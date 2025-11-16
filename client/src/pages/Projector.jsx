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
  const [finalRank, setFinalRank] = useState(null);

  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    s.on("room:state", ({ state }) => {
      setPhase(state);
    });

    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(seconds);
      let n = seconds;

      const int = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(int);
      }, 1000);
    });

    s.on("round:start", ({ roundNumber, totalRounds, hints, duration }) => {
      setPhase("playing");
      setReveal(null);
      setFinalRank(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);
      setHints(hints);

      // Reset + animação da barra
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

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    s.on("game:final", ({ podium, ranking, charStats }) => {
      setPhase("final");
      setFinalRank({ podium, ranking, charStats });
    });

    return () => s.disconnect();
  }, [roomCode]);

  function handleSkip() {
    socket?.emit("round:skip", { roomCode });
  }

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">

        <h1 className="title-afro text-5xl text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">Sala {roomCode} — {status}</p>

        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <div className="opacity-75 mt-2 text-xl">Preparem-se…</div>
          </div>
        )}

        {phase === "playing" && (
          <div className="afro-card kente-border mt-6">
            <h2 className="h2 mb-3 text-2xl">Pistas</h2>

            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <ul className="space-y-4">
              {hints.map((h, i) => (
                <li key={i} className="chip p-4 rounded-xl text-xl">{h}</li>
              ))}
            </ul>
          </div>
        )}

        {phase === "reveal" && reveal && (
          <>
            <div className="reveal-deluxe-wrapper">
              <img
                src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
                className="reveal-deluxe-img"
                alt={reveal.name}
              />
              <div className="reveal-deluxe-name">{reveal.name}</div>
            </div>

            <div className="text-center">
              <button className="btn-secondary rounded-xl px-6 py-3" onClick={handleSkip}>
                ⏭️ Pular para o próximo round
              </button>
            </div>
          </>
        )}

        {phase === "final" && finalRank && (
          <div className="mt-10">

            <h2 className="text-4xl title-afro text-center mb-8">Pódio Final</h2>

            <div className="podium">
              <div className="place">
                <div className="medal">🥈</div>
                <div className="font-bold mt-1">{finalRank.podium[1]?.name || "-"}</div>
                <div>{finalRank.podium[1]?.corrects ?? 0} acertos</div>
              </div>

              <div className="place first neon-gold">
                <div className="medal">🥇</div>
                <div className="font-bold mt-1 text-xl">{finalRank.podium[0]?.name || "-"}</div>
                <div>{finalRank.podium[0]?.corrects ?? 0} acertos</div>
              </div>

              <div className="place">
                <div className="medal">🥉</div>
                <div className="font-bold mt-1">{finalRank.podium[2]?.name || "-"}</div>
                <div>{finalRank.podium[2]?.corrects ?? 0} acertos</div>
              </div>
            </div>

            {/* LISTA DE PERSONAGENS ACERTADOS */}
            <div className="mt-10 afro-card kente-border">
              <h3 className="text-2xl mb-3">Personagens mais acertados</h3>

              <ol className="space-y-2">
                {finalRank.charStats?.map((c, i) => (
                  <li key={i} className="chip p-3 rounded-xl flex justify-between">
                    <span>{i + 1}. {c.name}</span>
                    <span>{c.count} acertos</span>
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