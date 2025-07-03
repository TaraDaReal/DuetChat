const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for chat room URLs like /chat/:room
app.get('/chat/:room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// In-memory storage
const chatRooms = {};       // roomName -> Set of IP strings
const messageHistory = {};  // roomName -> array of messages

io.on('connection', (socket) => {
  const room = socket.handshake.query.room;
  if (!room) {
    socket.disconnect(true);
    return;
  }

  // Get client IP, prefer x-forwarded-for if behind proxy
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  if (!chatRooms[room]) chatRooms[room] = new Set();
  if (!messageHistory[room]) messageHistory[room] = [];

  const ips = chatRooms[room];

  // Enforce max 2 unique IPs per room
  if (!ips.has(ip) && ips.size >= 2) {
    socket.emit('full', 'Room full — max 2 users allowed.');
    socket.disconnect(true);
    return;
  }

  ips.add(ip);
  socket.join(room);

  // Send message history to newly connected client
  socket.emit('message history', messageHistory[room]);

  socket.on('chat message', (msg) => {
    // Save message and limit history size
    messageHistory[room].push(msg);
    if (messageHistory[room].length > 50) messageHistory[room].shift();

    io.to(room).emit('chat message', msg);
  });

  // Handle delete chat request
  socket.on('delete chat', () => {
    // Kick all clients in this room
    const clients = io.sockets.adapter.rooms.get(room);
    if (clients) {
      for (const clientId of clients) {
        const clientSocket = io.sockets.sockets.get(clientId);
        if (clientSocket) {
          clientSocket.emit('chat deleted');
          clientSocket.disconnect(true);
        }
      }
    }
    // Clear room data
    delete chatRooms[room];
    delete messageHistory[room];
  });

  socket.on('disconnect', () => {
    ips.delete(ip);
    if (ips.size === 0) {
      delete chatRooms[room];
      delete messageHistory[room];
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});
