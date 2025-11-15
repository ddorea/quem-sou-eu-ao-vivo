import React, { useEffect, useRef, useState } from "react";
import { getSocket } from "../lib/socket";
import { useParams, useSearchParams } from "react-router-dom";

export default function Play() {
  const { roomCode } = useParams();
  const [params] = useSearchParams();

  const [socket, setSocket] = useState(null);
  const [phase, setPhase] = useState("lobby");
  const [status, setStatus] = useState("Aguardando…");
  const [hints, setHints] = useState([]);
  const [rank, setRank] = useState([]);
  const [reveal, setReveal] = useState(null);
  const [gapMsg, setGapMsg] = useState("");
  const [options, setOptions] = useState([]);
  const [roundTimer, setRoundTimer] = useState(0);

  const barRef = useRef(null);
  const timerIntervalRef = useRef(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name");
    const team = params.get("team");

    s.emit("room:join", { roomCode, name, team });

    s.on("room:state", ({ state }) => setPhase(state));
    s.on("game:countdown:start", ({ seconds }) => setStatus(`Começa em ${seconds}…`));

    // Novo: round:start traz todas as pistas e a duração
    s.on("round:start", ({ roundNumber, hints, duration, options }) => {
      setPhase("playing");
      setReveal(null);
      setGapMsg("");
      setStatus(`Round ${roundNumber}`);
      setHints(hints || []);
      setOptions(options || []);
      setRoundTimer(duration || 0);

      // reset do timer visual
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }

      // start contador local
      clearInterval(timerIntervalRef.current);
      let t = duration || 0;
      setRoundTimer(t);
      timerIntervalRef.current = setInterval(() => {
        t--;
        setRoundTimer(t);
        if (t <= 0) {
          clearInterval(timerIntervalRef.current);
        }
      }, 1000);
    });

    // Revelação
    s.on("round:reveal", ({ name, image }) => {
      setReveal({ name, image });
      setPhase("reveal");
      setOptions([]); // remove botões
      clearInterval(timerIntervalRef.current);
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "0%";
      }
    });

    // Ranking parcial
    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    // Mensagem individual (6º+)
    s.on("intermission:you", ({ position, gapToNext }) => {
      if (position >= 6) {
        setGapMsg(`Você está a ${gapToNext} acertos do próximo colocado.`);
      }
    });

    // Final de jogo
    s.on("game:final", () => setPhase("final"));

    return () => {
      clearInterval(timerIntervalRef.current);
      s.disconnect();
    };
  }, [roomCode]);

  function sendChoice(choice) {
    socket.emit("answer:send", { roomCode, answer: choice });
    setOptions([]); // desabilita botões para evitar duplo clique
  }

  return (
    <div className="page-center bg-wakanda overlay animate-tribal">

      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />

        {/* REVELAÇÃO */}
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

        {/* EM JOGO */}
        {phase === "playing" && (
          <>
            {/* Timer */}
            <div className="timer-track">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            <div className="chip p-4 rounded-xl text-left">
              {/* mostra todas as pistas de uma vez */}
              {hints.map((h, i) => (
                <div key={i}><b>Pista {i + 1}:</b> {h}</div>
              ))}
            </div>

            {/* Botões de múltipla escolha (aparecem junto com as pistas) */}
            <div className="grid grid-cols-2 gap-4">
              {options.map((opt, idx) => (
                <button
                  key={idx}
                  className="btn-choice"
                  onClick={() => sendChoice(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
          </>
        )}

        {/* INTERMISSION / FINAL */}
        {phase === "final" && (
          <div className="chip p-4 rounded-xl text-center text-xl font-bold">
            Fim da partida! Veja o pódio no projetor.
          </div>
        )}

        <h2 className="h2 text-2xl">Top 5</h2>
        <ol className="space-y-2">
          {rank.slice(0, 5).map((r, i) => (
            <li key={r.socketId} className="chip p-3 flex justify-between">
              <span>{i + 1}. {r.name}</span>
              <span>{r.score} acertos</span>
            </li>
          ))}
        </ol>

        {gapMsg && <div className="opacity-80 text-sm mt-2">{gapMsg}</div>}

      </div>

    </div>
  );
}