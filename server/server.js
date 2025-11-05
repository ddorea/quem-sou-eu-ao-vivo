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

/**
 * rooms: {
 *   code: {
 *     hostId,
 *     state: "lobby"|"countdown"|"playing"|"intermission"|"ended",
 *     players: { [socketId]: { name, team, score, lastDelta: 0 } },
 *     roundNumber, totalRounds,
 *     used: Set<string>,
 *     round: {
 *        correctName, hintsRevealed, answers: { [socketId]: true },
 *     },
 *     timers: { hintInterval?, nextTimeout? },
 *     lastRanking: Array<{socketId,name,team,score}>
 *   }
 * }
 */
const rooms = {};

function generateRoomCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function pickRandomCharacter(used) {
  const pool = characters.filter(c => !used.has(c.id));
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : characters[0];
}

function normalize(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pointsByHint(h) {
  if (h === 1) return 1000;
  if (h === 2) return 600;
  return 300;
}

function rankingOf(room) {
  return Object.entries(room.players)
    .map(([socketId, p]) => ({ socketId, name: p.name, team: p.team, score: p.score ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

function clearTimers(room) {
  if (!room?.timers) return;
  if (room.timers.hintInterval) clearInterval(room.timers.hintInterval);
  if (room.timers.nextTimeout) clearTimeout(room.timers.nextTimeout);
  room.timers = {};
}

function emitRanking(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;
  io.to(roomCode).emit("ranking:update", { ranking: rankingOf(room) });
}

io.on("connection", (socket) => {
  // criar sala
  socket.on("room:create", ({ hostName = "Host", totalRounds = 6 }, cb) => {
    const code = generateRoomCode();
    rooms[code] = {
      hostId: socket.id,
      state: "lobby",
      players: {},
      roundNumber: 0,
      totalRounds,
      used: new Set(),
      round: null,
      timers: {},
      lastRanking: []
    };
    socket.join(code);
    rooms[code].players[socket.id] = { name: hostName, team: "Host", score: 0 };
    cb?.({ roomCode: code, totalRounds });
    io.to(code).emit("room:state", { state: "lobby", players: rooms[code].players });
  });

  // entrar na sala
  socket.on("room:join", ({ roomCode, name = "Jogador", team = "Equipe" }, cb) => {
    const room = rooms[roomCode];
    if (!room) return cb?.({ error: "Sala não encontrada." });
    socket.join(roomCode);
    room.players[socket.id] = { name, team, score: room.players[socket.id]?.score ?? 0 };
    io.to(roomCode).emit("room:state", { state: room.state, players: room.players });
    cb?.({ ok: true });
  });

  // iniciar jogo (countdown estilo Kahoot)
  socket.on("game:start", ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    room.state = "countdown";
    io.to(roomCode).emit("game:countdown", { seconds: 3 });
    // 3..2..1..GO!
    setTimeout(() => io.to(roomCode).emit("game:countdown", { seconds: 2 }), 1000);
    setTimeout(() => io.to(roomCode).emit("game:countdown", { seconds: 1 }), 2000);
    setTimeout(() => {
      room.state = "playing";
      room.roundNumber = 0;
      nextRound(roomCode);
    }, 3000);
  });

  // respostas
  socket.on("answer:send", ({ roomCode, answer }) => {
    const room = rooms[roomCode];
    if (!room || room.state !== "playing" || !room.round) return;
    const player = room.players[socket.id];
    if (!player) return;

    // evita múltiplas correções do mesmo jogador no round
    if (room.round.answers[socket.id]) return;

    const given = normalize(answer);
    const correct = normalize(room.round.correctName);
    const ok = given && correct && (given === correct || correct.includes(given) || given.includes(correct));

    room.round.answers[socket.id] = true;

    if (ok) {
      const pts = pointsByHint(room.round.hintsRevealed);
      player.score = (player.score || 0) + pts;
      io.to(roomCode).emit("answer:correct", { name: player.name, team: player.team, points: pts, socketId: socket.id });
      emitRanking(roomCode);
    } else {
      socket.emit("answer:received", { ok: true });
    }
  });

  socket.on("disconnect", () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.players[socket.id]) {
        delete room.players[socket.id];
        io.to(code).emit("room:state", { state: room.state, players: room.players });
        // se o host caiu, encerra
        if (room.hostId === socket.id) {
          clearTimers(room);
          io.to(code).emit("game:final", { podium: [], top5: [], ranking: [] });
          delete rooms[code];
        }
      }
    }
  });
});

function nextRound(roomCode) {
  const room = rooms[roomCode];
  if (!room) return;

  clearTimers(room);

  room.roundNumber++;
  if (room.roundNumber > room.totalRounds) {
    // Final: pódio
    room.state = "ended";
    const finalRanking = rankingOf(room);
    const podium = finalRanking.slice(0, 3);
    const top5 = finalRanking.slice(0, 5);
    io.to(roomCode).emit("game:final", { podium, top5, ranking: finalRanking });
    return;
  }

  room.state = "playing";

  const ch = pickRandomCharacter(room.used);
  room.used.add(ch.id);

  room.round = { correctName: ch.name, hintsRevealed: 0, answers: {} };

  // Início do round
  io.to(roomCode).emit("round:start", { roundNumber: room.roundNumber, totalRounds: room.totalRounds });

  // Envia as dicas com duração para barra de tempo
  let i = 0;
  room.timers.hintInterval = setInterval(() => {
    if (i >= ch.hints.length) {
      clearInterval(room.timers.hintInterval);
      // Revela personagem
      io.to(roomCode).emit("round:reveal", { name: ch.name, image: ch.image });

      // INTERMISSION: ranking temporário estilo Kahoot (top 5 + deltas)
      setTimeout(() => {
        room.state = "intermission";
        const current = rankingOf(room);
        const prev = room.lastRanking;
        const movement = current.map((r, idx) => {
          const prevPos = prev.findIndex(p => p.socketId === r.socketId);
          const delta = prevPos === -1 ? 0 : (prevPos - idx); // positivo = subiu
          room.players[r.socketId].lastDelta = delta;
          return { ...r, pos: idx + 1, delta };
        });

        // mensagens individuais (6º+): diferença para alcançar colocado acima
        movement.forEach((r, idx) => {
          if (idx >= 5) {
            const above = movement[idx - 1];
            const gap = above ? (above.score - r.score) : 0;
            io.to(r.socketId).emit("intermission:you", {
              position: idx + 1,
              gapToNext: gap
            });
          }
        });

        const top5 = movement.slice(0, 5);
        io.to(roomCode).emit("intermission:start", { top5, roundNumber: room.roundNumber });

        // guarda ranking atual para medir movimento no próximo
        room.lastRanking = current;

        // após a intermission, avança
        room.timers.nextTimeout = setTimeout(() => {
          room.state = "playing";
          nextRound(roomCode);
        }, 6000);
      }, 800); // pequeno respiro após a revelação

      return;
    }

    room.round.hintsRevealed = i + 1;

    io.to(roomCode).emit("round:hint", {
      hintNumber: i + 1,
      text: ch.hints[i],
      duration: HINT_SECONDS
    });

    i++;
  }, HINT_SECONDS * 1000);

  emitRanking(roomCode);
}

server.listen(PORT, () => {
  console.log(`✅ Server rodando em http://localhost:${PORT}`);
});
