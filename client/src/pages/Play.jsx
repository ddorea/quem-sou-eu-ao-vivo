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

    // entrar na sala
    s.emit("room:join", { roomCode, name, team });

    // COUNTDOWN
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(seconds);

      let n = seconds;
      const interval = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(interval);
      }, 1000);
    });

    // INÍCIO DO ROUND
    s.on("round:start", ({ roundNumber, totalRounds, hints, options, duration }) => {
      setPhase("playing");
      setReveal(null);
      setFeedback(null);

      setStatus(`Round ${roundNumber}/${totalRounds}`);
      setHints(hints);
      setOptions(options);

      // anima a barra de tempo
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

    // REVELAÇÃO DO SERVIDOR (quando o tempo acaba)
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
      setHints([]);
      setOptions([]);
      setFeedback(null); // feedback individual não aparece aqui
    });

    // REVELAÇÃO IMEDIATA (resposta do jogador)
    s.on("answer:feedback", ({ ok, correctName, image }) => {
      setOptions([]);
      setHints([]);

      // pequeno delay para garantir render correto
      setTimeout(() => {
        setFeedback(ok ? "Acertou!" : "Errou!");
        setReveal({ name: correctName, image });
        setPhase("reveal-local");
      }, 50);
    });

    // FINAL DA PARTIDA
    s.on("game:final", () => {
      setPhase("final");
    });

    return () => s.disconnect();
  }, [roomCode]);

  function answer(opt) {
    if (!socket) return;
    socket.emit("answer:send", { roomCode, answer: opt });
    setOptions([]); // já some com as opções
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        {/* Header */}
        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <h1 className="text-center text-7xl animate-pulse font-extrabold">
            {status}
          </h1>
        )}

        {/* REVEAL LOCAL (resposta do jogador) */}
        {phase === "reveal-local" && reveal && (
          <div className="text-center">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img mx-auto"
            />
            <h2 className="reveal-deluxe-name mt-4">{reveal.name}</h2>

            <div
              className={`mt-6 text-3xl font-bold ${
                feedback === "Acertou!" ? "text-green-300" : "text-red-400"
              }`}
            >
              {feedback}
            </div>
          </div>
        )}

        {/* REVEAL GLOBAL (tempo acabou) */}
        {phase === "reveal" && reveal && (
          <div className="text-center">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img mx-auto"
            />
            <h2 className="reveal-deluxe-name mt-4">{reveal.name}</h2>
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <>
            {/* Barra de tempo */}
            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            {/* Pistas */}
            <div className="space-y-4">
              {hints.map((h, i) => (
                <div key={i} className="chip p-4 rounded-xl text-lg">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            {/* Opções */}
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
          <div className="text-center text-xl p-4 chip">
            A partida terminou! Veja o pódio no projetor.
          </div>
        )}

      </div>
    </div>
  );
}