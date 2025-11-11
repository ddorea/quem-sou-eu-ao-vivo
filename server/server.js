import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";

const PORT = process.env.PORT || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
const HINT_SECONDS = Number(process.env.ROUND_SECONDS_PER_HINT || 15);

const characters = JSON.parse(fs.readFileSync("./characters.json", "utf-8"));

const app = express();
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json());
app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: CORS_ORIGIN } });

const rooms = {};

// ------------------------------------------------------------
// FUNÇÕES
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

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

// ✅ Pontuação por dica
function pointsByHint(h) {
  if (h === 1) return 1000;
  if (h === 2) return 600;
  return 300;
}

// ✅ NOVO → Ranking agora ignora HOST e PROJETOR
function rankingOf(room) {
  return Object.entries(room.players)
    .filter(([, p]) => p.name !== "Host" && p.name !== "PROJETOR")
    .map(([socketId, p]) => ({
      socketId,
      name: p.name,
      team: p.team,
      score: p.score ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

// ✅ Múltipla escolha
function generateOptions(correctName) {
  const all = characters.map((c) => c.name);
  const wrong = all
    .filter((n) => n !== correctName)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);

  return [correctName, ...wrong].sort(() => Math.random() - 0.5);
}

function clearTimers(room) {
  if (!room?.timers) return;
  if (room.timers.hintInterval) clearTimeout(room.timers.hintInterval);
  if (room.timers.nextTimeout) clearTimeout(room.timers.nextTimeout);
  room.timers = {};
}

function emitRanking(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit("ranking:update", { ranking: rankingOf(room) });
}

// ------------------------------------------------------------
// SOCKET.IO
// ------------------------------------------------------------
io.on("connection", (socket) => {
  // ✅ Criar sala
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
      lastRanking: [],
    };

    socket.join(code);

    // ✅ Host entra como jogador mas NÃO aparece no ranking
    rooms[code].players[socket.id] = {
      name: "Host",
      team: "Host",
      score: 0,
    };

    cb?.({ roomCode: code });

    io.to(code).emit("room:state", {
      state: "lobby",
      players: rooms[code].players,
    });
  });

  // ✅ Entrar na sala
  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não encontrada" });

    // ✅ PROJETOR NÃO ENTRA COMO JOGADOR
    if (name === "PROJETOR") {
      socket.join(roomCode);
      return cb?.({ ok: true });
    }

    room.players[socket.id] = {
      name: name || "Jogador",
      team: team || "Equipe",
      score: 0,
    };

    socket.join(roomCode);

    io.to(roomCode).emit("room:state", {
      state: room.state,
      players: room.players,
    });

    cb?.({ ok: true });
  });

  // ✅ Iniciar jogo
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

  // ✅ Respostas
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    const player = room.players[socket.id];
    if (!player) return;

    if (room.round.answers[socket.id]) return;

    const given = normalize(answer);
    const correct = normalize(room.round.correctName);

    room.round.answers[socket.id] = true;

    const ok =
      given === correct ||
      correct.includes(given) ||
      given.includes(correct);

    if (ok) {
      const pts = pointsByHint(room.round.hintsRevealed);
      player.score += pts;

      io.to(roomCode).emit("answer:correct", {
        socketId: socket.id,
        name: player.name,
        team: player.team,
        points: pts,
      });

      emitRanking(roomCode);
    } else {
      socket.emit("answer:received", { ok: true });
    }
  });

  // ✅ Desconectar
  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];

        io.to(code).emit("room:state", {
          state: room.state,
          players: room.players,
        });

        if (room.hostId === socket.id) {
          delete rooms[code];
          io.to(code).emit("game:final", {
            podium: [],
            ranking: [],
          });
        }
      }
    }
  });
});

// ------------------------------------------------------------
// ROUND RÁPIDO
// ------------------------------------------------------------
function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    const ranking = rankingOf(room);
    io.to(roomCode).emit("game:final", {
      podium: ranking.slice(0, 3),
      top5: ranking.slice(0, 5),
      ranking,
    });
    return;
  }

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  room.state = "playing";
  room.round = {
    correctName: ch.name,
    hintsRevealed: 0,
    answers: {},
  };

  const options = generateOptions(ch.name);

  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    options,
  });

  let index = 0;

  const sendHint = () => {
    if (index >= ch.hints.length) {
      io.to(roomCode).emit("round:reveal", {
        name: ch.name,
        image: ch.image,
      });

      return nextRound(roomCode);
    }

    room.round.hintsRevealed = index + 1;

    io.to(roomCode).emit("round:hint", {
      hintNumber: index + 1,
      text: ch.hints[index],
      duration: HINT_SECONDS,
    });

    index++;
    room.timers.hintInterval = setTimeout(sendHint, HINT_SECONDS * 1000);
  };

  sendHint();

  emitRanking(roomCode);
}

server.listen(PORT, () => {
  console.log(`✅ Server rodando em http://localhost:${PORT}`);
});
