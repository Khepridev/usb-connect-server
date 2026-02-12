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

app.get('/', (_, res) => {
    res.status(200).send('USB Connect signaling server is running.');
});

app.get('/health', (_, res) => {
    res.status(200).json({ ok: true });
});

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('create-room', (roomId) => {
        if (!roomId) {
            socket.emit('room-error', 'Room id is required');
            return;
        }

        // Keep a single active host room per socket to avoid stale IDs on refresh.
        for (const [existingRoomId, room] of rooms.entries()) {
            if (room.host === socket.id) {
                socket.leave(existingRoomId);
                rooms.delete(existingRoomId);
            }
        }

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
                socket.emit('room-full', 'Room is full');
            }
        } else {
            socket.emit('room-not-found', 'Room not found');
        }
    });

    socket.on('signal', ({ roomId, signal }) => {
        socket.to(roomId).emit('signal', { sender: socket.id, signal });
    });

    // USB device list: host sends, server forwards to client
    socket.on('usb-device-list', (data = {}) => {
        const { roomId, ...payload } = data;
        if (!roomId) {
            socket.emit('room-error', 'roomId is required for usb-device-list');
            return;
        }

        socket.to(roomId).emit('usb-device-list', payload);
        console.log(`USB device list sent in room: ${roomId}`);
    });

    // USB bind request: client sends, server forwards to host
    socket.on('usb-bind-request', ({ roomId, busId }) => {
        socket.to(roomId).emit('usb-bind-request', busId);
        console.log(`USB bind request for ${busId} in room: ${roomId}`);
    });

    // USB share result: host sends IP+busId, server forwards to client
    socket.on('usb-share-result', (data) => {
        const { roomId, ...rest } = data;
        socket.to(roomId).emit('usb-share-result', rest);
        console.log(`USB share result in room: ${roomId}`, rest);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        // Cleanup rooms
        for (const [roomId, room] of rooms.entries()) {
            if (room.host === socket.id || room.client === socket.id) {
                socket.to(roomId).emit('peer-disconnected');
                rooms.delete(roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Signaling server running on port ${PORT}`);
});
