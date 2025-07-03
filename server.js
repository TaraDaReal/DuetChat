const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Store active chat rooms with connected IPs
const chatRooms = {};

// Serve a simple homepage
app.get('/', (req, res) => {
  res.send('DuetChat server is running. Connect via /chat/roomname');
});

// Middleware to get client IP address (trusting X-Forwarded-For from Nginx)
app.set('trust proxy', true);

app.get('/chat/:room', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

io.on('connection', (socket) => {
  // Get the room and IP from handshake query
  const room = socket.handshake.query.room;
  const ip = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address;

  if (!room) {
    socket.disconnect(true);
    return;
  }

  // Initialize room if needed
  if (!chatRooms[room]) {
    chatRooms[room] = new Set();
  }

  const ips = chatRooms[room];

  if (!ips.has(ip) && ips.size >= 2) {
    // Reject connection if room full
    socket.emit('full', 'Room full (max 2 IPs)');
    socket.disconnect(true);
    return;
  }

  ips.add(ip);

  socket.join(room);

  console.log(`IP ${ip} connected to room ${room}`);

  socket.on('chat message', (msg) => {
    io.to(room).emit('chat message', msg);
  });

  socket.on('disconnect', () => {
    // Remove IP from room on disconnect
    if (chatRooms[room]) {
      ips.delete(ip);
      if (ips.size === 0) {
        delete chatRooms[room];
      }
    }
    console.log(`IP ${ip} disconnected from room ${room}`);
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
