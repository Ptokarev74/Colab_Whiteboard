'use client';

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { onSnapshot, setDoc, doc, updateDoc, getDoc, Firestore } from 'firebase/firestore';
import { initializeFirebase, getDrawingCollection, DRAWING_DOC_ID } from '../src/utils/firebase';
import { Paintbrush, Eraser, Loader2, RefreshCw } from 'lucide-react';

// --- TYPESCRIPT INTERFACES ---

interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
  color: string;
  size: number;
  tool: 'pen' | 'eraser';
}

interface DrawingState {
  lines: Line[];
  currentTool: 'pen' | 'eraser';
  currentColor: string;
  currentSize: number;
}

const INITIAL_STATE: DrawingState = {
  lines: [],
  currentTool: 'pen',
  currentColor: '#000000',
  currentSize: 5,
};

// --- CORE COMPONENT ---

export default function Whiteboard() {
  // --- STATE AND REFS ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [state, setState] = useState<DrawingState>(INITIAL_STATE);
  const lastPoint = useRef<Point | null>(null);

  // Firestore Refs
  const [db, setDb] = useState<Firestore | null>(null);
  const [userId, setUserId] = useState<string>('Initializing...');
  const [appId, setAppId] = useState<string>('default-app-id');
  const [isAuthReady, setIsAuthReady] = useState(false);
  const stateRef = useRef(state); // Ref to hold the latest state for event handlers

  // Update stateRef whenever state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // --- LOCAL PERSISTENCE HOOK (FOR OFFLINE DEV) ---
  const useLinesPersistence = (db: Firestore | null, lines: Line[], userId: string) => {
    useEffect(() => {
      // Only runs if we are offline (db is null, as set in the fixed firebase.ts)
      if (db === null) {
        try {
          // Load from localStorage on initial render
          const storedLines = localStorage.getItem(`whiteboard_lines_${userId}`);
          if (storedLines) {
            setState(prevState => ({ ...prevState, lines: JSON.parse(storedLines) }));
          }
        } catch (e) {
          console.warn("Could not load from local storage:", e);
        }
      }
    }, [db, userId]);

    // Save to localStorage whenever lines change AND we are offline
    useEffect(() => {
      if (db === null) {
        try {
          localStorage.setItem(`whiteboard_lines_${userId}`, JSON.stringify(lines));
        } catch (e) {
          console.warn("Could not save to local storage:", e);
        }
      }
    }, [db, lines, userId]);
  };

  useLinesPersistence(db, state.lines, userId);

  // --- FIREBASE INITIALIZATION AND REAL-TIME SYNC ---

  const setupFirebase = useCallback(async () => {
    try {
      const { db, userId: newUserId, appId: newAppId } = await initializeFirebase();
      setDb(db);
      setUserId(newUserId);
      setAppId(newAppId);
      setIsAuthReady(true);
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      setIsAuthReady(false);
      setUserId("Error");
    }
  }, []);

  useEffect(() => {
    setupFirebase();
  }, [setupFirebase]);


  // Real-time Listener (onSnapshot)
  useEffect(() => {
    if (!isAuthReady || !db || !appId) return;

    const canvasCollection = getDrawingCollection(db, appId);
    if (!canvasCollection) return;

    const docRef = doc(canvasCollection, DRAWING_DOC_ID);

    const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
        if (docSnapshot.exists()) {
            const data = docSnapshot.data();
            const fetchedLinesString = data?.lines || '[]'; // Default to empty array string
            
            try {
                // Parse the JSON string retrieved from Firestore
                const parsedLines: Line[] = JSON.parse(fetchedLinesString);
                setState(prevState => ({ ...prevState, lines: parsedLines }));
            } catch (e) {
                console.error("Failed to parse Firestore data:", e);
            }
        }
    }, (error) => {
        console.error("Firestore subscription error:", error);
    });

    return () => unsubscribe();
  }, [isAuthReady, db, appId]); 


  // --- CANVAS & DRAWING HANDLERS ---

  const redrawCanvas = useCallback((linesToDraw: Line[]) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    linesToDraw.forEach(line => {
      const strokeColor = line.tool === 'eraser' ? '#ffffff' : line.color;
      
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = line.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }, []);


  // Effect to handle canvas context, resizing, and redrawing when lines state changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    ctxRef.current = ctx;

    const resizeObserver = new ResizeObserver(() => {
      const rect = canvas.parentElement!.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      redrawCanvas(state.lines);
    });

    resizeObserver.observe(canvas.parentElement!);

    redrawCanvas(state.lines);

    return () => {
      resizeObserver.unobserve(canvas.parentElement!);
    };
  }, [state.lines, redrawCanvas]);

  // Function to save the full array to Firestore
  const saveLinesToFirestore = useCallback(async (linesToSave: Line[]) => {
    if (!db || !appId) {
        return; 
    }

    const canvasCollection = getDrawingCollection(db, appId);
    if (!canvasCollection) return;

    const docRef = doc(canvasCollection, DRAWING_DOC_ID);
    
    try {
        const linesJsonString = JSON.stringify(linesToSave);

        // We use setDoc to overwrite the complete state, ensuring data consistency
        await setDoc(docRef, { lines: linesJsonString }, { merge: false }); 
    } catch (e) {
        console.error("Failed to save drawing to Firestore:", e);
    }
  }, [db, appId]);


  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const handleStartDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isAuthReady) return; 
    
    e.preventDefault(); 
    
    const { currentTool, currentColor, currentSize } = stateRef.current;
    
    const clientX = (e as React.MouseEvent).clientX || (e as React.TouchEvent).touches[0].clientX;
    const clientY = (e as React.MouseEvent).clientY || (e as React.TouchEvent).touches[0].clientY;

    const point = getCanvasPoint(clientX, clientY);
    lastPoint.current = point;
    setIsDrawing(true);
    
    const dotLine: Line = { 
        start: point, 
        end: point, 
        color: currentColor, 
        size: currentSize, 
        tool: currentTool 
    };
    
    setState(prevState => {
        const newLines = [...prevState.lines, dotLine];
        return { ...prevState, lines: newLines };
    });
  }, [isAuthReady, getCanvasPoint]);

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDrawing || !lastPoint.current || !canvasRef.current || !ctxRef.current) return;
    
    const { currentTool, currentColor, currentSize } = stateRef.current;

    const clientX = (e as MouseEvent).clientX || (e as TouchEvent).touches[0].clientX;
    const clientY = (e as MouseEvent).clientY || (e as TouchEvent).touches[0].clientY;
    
    const newPoint = getCanvasPoint(clientX, clientY);

    const newLine: Line = {
      start: lastPoint.current,
      end: newPoint,
      color: currentColor,
      size: currentSize,
      tool: currentTool,
    };
    
    // Update local state
    setState(prevState => ({ ...prevState, lines: [...prevState.lines, newLine] }));
    
    lastPoint.current = newPoint;

}, [isDrawing, getCanvasPoint]);


const handleEndDrawing = useCallback(() => {
    if (isDrawing) {
        setIsDrawing(false);
        lastPoint.current = null;
        
        // CRITICAL FIX: Only save the entire state when drawing STOPS
        saveLinesToFirestore(stateRef.current.lines);
    }
}, [isDrawing, saveLinesToFirestore]);


  // Effect to attach global mouse and touch listeners
  useEffect(() => {
    document.addEventListener('mousemove', draw as (e: MouseEvent) => void);
    document.addEventListener('mouseup', handleEndDrawing);
    document.addEventListener('touchmove', draw as (e: TouchEvent) => void);
    document.addEventListener('touchend', handleEndDrawing);

    return () => {
      document.removeEventListener('mousemove', draw as (e: MouseEvent) => void);
      document.removeEventListener('mouseup', handleEndDrawing);
      document.removeEventListener('touchmove', draw as (e: TouchEvent) => void);
      document.removeEventListener('touchend', handleEndDrawing);
    };
  }, [draw, handleEndDrawing]);


  // --- UTILITY HANDLERS ---

  const handleClearBoard = useCallback(() => {
    // Clear locally immediately
    setState(prevState => ({ ...prevState, lines: [] }));
    
    // Write an empty lines array to Firestore to clear for everyone
    saveLinesToFirestore([]);
  }, [saveLinesToFirestore]);

  const setTool = (tool: 'pen' | 'eraser') => {
    setState(prevState => ({ ...prevState, currentTool: tool }));
  };

  const setColor = (color: string) => {
    setState(prevState => ({ ...prevState, currentColor: color, currentTool: 'pen' }));
  };

  const setSize = (size: number) => {
    setState(prevState => ({ ...prevState, currentSize: size }));
  };


  // --- RENDER ---
  
  const CurrentToolIcon = state.currentTool === 'pen' ? Paintbrush : Eraser;
  
  if (!isAuthReady) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="h-8 w-8 text-indigo-500 animate-spin" />
        <p className="mt-4 text-gray-600">Connecting to real-time service...</p>
        <p className="mt-2 text-sm text-gray-500">User ID: {userId}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen w-full bg-gray-100">
      
      {/* --- TOP TOOLBAR --- */}
      <header className="flex-shrink-0 bg-white shadow-md p-3 border-b border-gray-200">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <h1 className="text-2xl font-extrabold text-indigo-600">
            Collab Whiteboard
          </h1>

          <div className="flex space-x-2 sm:space-x-4">
            {/* Pen/Eraser Toggle */}
            <button
              onClick={() => setTool('pen')}
              className={`p-3 rounded-full transition duration-150 ${
                state.currentTool === 'pen' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-indigo-100'
              }`}
              title="Pen Tool"
            >
              <Paintbrush className="h-5 w-5" />
            </button>
            <button
              onClick={() => setTool('eraser')}
              className={`p-3 rounded-full transition duration-150 ${
                state.currentTool === 'eraser' ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600 hover:bg-indigo-100'
              }`}
              title="Eraser Tool"
            >
              <Eraser className="h-5 w-5" />
            </button>
            
            {/* Color Picker (Only visible for Pen) */}
            {state.currentTool === 'pen' && (
                <div className="relative">
                    <input
                      type="color"
                      value={state.currentColor}
                      onChange={(e) => setColor(e.target.value)}
                      className="h-11 w-11 rounded-full border-2 border-gray-300 cursor-pointer overflow-hidden opacity-0 absolute top-0 left-0"
                      title="Select Color"
                    />
                    <div 
                        className="h-11 w-11 rounded-full border-2 border-gray-300 shadow-inner pointer-events-none" 
                        style={{ backgroundColor: state.currentColor }}
                    />
                </div>
            )}


            {/* Size Slider */}
            <div className="flex items-center bg-gray-200 rounded-full p-2 space-x-2">
              <CurrentToolIcon className="h-5 w-5 text-gray-600" />
              <input
                type="range"
                min="1"
                max="50"
                value={state.currentSize}
                onChange={(e) => setSize(parseInt(e.target.value))}
                className="w-20 h-2 bg-indigo-200 rounded-lg appearance-none cursor-pointer range-lg"
              />
              <span className="text-sm font-semibold w-6 text-gray-700">{state.currentSize}</span>
            </div>

            {/* Clear Button */}
            <button
              onClick={handleClearBoard}
              className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition duration-150 shadow-lg"
              title="Clear Board for All"
            >
              <RefreshCw className="h-5 w-5" />
            </button>
          </div>
          
          <div className="hidden sm:block text-xs font-mono text-gray-500 bg-gray-100 p-2 rounded-lg">
            User ID: **{userId}**
          </div>
        </div>
      </header>
      
      {/* --- CANVAS AREA --- */}
      <main className="flex-grow flex justify-center items-center p-4">
        <div className="flex-grow w-full max-w-7xl h-full relative rounded-xl shadow-2xl overflow-hidden border-4 border-indigo-500/50">
          <canvas
            ref={canvasRef}
            onMouseDown={handleStartDrawing}
            onTouchStart={handleStartDrawing}
            style={{ touchAction: 'none', cursor: isDrawing ? 'crosshair' : 'default' }}
            className="bg-white w-full h-full block"
          />
        </div>
      </main>
    </div>
  );
}