import dotenv from "dotenv";
dotenv.config();

import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 4000;
// tempo do round em segundos (usado como tempo geral do round)
const HINT_SECONDS = Number(process.env.ROUND_SECONDS_PER_HINT || 20);

// CORS permitido (ajuste se necessário)
const CORS_ALLOWED = [
  "http://localhost:5173",
  "https://ddorea.github.io",
  "https://ddorea.github.io/quem-sou-eu-ao-vivo"
];

console.log("🔧 CORS permitido:", CORS_ALLOWED);

// ------------------------------------------------------------
// carregar characters.json
const charactersPath = path.join(__dirname, "characters.json");
const characters = JSON.parse(fs.readFileSync(charactersPath, "utf-8"));

const app = express();
app.use(cors({ origin: CORS_ALLOWED }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: CORS_ALLOWED }
});

// ------------------------------------------------------------
// rooms
const rooms = {};

// ------------------------------------------------------------
// util helpers
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

// ranking agora usa 'score' = número de acertos
function rankingOf(room) {
  return Object.entries(room.players)
    .filter(([, p]) => p.name !== "Host" && p.name !== "PROJETOR")
    .map(([socketId, p]) => ({
      socketId,
      name: p.name,
      team: p.team,
      score: p.corrects ?? 0
    }))
    .sort((a, b) => b.score - a.score);
}

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
// socket.io events
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
      lastRanking: [],
      // estatísticas por personagem: { characterId: count }
      charStats: {}
    };

    socket.join(code);

    // host entra como jogador (mas é filtrado do ranking)
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

  // entrar na sala
  socket.on("room:join", ({ roomCode, name, team }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não encontrada" });

    // projetor entra apenas na sala (não é jogador)
    if (name === "PROJETOR") {
      socket.join(roomCode);
      return cb?.({ ok: true });
    }

    room.players[socket.id] = {
      name: name || "Jogador",
      team: team || "Equipe",
      corrects: 0
    };

    socket.join(roomCode);

    io.to(roomCode).emit("room:state", {
      state: room.state,
      players: room.players
    });

    cb?.({ ok: true });
  });

  // iniciar jogo
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

  // resposta do jogador (múltipla escolha)
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || !room.round) return;

    const player = room.players[socket.id];
    if (!player) return;

    // evita múltiplas respostas do mesmo jogador no round
    if (room.round.answers[socket.id]) return;

    const given = normalize(answer);
    const correct = normalize(room.round.correctName);

    room.round.answers[socket.id] = true;

    const ok =
      given === correct ||
      correct.includes(given) ||
      given.includes(correct);

    if (ok) {
      // marca acerto (1 ponto por personagem)
      player.corrects = (player.corrects || 0) + 1;

      // incrementa estatística da sala para esse personagem
      room.charStats[room.round.characterId] = (room.charStats[room.round.characterId] || 0) + 1;

      io.to(roomCode).emit("answer:correct", {
        socketId: socket.id,
        name: player.name,
        team: player.team
      });

      emitRanking(roomCode);
    } else {
      socket.emit("answer:received", { ok: false });
    }
  });

  // desconexão
  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];

        io.to(code).emit("room:state", {
          state: room.state,
          players: room.players
        });

        if (room.hostId === socket.id) {
          delete rooms[code];
          io.to(code).emit("game:final", {
            podium: [],
            top5: [],
            ranking: [],
            charStats: []
          });
        }
      }
    }
  });
});

// ------------------------------------------------------------
// rodada (com envio de todas as pistas de uma vez e 1 timer geral)
function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    const ranking = rankingOf(room);

    // montar charStats ordenado por mais acertados
    const charStatsArray = Object.entries(room.charStats || {})
      .map(([id, count]) => {
        const ch = characters.find((c) => c.id === id);
        return { id, name: ch?.name || id, count };
      })
      .sort((a, b) => b.count - a.count);

    io.to(roomCode).emit("game:final", {
      podium: ranking.slice(0, 3),
      top5: ranking.slice(0, 5),
      ranking,
      charStats: charStatsArray
    });
    return;
  }

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  room.state = "playing";
  room.round = {
    characterId: ch.id,
    correctName: ch.name,
    hintsRevealed: ch.hints.length,
    answers: {}
  };

  const options = generateOptions(ch.name);

  // Envia o start com todas as pistas de uma vez e a duração do round
  io.to(roomCode).emit("round:start", {
    roundNumber: room.roundNumber,
    totalRounds: room.totalRounds,
    hints: ch.hints, // todas as pistas de uma vez
    duration: HINT_SECONDS,
    options
  });

  // agenda a revelação quando o tempo do round acabar
  room.timers.hintInterval = setTimeout(() => {
    io.to(roomCode).emit("round:reveal", {
      name: ch.name,
      image: ch.image
    });

    // espera 5s para mostrar a revelação e então inicia o próximo round
    room.timers.nextTimeout = setTimeout(() => {
      nextRound(roomCode);
    }, 5000);
  }, HINT_SECONDS * 1000);

  emitRanking(roomCode);
}

// ------------------------------------------------------------
server.listen(PORT, () => {
  console.log(`🚀 Server rodando na porta ${PORT}`);
});