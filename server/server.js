import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS || 20);

const CORS_ALLOWED = [
  "http://localhost:5173",
  "https://ddorea.github.io",
  "https://ddorea.github.io/quem-sou-eu-ao-vivo"
];

const charactersPath = path.join(__dirname, "characters.json");
const characters = JSON.parse(fs.readFileSync(charactersPath, "utf-8"));

const app = express();
app.use(cors({ origin: CORS_ALLOWED }));
app.use(express.json());
app.get("/health", (_, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ALLOWED } });

const rooms = {};

/* ---------------- FUNÇÕES ---------------- */
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const list = characters.filter(c => !used.has(c.id));
  return list.length ? list[Math.floor(Math.random() * list.length)] : characters[0];
}

function shuffleOptions(correct) {
  const wrong = characters
    .filter(c => c.name !== correct)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3)
    .map(c => c.name);

  return [correct, ...wrong].sort(() => Math.random() - 0.5);
}

/* ---------------- SOCKET.IO ---------------- */
io.on("connection", (socket) => {

  socket.on("room:create", ({ totalRounds }, cb) => {
    const code = generateRoomCode();

    rooms[code] = {
      hostId: socket.id,
      players: {},
      used: new Set(),
      roundNumber: 0,
      totalRounds,
      charStats: {},
      timers: {},
      current: null
    };

    socket.join(code);

    rooms[code].players[socket.id] = {
      name: "Host",
      corrects: 0
    };

    cb({ roomCode: code });

    io.to(code).emit("room:state", {
      players: rooms[code].players
    });
  });

  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb({ error: "Sala não encontrada" });

    if (name === "PROJETOR") {
      socket.join(roomCode);
      return cb({ ok: true });
    }

    room.players[socket.id] = {
      name,
      team,
      corrects: 0
    };

    socket.join(roomCode);

    io.to(roomCode).emit("room:state", {
      players: room.players
    });

    cb({ ok: true });
  });

  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;

    io.to(roomCode).emit("game:countdown:start", { seconds: 3 });

    setTimeout(() => {
      room.roundNumber = 0;
      nextRound(roomCode);
    }, 3000);
  });

  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room?.current) return;

    const player = room.players[socket.id];
    if (!player) return;

    if (room.current.answered[socket.id]) return;
    room.current.answered[socket.id] = true;

    const correct = room.current.correctName.toLowerCase();
    const given = answer.toLowerCase();

    const ok =
      given === correct ||
      correct.includes(given) ||
      given.includes(correct);

    if (ok) {
      player.corrects += 1;
      room.charStats[room.current.id] = (room.charStats[room.current.id] || 0) + 1;

      socket.emit("answer:feedback", { ok: true });
    } else {
      socket.emit("answer:feedback", { ok: false });
    }
  });

  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];

        if (room.hostId === socket.id) {
          delete rooms[code];
          io.to(code).emit("game:final", {
            podium: [],
            ranking: [],
            charStats: []
          });
        }
      }
    }
  });
});

/* ---------------- RODADAS ---------------- */
function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.roundNumber++;

  if (room.roundNumber > room.totalRounds) {
    const ranking = Object.values(room.players)
      .filter(p => p.name !== "Host" && p.name !== "PROJETOR")
      .sort((a, b) => b.corrects - a.corrects);

    const charStats = Object.entries(room.charStats)
      .map(([id, count]) => ({
        id,
        name: characters.find(c => c.id == id)?.name,
        count
      }))
      .sort((a, b) => b.count - a.count);

    io.to(roomCode).emit("game:final", {
      podium: ranking.slice(0, 3),
      ranking,
      charStats
    });

    return;
  }

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  room.current = {
    id: ch.id,
    correctName: ch.name,
    answered: {}
  };

  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints,
    duration: ROUND_SECONDS,
    options: shuffleOptions(ch.name)
  });

  room.timers.round = setTimeout(() => {
    io.to(roomCode).emit("round:reveal", {
      name: ch.name,
      image: ch.image
    });

    setTimeout(() => nextRound(roomCode), 4500);

  }, ROUND_SECONDS * 1000);
}

server.listen(PORT, () =>
  console.log("🔥 Server rodando na porta", PORT)
);