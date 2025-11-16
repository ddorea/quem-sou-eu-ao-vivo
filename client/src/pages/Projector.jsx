import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("");
  const [hints, setHints] = useState([]);
  const [reveal, setReveal] = useState(null);
  const [finalData, setFinalData] = useState(null);

  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    s.emit("room:join", { roomCode, name: "PROJETOR" });

    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(seconds);
      let n = seconds;

      const timer = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(timer);
      }, 1000);
    });

    s.on("round:start", ({ roundNumber, totalRounds, hints, duration }) => {
      setPhase("playing");
      setReveal(null);
      setHints(hints);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
        setTimeout(() => {
          barRef.current.style.transition = `width ${duration}s linear`;
          barRef.current.style.width = "0%";
        }, 25);
      }
    });

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
    });

    s.on("game:final", (data) => {
      setPhase("final");
      setFinalData(data);
    });

    return () => s.disconnect();
  }, []);

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">

        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">{status}</p>

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="mt-10 text-center text-8xl font-black animate-pulse">
            {status}
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

        {/* REVEAL */}
        {phase === "reveal" && reveal && (
          <div className="mt-10 text-center">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img mx-auto"
            />
            <h2 className="text-4xl font-bold mt-4">{reveal.name}</h2>

            <button
              className="btn-primary mt-10 px-8 py-3 rounded-xl text-xl"
              onClick={() => socket.emit("round:skip", { roomCode })}
            >
              ⏭ Pular para o próximo round
            </button>
          </div>
        )}

        {/* FINAL */}
        {phase === "final" && finalData && (
          <div className="mt-16">
            
            <h2 className="text-5xl title-afro text-center mb-12">🏆 Pódio Final 🏆</h2>

            <div className="flex justify-center items-end gap-10 podium-wrapper">

              {/* Segundo */}
              <div className="podium-card podium-second">
                <div className="medal-icon">🥈</div>
                <div className="podium-name">{finalData.podium[1]?.name || "-"}</div>
                <div className="podium-score">{finalData.podium[1]?.corrects || 0} acertos</div>
              </div>

              {/* Primeiro */}
              <div className="podium-card podium-first">
                <div className="medal-icon">🥇</div>
                <div className="podium-name podium-winner">{finalData.podium[0]?.name || "-"}</div>
                <div className="podium-score podium-winner-score">
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

            {/* espaçamento extra */}
            <div className="mt-20 afro-card kente-border">
              <h3 className="text-3xl mb-4">Personagens mais acertados</h3>
              <ol className="space-y-3">
                {finalData.charStats.map((c, i) => (
                  <li key={c.id} className="chip p-3 rounded-xl flex justify-between text-xl">
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