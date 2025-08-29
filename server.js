// server.js
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static index.html (single-file frontend)
app.use(express.static(path.join(__dirname)));

const users = new Map(); // socketId -> { name, avatar, socketId }
const rooms = new Map(); // roomId -> [messages...]

function getPublicUserList() {
  return Array.from(users.values()).map(u => ({ name: u.name, avatar: u.avatar, socketId: u.socketId }));
}

io.on('connection', socket => {
  console.log('socket connected:', socket.id);

  // user joins with their name and optional avatar dataURL
  socket.on('join', ({ name, avatar }) => {
    users.set(socket.id, { name: name || 'Anonymous', avatar: avatar || null, socketId: socket.id });
    io.emit('users', getPublicUserList());
    // join global room
    socket.join('global');
    // send existing global room messages
    if (rooms.has('global')) socket.emit('room_messages', { roomId: 'global', messages: rooms.get('global') });
  });

  // send public (global) message
  socket.on('public_message', ({ text }) => {
    const user = users.get(socket.id);
    if (!user || !text) return;
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
      from: { name: user.name, avatar: user.avatar, socketId: socket.id },
      text: text,
      ts: Date.now(),
      roomId: 'global'
    };
    if (!rooms.has('global')) rooms.set('global', []);
    rooms.get('global').push(msg);
    io.to('global').emit('new_message', msg);
  });

  // start or continue private chat - server will forward to the target socketId
  // clients should create consistent roomId: smallerId_largerId
  socket.on('private_message', ({ toSocketId, text }) => {
    const from = users.get(socket.id);
    const to = users.get(toSocketId);
    if (!from || !to || !text) return;
    // canonical room id
    const roomId = [socket.id, toSocketId].sort().join('_');
    const msg = {
      id: Date.now() + '-' + Math.random().toString(36).slice(2,8),
      from: { name: from.name, avatar: from.avatar, socketId: socket.id },
      to: { name: to.name, avatar: to.avatar, socketId: toSocketId },
      text,
      ts: Date.now(),
      roomId
    };
    if (!rooms.has(roomId)) rooms.set(roomId, []);
    rooms.get(roomId).push(msg);

    // send to both sockets (if connected)
    io.to(toSocketId).to(socket.id).emit('new_message', msg);
  });

  // ask server for existing room messages
  socket.on('get_room', ({ roomId }) => {
    const msgs = rooms.get(roomId) || [];
    socket.emit('room_messages', { roomId, messages: msgs });
  });

  socket.on('disconnect', () => {
    users.delete(socket.id);
    io.emit('users', getPublicUserList());
    console.log('socket disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
