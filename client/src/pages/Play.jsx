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

    // COUNTDOWN
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(seconds);
      let n = seconds;
      const i = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(i);
      }, 1000);
    });

    // ROUND START
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration, options }) => {
      setPhase("playing");
      setReveal(null);
      setFeedback(null);
      setHints(hints);
      setOptions(options);
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

    // JOGADOR RECEBE FEEDBACK IMEDIATO
    s.on("answer:feedback", ({ ok, correctName, image }) => {
      setFeedback(ok ? "Acertou!" : "Errou!");
      setReveal({ name: correctName, image });
      setOptions([]); // remove botões
      setPhase("reveal-local"); // revelação individual
    });

    // REVEAL GLOBAL (projeta)
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
    });

    // FINAL
    s.on("game:final", () => {
      setPhase("final");
    });

    return () => s.disconnect();
  }, []);

  function answer(opt) {
    socket.emit("answer:send", { roomCode, answer: opt });
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full space-y-6">

        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <h1 className="text-center text-7xl font-bold animate-pulse">
            {status}
          </h1>
        )}

        {/* REVEAL LOCAL */}
        {phase === "reveal-local" && reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
            />
            <div className="reveal-deluxe-name">
              {reveal.name}
            </div>
            <div className="text-3xl mt-4 font-bold">
              {feedback}
            </div>
          </div>
        )}

        {/* REVEAL GLOBAL */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
            />
            <div className="reveal-deluxe-name">
              {reveal.name}
            </div>
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <>
            <div className="timer-track">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="space-y-4 mt-4">
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

        {/* FINAL */}
        {phase === "final" && (
          <div className="text-center chip p-4 text-xl">
            Jogo encerrado! Veja o pódio no projetor 🎉
          </div>
        )}

      </div>
    </div>
  );
}