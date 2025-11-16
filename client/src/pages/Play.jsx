import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { useParams, useSearchParams } from "react-router-dom";

export default function Play() {
  const { roomCode } = useParams();
  const [params] = useSearchParams();

  const [socket, setSocket] = useState(null);
  const [phase, setPhase] = useState("lobby"); // lobby|countdown|playing|reveal|final
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [options, setOptions] = useState([]);
  const [reveal, setReveal] = useState(null);
  const [feedback, setFeedback] = useState(null); // {ok: true/false}
  const barRef = useRef(null);
  const roundDurationRef = useRef(0);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name") || `Jogador${Math.floor(Math.random()*900)+100}`;
    const team = params.get("team") || "";

    s.emit("room:join", { roomCode, name, team });

    // countdown
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(seconds);
      let n = seconds;
      const intr = setInterval(() => {
        n--;
        setStatus(n > 0 ? n : "...");
        if (n <= 0) clearInterval(intr);
      }, 1000);
    });

    // round start: receives ALL hints at once + duration + options
    s.on("round:start", ({ roundNumber, totalRounds, hints: allHints, duration, options }) => {
      setPhase("playing");
      setReveal(null);
      setFeedback(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);
      setHints(allHints || []);
      setOptions(options || []);
      roundDurationRef.current = duration || 30;

      // reset + animate bar
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
        setTimeout(() => {
          barRef.current.style.transition = `width ${roundDurationRef.current}s linear`;
          barRef.current.style.width = "0%";
        }, 20);
      }
    });

    // feedback (para quem respondeu)
    s.on("answer:feedback", ({ ok, correctName, image }) => {
      setFeedback({ ok });
      // move player to reveal immediately (server also emits round:reveal to all)
      setPhase("reveal");
      setReveal({ name: correctName, image });
      setOptions([]);
      // ensure bar collapsed
      if (barRef.current) { barRef.current.style.transition = "none"; barRef.current.style.width = "0%"; }
    });

    // reveal (also emitted when time runs out)
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
      setOptions([]);
      if (barRef.current) { barRef.current.style.transition = "none"; barRef.current.style.width = "0%"; }
    });

    s.on("game:final", () => setPhase("final"));

    return () => s.disconnect();
    // eslint-disable-next-line
  }, []);

  function answer(opt) {
    if (!socket) return;
    socket.emit("answer:send", { roomCode, answer: opt });
    // disable options to avoid spam
    setOptions([]);
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        {/* header */}
        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {phase === "countdown" && (
          <h1 className="text-center text-7xl animate-pulse font-extrabold">{status}</h1>
        )}

        {/* REVEAL */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              alt={reveal.name}
              className="reveal-deluxe-img mx-auto"
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>

            {feedback && (
              <div className={`chip p-3 rounded-xl mt-4 text-center ${feedback.ok ? "bg-green-700/30" : "bg-red-800/30"}`}>
                {feedback.ok ? "✅ Acertou!" : "❌ Errou"}
              </div>
            )}
          </div>
        )}

        {/* PLAYING */}
        {phase === "playing" && (
          <>
            <div className="timer-track mb-4">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="space-y-4">
              {hints.map((h, i) => (
                <div key={i} className="chip p-4 rounded-xl text-lg pista-texto">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-6">
              {options.map((opt, i) => (
                <button key={i} className="btn-choice" onClick={() => answer(opt)}>{opt}</button>
              ))}
            </div>
          </>
        )}

        {phase === "final" && (
          <div className="text-center text-xl p-4 chip">
            A partida terminou! Veja o pódio no projetor.
          </div>
        )}

      </div>
    </div>
  );
}