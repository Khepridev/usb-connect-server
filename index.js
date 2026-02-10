const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create-room', (roomId) => {
        socket.join(roomId);
        rooms.set(roomId, { host: socket.id, client: null });
        console.log(`Room created: ${roomId} by ${socket.id}`);
        socket.emit('room-created', roomId);
    });

    socket.on('join-room', (roomId) => {
        if (rooms.has(roomId)) {
            const room = rooms.get(roomId);
            if (!room.client) {
                socket.join(roomId);
                room.client = socket.id;
                console.log(`User ${socket.id} joined room: ${roomId}`);
                socket.to(room.host).emit('client-joined', socket.id);
                socket.emit('joined-room', roomId);
            } else {
                socket.emit('error', 'Room is full');
            }
        } else {
            socket.emit('error', 'Room not found');
        }
    });

    socket.on('signal', ({ roomId, signal }) => {
        // Forward signal to the other person in the room
        socket.to(roomId).emit('signal', { sender: socket.id, signal });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Room cleanup could be added here
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
