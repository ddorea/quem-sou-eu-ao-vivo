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

// 🔥 30 segundos por round
const ROUND_DURATION = 30 * 1000;
// 🔥 30 segundos de revelação
const REVEAL_DURATION = 30 * 1000;

const CORS_ALLOWED = [
  "http://localhost:5173",
  "https://ddorea.github.io",
  "https://ddorea.github.io/quem-sou-eu-ao-vivo"
];

console.log("🔧 CORS permitido:", CORS_ALLOWED);

const charactersPath = path.join(__dirname, "characters.json");
const characters = JSON.parse(fs.readFileSync(charactersPath, "utf-8"));

const app = express();
app.use(cors({ origin: CORS_ALLOWED }));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ALLOWED } });

const rooms = {};

// ------------------------------------------------------------
// FUNÇÕES AUXILIARES
// ------------------------------------------------------------
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const pool = characters.filter(ch => !used.has(ch.id));
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function rankingOf(room) {
  return Object.entries(room.players)
    .filter(([, p]) => p.name !== "Host" && p.name !== "PROJETOR")
    .map(([sid, p]) => ({
      socketId: sid,
      name: p.name,
      corrects: p.corrects || 0
    }))
    .sort((a, b) => b.corrects - a.corrects);
}

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------
io.on("connection", socket => {

  socket.on("room:create", ({ totalRounds }, cb) => {
    const code = generateRoomCode();

    rooms[code] = {
      hostId: socket.id,
      players: {},
      totalRounds,
      used: new Set(),
      roundNumber: 0,
      round: null,
      timers: {},
      charStats: {} // contador por personagem
    };

    rooms[code].players[socket.id] = {
      name: "Host",
      team: "Host",
      corrects: 0
    };

    socket.join(code);
    cb?.({ roomCode: code });

    io.to(code).emit("room:state", { players: rooms[code].players });
  });

  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não encontrada" });

    socket.join(roomCode);

    if (name === "PROJETOR") return cb?.({ ok: true });

    room.players[socket.id] = {
      name,
      team,
      corrects: 0
    };

    io.to(roomCode).emit("room:state", { players: room.players });
    cb?.({ ok: true });
  });

  // ------------------------------------------------------------
  // INICIAR JOGO
  // ------------------------------------------------------------
  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return;

    io.to(roomCode).emit("game:countdown:start", { seconds: 3 });

    setTimeout(() => {
      nextRound(roomCode);
    }, 3000);
  });

  // ------------------------------------------------------------
  // RESPOSTAS DOS JOGADORES
  // ------------------------------------------------------------
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    const player = room.players[socket.id];
    if (!player) return;

    if (room.round.answered[socket.id]) return;
    room.round.answered[socket.id] = true;

    const correct = normalize(room.round.correctName);
    const given = normalize(answer);

    const ok = given === correct;

    if (ok) {
      player.corrects++;
      room.charStats[room.round.id] =
        (room.charStats[room.round.id] || 0) + 1;

      io.to(socket.id).emit("answer:feedback", { ok: true });
    } else {
      io.to(socket.id).emit("answer:feedback", { ok: false });
    }

    // força revelação imediata só para o jogador
    io.to(socket.id).emit("force:reveal", {
      name: room.round.correctName,
      image: room.round.image
    });
  });

  // ------------------------------------------------------------
  // PULAR ROUND (BOTÃO DO PROJETOR)
  // ------------------------------------------------------------
  socket.on("round:skip", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;

    clearTimers(room);
    nextRound(roomCode);
  });

  // desconectar
  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (!room.players[socket.id]) continue;

      delete room.players[socket.id];

      io.to(code).emit("room:state", { players: room.players });

      if (room.hostId === socket.id) {
        delete rooms[code];
      }
    }
  });

});

// ------------------------------------------------------------
// RODADAS
// ------------------------------------------------------------
function clearTimers(room) {
  if (room?.timers?.round) clearTimeout(room.timers.round);
  if (room?.timers?.reveal) clearTimeout(room.timers.reveal);
  room.timers = {};
}

function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    const finalRanking = rankingOf(room);

    const charStatsArr = Object.entries(room.charStats)
      .map(([id, count]) => {
        const ch = characters.find(c => c.id == id);
        return { id, name: ch?.name, count };
      })
      .sort((a, b) => b.count - a.count);

    io.to(roomCode).emit("game:final", {
      podium: finalRanking.slice(0, 3),
      ranking: finalRanking,
      charStats: charStatsArr
    });

    return;
  }

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  room.round = {
    id: ch.id,
    correctName: ch.name,
    image: ch.image,
    answered: {}
  };

  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints,
    duration: 30
  });

  // fim do round → revelação
  room.timers.round = setTimeout(() => {
    io.to(roomCode).emit("round:reveal", {
      name: ch.name,
      image: ch.image
    });

    // espera 30 segundos de revelação
    room.timers.reveal = setTimeout(() => {
      nextRound(roomCode);
    }, REVEAL_DURATION);

  }, ROUND_DURATION);
}

server.listen(PORT, () => {
  console.log("🔥 Server rodando na porta " + PORT);
});