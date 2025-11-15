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
const ROUND_SECONDS = Number(process.env.ROUND_SECONDS_PER_HINT || 15);

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

app.get("/health", (req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ALLOWED } });

const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const pool = characters.filter(c => !used.has(c.id));
  return pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : characters[0];
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ===== Novo ranking baseado APENAS em acertos =====
function rankingOf(room) {
  return Object.entries(room.players)
    .filter(([_, p]) => p.name !== "Host" && p.name !== "PROJETOR")
    .map(([socketId, p]) => ({
      socketId,
      name: p.name,
      corrects: p.corrects ?? 0
    }))
    .sort((a, b) => b.corrects - a.corrects);
}

io.on("connection", socket => {

  socket.on("room:create", ({ totalRounds = 6 }, cb) => {
    const code = generateRoomCode();

    rooms[code] = {
      hostId: socket.id,
      players: {},
      used: new Set(),
      roundNumber: 0,
      totalRounds,
      timers: {},
      currentCharacter: null,
      characterHits: {} // estatísticas
    };

    socket.join(code);

    rooms[code].players[socket.id] = {
      name: "Host",
      corrects: 0
    };

    cb?.({ roomCode: code });

    io.to(code).emit("room:state", { state: "lobby", players: rooms[code].players });
  });


  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não existe." });

    socket.join(roomCode);

    if (name === "PROJETOR") return cb?.({ ok: true });

    room.players[socket.id] = {
      name,
      team,
      corrects: 0
    };

    cb?.({ ok: true });

    io.to(roomCode).emit("room:state", {
      state: "lobby",
      players: room.players
    });
  });


  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;

    io.to(roomCode).emit("game:countdown:start", { seconds: 3 });

    setTimeout(() => {
      nextRound(roomCode);
    }, 3000);
  });


  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.currentCharacter) return;

    const player = room.players[socket.id];
    if (!player) return;

    const given = normalize(answer);
    const correct = normalize(room.currentCharacter.name);

    if (given === correct) {
      player.corrects = (player.corrects || 0) + 1;

      // estatística
      room.characterHits[room.currentCharacter.id] =
        (room.characterHits[room.currentCharacter.id] || 0) + 1;

      socket.emit("answer:result", { correct: true });
    } else {
      socket.emit("answer:result", { correct: false });
    }
  });


  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];

        if (room.hostId === socket.id) {
          delete rooms[code];
          io.to(code).emit("game:final", { podium: [], ranking: [] });
        }
      }
    }
  });
});


// ========== CONTROLE DE RODADAS ==========

function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  room.roundNumber++;

  // acabou o jogo
  if (room.roundNumber > room.totalRounds) {
    const ranking = rankingOf(room);
    const charStats = Object.entries(room.characterHits)
      .map(([id, count]) => ({
        id,
        name: characters.find(c => c.id === id)?.name,
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

  // novo personagem
  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);
  room.currentCharacter = ch;

  const options = shuffleOptions(ch.name);

  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints,
    duration: ROUND_SECONDS,
    options
  });

  // revelar depois do tempo
  room.timers.roundTimeout = setTimeout(() => {
    io.to(roomCode).emit("round:reveal", {
      name: ch.name,
      image: ch.image
    });

    setTimeout(() => {
      nextRound(roomCode);
    }, 3000);
  }, ROUND_SECONDS * 1000);
}

// criar múltipla escolha
function shuffleOptions(correct) {
  const wrong = characters
    .map(c => c.name)
    .filter(n => n !== correct)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return [correct, ...wrong].sort(() => Math.random() - 0.5);
}

server.listen(PORT, () => {
  console.log("🔥 SERVER ONLINE:", PORT);
});