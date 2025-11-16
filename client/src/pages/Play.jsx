import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { useParams, useSearchParams } from "react-router-dom";

export default function Play() {
  const { roomCode } = useParams();
  const [params] = useSearchParams();

  const [socket, setSocket] = useState(null);
  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [options, setOptions] = useState([]);
  const [reveal, setReveal] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const barRef = useRef(null);
  const durationRef = useRef(0);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name") || `Jogador${Math.floor(Math.random()*900)+100}`;
    const team = params.get("team") || "";

    s.emit("room:join", { roomCode, name, team });

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

    s.on("round:start", ({ roundNumber, totalRounds, hints, options, duration }) => {
      setPhase("playing");
      setReveal(null);
      setFeedback(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);
      setHints(hints);
      setOptions(options);
      durationRef.current = duration;

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

    s.on("answer:feedback", ({ ok, correctName, image }) => {
      setFeedback({ ok });
      setPhase("reveal");
      setReveal({ name: correctName, image });
      setOptions([]);

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
      setOptions([]);

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    s.on("game:final", () => {
      setPhase("final");
    });

    return () => s.disconnect();
  }, []);

  function answer(opt) {
    socket.emit("answer:send", { roomCode, answer: opt });
    setOptions([]);
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full space-y-6">

        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {phase === "countdown" && (
          <h1 className="text-center text-7xl animate-pulse font-black">{status}</h1>
        )}

        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img mx-auto"
              alt={reveal.name}
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>

            {feedback && (
              <div
                className={`chip p-3 rounded-xl mt-4 text-center ${
                  feedback.ok ? "bg-green-700/30" : "bg-red-800/30"
                }`}
              >
                {feedback.ok ? "✅ Acertou!" : "❌ Errou"}
              </div>
            )}
          </div>
        )}

        {phase === "playing" && (
          <>
            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="space-y-4">
              {hints.map((h, i) => (
                <div key={i} className="chip p-4 rounded-xl pista-texto">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              {options.map((op, i) => (
                <button key={i} className="btn-choice" onClick={() => answer(op)}>
                  {op}
                </button>
              ))}
            </div>
          </>
        )}

        {phase === "final" && (
          <div className="text-center text-xl chip p-4">
            A partida terminou! Veja o pódio no projetor.
          </div>
        )}

      </div>
    </div>
  );
}