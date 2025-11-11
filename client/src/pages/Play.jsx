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
  const [reveal, setReveal] = useState(null);
  const [gapMsg, setGapMsg] = useState("");

  const [options, setOptions] = useState([]);

  const barRef = useRef(null);
  const hasFirstHint = useRef(false);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);

    const name = params.get("name") || "Jogador";
    const team = params.get("team") || "Equipe";

    s.emit("room:join", { roomCode, name, team });

    // ✅ Estado da sala
    s.on("room:state", ({ state }) => setPhase(state));

    // ✅ CONTAGEM REGRESSIVA LOCAL
    s.on("game:countdown:start", ({ seconds }) => {
      setPhase("countdown");

      let n = seconds;
      setStatus(`Começa em ${n}…`);

      const timer = setInterval(() => {
        n--;
        if (n <= 0) {
          clearInterval(timer);
          setStatus("...");
          return;
        }
        setStatus(`Começa em ${n}…`);
      }, 1000);
    });

    // ✅ ROUND COMEÇOU
    s.on("round:start", ({ roundNumber, totalRounds, options }) => {
      setPhase("playing");
      setReveal(null);
      setHint("");
      setGapMsg("");

      hasFirstHint.current = false;

      setStatus(`Round ${roundNumber}/${totalRounds}`);

      // ❗Muito importante: esconde as opções até a 1ª dica
      setOptions([]);

      // reset do timer visual
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
      }

      // salva opções para mostrar só na primeira dica
      s._pendingOptions = options;
    });

    // ✅ Receber dica
    s.on("round:hint", ({ hintNumber, text, duration }) => {
      setHint(`Pista ${hintNumber}: ${text}`);

      // ✅ MOSTRA BOTÕES SOMENTE NA PRIMEIRA DICA
      if (!hasFirstHint.current) {
        hasFirstHint.current = true;
        setOptions(s._pendingOptions || []);
      }

      // ✅ anima a barra
      if (barRef.current) {
        barRef.current.style.transition = "none";
        barRef.current.style.width = "100%";
        void barRef.current.offsetWidth;
        barRef.current.style.transition = `width ${duration}s linear`;
        barRef.current.style.width = "0%";
      }
    });

    // ✅ REVELAÇÃO
    s.on("round:reveal", ({ name, image }) => {
      setPhase("reveal");
      setReveal({ name, image });
      setOptions([]); // remove os botões
    });

    // ✅ Ranking parcial
    s.on("ranking:update", ({ ranking }) => setRank(ranking));

    // ✅ Mensagem para jogadores fora do top 5 (não usado sem intermission)
    s.on("intermission:you", ({ position, gapToNext }) => {
      if (position >= 6) {
        setGapMsg(`Você está a ${gapToNext} pts do jogador acima.`);
      }
    });

    // ✅ Final do jogo
    s.on("game:final", () => setPhase("final"));

    return () => s.disconnect();
  }, []);



  // ✅ Enviar resposta pelo clique
  function sendChoice(option) {
    socket.emit("answer:send", {
      roomCode,
      answer: option
    });
    setOptions([]); // desativa para não enviar duas vezes
  }



  return (
    <div className="page-center bg-wakanda overlay animate-tribal">

      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-6">

        {/* CABEÇALHO */}
        <div className="flex justify-between">
          <h1 className="title-afro text-3xl">Sala {roomCode}</h1>
          <span className="chip">{status}</span>
        </div>

        <hr className="hr-gold opacity-60" />


        {/* ✅ CONTAGEM REGRESSIVA */}
        {phase === "countdown" && (
          <div className="text-center text-5xl font-black animate-pulse">
            {status}
          </div>
        )}


        {/* ✅ REVELAÇÃO DELUXE */}
        {phase === "reveal" && reveal && (
          <div className="reveal-deluxe-wrapper">
            <img
              src={import.meta.env.BASE_URL + reveal.image.replace(/^\//, "")}
              alt={reveal.name}
              className="reveal-deluxe-img"
            />
            <div className="reveal-deluxe-name">{reveal.name}</div>
          </div>
        )}



        {/* ✅ RODADA (PISTA + BOTÕES) */}
        {phase === "playing" && (
          <>
            {/* Barra do tempo */}
            <div className="timer-track">
              <div ref={barRef} className="timer-bar"></div>
            </div>

            {/* Pista */}
            <div className="chip p-4 rounded-xl text-center">{hint}</div>

            {/* ✅ Botões só aparecem após a primeira dica */}
            {options.length > 0 && (
              <div className="grid grid-cols-2 gap-4">
                {options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => sendChoice(opt)}
                    className="btn-choice"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </>
        )}



        {/* ✅ FIM DO JOGO */}
        {phase === "final" && (
          <div className="chip text-center text-xl font-bold p-4">
            Fim da partida! Veja o pódio no projetor.
          </div>
        )}

        {/* ✅ TOP 5 */}
        <h2 className="h2 text-2xl">Top 5</h2>
        <ol className="space-y-2">
          {rank.slice(0, 5).map((r, i) => (
            <li key={r.socketId} className="chip p-3 flex justify-between">
              <span>{i + 1}. {r.name}</span>
              <span>{r.score} pts</span>
            </li>
          ))}
        </ol>

      </div>
    </div>
  );
}
