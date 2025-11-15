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
  const [finalData, setFinalData] = useState(null);

  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    // PROJETOR
    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    s.on("room:state", ({ state }) => setPhase(state || "lobby"));

    // COUNTDOWN
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      let n = seconds;
      setStatus(n);

      const int = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(int);
      }, 1000);
    });

    // ROUND COMEÇOU
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration }) => {
      setPhase("playing");
      setHints(hints);
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      // barra
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";

        void barRef.current.offsetWidth;
        setTimeout(() => {
          barRef.current.style.transition = `width ${duration}s linear`;
          barRef.current.style.width = "0%";
        }, 30);
      }
    });

    // REVEAL
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });

      // parar barra
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    // FINAL
    s.on("game:final", ({ podium, ranking, charStats }) => {
      setPhase("final");
      setFinalData({ podium, ranking, charStats });
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

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <p className="opacity-70 text-xl mt-3">Preparem-se…</p>
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <div className="afro-card kente-border mt-8">
            <h2 className="text-3xl h2 mb-4">Pistas</h2>

            <div className="timer-track mb-6">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <ul className="space-y-4">
              {hints.map((h, i) => (
                <li key={i} className="chip p-4 rounded-xl text-xl animate-tribal">
                  <b>Pista {i + 1}:</b> {h}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* REVEAL */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper mt-10" style={{ maxWidth: "900px", margin: "0 auto" }}>
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
              alt={reveal.name}
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>
          </div>
        )}

        {/* FINAL */}
        {phase === "final" && finalData && (
          <div className="mt-20">
            <h2 className="text-5xl title-afro text-center mb-14">🏆 Pódio Final 🏆</h2>

            <div className="flex justify-center items-end gap-8 podium-wrapper">

              {/* Seg */}
              <div className="podium-card podium-second">
                <div className="medal-icon">🥈</div>
                <div className="podium-name">{finalData.podium[1]?.name || "-"}</div>
                <div className="podium-score">{finalData.podium[1]?.corrects || 0} acertos</div>
              </div>

              {/* Primeiro */}
              <div className="podium-card podium-first">
                <div className="medal-icon">🥇</div>
                <div className="podium-name podium-winner">{finalData.podium[0]?.name || "-"}</div>
                <div className="podium-winner-score">
                  {finalData.podium[0]?.corrects || 0} acertos
                </div>
              </div>

              {/* Terceiro */}
              <div className="podium-card podium-third">
                <div className="medal-icon">🥉</div>
                <div className="podium-name">{finalData.podium[2]?.name || "-"}</div>
                <div className="podium-score">{finalData.podium[2]?.corrects || 0} acertos</div>
              </div>
            </div>

            {/* Estatísticas */}
            <div className="mt-10 afro-card kente-border">
              <h3 className="text-3xl mb-4">Personagens mais acertados</h3>
              <ol className="space-y-2">
                {finalData.charStats.map((c, i) => (
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