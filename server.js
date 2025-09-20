const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*", // For dev allow all; in prod restrict to your Netlify domain
    methods: ["GET", "POST"]
  }
});

// Keep active rooms and metadata
const rooms = {};

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Create room
  socket.on("createRoom", ({ roomCode, hostName, rounds }) => {
    if (rooms[roomCode]) {
      socket.emit("roomFull", { roomCode });
      return;
    }

    rooms[roomCode] = {
      hostId: socket.id,
      hostName,
      guestId: null,
      guestName: null,
      rounds
    };

    socket.join(roomCode);
    console.log(`Room created: ${roomCode} by ${hostName}`);
    socket.emit("roomCreated", { roomCode });
  });

  // Join room
  socket.on("joinRoom", ({ roomCode, guestName }) => {
    const room = rooms[roomCode];

    if (!room) {
      socket.emit("roomNotFound", { roomCode });
      return;
    }
    if (room.guestId) {
      socket.emit("roomFull", { roomCode });
      return;
    }

    room.guestId = socket.id;
    room.guestName = guestName;
    socket.join(roomCode);

    console.log(`${guestName} joined room ${roomCode}`);

    // notify both players
    io.to(room.hostId).emit("guestJoined", { guestName, roomCode });
    socket.emit("joinedSuccess", { hostName: room.hostName, roomCode });
  });

  // Letter guess
  socket.on("letterGuess", ({ roomCode, letter, isCorrect, sender }) => {
    socket.to(roomCode).emit("letterAttempt", { letter, guesser: sender });
  });

  // Movie set
  socket.on("movieSet", ({ roomCode, movie, setterName }) => {
    socket.to(roomCode).emit("movieSet", { movie, setterName });
  });

  // Round result
  socket.on("roundResult", (payload) => {
    const { roomCode } = payload;
    socket.to(roomCode).emit("roundResult", payload);
  });

  // Start round
  socket.on("startRound", (payload) => {
    const { roomCode } = payload;
    io.to(roomCode).emit("roundStarted", payload);
  });

  // Rejoin host (in case of refresh)
  socket.on("rejoinHost", ({ roomCode, hostName }) => {
    if (rooms[roomCode]) {
      rooms[roomCode].hostId = socket.id;
      rooms[roomCode].hostName = hostName;
      socket.join(roomCode);
      socket.emit("roomCreated", { roomCode });
      console.log(`Host rejoined room ${roomCode}`);
    }
  });

  // Leave room
  socket.on("leaveRoom", ({ roomCode }) => {
    if (rooms[roomCode]) {
      socket.leave(roomCode);
      io.to(roomCode).emit("playerDisconnected", { roomCode });
      delete rooms[roomCode];
      console.log(`Room ${roomCode} closed`);
    }
  });

  // Handle disconnect
  socket.on("disconnect", () => {
    console.log("User disconnected:", socket.id);

    // Find which room they were in
    for (const [roomCode, room] of Object.entries(rooms)) {
      if (room.hostId === socket.id || room.guestId === socket.id) {
        io.to(roomCode).emit("playerDisconnected", { roomCode });
        delete rooms[roomCode];
        console.log(`Room ${roomCode} closed due to disconnect`);
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
