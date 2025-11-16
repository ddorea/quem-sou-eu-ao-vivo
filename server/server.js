import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { extraNames } from "./extraNames.js";

// ------------------------------------------------------------
// PATH FIX
// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// CONSTANTES
// ------------------------------------------------------------
const PORT = process.env.PORT || 4000;
const ROUND_TIME = 30;        // ⬅ 30s por round
const REVEAL_TIME = 30;       // ⬅ 30s de revelação

// CORS (produção)
const CORS_ALLOWED = [
  "http://localhost:5173",
  "https://ddorea.github.io",
  "https://ddorea.github.io/quem-sou-eu-ao-vivo"
];

// ------------------------------------------------------------
// LOAD CHARACTERS
// ------------------------------------------------------------
const charactersPath = path.join(__dirname, "characters.json");
const characters = JSON.parse(fs.readFileSync(charactersPath, "utf-8"));

// ------------------------------------------------------------
// EXPRESS + SOCKET.IO
// ------------------------------------------------------------
const app = express();
app.use(cors({ origin: CORS_ALLOWED }));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ALLOWED }
});

// ------------------------------------------------------------
// ROOMS
// ------------------------------------------------------------
const rooms = {};

// ------------------------------------------------------------
// FUNÇÕES AUXILIARES
// ------------------------------------------------------------
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const pool = characters.filter((c) => !used.has(c.id));
  return pool.length
    ? pool[Math.floor(Math.random() * pool.length)]
    : characters[0];
}

// NORMALIZAÇÃO
function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// RANKING POR ACERTOS
function rankingOf(room) {
  return Object.entries(room.players)
    .filter(([, p]) => p.name !== "Host" && p.name !== "PROJETOR")
    .map(([id, p]) => ({
      socketId: id,
      name: p.name,
      corrects: p.corrects ?? 0
    }))
    .sort((a, b) => b.corrects - a.corrects);
}

// GERAR OPÇÕES (CORRETO + ERRADAS)
function generateOptions(correctName) {
  const names = [
    ...characters.map(c => c.name),
    ...extraNames
  ];

  const wrong = names
    .filter(n => n !== correctName)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return [correctName, ...wrong].sort(() => Math.random() - 0.5);
}

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------
io.on("connection", (socket) => {

  // CRIAR SALA
  socket.on("room:create", ({ hostName = "Host", totalRounds = 6 }, cb) => {
    const code = generateRoomCode();

    rooms[code] = {
      hostId: socket.id,
      state: "lobby",
      players: {},
      used: new Set(),
      roundNumber: 0,
      totalRounds,
      round: null,
      timers: {},
      stats: {}            // ← registro de personagens acertados
    };

    socket.join(code);

    rooms[code].players[socket.id] = {
      name: "Host",
      team: "Host",
      corrects: 0
    };

    cb?.({ roomCode: code });

    io.to(code).emit("room:state", {
      state: "lobby",
      players: rooms[code].players
    });
  });

  // ENTRAR NA SALA
  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não existe" });

    if (name === "PROJETOR") {
      socket.join(roomCode);
      return cb?.({ ok: true });
    }

    room.players[socket.id] = {
      name,
      team,
      corrects: 0
    };

    socket.join(roomCode);
    io.to(roomCode).emit("room:state", {
      state: room.state,
      players: room.players
    });

    cb?.({ ok: true });
  });

  // INICIAR JOGO
  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;

    io.to(roomCode).emit("game:countdown:start", { seconds: 3 });

    setTimeout(() => {
      room.state = "playing";
      room.roundNumber = 0;
      nextRound(roomCode);
    }, 3000);
  });

  // RESPOSTA DO USUÁRIO
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    const player = room.players[socket.id];
    if (!player) return;

    if (room.round.answered[socket.id]) return;

    room.round.answered[socket.id] = true;

    const correct = normalize(room.round.correctName);
    const given = normalize(answer);

    const isCorrect = (correct === given);

    if (isCorrect) {
      player.corrects = (player.corrects ?? 0) + 1;

      // registrar estatísticas
      room.stats[room.round.charId] =
        (room.stats[room.round.charId] ?? 0) + 1;

      socket.emit("answer:feedback", {
        ok: true,
        correctName: room.round.correctName,
        image: room.round.image
      });
    } else {
      socket.emit("answer:feedback", {
        ok: false,
        correctName: room.round.correctName,
        image: room.round.image
      });
    }
  });

  // PULAR ROUND
  socket.on("round:skip", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || socket.id !== room.hostId) return;

    clearTimers(room);
    nextRound(roomCode);
  });

  // DESCONECTAR
  socket.on("disconnect", () => {
    for (const [roomCode, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(roomCode).emit("room:state", {
          state: room.state,
          players: room.players
        });
      }
    }
  });
});

// ------------------------------------------------------------
// LÓGICA DO ROUND
// ------------------------------------------------------------
function clearTimers(room) {
  if (!room.timers) return;
  for (const t of Object.values(room.timers)) clearTimeout(t);
  room.timers = {};
}

function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    return endGame(roomCode);
  }

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  const options = generateOptions(ch.name);

  room.round = {
    charId: ch.id,
    correctName: ch.name,
    image: ch.image,
    answered: {}
  };

  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints,
    options,
    duration: ROUND_TIME
  });

  room.timers.round = setTimeout(() => {
    io.to(roomCode).emit("round:reveal", {
      name: ch.name,
      image: ch.image
    });

    room.timers.reveal = setTimeout(() => {
      nextRound(roomCode);
    }, REVEAL_TIME * 1000);

  }, ROUND_TIME * 1000);
}

function endGame(roomCode) {
  const room = rooms[roomCode];

  const ranking = rankingOf(room);

  const charStats = Object.entries(room.stats)
    .map(([id, count]) => {
      const ch = characters.find(c => c.id == id);
      return { id, name: ch.name, count };
    })
    .sort((a, b) => b.count - a.count);

  io.to(roomCode).emit("game:final", {
    podium: ranking.slice(0, 3),
    ranking,
    charStats
  });
}

// ------------------------------------------------------------
server.listen(PORT, () => {
  console.log("🚀 Server rodando na porta " + PORT);
});