'use client';

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { onSnapshot, setDoc, doc, getDoc, Firestore } from 'firebase/firestore';
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
  size: number; // Stroke size is stored in world coordinates
  tool: 'pen' | 'eraser';
}

interface Camera {
  x: number; // horizontal pan offset (in screen pixels)
  y: number; // vertical pan offset (in screen pixels)
  zoom: number; // scale factor
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
const INITIAL_CAMERA: Camera = { x: 0, y: 0, zoom: 1 };


// --- CORE COMPONENT ---

export default function Whiteboard() {
  // --- STATE AND REFS ---
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  
  const [isDrawing, setIsDrawing] = useState(false);
  const [isPanning, setIsPanning] = useState(false); // New state for panning mode
  
  const [state, setState] = useState<DrawingState>(INITIAL_STATE);
  const [camera, setCamera] = useState<Camera>(INITIAL_CAMERA);
  
  const lastPoint = useRef<Point | null>(null);

  // Firestore Refs
  const [db, setDb] = useState<Firestore | null>(null);
  const [userId, setUserId] = useState<string>('Initializing...');
  const [appId, setAppId] = useState<string>('default-app-id');
  const [isContentReady, setIsContentReady] = useState(false); 
  
  // Refs to hold the latest state for event handlers (CRITICAL for smooth drawing/panning)
  const stateRef = useRef(state); 
  const cameraRef = useRef(camera); 

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);


  // --- LOCAL PERSISTENCE HOOK (FOR OFFLINE DEV) ---
  const useLinesPersistence = (db: Firestore | null, lines: Line[], userId: string) => {
    useEffect(() => {
      if (db === null) {
        try {
          const storedLines = localStorage.getItem(`whiteboard_lines_${userId}`);
          if (storedLines) {
            setState(prevState => ({ ...prevState, lines: JSON.parse(storedLines) }));
          }
        } catch (e) {
          console.warn("Could not load from local storage:", e);
        }
      }
    }, [db, userId]);

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

  // --- FIREBASE INITIALIZATION ---

  const setupFirebase = useCallback(async () => {
    try {
      const { db, userId: newUserId, appId: newAppId } = await initializeFirebase();
      setDb(db);
      setUserId(newUserId);
      setAppId(newAppId);
    } catch (e) {
      console.error("Failed to initialize Firebase:", e);
      setUserId("Error");
    }
  }, []);

  useEffect(() => {
    setupFirebase();
  }, [setupFirebase]);


  // --- CANVAS COORDINATE CONVERSION (New Logic) ---

  const getCanvasPoint = useCallback((clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { x: camX, y: camY, zoom } = cameraRef.current; // Use camera ref

    // Convert Screen Pixel to World Coordinate
    const worldX = (clientX - rect.left - camX) / zoom;
    const worldY = (clientY - rect.top - camY) / zoom;
    
    return { x: worldX, y: worldY };
  }, []); // cameraRef.current is used inside the function, no need to list as dep


  // --- REDRAW LOGIC (Updated to use Camera) ---

  const redrawCanvas = useCallback((linesToDraw: Line[]) => {
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    if (!canvas || !ctx) return;
    
    const { x: camX, y: camY, zoom } = cameraRef.current;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Apply global canvas transformation based on the camera state
    ctx.save();
    ctx.translate(camX, camY); // Apply pan
    ctx.scale(zoom, zoom);     // Apply zoom

    linesToDraw.forEach(line => {
      const strokeColor = line.tool === 'eraser' ? '#ffffff' : line.color;
      
      ctx.beginPath();
      // Drawing points are already in World Coordinates
      ctx.moveTo(line.start.x, line.start.y); 
      ctx.lineTo(line.end.x, line.end.y);
      
      // Line properties must be scaled inversely to keep size consistent on screen
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = line.size / zoom; 
      ctx.lineCap = 'round';
      ctx.stroke();
    });

    ctx.restore();
  }, []); // cameraRef.current is used inside the function, no need to list as dep


  // --- FIREBASE REAL-TIME LISTENER (FETCH-FIRST FIX) ---
  useEffect(() => {
    if (!db || !appId) return;

    const canvasCollection = getDrawingCollection(db, appId);
    if (!canvasCollection) return;

    const docRef = doc(canvasCollection, DRAWING_DOC_ID);

    const initializeDataAndListener = async () => {
        try {
            // 1. Fetch the initial state ONCE
            const docSnapshot = await getDoc(docRef);
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const fetchedLinesString = data?.lines || '[]';
                const parsedLines: Line[] = JSON.parse(fetchedLinesString);
                setState(prevState => ({ ...prevState, lines: parsedLines }));
            }
        } catch (error) {
            console.error("Initial data fetch failed (check rules/connection):", error);
        }
        
        // 2. Attach the continuous listener
        const unsubscribe = onSnapshot(docRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const data = docSnapshot.data();
                const fetchedLinesString = data?.lines || '[]';
                
                try {
                    const parsedLines: Line[] = JSON.parse(fetchedLinesString);
                    setState(prevState => ({ ...prevState, lines: parsedLines }));
                } catch (e) {
                    console.error("Failed to parse Firestore data in snapshot:", e);
                }
            }
        }, (error) => {
            console.error("Firestore subscription error:", error);
        });

        // 3. Mark content as ready
        setIsContentReady(true);
        return unsubscribe;
    };

    const cleanupPromise = initializeDataAndListener();

    return () => {
      cleanupPromise.then(unsubscribe => unsubscribe && unsubscribe());
    };
  }, [db, appId]); 


  // Effect to handle context, resizing, and redrawing
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
        await setDoc(docRef, { lines: linesJsonString }, { merge: false }); 
    } catch (e) {
        console.error("Failed to save drawing to Firestore:", e);
    }
  }, [db, appId]);


  // --- PANNING HANDLERS ---

  const handleStartDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isContentReady) return; 
    
    e.preventDefault(); 
    
    const clientX = (e as React.MouseEvent).clientX || (e as React.TouchEvent).touches[0].clientX;
    const clientY = (e as React.MouseEvent).clientY || (e as React.TouchEvent).touches[0].clientY;
    
    // Panning logic: Middle mouse button (button 1)
    const isMiddleClick = (e as React.MouseEvent).button === 1;

    if (isMiddleClick) {
        setIsPanning(true);
        lastPoint.current = { x: clientX, y: clientY }; // Store screen coordinates for panning
        return;
    }
    
    // --- DRAWING START LOGIC ---
    
    const { currentTool, currentColor, currentSize } = stateRef.current;
    
    const point = getCanvasPoint(clientX, clientY); // Convert to World Coordinates
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
  }, [isContentReady, getCanvasPoint]);

  
  const handlePanMove = useCallback((e: MouseEvent) => {
    if (!isPanning || !lastPoint.current) return;
    
    // Calculate difference in screen coordinates
    const dx = e.clientX - lastPoint.current.x;
    const dy = e.clientY - lastPoint.current.y;

    // Update camera state
    setCamera(prevCam => {
        const newCam = {
            ...prevCam,
            x: prevCam.x + dx,
            y: prevCam.y + dy,
        };
        cameraRef.current = newCam; 
        return newCam;
    });

    // Update lastPoint for the next frame
    lastPoint.current = { x: e.clientX, y: e.clientY };
  }, [isPanning]);


  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDrawing || !lastPoint.current || !canvasRef.current || !ctxRef.current) return;
    
    const { currentTool, currentColor, currentSize } = stateRef.current;

    const clientX = (e as MouseEvent).clientX || (e as TouchEvent).touches[0].clientX;
    const clientY = (e as MouseEvent).clientY || (e as TouchEvent).touches[0].clientY;
    
    const newPoint = getCanvasPoint(clientX, clientY); // Convert to World Coordinates

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
        saveLinesToFirestore(stateRef.current.lines);
    }
    if (isPanning) {
        setIsPanning(false);
        lastPoint.current = null;
    }
  }, [isDrawing, isPanning, saveLinesToFirestore]);


  // --- ZOOM HANDLER ---

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { zoom: oldZoom, x: oldX, y: oldY } = cameraRef.current;
    
    const zoomFactor = 1.1; // Zoom step
    const newZoom = e.deltaY > 0 ? oldZoom / zoomFactor : oldZoom * zoomFactor;
    
    const clampedZoom = Math.max(0.1, Math.min(newZoom, 5)); // Zoom limits

    // Mouse position relative to the canvas
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Calculate new position to keep the point under the mouse stable
    const newX = mouseX - ((mouseX - oldX) / oldZoom) * clampedZoom;
    const newY = mouseY - ((mouseY - oldY) / oldZoom) * clampedZoom;

    setCamera({
        x: newX,
        y: newY,
        zoom: clampedZoom,
    });
  }, []);

  // Effect to attach global mouse and touch listeners
  useEffect(() => {
    // Drawing listeners
    document.addEventListener('mousemove', draw as (e: MouseEvent) => void);
    
    // Panning listeners
    document.addEventListener('mousemove', handlePanMove);
    
    // End listeners (stops both drawing and panning)
    document.addEventListener('mouseup', handleEndDrawing);
    document.addEventListener('touchend', handleEndDrawing);

    return () => {
      document.removeEventListener('mousemove', draw as (e: MouseEvent) => void);
      document.removeEventListener('mousemove', handlePanMove);
      document.removeEventListener('mouseup', handleEndDrawing);
      document.removeEventListener('touchend', handleEndDrawing);
    };
  }, [draw, handleEndDrawing, handlePanMove]);


  // --- UTILITY HANDLERS ---

  const handleClearBoard = useCallback(() => {
    // Clear locally immediately
    setState(prevState => ({ ...prevState, lines: [] }));
    
    // Write an empty lines array to Firestore to clear for everyone
    saveLinesToFirestore([]);
    setCamera(INITIAL_CAMERA); // Reset camera on clear
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
  const cursorStyle = isDrawing ? 'crosshair' : (isPanning ? 'grabbing' : 'default');
  
  if (!isContentReady) {
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
            onWheel={handleWheel}
            // Use the combined cursor style
            style={{ touchAction: 'none', cursor: cursorStyle }}
            className="bg-white w-full h-full block"
          />
          {/* Zoom Indicator */}
          <div className="absolute bottom-4 right-4 bg-gray-800 text-white text-xs px-3 py-1.5 rounded-full shadow-lg">
            Zoom: {(camera.zoom * 100).toFixed(0)}%
          </div>
          <div className="absolute bottom-4 left-4 text-xs text-gray-500 bg-white px-3 py-1.5 rounded-full shadow-lg">
            Pan: Middle-Click Drag
          </div>
        </div>
      </main>
    </div>
  );
}