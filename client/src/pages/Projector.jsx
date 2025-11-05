import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby"); // lobby|countdown|playing|reveal|intermission|final
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [rank, setRank] = useState([]);
  const [whoScored, setWhoScored] = useState(null);
  const [reveal, setReveal] = useState(null);

  // timer bar
  const [hintDuration, setHintDuration] = useState(0);
  const barRef = useRef(null);
  const timerAnim = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    s.emit("room:join", { roomCode, name: "PROJETOR", team: "VISUAL" });

    s.on("room:state", ({ state }) => setPhase(state || "lobby"));

    s.on("game:countdown", ({ seconds }) => {
      setPhase("countdown");
      setStatus(String(seconds));
    });

    s.on("round:start", ({ roundNumber, totalRounds }) => {
      setPhase("playing");
      setHints([]);
      setReveal(null);
      setStatus(`Round ${roundNumber}/${totalRounds}`);
    });

    s.on("round:hint", ({ hintNumber, text, duration }) => {
      setPhase("playing");
      setHints(prev => [...prev, `Pista ${hintNumber}: ${text}`]);
      setHintDuration(duration);
      // anima a barra (CSS-only)
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        // reflow
        void barRef.current.offsetWidth;
        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }
      clearTimeout(timerAnim.current);
      timerAnim.current = setTimeout(() => {
        if (barRef.current) barRef.current.style.width = "0%";
      }, duration * 1000);
    });

    s.on("answer:correct", ({ name, team, points }) => {
      setWhoScored({ name, team, points });
      setTimeout(() => setWhoScored(null), 2500);
    });

    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
    });

    s.on("intermission:start", ({ top5, roundNumber }) => {
      setPhase("intermission");
      // marca movimentos (delta>0 up, delta<0 down)
      setRank(top5);
      setStatus(`Ranking parcial — Round ${roundNumber}`);
    });

    s.on("game:final", ({ podium, top5, ranking }) => {
      setPhase("final");
      setRank({ podium, top5, ranking });
    });

    return () => {
      clearTimeout(timerAnim.current);
      s.disconnect();
    };
  }, [roomCode]);

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">
        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">Sala {roomCode} — {status}</p>

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-7xl font-black">{status}</div>
            <div className="mt-2 opacity-80">Preparem-se…</div>
          </div>
        )}

        {/* PLAYING: PISTAS + BARRA */}
        {phase === "playing" && (
          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <div className="afro-card kente-border">
              <h2 className="text-2xl h2 mb-3">Pistas</h2>
              <div className="timer-track mb-3">
                <div ref={barRef} className="timer-bar"></div>
              </div>
              <ul className="space-y-2">
                {hints.map((h, i) => (
                  <li key={i} className="p-3 rounded-lg chip animate-tribal">{h}</li>
                ))}
              </ul>

              {whoScored && (
                <div className="mt-4 p-3 rounded-xl bg-green-900/30 border border-green-400/50 shadow animate-tribal">
                  ✅ <b>{whoScored.name}</b> {whoScored.team ? `(${whoScored.team})` : ""} acertou! +{whoScored.points} pts
                </div>
              )}
            </div>

            <div className="afro-card kente-border">
              <h2 className="text-2xl h2 mb-3">Ranking (parcial)</h2>
              <ol className="space-y-2">
                {rank.slice(0, 5).map((r, i) => (
                  <li key={r.socketId} className="flex justify-between chip rounded-xl p-3">
                    <span>{i + 1}. {r.name} {r.team && `(${r.team})`}</span>
                    <span className="font-bold">{r.score} pts</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        )}

        {reveal && (
          <div className="reveal-deluxe-wrapper" style={{ margin: "0 auto", maxWidth: "900px" }}>
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              className="reveal-deluxe-img"
              alt={reveal.name}
            />
            <div className="reveal-deluxe-name" style={{ fontSize: "3rem" }}>
              {reveal.name}
            </div>
          </div>
        )}


        {/* INTERMISSION: RANKING TOP 5 + MOVIMENTO */}
        {phase === "intermission" && Array.isArray(rank) && (
          <div className="mt-6 afro-card kente-border">
            <h2 className="text-2xl h2 mb-3">Ranking Temporário — Top 5</h2>
            <ol className="space-y-2">
              {rank.map((r, i) => (
                <li
                  key={r.socketId}
                  className={`flex justify-between chip rounded-xl p-3 ${r.delta > 0 ? "move-up" : r.delta < 0 ? "move-down" : ""}`}
                >
                  <span>
                    {i + 1}. {r.name} {r.team && `(${r.team})`}{" "}
                    {r.delta > 0 && <span className="text-green-400">↑ +{r.delta}</span>}
                    {r.delta < 0 && <span className="text-red-400">↓ {r.delta}</span>}
                  </span>
                  <span className="font-bold">{r.score} pts</span>
                </li>
              ))}
            </ol>
            <p className="mt-3 opacity-80 text-sm">Próximo round começará automaticamente…</p>
          </div>
        )}

        {/* FINAL: PÓDIO */}
        {phase === "final" && rank?.podium && (
          <div className="mt-8">
            <h2 className="text-3xl title-afro text-center mb-6">Pódio Final</h2>
            <div className="podium">
              {/* 2º */}
              <div className="place">
                <div className="medal">🥈</div>
                <div className="font-bold mt-1">{rank.podium[1]?.name || "-"}</div>
                <div className="opacity-80">{rank.podium[1]?.score ?? 0} pts</div>
              </div>
              {/* 1º */}
              <div className="place first neon-gold">
                <div className="medal">🥇</div>
                <div className="font-bold mt-1 text-xl">{rank.podium[0]?.name || "-"}</div>
                <div className="opacity-90 font-semibold">{rank.podium[0]?.score ?? 0} pts</div>
              </div>
              {/* 3º */}
              <div className="place">
                <div className="medal">🥉</div>
                <div className="font-bold mt-1">{rank.podium[2]?.name || "-"}</div>
                <div className="opacity-80">{rank.podium[2]?.score ?? 0} pts</div>
              </div>
            </div>

            {/* 4º e 5º */}
            <div className="grid md:grid-cols-2 gap-4 mt-6">
              {rank.top5?.slice(3, 5).map((r, idx) => (
                <div key={r.socketId} className="afro-card">
                  <div className="font-bold">{(idx + 4)}º — {r.name}</div>
                  <div className="opacity-80">{r.score} pts</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
