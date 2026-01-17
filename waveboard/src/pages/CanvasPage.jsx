import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useApi } from '../context/AppContext';
import Board from '../components/Board';
import Toolbar from '../components/Toolbar';
import Toolbox from '../components/Toolbox';
import BoardProvider from '../store/BoardProvider';
import ToolboxProvider from '../store/toolboxProvider';
import socket from '../utils/socket';
import RightSidebar from '../components/RightSidebar';
import RemoteCursor from '../components/RemoteCursor/RemoteCursor'; 
import { Palette, Sparkles, Crop, Image as ImageIcon } from "lucide-react"; 
import CallManager from '../components/VideoCall/CallManager';
import { loadModels } from '../ml/predict';
import CodeModal from '../components/CodeModal'; 
import PromptModal from '../components/PromptModal'; // --- NEW IMPORT ---
import './CanvasPage.css';

function CanvasPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { canvasService, user } = useApi();
  
  // Existing State
  const [canvas, setCanvas] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [cursors, setCursors] = useState({}); 
  const token = localStorage.getItem('token');
  const [isDarkMode, setIsDarkMode] = useState(false);

  // GenAI Result State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [genAIResult, setGenAIResult] = useState(null);
  const [genAILoading, setGenAILoading] = useState(false);

  // --- NEW: Snipping & Prompt State ---
  const [isSnipping, setIsSnipping] = useState(false);
  const [snipMode, setSnipMode] = useState(null); // 'code' or 'image'
  const [snipStart, setSnipStart] = useState(null);
  const [snipEnd, setSnipEnd] = useState(null);    
  
  const [isPromptModalOpen, setIsPromptModalOpen] = useState(false); // Controls the input popup
  const [tempSnipRect, setTempSnipRect] = useState(null); // Stores selection while user types

  const overlayRef = useRef(null);

  const toggleDarkMode = () => setIsDarkMode(prevMode => !prevMode);

  // --- 1. Activate Snipping Mode ---
  const startSnippingMode = (mode) => {
    setSnipMode(mode); 
    setIsSnipping(true);
    setSnipStart(null);
    setSnipEnd(null);
  };

  // --- 2. Handle Mouse Actions on Overlay ---
  const handleSnipMouseDown = (e) => {
    setSnipStart({ x: e.clientX, y: e.clientY });
    setSnipEnd({ x: e.clientX, y: e.clientY }); 
  };

  const handleSnipMouseMove = (e) => {
    if (snipStart) {
      setSnipEnd({ x: e.clientX, y: e.clientY });
    }
  };

  const handleSnipMouseUp = async () => {
    if (!snipStart || !snipEnd) return;
    
    setIsSnipping(false); // Stop snipping visual
    
    // Calculate selection rectangle
    const rect = {
      x: Math.min(snipStart.x, snipEnd.x),
      y: Math.min(snipStart.y, snipEnd.y),
      width: Math.abs(snipEnd.x - snipStart.x),
      height: Math.abs(snipEnd.y - snipStart.y)
    };

    if (rect.width < 50 || rect.height < 50) {
      alert("Selection too small. Please drag a box around your sketch.");
      return;
    }

    // --- NEW FLOW: Don't generate yet. Open Prompt Modal first. ---
    setTempSnipRect(rect); // Save the box coordinates
    setIsPromptModalOpen(true); // Open the question popup
    
    // Reset snip coordinates
    setSnipStart(null);
    setSnipEnd(null);
  };

  // --- 3. Handle User Submitting the Prompt ---
  const handlePromptSubmit = async (userPrompt) => {
    setIsPromptModalOpen(false); // Close the prompt modal
    
    if (tempSnipRect && snipMode) {
      // NOW call the AI with the rect AND the user's text
      await generateFromRegion(tempSnipRect, snipMode, userPrompt);
    }
    
    // Cleanup
    setTempSnipRect(null);
    setSnipMode(null);
  };

  // --- 4. Crop, Encode & Send to Backend ---
  const generateFromRegion = async (rect, mode, userPrompt) => {
    const canvasElement = document.querySelector('canvas'); 
    if (!canvasElement) return;

    setIsModalOpen(true); // Open Result Modal immediately (Loading...)
    setGenAILoading(true);

    try {
      // Create temporary canvas for cropping
      const tempCanvas = document.createElement('canvas');
      const ctx = tempCanvas.getContext('2d');
      const dpr = window.devicePixelRatio || 1;
      const canvasRect = canvasElement.getBoundingClientRect();

      const scaleX = (canvasElement.width / dpr) / canvasRect.width;
      const scaleY = (canvasElement.height / dpr) / canvasRect.height;

      tempCanvas.width = rect.width;
      tempCanvas.height = rect.height;

      // Draw only the selected region
      ctx.drawImage(
        canvasElement,
        (rect.x - canvasRect.left) * scaleX * dpr, 
        (rect.y - canvasRect.top) * scaleY * dpr,  
        rect.width * scaleX * dpr,                 
        rect.height * scaleY * dpr,                
        0, 0, rect.width, rect.height              
      );

      const croppedImage = tempCanvas.toDataURL("image/png");

      const backendUrl = process.env.REACT_APP_BACKEND_URL || "http://localhost:5000"; 
      
      const endpoint = mode === 'image' 
        ? `${backendUrl}/api/genai/enhance-image`
        : `${backendUrl}/api/genai/generate`;

      // Send Image + Prompt to Backend
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            image: croppedImage,
            userPrompt: userPrompt // <--- Passing the custom instruction
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setGenAIResult(data);

    } catch (error) {
      console.error("GenAI Error:", error);
      setGenAIResult({ type: "Error", code: "Failed to generate. Please try again." });
    } finally {
      setGenAILoading(false);
    }
  };

  // --- EXISTING APP LOGIC ---
  useEffect(() => {
    if (!token) {
      navigate('/login');
      return;
    }
    const loadAndConnect = async () => {
      try {
        setLoading(true);
        const res = await canvasService.loadCanvas(id);
        setCanvas(res.data);
        socket.connect();
        socket.on('connect', () => {
          setIsConnected(true);
          socket.emit('joinRoom', { roomId: id, token });
        });
        socket.on('disconnect', () => {
          setIsConnected(false);
          setConnectedUsers([]);
          setCursors({}); 
        });
        socket.on('connect_error', () => {
          setError('Could not connect to real-time service.');
          setIsConnected(false);
        });
        socket.on('canvasUpdate', (data) => {
          if (window.boardProviderHandlers && window.boardProviderHandlers[id]) {
            window.boardProviderHandlers[id].handleRemoteUpdate(data);
          }
        });
        socket.on('roomUsers', (users) => setConnectedUsers(users));
        socket.on('userCursor', (data) => {
          if (data.userId !== socket.id) {
            setCursors(prev => ({ ...prev, [data.userId]: data }));
          }
        });
      } catch (err) {
        setError(err.response?.data?.message || 'Failed to load canvas');
        if (err.response?.status === 401) navigate('/login');
      } finally {
        setLoading(false);
      }
    };
    loadAndConnect();
    return () => {
      if (socket.connected) {
        socket.emit('leaveRoom', id);
        socket.disconnect();
      }
      socket.off(); 
      if (window.boardProviderHandlers) delete window.boardProviderHandlers[id];
    };
  }, [id, navigate, token, canvasService]);

  useEffect(() => {
    const activeUserIds = new Set(connectedUsers.map(u => u.id));
    setCursors(prevCursors => {
        const nextCursors = {};
        for (const userId in prevCursors) {
            if (activeUserIds.has(userId)) nextCursors[userId] = prevCursors[userId];
        }
        return nextCursors;
    });
  }, [connectedUsers]);

  const handleCanvasUpdate = useCallback((updateData) => {
    if (socket.connected) socket.emit('canvasUpdate', { roomId: id, ...updateData });
  }, [id]);

  const handleCursorMove = useCallback((cursorData) => {
    if (socket.connected && connectedUsers.length > 1) socket.emit('userCursor', { roomId: id, ...cursorData });
  }, [id, connectedUsers.length]);

  useEffect(() => { loadModels(); }, []);
    
  if (loading) return <div className="flex justify-center items-center h-screen bg-stone-100"><Palette className="w-12 h-12 animate-spin" /></div>;
  if (error || !canvas) return <div className="flex justify-center items-center h-screen bg-stone-100 text-red-500">{error || "Canvas Not Found"}</div>;

  return (
    <div className={`h-screen bg-stone-100 relative font-sans ${isDarkMode ? 'dark' : ''}`}>
      
      {/* --- SNIPPING OVERLAY --- */}
      {isSnipping && (
        <div 
          ref={overlayRef}
          className="fixed inset-0 z-50 cursor-crosshair bg-black bg-opacity-20 select-none"
          onMouseDown={handleSnipMouseDown}
          onMouseMove={handleSnipMouseMove}
          onMouseUp={handleSnipMouseUp}
        >
          <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black text-white px-4 py-2 rounded-full shadow-lg pointer-events-none">
            {snipMode === 'code' ? "Drag to Select Code Area" : "Drag to Select Image Area"}
          </div>

          {snipStart && snipEnd && (
            <div 
              className={`absolute border-2 border-dashed bg-opacity-20 pointer-events-none ${snipMode === 'code' ? 'border-purple-500 bg-purple-200' : 'border-green-500 bg-green-200'}`}
              style={{
                left: Math.min(snipStart.x, snipEnd.x),
                top: Math.min(snipStart.y, snipEnd.y),
                width: Math.abs(snipEnd.x - snipStart.x),
                height: Math.abs(snipEnd.y - snipStart.y),
              }}
            />
          )}
        </div>
      )}

      {connectedUsers.length > 1 && Object.entries(cursors).map(([userId, data]) => (
        <RemoteCursor key={userId} x={data.x} y={data.y} color={data.color} email={data.email} />
      ))}

      {/* --- HEADER --- */}
      <div className="absolute top-4 left-4 z-20 flex flex-row items-center gap-2 md:flex-col md:items-start lg:flex-row lg:items-center">
        <img src={isDarkMode ? "/logo_dark_nobg.png" : "/logo_light_nobg.png"} alt="App Logo" className="h-10 w-auto drop-shadow-md" />
        <div className="flex flex-row gap-2 md:flex-col md:gap-2 lg:flex-row lg:gap-2">
          
          <div className="flex items-center gap-2 px-3 py-1 bg-white/80 backdrop-blur-sm border border-stone-200 rounded-full text-xs font-semibold text-stone-700 shadow-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-red-500"}`}></div>
            <span>{isConnected ? "Connected" : "Disconnected"}</span>
          </div>

          {/* BUTTON 1: MAKE CODE */}
          <button 
             onClick={() => isSnipping ? setIsSnipping(false) : startSnippingMode('code')}
             className={`flex items-center gap-2 px-3 py-1 text-white border border-transparent rounded-full text-xs font-bold shadow-md transition-all transform hover:scale-105 ${isSnipping && snipMode === 'code' ? 'bg-red-500' : 'bg-gradient-to-r from-purple-600 to-indigo-600'}`}
           >
             {isSnipping && snipMode === 'code' ? <Crop className="w-3 h-3" /> : <Sparkles className="w-3 h-3" />}
             <span>{isSnipping && snipMode === 'code' ? "Cancel" : "Make Code"}</span>
           </button>

           {/* BUTTON 2: MAKE IMAGE */}
           <button 
             onClick={() => isSnipping ? setIsSnipping(false) : startSnippingMode('image')}
             className={`flex items-center gap-2 px-3 py-1 text-white border border-transparent rounded-full text-xs font-bold shadow-md transition-all transform hover:scale-105 ${isSnipping && snipMode === 'image' ? 'bg-red-500' : 'bg-gradient-to-r from-green-600 to-teal-600'}`}
           >
             {isSnipping && snipMode === 'image' ? <Crop className="w-3 h-3" /> : <ImageIcon className="w-3 h-3" />}
             <span>{isSnipping && snipMode === 'image' ? "Cancel" : "Make Image"}</span>
           </button>

        </div>
      </div>

       <div className="h-full">
         <BoardProvider
           canvasId={id}
           initialElements={canvas.elements}
           onCanvasUpdate={handleCanvasUpdate}
           onCursorMove={handleCursorMove}
         >
           <ToolboxProvider isDarkMode={isDarkMode}>
             <Toolbar isDarkMode={isDarkMode} toggleDarkMode={toggleDarkMode} />
             <Board isDarkMode={isDarkMode} />
             <Toolbox isDarkMode={isDarkMode} />
           </ToolboxProvider>
         </BoardProvider>
       </div>

       <RightSidebar
         canvas={canvas}
         navigate={navigate}
         connectedUsers={connectedUsers}
         isConnected={isConnected}
         isDarkMode={isDarkMode}
       />
       
       {isConnected && user && connectedUsers.length > 1 && (
         <CallManager roomId={id} currentUser={user} isDarkMode={isDarkMode} />
       )}

      {/*\PROMPT MODAL (Step 1) --- */}
      <PromptModal 
          isOpen={isPromptModalOpen}
          onClose={() => setIsPromptModalOpen(false)}
          onSubmit={handlePromptSubmit}
          mode={snipMode}
          isDarkMode={isDarkMode}
       />

      {/*  RESULT MODAL (Step 2) --- */}
      <CodeModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        data={genAIResult}
        isLoading={genAILoading}
        isDarkMode={isDarkMode}
      />
    </div>
  );
}

export default CanvasPage;