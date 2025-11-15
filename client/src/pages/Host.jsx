import React, { useEffect, useState } from "react";
import { getSocket } from "../lib/socket";

export default function Host() {
  const [socket, setSocket] = useState(null);
  const [roomCode, setRoomCode] = useState("");
  const [players, setPlayers] = useState({});
  const [rounds, setRounds] = useState(6);
  const [finalStats, setFinalStats] = useState(null);

  useEffect(() => {
    const s = getSocket();
    setSocket(s);
    s.on("room:state", ({ players }) => setPlayers(players));
    s.on("game:final", ({ charStats }) => {
      setFinalStats(charStats || null);
    });
    return () => s.disconnect();
  }, []);

  function createRoom() {
    socket.emit(
      "room:create",
      { hostName: "Host", totalRounds: rounds },
      ({ roomCode }) => {
        setRoomCode(roomCode);
        setFinalStats(null);
      }
    );
  }

  function startGame() {
    socket.emit("game:start", { roomCode });
    setFinalStats(null);
  }

  function openProjector() {
    const url = `${import.meta.env.BASE_URL}#/projector/${roomCode}`;
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="page-center bg-origens overlay animate-tribal">
      <div className="afro-card kente-border max-w-3xl w-full box-shadow-lift space-y-8">

        <h1 className="title-afro text-4xl text-center">Criar Sala</h1>
        <hr className="hr-gold opacity-50" />

        {!roomCode ? (
          <div className="space-y-6 text-center">
            <p className="text-lg opacity-90">Defina quantos rounds você deseja jogar:</p>

            <input
              type="number"
              min={3}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="input-afro mx-auto w-40 text-center"
            />

            <button className="btn-primary rounded-xl w-full" onClick={createRoom}>
              Criar Sala
            </button>
          </div>
        ) : (
          <>
            <div className="text-center space-y-2">
              <p className="opacity-80">Código da sala:</p>
              <p className="text-5xl font-bold tracking-widest">{roomCode}</p>
            </div>

            <hr className="hr-gold opacity-40" />

            <h2 className="h2 text-2xl">Jogadores</h2>
            <ul className="space-y-2">
              {Object.values(players)
                .filter((p) => p.name !== "Host" && p.name !== "PROJETOR")
                .map((p, i) => (
                  <li key={i} className="chip rounded-xl p-3 flex justify-between">
                    <span>{p.name}</span>
                    <span>{p.corrects ?? 0} acertos</span>
                  </li>
                ))}
            </ul>

            <hr className="hr-gold opacity-40" />

            <h2 className="h2 text-2xl">Gerenciar Sala</h2>
            <div className="space-y-3">
              <button className="btn-secondary w-full rounded-xl" onClick={startGame}>
                Iniciar Partida
              </button>

              <button
                className="btn-ghost w-full text-center rounded-xl"
                onClick={openProjector}
              >
                Abrir Projetor
              </button>
            </div>

            {/* mostra estatísticas de personagens após a partida, se existirem */}
            {finalStats && (
              <>
                <hr className="hr-gold opacity-40 mt-4" />
                <h2 className="h2 text-2xl mt-2">Personagens mais acertados</h2>
                <ol className="space-y-2">
                  {finalStats.map((c, i) => (
                    <li key={c.id} className="chip p-3 rounded-xl flex justify-between">
                      <span>{i+1}. {c.name}</span>
                      <span className="font-bold">{c.count} acertos</span>
                    </li>
                  ))}
                </ol>
              </>
            )}
          </>
        )}

      </div>
    </div>
  );
}