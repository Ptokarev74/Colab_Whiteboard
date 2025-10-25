// Written by Pavel Tokarev (ptokarev74)
import React, { useRef, useEffect, useState, useCallback } from 'react';

// Set up for items used in whiteboard
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
    currentTool: string;
    currentColor: string;
    currentSize: number
}

const INITIAL_STATE: DrawingState = {
    lines: [],
    currentTool: 'pen',
    currentColor: '#000000',
    currentSize: 5,
};

export const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [state, setState] = useState<DrawingState>(INITIAL_STATE);
  const lastPoint = useRef<Point | null>(null);

  const { lines, currentTool, currentColor, currentSize } = state;

  // --- Utility Functions ---

  const getContext = useCallback(() => {
    return canvasRef.current?.getContext('2d');
  }, []);

  // Function to redraw the entire canvas state
  const redrawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    // Clear the canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Redraw all lines
    lines.forEach(line => {
      ctx.beginPath();
      ctx.moveTo(line.start.x, line.start.y);
      ctx.lineTo(line.end.x, line.end.y);
      ctx.strokeStyle = line.color;
      ctx.lineWidth = line.size;
      ctx.lineCap = 'round';
      ctx.stroke();
    });
  }, [lines, getContext]);

  // --- Drawing Logic (Mouse/Touch Handlers) ---

  const draw = useCallback((e: MouseEvent | TouchEvent) => {
    if (!isDrawing) return;

    const ctx = getContext();
    const canvas = canvasRef.current;
    if (!ctx || !canvas) return;

    // Get coordinates relative to the canvas
    let clientX, clientY;
    if (e instanceof TouchEvent) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const currentPoint: Point = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };

    if (lastPoint.current) {
      const newLine: Line = {
        start: lastPoint.current,
        end: currentPoint,
        color: currentTool === 'eraser' ? '#FFFFFF' : currentColor, // Eraser draws white
        size: currentSize,
      };

      // Update state with the new line
      setState(prevState => ({
        ...prevState,
        lines: [...prevState.lines, newLine],
      }));
      
      lastPoint.current = currentPoint;
    }
    
  }, [isDrawing, getContext, currentTool, currentColor, currentSize]);

  const handleStartDrawing = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const canvas = canvasRef.current;
    if (!canvas) return;

    let clientX, clientY;
    if (e.nativeEvent instanceof TouchEvent) {
      clientX = e.nativeEvent.touches[0].clientX;
      clientY = e.nativeEvent.touches[0].clientY;
    } else {
      clientX = e.nativeEvent.clientX;
      clientY = e.nativeEvent.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    lastPoint.current = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  }, []);

  const handleEndDrawing = useCallback(() => {
    setIsDrawing(false);
    lastPoint.current = null;
  }, []);

  // --- Effect Hooks ---

  // 1. Setup Canvas and Redraw on state change
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Set canvas dimensions based on container size
    const resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        if (entry.target === canvas.parentElement) {
          canvas.width = entry.contentRect.width;
          canvas.height = entry.contentRect.height;
          redrawCanvas();
        }
      }
    });

    if (canvas.parentElement) {
        resizeObserver.observe(canvas.parentElement);
    }
    
    redrawCanvas(); // Initial draw/redraw

    return () => {
      resizeObserver.disconnect();
    };
  }, [redrawCanvas]);

  // 2. Attach Global Event Listeners (Mouse Move and Up)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Attach to document to catch mouseup even if it leaves the canvas
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


  // --- Toolbar Handlers ---

  const handleToolChange = (tool: string) => {
    setState(prevState => ({ ...prevState, currentTool: tool }));
  };

  const handleColorChange = (color: string) => {
    setState(prevState => ({ ...prevState, currentColor: color, currentTool: 'pen' }));
  };

  const handleSizeChange = (size: number) => {
    setState(prevState => ({ ...prevState, currentSize: size }));
  };

  const handleClear = () => {
    setState(prevState => ({ ...prevState, lines: [] }));
    redrawCanvas();
  };

  const toolClasses = (tool: string) => 
    `p-3 rounded-full transition-all duration-150 shadow-md ${
      state.currentTool === tool
        ? 'bg-indigo-600 text-white ring-4 ring-indigo-300'
        : 'bg-white text-gray-700 hover:bg-gray-100'
    }`;

  // --- Render ---

  return (
    <div className="flex flex-col items-center w-full h-[calc(100vh-64px)] bg-gray-100 dark:bg-gray-900 p-4">
      
      {/* Tool Bar */}
      <div className="mb-4 p-3 bg-white shadow-xl rounded-xl flex flex-wrap gap-4 justify-center z-10">
        
        {/* Pen/Eraser Tools */}
        <div className="flex space-x-2 border-r pr-4">
          <button
            onClick={() => handleToolChange('pen')}
            className={toolClasses('pen')}
            title="Pen Tool"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
          </button>
          <button
            onClick={() => handleToolChange('eraser')}
            className={toolClasses('eraser')}
            title="Eraser Tool"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 4l-11 11h-2v2h2l11-11v-2zM15 4l-11 11M17 12l2 2m-2-2l-2-2"/></svg>
          </button>
        </div>

        {/* Color Picker */}
        <div className="flex items-center space-x-2 border-r pr-4">
            <label htmlFor="color-picker" className="text-gray-600 font-medium">Color:</label>
            <input
                id="color-picker"
                type="color"
                value={currentColor}
                onChange={(e) => handleColorChange(e.target.value)}
                className="w-8 h-8 rounded-full border-none cursor-pointer p-0 overflow-hidden"
                style={{ WebkitAppearance: 'none', MozAppearance: 'none' }}
            />
        </div>

        {/* Size Slider */}
        <div className="flex items-center space-x-3 border-r pr-4">
            <label htmlFor="size-slider" className="text-gray-600 font-medium">Size ({currentSize}):</label>
            <input
                id="size-slider"
                type="range"
                min="1"
                max="30"
                value={currentSize}
                onChange={(e) => handleSizeChange(parseInt(e.target.value))}
                className="w-24 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer range-lg"
            />
        </div>

        {/* Action Button */}
        <button
          onClick={handleClear}
          className="p-3 bg-red-500 text-white rounded-full hover:bg-red-600 transition-all duration-150 shadow-lg flex items-center space-x-2"
          title="Clear Canvas"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/></svg>
        </button>
      </div>


      {/* Canvas Container */}
      <div className="flex-grow w-full max-w-7xl h-full relative rounded-xl shadow-2xl overflow-hidden border-4 border-indigo-500/50">
        <canvas
          ref={canvasRef}
          onMouseDown={handleStartDrawing}
          onTouchStart={handleStartDrawing}
          style={{ cursor: isDrawing ? 'crosshair' : 'default', touchAction: 'none' }}
          className="bg-white w-full h-full block"
        />
      </div>
    </div>
  );
};

export default Whiteboard;
