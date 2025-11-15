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

  const [answerResult, setAnswerResult] = useState(null); // 🟢 novo

  const barRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name");
    const team = params.get("team");

    s.emit("room:join", { roomCode, name, team });

    // ----------------------------------------
    // COUNTDOWN
    // ----------------------------------------
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

    // ----------------------------------------
    // START ROUND
    // ----------------------------------------
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration, options }) => {
      setPhase("playing");
      setReveal(null);

      setStatus(`Round ${roundNumber}/${totalRounds}`);

      setHints(hints || []);
      setOptions(options || []);

      // reinicia animação da barra
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

    // ----------------------------------------
    // FEEDBACK DE RESPOSTA
    // ----------------------------------------
    s.on("answer:result", ({ correct }) => {
      setAnswerResult(correct ? "ACERTOU!" : "ERROU!");

      setTimeout(() => setAnswerResult(null), 2000);
    });

    // ----------------------------------------
    // REVEAL
    // ----------------------------------------
    s.on("round:reveal", ({ name, image }) => {
      setReveal({ name, image });
      setPhase("reveal");
      setOptions([]);
    });

    // ----------------------------------------
    // FINAL DO JOGO
    // ----------------------------------------
    s.on("game:final", () => setPhase("final"));

    return () => s.disconnect();
  }, []);

  // ----------------------------------------
  // ENVIAR RESPOSTA
  // ----------------------------------------
  function answer(opt) {
    socket.emit("answer:send", { roomCode, answer: opt });
    setOptions([]); // desabilita botões após a resposta
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        {/* HEADER */}
        <div className="flex justify-between items-center">
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

        {/* REVEAL */}
        {phase === "reveal" && reveal && (
          <div className="text-center">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img mx-auto"
            />
            <h2 className="text-3xl font-bold mt-4">{reveal.name}</h2>
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <>
            {/* Barra de tempo */}
            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            {/* FEEDBACK ACERTOU/ERROU */}
            {answerResult && (
              <div
                className={`text-center text-4xl font-extrabold mb-4 ${
                  answerResult === "ACERTOU!" ? "text-green-400" : "text-red-400"
                } animate-pulse`}
              >
                {answerResult}
              </div>
            )}

            {/* Pistas */}
            <div className="space-y-4">
              {hints.map((h, i) => (
                <div key={i} className="chip p-4 rounded-xl text-lg">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            {/* Botões de resposta */}
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