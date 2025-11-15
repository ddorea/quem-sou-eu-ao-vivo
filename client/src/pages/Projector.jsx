import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [rank, setRank] = useState([]);
  const [reveal, setReveal] = useState(null);
  const barRef = useRef(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    s.on("room:state", ({ state }) => setPhase(state || "lobby"));

    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");
      setStatus(String(seconds));
      let n = seconds;
      const intr = setInterval(() => {
        n--;
        setStatus(String(n > 0 ? n : "..."));
        if (n <= 0) clearInterval(intr);
      }, 1000);
    });

    // Novo: round:start tem todas as pistas e duration
    s.on("round:start", ({ roundNumber, totalRounds, hints, duration }) => {
      setPhase("playing");
      setHints(hints || []);
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);

      // anima a barra
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;

        // micro-delay para garantir que a animação reinicia
        setTimeout(() => {
          barRef.current.style.transition = `width ${duration}s linear`;
          barRef.current.style.width = "0%";
        }, 20);
      }

      // limpa qualquer timer antigo
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    });

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });

      // garantir a barra a 0
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    s.on("game:final", ({ podium, top5, ranking, charStats }) => {
      setPhase("final");
      setRank({ podium, top5, ranking, charStats });
    });

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      s.disconnect();
    };
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">
        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">Sala {roomCode} — {status}</p>

        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <div className="mt-2 opacity-80">Preparem-se…</div>
          </div>
        )}

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

        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper" style={{ margin: "0 auto", maxWidth: "900px" }}>
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
              alt={reveal.name}
            />
            <div className="reveal-deluxe-name" style={{ fontSize: "3rem" }}>{reveal.name}</div>
          </div>
        )}

        {phase === "final" && rank?.podium && (
          <div className="mt-10">
            <h2 className="text-4xl title-afro text-center mb-8">Pódio Final</h2>

            <div className="podium">
              <div className="place">
                <div className="medal">🥈</div>
                <div className="font-bold mt-1">{rank.podium[1]?.name || "-"}</div>
                <div className="opacity-80">{rank.podium[1]?.score} acertos</div>
              </div>

              <div className="place first neon-gold">
                <div className="medal">🥇</div>
                <div className="font-bold mt-1 text-xl">{rank.podium[0]?.name || "-"}</div>
                <div className="opacity-90 font-semibold">{rank.podium[0]?.score} acertos</div>
              </div>

              <div className="place">
                <div className="medal">🥉</div>
                <div className="font-bold mt-1">{rank.podium[2]?.name || "-"}</div>
                <div className="opacity-80">{rank.podium[2]?.score} acertos</div>
              </div>
            </div>

            {/* stats de personagens mais acertados */}
            <div className="mt-6 afro-card kente-border">
              <h3 className="text-2xl mb-3">Personagens mais acertados</h3>
              <ol className="space-y-2">
                {rank.charStats?.map((c, i) => (
                  <li key={c.id} className="chip p-3 rounded-xl flex justify-between">
                    <span>{i + 1}. {c.name}</span>
                    <span className="font-bold">{c.count} acertos</span>
                  </li>
                )) || <li>Nenhum dado</li>}
              </ol>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}