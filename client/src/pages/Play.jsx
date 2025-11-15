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

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name");
    const team = params.get("team");

    s.emit("room:join", { roomCode, name, team });

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

    s.on("round:start", ({ roundNumber, totalRounds, hints, duration, options }) => {
      setPhase("playing");
      setReveal(null);
      setFeedback(null);

      setStatus(`Round ${roundNumber}/${totalRounds}`);
      setHints(hints);
      setOptions(options);

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
      setReveal({ name, image });
      setPhase("reveal");
      setOptions([]);
    });

    s.on("answer:feedback", ({ ok }) => {
      setFeedback(ok ? "ACERTOU! 🎉" : "ERROU ❌");

      setTimeout(() => setFeedback(null), 2000);
    });

    s.on("game:final", () => setPhase("final"));

    return () => s.disconnect();
  }, []);

  function answer(opt) {
    socket.emit("answer:send", { roomCode, answer: opt });
    setOptions([]);
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-xl w-full space-y-6">

        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {/* CONTAGEM */}
        {phase === "countdown" && (
          <h1 className="text-center text-7xl font-black animate-pulse">
            {status}
          </h1>
        )}

        {/* REVELAÇÃO */}
        {reveal && (
          <div className="reveal-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-img-big"
            />
            <div className="reveal-name">{reveal.name}</div>
          </div>
        )}

        {/* FEEDBACK */}
        {feedback && (
          <div className={`text-center text-3xl font-bold ${feedback.includes("ERROU") ? "text-red-400" : "text-green-300"}`}>
            {feedback}
          </div>
        )}

        {/* RODANDO */}
        {phase === "playing" && (
          <>
            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="space-y-4">
              {hints.map((h, i) => (
                <div key={i} className="chip p-4 rounded-xl text-lg">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              {options.map((opt, i) => (
                <button key={i} className="btn-choice" onClick={() => answer(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}

        {/* FIM */}
        {phase === "final" && (
          <div className="text-center text-xl p-4 chip">
            A partida terminou! Veja o pódio no projetor.
          </div>
        )}
      </div>
    </div>
  );
}