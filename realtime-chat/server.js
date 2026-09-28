const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.io with open CORS policy across environments
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PORT || 3000;

// Serve static assets (index.html) from current directory
app.use(express.static(path.join(__dirname)));

// Map of active connected users (socket.id -> username)
const activeUsers = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  // Handle client user authentication/joining
  socket.on('user_join', (rawUsername) => {
    const username = String(rawUsername || 'Anonymous').trim().slice(0, 25);
    activeUsers.set(socket.id, username);

    // Notify other peers in room
    socket.broadcast.emit('system_message', {
      text: `${username} joined the room`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      onlineCount: activeUsers.size
    });

    // Welcome current user and sync online count
    socket.emit('system_message', {
      text: `Connected to real-time chat as ${username}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      onlineCount: activeUsers.size
    });

    // Broadcast updated user count to all
    io.emit('online_count', activeUsers.size);
  });

  // Handle incoming chat messages and broadcast instantly
  socket.on('chat_message', (payload) => {
    if (!payload || !payload.text || typeof payload.text !== 'string') return;

    const cleanText = payload.text.trim().slice(0, 2000);
    if (!cleanText) return;

    const username = activeUsers.get(socket.id) || payload.username || 'Anonymous';
    
    const outgoingMessage = {
      id: payload.id || `msg_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
      senderId: socket.id,
      username: username,
      text: cleanText,
      timestamp: payload.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Broadcast to all sockets EXCEPT sender (sender is already rendered optimistically)
    socket.broadcast.emit('chat_message', outgoingMessage);
  });

  // Real-time typing indicators
  socket.on('typing', (isTyping) => {
    const username = activeUsers.get(socket.id) || 'Someone';
    socket.broadcast.emit('user_typing', {
      userId: socket.id,
      username: username,
      isTyping: Boolean(isTyping)
    });
  });

  // Handle connection cleanup on disconnect
  socket.on('disconnect', () => {
    const username = activeUsers.get(socket.id);
    activeUsers.delete(socket.id);

    if (username) {
      socket.broadcast.emit('system_message', {
        text: `${username} left the room`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        onlineCount: activeUsers.size
      });
    }

    io.emit('online_count', activeUsers.size);
    console.log(`[Socket Disconnected] ID: ${socket.id}`);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Real-Time Chat Server listening on http://localhost:${PORT}`);
});
