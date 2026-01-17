const express = require('express');
require('dotenv').config();
const cors = require('cors');
const connectDB = require('./config/db');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('./models/userModal');
const userRoutes = require('./routes/userRoutes');
const canvasRoutes = require('./routes/canvasRoutes');
const agoraRoutes = require('./routes/agoraRoutes');
const helmet = require("helmet");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAIRoutes = require('./routes/genAIRoutes');

// Connect to database
connectDB();

const app = express();
const server = http.createServer(app); 

app.use(
  helmet({
    crossOriginOpenerPolicy: false,
    crossOriginEmbedderPolicy: false,
  })
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);


/****************** */
function fileToGenerativePart(base64Image, mimeType) {
  return {
    inlineData: {
      data: base64Image.split(',')[1], // Remove the "data:image/png;base64," prefix
      mimeType
    },
  };
}
////////****************** */

// Improved CORS configuration for production
const allowedOrigins = [
  process.env.FRONTEND_URL,
   "https://virtual-canvas.vercel.app",
  "https://gnexflow.vercel.app",
  "http://localhost:3000",
  "http://localhost:3001"
].filter(Boolean); 

// Attach Socket.IO to the server with optimized settings for Render
const io = new Server(server, {
  cors: {
   origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    methods: ['GET', 'POST'],
    credentials: true
  },
  // Optimized settings for Render free tier
  pingTimeout: 30000, // Reduced from 60000
  pingInterval: 15000, // Reduced from 25000
  maxHttpBufferSize: 5e6, // Reduced to 5MB from 100MB
  transports: ['websocket', 'polling'], // Prefer websocket
  upgradeTimeout: 30000, // 30 seconds to upgrade
  allowEIO3: true, // Allow Engine.IO v3 clients
  // Add compression for better performance on limited bandwidth
  compression: true,
  // Reduce memory usage
  perMessageDeflate: {
    threshold: 1024,
    concurrencyLimit: 10,
    serverMaxWindowBits: 13
  }
});


const stringToColor = (str) => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  let color = '#';
  for (let i = 0; i < 3; i++) {
    const value = (hash >> (i * 8)) & 0xFF;
    color += ('00' + value.toString(16)).substr(-2);
  }
  return color;
};

// Store room information and user data with memory optimization
const rooms = new Map();
const userRooms = new Map();
const MAX_ROOMS = 50; // Limit rooms to prevent memory issues



// Enhanced room management with memory limits
const addUserToRoom = (roomId, socketId, userData = {}) => {
  // Limit number of rooms to prevent memory issues on free tier
  if (!rooms.has(roomId) && rooms.size >= MAX_ROOMS) {
    // Remove oldest inactive room
    const oldestRoom = Array.from(rooms.entries())
      .filter(([_, room]) => room.users.size === 0)
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity)[0];
    
    if (oldestRoom) {
      rooms.delete(oldestRoom[0]);
      console.log(`Removed oldest inactive room: ${oldestRoom[0]}`);
    }
  }
  
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Map(),
      lastActivity: Date.now(),
      lastCanvasUpdate: null,
    });
  }
  
  const room = rooms.get(roomId);
  room.users.set(socketId, {
    id: socketId,
    ...userData
  });
   room.lastActivity = Date.now();
  userRooms.set(socketId, roomId);
};

const removeUserFromRoom = (socketId) => {
  const roomId = userRooms.get(socketId);
  if (roomId && rooms.has(roomId)) {
    const room = rooms.get(roomId);
    room.users.delete(socketId);
    if (room.users.size === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned up empty room: ${roomId}`);
    }
    userRooms.delete(socketId);
    return roomId;
  }
  return null;
};

const getRoomUsers = (roomId) => {
  const room = rooms.get(roomId);
  return room ? Array.from(room.users.values()) : [];
};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // --- MODIFIED joinRoom handler ---
  socket.on('joinRoom', async ({ roomId, token }) => {
   try {
            if (!roomId || !token) {
                return socket.emit('error', { message: 'Invalid room or token.' });
            }
            const verified = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(verified.id).select('name email');
            if (!user) {
                return socket.emit('error', { message: 'Authentication failed.' });
            }

      // Leave previous room if any
       const previousRoomId = userRooms.get(socket.id);
            if (previousRoomId) {
                socket.leave(previousRoomId);
                removeUserFromRoom(socket.id);
                io.in(previousRoomId).emit('roomUsers', getRoomUsers(previousRoomId));
            }

            socket.join(roomId);
            addUserToRoom(roomId, socket.id, {
                name: user.name,
                email: user.email,
                color: stringToColor(user._id.toString()),
            });
      console.log(`User ${user.name} (${socket.id}) joined room ${roomId}`);
      
      // Broadcast the new list of users to everyone in the room
       io.in(roomId).emit('roomUsers', getRoomUsers(roomId));
            
            const room = rooms.get(roomId);
            if (room && room.lastCanvasUpdate) {
                socket.emit('canvasUpdate', room.lastCanvasUpdate);
            }
//       const usersInThisRoom = getRoomUsers(roomId).filter(user => user.id !== socket.id);
//     socket.emit("all-users", usersInThisRoom);

    } catch (error) {
      console.error('Join room error:', error.message);
      socket.emit('error', { message: 'Failed to join room. Invalid token.' });
    }
  });
  

  socket.on('leaveRoom', (roomId) => {
    socket.leave(roomId);
    removeUserFromRoom(socket.id);
    // Broadcast updated user list
    io.in(roomId).emit('roomUsers', getRoomUsers(roomId));
  });


  // Optimized canvas update handling with throttling
  let lastCanvasUpdate = 0;
  const CANVAS_UPDATE_THROTTLE = 50; // 50ms throttle

  socket.on('canvasUpdate', (data) => {
    const { roomId, ...updateData } = data;
    if (!roomId) return;
    
    // Cache the latest canvas state for new joiners
    const room = rooms.get(roomId);
    if (room && data.elements) {
        room.lastCanvasUpdate = updateData;
    }

    socket.to(roomId).emit('canvasUpdate', updateData);
  });

  // Throttled cursor updates
  let lastCursorUpdate = 0;
  const CURSOR_UPDATE_THROTTLE = 100; // 100ms throttle

  socket.on('userCursor', (data) => {
    const now = Date.now();
    if (now - lastCursorUpdate < CURSOR_UPDATE_THROTTLE) {
      return;
    }
    lastCursorUpdate = now;

    const { roomId, x, y } = data;
    if (!roomId || typeof x !== 'number' || typeof y !== 'number') return;
    
    const room = rooms.get(roomId);
    if (room && room.users.has(socket.id)) {
      const user = room.users.get(socket.id);
      socket.to(roomId).emit('userCursor', {
        userId: socket.id,
        x,
        y,
        color: user.color,
        email: user.email,
      });
    }
  });


   // =======================================================
    // --- HIGHLIGHT: Cleaned-Up WebRTC Signaling Handlers ---
    // This is the complete and correct logic for an invitation-based call.
    // =======================================================

    // 1. A user starts a call, inviting everyone in the room
    socket.on("initiate-call", ({ roomId, callerInfo }) => {
        socket.to(roomId).emit("call-invitation", { callerInfo });
    });

    // 2. A user accepts the call and notifies the original caller
    socket.on("accept-call", ({ callerId, calleeInfo }) => {
        io.to(callerId).emit("call-accepted", { calleeInfo });
    });

    // 3. Exchange of WebRTC signals (Offer/Answer/ICE) after call is accepted
    socket.on("sending-signal", payload => {
        io.to(payload.userToSignal).emit('user-joined', { signal: payload.signal, callerID: payload.callerID });
    });

    socket.on("returning-signal", payload => {
        io.to(payload.callerID).emit('receiving-returned-signal', { signal: payload.signal, id: socket.id });
    });
     socket.on('screen-share-changed', ({ roomId, isSharing }) => {
        // Broadcast the change to everyone else in the room
        socket.to(roomId).emit('screen-share-status-update', {
            userId: socket.id,
            isSharing: isSharing
        });
    });


socket.on('disconnect', (reason) => {
    const roomId = removeUserFromRoom(socket.id);
    if (roomId) {
      io.in(roomId).emit('user-left', socket.id);
      io.in(roomId).emit('roomUsers', getRoomUsers(roomId));
    }
  });

  socket.on('error', (error) => {
    console.error('Socket error for user', socket.id, ':', error);
  });
});



// More aggressive cleanup for free tier
setInterval(() => {
  const now = Date.now();
  const INACTIVE_TIMEOUT = 10 * 60 * 1000; // Reduced to 10 minutes

  for (const [roomId, room] of rooms.entries()) {
    if (now - room.lastActivity > INACTIVE_TIMEOUT) {
      if (room.users.size === 0) {
        rooms.delete(roomId);
        console.log(`Cleaned up inactive room: ${roomId}`);
      } else {
        // Clear canvas data for inactive rooms to save memory
        room.lastCanvasUpdate = null;
      }
    }
  }
  
  // Force garbage collection if available (for debugging)
  if (global.gc && rooms.size === 0) {
    global.gc();
  }
}, 2 * 60 * 1000); // Run every 2 minutes

// Enhanced CORS middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    
    const normalizedOrigin = origin.replace(/\/$/, '');
    const normalizedAllowed = allowedOrigins.map(o => o.replace(/\/$/, ''));
    
    if (normalizedAllowed.includes(normalizedOrigin)) {
      return callback(null, true);
    }
    
    console.warn(`CORS blocked origin: ${origin}`);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

app.use(express.json({ limit: '5mb' })); // Reduced limit
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/canvas', canvasRoutes);
app.use('/api/agora', agoraRoutes);
app.use('/api/genai', genAIRoutes);

// Enhanced health check with memory info
app.get('/api/health', (req, res) => {
  const memUsage = process.memoryUsage();
  res.status(200).json({ 
    message: 'Server is running', 
    timestamp: new Date(),
    activeRooms: rooms.size,
    totalConnections: io.engine.clientsCount,
    memory: {
      used: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
      total: Math.round(memUsage.heapTotal / 1024 / 1024) + 'MB'
    },
    uptime: Math.round(process.uptime()) + 's'
  });
});

app.get('/api/socket-status', (req, res) => {
  const roomStats = Array.from(rooms.entries()).map(([roomId, room]) => ({
    roomId: roomId.length > 20 ? roomId.substring(0, 20) + '...' : roomId,
    userCount: room.users.size,
    lastActivity: new Date(room.lastActivity),
    hasCanvasData: !!room.lastCanvasUpdate,
    age: Math.round((Date.now() - room.createdAt) / 1000) + 's'
  }));

  res.status(200).json({
    totalRooms: rooms.size,
    totalConnections: io.engine.clientsCount,
    rooms: roomStats,
    serverStats: {
      memory: process.memoryUsage(),
      uptime: process.uptime()
    }
  });
});

// Enhanced error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err.message);
  res.status(500).json({
    message: 'Server error occurred',
    error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

app.use('*', (req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Graceful shutdown handling for Render
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Allowed origins: ${allowedOrigins.join(', ')}`);
  console.log('Socket.IO server optimized for Render free tier');
});