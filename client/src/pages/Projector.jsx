import React, { useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { getSocket } from "../lib/socket";

export default function Projector() {
  const { roomCode } = useParams();
  const [socket, setSocket] = useState(null);

  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando...");
  const [hints, setHints] = useState([]);
  const [reveal, setReveal] = useState(null);
  const [finalRank, setFinalRank] = useState(null);
  const barRef = useRef(null);

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

    s.on("round:start", ({ roundNumber, totalRounds, hints: allHints, duration }) => {
      setPhase("playing");
      setReveal(null);
      setFinalRank(null);
      setHints(allHints || []);
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

    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");

      // CORREÇÃO DO CAMINHO DA IMAGEM
      const finalImage = import.meta.env.BASE_URL + image.replace(/^\//, "");

      setReveal({ name, image: finalImage });

      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    s.on("game:final", ({ podium, ranking, charStats }) => {
      setPhase("final");
      setFinalRank({ podium, ranking, charStats });
    });

    return () => s.disconnect();
  }, [roomCode]);

  function handleSkip() {
    if (!socket) return;
    socket.emit("round:skip", { roomCode });
  }

  return (
    <div className="min-h-screen bg-wakanda overlay p-6 animate-tribal flex justify-center">
      <div className="max-w-6xl w-full">

        <h1 className="text-5xl title-afro text-center">Quem Sou Eu — Projetor</h1>
        <p className="text-center opacity-90 mt-2">
          Sala {roomCode} — {status}
        </p>

        {/* COUNTDOWN */}
        {phase === "countdown" && (
          <div className="mt-10 afro-card kente-border text-center">
            <div className="text-8xl font-black animate-pulse">{status}</div>
            <div className="opacity-75 mt-2 text-xl">Preparem-se…</div>
          </div>
        )}

        {/* PLAYING */}
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

        {/* REVEAL */}
        {phase === "reveal" && reveal && (
          <div
            className="reveal-deluxe-wrapper"
            style={{ margin: "0 auto", maxWidth: "900px" }}
          >
            <img
              src={reveal.image}
              className="reveal-deluxe-img"
              alt={reveal.name}
            />

            <div className="reveal-deluxe-name">{reveal.name}</div>

            {/* Botão de pular */}
            <div style={{ textAlign: "center", marginTop: 18 }}>
              <button
                className="btn-secondary px-6 py-3 rounded-xl"
                onClick={handleSkip}
              >
                ⏭️ Pular para o próximo round
              </button>
            </div>
          </div>
        )}

        {/* FINAL */}
        {phase === "final" && finalRank && (
          <div className="mt-10">
            <h2 className="text-4xl title-afro text-center mb-8">Pódio Final</h2>

            {/* PÓDIO A — ORIGINAL */}
            <div className="podium">
              <div className="place">
                <div className="medal">🥈</div>
                <div className="font-bold mt-1">
                  {finalRank.podium[1]?.name || "-"}
                </div>
                <div className="opacity-80">
                  {finalRank.podium[1]?.corrects ?? 0} acertos
                </div>
              </div>

              <div className="place first neon-gold">
                <div className="medal">🥇</div>
                <div className="font-bold mt-1 text-xl">
                  {finalRank.podium[0]?.name || "-"}
                </div>
                <div className="opacity-90 font-semibold">
                  {finalRank.podium[0]?.corrects ?? 0} acertos
                </div>
              </div>

              <div className="place">
                <div className="medal">🥉</div>
                <div className="font-bold mt-1">
                  {finalRank.podium[2]?.name || "-"}
                </div>
                <div className="opacity-80">
                  {finalRank.podium[2]?.corrects ?? 0} acertos
                </div>
              </div>
            </div>

            {/* Separação especial pedida por você */}
            <div style={{ height: "60px" }} />

            <div className="afro-card kente-border">
              <h3 className="text-2xl mb-3">Personagens mais acertados</h3>
              <ol className="space-y-2">
                {finalRank.charStats?.length ? (
                  finalRank.charStats.map((c, i) => (
                    <li
                      key={c.id}
                      className="chip p-3 rounded-xl flex justify-between"
                    >
                      <span>
                        {i + 1}. {c.name}
                      </span>
                      <span className="font-bold">{c.count} acertos</span>
                    </li>
                  ))
                ) : (
                  <li className="chip p-3 rounded-xl">Nenhum dado</li>
                )}
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}