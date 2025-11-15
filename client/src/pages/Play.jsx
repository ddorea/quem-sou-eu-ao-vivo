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
  const [rank, setRank] = useState([]);
  const [reveal, setReveal] = useState(null);

  const barRef = useRef(null);
  const timeRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name");
    const team = params.get("team");

    s.emit("room:join", { roomCode, name, team });

    // count
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

    // ROUND — todas as pistas + opções + timer
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration, options }) => {
      setPhase("playing");
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      setHints(hints);
      setOptions(options);

      // BAR animation
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }
    });

    // REVEAL
    s.on("round:reveal", ({ name, image }) => {
      setReveal({ name, image });
      setPhase("reveal");
      setOptions([]);
    });

    // ranking
    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    // final
    s.on("game:final", () => setPhase("final"));

    return () => s.disconnect();
  }, []);

  function choose(opt) {
    socket.emit("answer:send", { roomCode, answer: opt });
    setOptions([]); // trava
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">
        
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

        {/* REVEAL */}
        {reveal && (
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
            <div className="timer-track">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="space-y-2">
              {hints.map((h, i) => (
                <div key={i} className="chip p-3 rounded-xl">
                  <b>Pista {i + 1}:</b> {h}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4 mt-4">
              {options.map((opt, i) => (
                <button
                  key={i}
                  className="btn-choice"
                  onClick={() => choose(opt)}
                >
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

        <h2 className="h2 text-2xl mt-4">Top 5</h2>
        <ul className="space-y-2">
          {rank.slice(0, 5).map((r, i) => (
            <li
              key={r.socketId}
              className="chip p-3 flex justify-between rounded-xl"
            >
              <span>{i + 1}. {r.name}</span>
              <span>{r.score} acertos</span>
            </li>
          ))}
        </ul>

      </div>
    </div>
  );
}