import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [rank, setRank] = useState([]);
  const [reveal, setReveal] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    // ✅ O projetor entra sempre como VISUAL
    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    // ✅ Estado da sala
    s.on("room:state", ({ state }) => setPhase(state || "lobby"));

    // ✅ CONTAGEM REGRESSIVA LOCAL (SEM BUGAR NO 1)
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      let n = seconds;

      setStatus(n);

      const interval = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(interval);
          setStatus("...");
          return;
        }
        setStatus(n);
      }, 1000);
    });

    // ✅ Novo round
    s.on("round:start", ({ roundNumber, totalRounds }) => {
      setPhase("playing");
      setHints([]);
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      // reset da barra
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
      }
    });

    // ✅ Pistas chegando + barra
    s.on("round:hint", ({ hintNumber, text, duration }) => {
      setPhase("playing");
      setHints((prev) => [...prev, `Pista ${hintNumber}: ${text}`]);

      // Barra recomeça a cada dica
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;

        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }
    });

    // ✅ Revelação DELUXE
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
    });

    // ✅ Atualização de ranking parcial
    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    // ✅ Final do jogo
    s.on("game:final", ({ podium, top5, ranking }) => {
      setPhase("final");
      setRank({ podium, top5, ranking });
    });

    return () => s.disconnect();
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">

        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">
          Sala {roomCode} — {status}
        </p>

        {/* ✅ Countdown grande */}
        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <div className="opacity-75 mt-2 text-xl">Preparem-se…</div>
          </div>
        )}

        {/* ✅ Durante o round — Pistas + Barra */}
        {phase === "playing" && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">

            <div className="afro-card kente-border">
              <h2 className="text-2xl h2 mb-3">Pistas</h2>

              <div className="timer-track mb-3">
                <div ref={barRef} className="timer-bar"></div>
              </div>

              <ul className="space-y-2">
                {hints.map((h, i) => (
                  <li key={i} className="chip p-3 rounded-xl animate-tribal">{h}</li>
                ))}
              </ul>
            </div>

            <div className="afro-card kente-border">
              <h2 className="text-2xl h2 mb-3">Ranking Parcial</h2>

              <ol className="space-y-2">
                {rank.slice(0, 5).map((r, i) => (
                  <li key={r.socketId} className="chip rounded-xl p-3 flex justify-between">
                    <span>{i + 1}. {r.name}</span>
                    <span className="font-bold">{r.score} pts</span>
                  </li>
                ))}
              </ol>
            </div>

          </div>
        )}

        {/* ✅ Revelação DELUXE */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper" style={{ margin: "0 auto", maxWidth: "900px" }}>
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
              alt={reveal.name}
            />
            <div className="reveal-deluxe-name" style={{ fontSize: "3rem" }}>
              {reveal.name}
            </div>
          </div>
        )}

        {/* ✅ Tela final */}
        {phase === "final" && rank?.podium && (
          <div className="mt-20">

            <h2 className="text-5xl title-afro text-center mb-10">🏆 Pódio Final 🏆</h2>

            <div className="flex justify-center items-end gap-6 podium-wrapper">

              {/* Segundo Lugar */}
              <div className="podium-card podium-second">
                <div className="medal-icon">🥈</div>
                <div className="podium-name">{rank.podium[1]?.name || "-"}</div>
                <div className="podium-score">{rank.podium[1]?.score ?? 0} pts</div>
              </div>

              {/* Primeiro Lugar */}
              <div className="podium-card podium-first">
                <div className="medal-icon">🥇</div>
                <div className="podium-name podium-winner">{rank.podium[0]?.name || "-"}</div>
                <div className="podium-score podium-winner-score">
                  {rank.podium[0]?.score ?? 0} pts
                </div>
              </div>

              {/* Terceiro Lugar */}
              <div className="podium-card podium-third">
                <div className="medal-icon">🥉</div>
                <div className="podium-name">{rank.podium[2]?.name || "-"}</div>
                <div className="podium-score">{rank.podium[2]?.score ?? 0} pts</div>
              </div>

            </div>

          </div>
        )}


      </div>
    </div>
  );
}
