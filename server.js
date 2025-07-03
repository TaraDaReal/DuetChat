const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json());

const chatRooms = {};       // Stores IPs per room
const messageHistory = {};  // Stores messages per room

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/chat/:room', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

app.post('/delete', (req, res) => {
  const room = req.body.room;
  const sockets = io.sockets.adapter.rooms.get(room);

  if (sockets) {
    for (const socketId of sockets) {
      const socket = io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('chat deleted');
        socket.disconnect();
      }
    }
  }

  delete chatRooms[room];
  delete messageHistory[room];

  res.sendStatus(200);
});

io.on('connection', socket => {
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;
  const room = socket.handshake.query.room;

  if (!chatRooms[room]) {
    chatRooms[room] = new Set();
    messageHistory[room] = [];
  }

  const ips = chatRooms[room];

  if (!ips.has(ip) && ips.size >= 2) {
    socket.emit('full', 'Room is full. Only 2 IPs allowed.');
    socket.disconnect();
    return;
  }

  ips.add(ip);
  socket.join(room);

  // Send existing history
  messageHistory[room].forEach(msg => socket.emit('chat message', msg));

  socket.on('chat message', msg => {
    const fullMsg = `[${new Date().toLocaleTimeString()}] ${msg}`;
    messageHistory[room].push(fullMsg);
    io.to(room).emit('chat message', fullMsg);
  });

  socket.on('disconnect', () => {
    // Do NOT remove IP — first 2 IPs are permanent until delete
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
