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
// PATH FIX (necessário em ambientes ESM)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ------------------------------------------------------------
// CONFIG
const PORT = process.env.PORT || 4000;
const ROUND_TIME = Number(process.env.ROUND_TIME_SECONDS || 30);   // 30s por round
const REVEAL_TIME = Number(process.env.REVEAL_TIME_SECONDS || 30); // 30s de revelação

const CORS_ALLOWED = [
  "http://localhost:5173",
  "https://ddorea.github.io",
  "https://ddorea.github.io/quem-sou-eu-ao-vivo",
  // adicione aqui seu domínio do cliente se for diferente
];

console.log("CORS allowed:", CORS_ALLOWED);

// ------------------------------------------------------------
// LOAD CHARACTERS
const charactersPath = path.join(__dirname, "characters.json");
const characters = JSON.parse(fs.readFileSync(charactersPath, "utf-8"));

// ------------------------------------------------------------
const app = express();
app.use(cors({ origin: CORS_ALLOWED }));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ALLOWED } });

// ------------------------------------------------------------
// ROOMS state
const rooms = {};

// ------------------------------------------------------------
// HELPERS
function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const pool = characters.filter((c) => !used.has(c.id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : characters[0];
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
    .map(([id, p]) => ({ socketId: id, name: p.name, corrects: p.corrects ?? 0 }))
    .sort((a, b) => b.corrects - a.corrects);
}

function generateOptions(correctName) {
  const names = [...characters.map(c => c.name), ...extraNames];
  const wrong = names.filter(n => n !== correctName).sort(() => Math.random() - 0.5).slice(0, 3);
  return [correctName, ...wrong].sort(() => Math.random() - 0.5);
}

function clearTimers(room) {
  if (!room?.timers) return;
  Object.values(room.timers).forEach(t => clearTimeout(t));
  room.timers = {};
}

// ------------------------------------------------------------
// SOCKET.IO
io.on("connection", (socket) => {
  // criar sala
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
      stats: {} // contador por personagem id
    };

    socket.join(code);

    // registra host como player (não aparece no ranking)
    rooms[code].players[socket.id] = { name: "Host", team: "Host", corrects: 0 };

    cb?.({ roomCode: code });
    io.to(code).emit("room:state", { state: "lobby", players: rooms[code].players });
  });

  // join
  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não existe" });

    // projetor entra mas não vira player
    if (name === "PROJETOR") {
      socket.join(roomCode);
      return cb?.({ ok: true });
    }

    room.players[socket.id] = { name: name || "Jogador", team: team || "Equipe", corrects: 0 };
    socket.join(roomCode);

    io.to(roomCode).emit("room:state", { state: room.state, players: room.players });
    cb?.({ ok: true });
  });

  // iniciar jogo (countdown)
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

  // resposta do usuário
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    const player = room.players[socket.id];
    if (!player) return;

    // já respondeu
    if (room.round.answered[socket.id]) return;
    room.round.answered[socket.id] = true;

    const correct = normalize(room.round.correctName);
    const given = normalize(answer);
    const isCorrect = (correct === given);

    // se correto, incrementa contador de acertos
    if (isCorrect) {
      player.corrects = (player.corrects ?? 0) + 1;
      // contabiliza estatística do personagem
      room.stats[room.round.charId] = (room.stats[room.round.charId] ?? 0) + 1;
    }

    // envia feedback só para quem respondeu
    socket.emit("answer:feedback", {
      ok: isCorrect,
      correctName: room.round.correctName,
      image: room.round.image
    });

    // CANCELA timers e revela para todos IMEDIATAMENTE
    clearTimers(room);
    io.to(roomCode).emit("round:reveal", { name: room.round.correctName, image: room.round.image });

    // após REVEAL_TIME, vai para próximo round automaticamente
    room.timers.reveal = setTimeout(() => {
      nextRound(roomCode);
    }, REVEAL_TIME * 1000);

    // atualiza estado da sala (para o host ver acertos)
    io.to(roomCode).emit("room:state", { state: room.state, players: room.players });
  });

  // pular round — somente host pode pular
  socket.on("round:skip", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    if (socket.id !== room.hostId) return; // só host

    if (!room.round) {
      // nada a fazer
      return;
    }

    clearTimers(room);
    // revela (caso não tenha sido revelado)
    io.to(roomCode).emit("round:reveal", { name: room.round.correctName, image: room.round.image });

    // agenda próximo round após REVEAL_TIME
    room.timers.reveal = setTimeout(() => {
      nextRound(roomCode);
    }, REVEAL_TIME * 1000);
  });

  // disconnect
  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(code).emit("room:state", { state: room.state, players: room.players });

        // se host saiu, encerra sala
        if (room.hostId === socket.id) {
          clearTimers(room);
          io.to(code).emit("game:final", { podium: [], ranking: [], charStats: [] });
          delete rooms[code];
        }
      }
    }
  });
});

// ------------------------------------------------------------
// ROUND flow
function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    // fim do jogo
    const ranking = rankingOf(room);
    // charStats
    const charStats = Object.entries(room.stats || {})
      .map(([id, count]) => {
        const ch = characters.find(c => c.id === id);
        return { id, name: ch?.name ?? id, count };
      })
      .sort((a, b) => b.count - a.count);

    io.to(roomCode).emit("game:final", { podium: ranking.slice(0, 3), ranking, charStats });
    return;
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

  // envia START com TODAS as pistas de uma vez e duration do round
  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints,
    options,
    duration: ROUND_TIME
  });

  // agenda reveal após ROUND_TIME caso ninguém responda antes
  room.timers.round = setTimeout(() => {
    // revela para todos
    io.to(roomCode).emit("round:reveal", { name: ch.name, image: ch.image });

    // após REVEAL_TIME, avança
    room.timers.reveal = setTimeout(() => {
      nextRound(roomCode);
    }, REVEAL_TIME * 1000);
  }, ROUND_TIME * 1000);
}

// ------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Server rodando na porta ${PORT}`);
});