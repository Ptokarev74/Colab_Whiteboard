'use client'; 

import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- TYPE DEFINITIONS (Interfaces) ---
interface Point {
  x: number;
  y: number;
}

interface Line {
  start: Point;
  end: Point;
  color: string;
  size: number;
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


// --- MAIN WHITEBOARD COMPONENT LOGIC ---
export default function Home() {
  
  // STATE & REFS
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [state, setState] = useState<DrawingState>(INITIAL_STATE);
  const lastPoint = useRef<Point | null>(null);

  const { lines, currentTool, currentColor, currentSize } = state;

  // --- UTILITY FUNCTIONS ---

  const getContext = useCallback(() => {
    return canvasRef.current?.getContext('2d');
  }, []);

  const redrawCanvas = useCallback((currentLines = lines) => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    // Clear the entire canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw all lines from the state
    currentLines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }, [lines, getContext]);

  // --- INTERACTION HANDLERS ---

  const handleStartDrawing = useCallback((event: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let clientX, clientY;
    if ('touches' in event) {
      clientX = event.touches[0].clientX;
      clientY = event.touches[0].clientY;
      event.preventDefault(); // Prevent scrolling on touch
    } else {
      clientX = event.clientX;
      clientY = event.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const point: Point = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    
    lastPoint.current = point;
    setIsDrawing(true);
  }, []);

  const draw = useCallback((event: MouseEvent | TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = getContext();
    const startPoint = lastPoint.current;
    if (!canvas || !ctx || !startPoint) return;

    let clientX, clientY;
    if ('touches' in event) {
        clientX = event.touches[0].clientX;
        clientY = event.touches[0].clientY;
        event.preventDefault();
    } else {
        clientX = event.clientX;
        clientY = event.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const endPoint: Point = {
        x: clientX - rect.left,
        y: clientY - rect.top,
    };

    // Determine the color and size based on the current tool
    const color = currentTool === 'eraser' ? '#ffffff' : currentColor; // Use white for eraser
    const size = currentTool === 'eraser' ? currentSize * 2 : currentSize; // Make eraser thicker

    const newLine: Line = { start: startPoint, end: endPoint, color: color, size: size };

    // Update state to include the new line segment
    setState(prevState => {
        const newLines = [...prevState.lines, newLine];
        // Redraw immediately for responsiveness
        redrawCanvas(newLines); 
        return { ...prevState, lines: newLines };
    });

    lastPoint.current = endPoint;

  }, [isDrawing, getContext, currentTool, currentColor, currentSize, redrawCanvas]);


  const handleEndDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPoint.current = null;
  }, []);

  // --- TOOLBAR HANDLERS ---
  const setTool = (tool: 'pen' | 'eraser') => setState(prev => ({ ...prev, currentTool: tool }));
  const setColor = (e: React.ChangeEvent<HTMLInputElement>) => setState(prev => ({ ...prev, currentColor: e.target.value }));
  const setSize = (e: React.ChangeEvent<HTMLInputElement>) => setState(prev => ({ ...prev, currentSize: parseInt(e.target.value, 10) }));
  const clearCanvas = () => {
    setState(prev => ({ ...prev, lines: [] }));
    redrawCanvas([]); // Immediate clear
  };
  
  // --- LIFECYCLE (EFFECTS) ---

  // 1. Setup Canvas Dimensions and Resize Observer
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    // Set initial size
    const container = canvas.parentElement;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    // Handle responsiveness on window resize
    const observer = new ResizeObserver(() => {
        if (container) {
            canvas.width = container.clientWidth;
            canvas.height = container.clientHeight;
            redrawCanvas(); // Redraw content to fit new size
        }
    });

    if (container) {
        observer.observe(container);
    }

    return () => {
        if (container) {
            observer.unobserve(container);
        }
    };
  }, [redrawCanvas]); 

  // 2. Global Event Listeners (important for smooth drawing outside the canvas bounds)
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


  // --- RENDER ---
  return (
    <div className="flex flex-col h-screen w-screen bg-gray-50 dark:bg-gray-800">
      
      {/* --- TOOLBAR --- */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 shadow-md p-3 md:p-4 border-b border-indigo-100/50">
        <div className="flex flex-wrap gap-3 items-center justify-center max-w-7xl mx-auto">
          
          {/* Tool Selector */}
          <div className="flex bg-gray-100 dark:bg-gray-700 p-1 rounded-lg shadow-inner">
            <button 
              onClick={() => setTool('pen')}
              className={`p-2 rounded-md transition-colors font-medium text-sm ${currentTool === 'pen' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              title="Pen Tool"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 18.07a4.5 4.5 0 01-1.897 1.13L6 20l1.123-4.187a4.5 4.5 0 011.13-1.897l8.243-8.243zm-8.62 8.62c.36.36.78.667 1.24.908l6.23-6.23a1.5 1.5 0 00-2.12-2.12l-6.23 6.23c.24.46.547.88 01.24z" />
              </svg>
            </button>
            <button 
              onClick={() => setTool('eraser')}
              className={`ml-2 p-2 rounded-md transition-colors font-medium text-sm ${currentTool === 'eraser' ? 'bg-indigo-500 text-white shadow-md' : 'text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}
              title="Eraser Tool"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H15.75a2.25 2.25 0 01-2.244-2.077L9.257 5.94c.346-.04.682-.11 1.022-.165m-4.788 0L4.256 19.673a2.25 2.25 0 002.244 2.077h.971a2.25 2.25 0 002.244-2.077L13.738 5.775c.346-.04.682-.11 1.022-.165" />
              </svg>
            </button>
          </div>

          {/* Color Picker (only shown for Pen) */}
          {currentTool === 'pen' && (
            <div className="flex items-center gap-2">
              <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">Color:</span>
              <input 
                type="color" 
                value={currentColor}
                onChange={setColor}
                className="w-8 h-8 rounded-full border-none cursor-pointer p-0"
                title="Line Color"
              />
            </div>
          )}

          {/* Line Size Selector */}
          <div className="flex items-center gap-2">
            <span className="text-gray-600 dark:text-gray-300 text-sm font-medium">Size: {currentSize}px</span>
            <input 
              type="range" 
              min="1" 
              max="50" 
              value={currentSize} 
              onChange={setSize}
              className="w-24 h-2 rounded-lg appearance-none cursor-pointer bg-indigo-200 dark:bg-indigo-700"
              title="Line Size"
            />
          </div>

          {/* Clear Button */}
          <button
            onClick={clearCanvas}
            className="px-4 py-2 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition duration-150 font-medium text-sm"
            title="Clear All Drawings"
          >
            Clear All
          </button>
        </div>
      </header>

      {/* --- CANVAS AREA --- */}
      <main className="flex-grow w-full max-w-7xl mx-auto p-4 md:p-6">
        <div className="h-full bg-white dark:bg-gray-700 rounded-xl shadow-2xl overflow-hidden border-4 border-indigo-500/50">
          <canvas
            ref={canvasRef}
            // Attach primary handlers to the canvas
            onMouseDown={handleStartDrawing}
            onTouchStart={handleStartDrawing}
            style={{ cursor: isDrawing ? 'crosshair' : 'default', touchAction: 'none' }}
            // The canvas is set to block-level and takes full available space of its container
            className="w-full h-full block"
          />
        </div>
      </main>
    </div>
  );
}
