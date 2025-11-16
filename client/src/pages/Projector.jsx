import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [reveal, setReveal] = useState(null);
  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    // Estado da sala
    s.on("room:state", ({ state }) => setPhase(state || "lobby"));

    // COUNTDOWN
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      let n = seconds;
      setStatus(String(n));

      const interval = setInterval(() => {
        n--;
        setStatus(n > 0 ? String(n) : "...");
        if (n <= 0) clearInterval(interval);
      }, 1000);
    });

    // ROUND START
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration }) => {
      setPhase("playing");
      setHints(hints || []);
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;

        setTimeout(() => {
          barRef.current.style.transition = `width ${duration}s linear`;
          barRef.current.style.width = "0%";
        }, 20);
      }
    });

    // REVELAÇÃO DELUXE
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    // FINAL
    s.on("game:final", ({ podium, ranking, charStats }) => {
      setPhase("final");
      setReveal(null);
      setStatus("Fim!");
      setHints([]);
      window.finalData = { podium, ranking, charStats };
    });

    return () => s.disconnect();
  }, [roomCode]);

  const final = window.finalData;

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">

        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">
          Sala {roomCode} — {status}
        </p>

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <div className="mt-2 opacity-80 text-xl">Preparem-se…</div>
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <div className="afro-card kente-border mt-6">
            <h2 className="text-2xl h2 mb-3">Pistas</h2>

            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <ul className="space-y-4">
              {hints.map((h, i) => (
                <li key={i} className="chip p-4 rounded-xl text-xl animate-tribal">
                  {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* ✨ REVELAÇÃO DELUXE ANTIGA — RESTAURADA */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper" style={{ margin: "40px auto", maxWidth: "900px" }}>
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              alt={reveal.name}
              className="reveal-deluxe-img"
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>
          </div>
        )}

        {/* FINAL */}
        {phase === "final" && final && (
          <div className="mt-20">

            <h2 className="text-5xl title-afro text-center mb-12">🏆 Pódio Final 🏆</h2>

            <div className="podium-wrapper flex justify-center items-end gap-6">

              {/* 2º lugar */}
              <div className="podium-card podium-second">
                <div className="medal-icon">🥈</div>
                <div className="podium-name">{final.podium[1]?.name || "-"}</div>
                <div className="podium-score">{final.podium[1]?.corrects ?? 0} acertos</div>
              </div>

              {/* 1º lugar */}
              <div className="podium-card podium-first">
                <div className="medal-icon">🥇</div>
                <div className="podium-name podium-winner">{final.podium[0]?.name || "-"}</div>
                <div className="podium-winner-score">
                  {final.podium[0]?.corrects ?? 0} acertos
                </div>
              </div>

              {/* 3º lugar */}
              <div className="podium-card podium-third">
                <div className="medal-icon">🥉</div>
                <div className="podium-name">{final.podium[2]?.name || "-"}</div>
                <div className="podium-score">{final.podium[2]?.corrects ?? 0} acertos</div>
              </div>

            </div>

            {/* Espaço entre pódio e ranking de personagens */}
            <div style={{ marginTop: "60px" }} />

            <div className="afro-card kente-border p-6 mt-6">
              <h3 className="text-3xl mb-4">Personagens mais acertados</h3>

              <ol className="space-y-2">
                {final.charStats.map((c, i) => (
                  <li key={i} className="chip p-3 rounded-xl flex justify-between">
                    <span>{i + 1}. {c.name}</span>
                    <span className="font-bold">{c.count} acertos</span>
                  </li>
                ))}
              </ol>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}