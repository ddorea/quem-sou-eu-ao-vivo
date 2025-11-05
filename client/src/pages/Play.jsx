import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { useParams, useSearchParams } from "react-router-dom";

export default function Play() {
  const { roomCode } = useParams();
  const [params] = useSearchParams();

  const [socket, setSocket] = useState(null);
  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando…");
  const [hint, setHint] = useState("");
  const [rank, setRank] = useState([]);
  const [answer, setAnswer] = useState("");
  const [reveal, setReveal] = useState(null);
  const [gapMsg, setGapMsg] = useState("");

  const [hintDuration, setHintDuration] = useState(0);
  const barRef = useRef(null);
  const timerAnim = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name");
    const team = params.get("team");
    s.emit("room:join", { roomCode, name, team });

    s.on("room:state", ({ state }) => setPhase(state));

    s.on("game:countdown", ({ seconds }) => {
      setPhase("countdown");
      setStatus(`Começa em ${seconds}…`);
    });

    s.on("round:start", ({ roundNumber }) => {
      setPhase("playing");
      setStatus(`Round ${roundNumber}`);
      setHint("");
      setReveal(null);
      setGapMsg("");
      setAnswer("");
    });

    s.on("round:hint", ({ hintNumber, text, duration }) => {
      setHint(`Pista ${hintNumber}: ${text}`);
      setHintDuration(duration);

      if (barRef.current) {
        barRef.current.style.width = "100%";
        barRef.current.style.transition = "width 0s";
        void barRef.current.offsetWidth;
        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }
    });

    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    s.on("round:reveal", ({ name, image }) => {
      setReveal({ name, image });
      setPhase("reveal");
    });

    s.on("intermission:start", () => {
      setPhase("intermission");
    });

    s.on("intermission:you", ({ position, gapToNext }) => {
      if (position >= 6) {
        setGapMsg(`Você está a ${gapToNext} pts de alcançar o colocado acima!`);
      }
    });

    s.on("game:final", () => {
      setPhase("final");
    });

    return () => s.disconnect();
  }, [roomCode]);

  function send() {
    if (!answer.trim()) return;
    socket.emit("answer:send", { roomCode, answer });
    setAnswer("");
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip rounded-xl px-3 py-1">{status}</span>
        </div>
        <hr className="hr-gold opacity-50" />

        {reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              alt={reveal.name}
              className="reveal-deluxe-img"
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>
          </div>
        )}



        {phase === "playing" && (
          <>
            <div className="timer-track">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="chip p-4 rounded-xl hint-text">{hint || "Aguardando pista…"}</div>

            <div className="flex gap-3">
              <input
                className="input-afro"
                placeholder="Sua resposta"
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && send()}
              />
              <button className="btn-primary rounded-xl" onClick={send}>Enviar</button>
            </div>
          </>
        )}

        {phase === "intermission" && (
          <div className="chip p-4 rounded-xl text-center animate-tribal">
            {gapMsg || "Próximo round começará em instantes…"}
          </div>
        )}

        {phase === "final" && (
          <div className="text-center text-xl font-bold">Fim! Veja o pódio no projetor.</div>
        )}

        <h2 className="h2 text-2xl mt-6">Top 5</h2>
        <ol className="space-y-2">
          {rank.slice(0, 5).map((r, i) => (
            <li key={r.socketId} className="chip p-3 rounded-xl flex justify-between ranking-item">
              <span>{i + 1}. {r.name}</span>
              <span>{r.score} pts</span>
            </li>
          ))}
        </ol>

      </div>
    </div>
  );
}
