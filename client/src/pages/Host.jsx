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
    s.on("game:final", ({ charStats }) => setFinalStats(charStats || []));

    return () => s.disconnect();
  }, []);

  function createRoom() {
    socket.emit("room:create", { totalRounds: rounds }, ({ roomCode }) => {
      setRoomCode(roomCode);
      setFinalStats(null);
    });
  }

  function startGame() {
    socket.emit("game:start", { roomCode });
    setFinalStats(null);
  }

  function openProjector() {
    const url = `${import.meta.env.BASE_URL}#/projector/${roomCode}`;
    window.open(url, "_blank");
  }

  return (
    <div className="page-center bg-origens overlay animate-tribal">
      <div className="afro-card kente-border max-w-3xl w-full space-y-8">

        <h1 className="title-afro text-4xl text-center">Criar Sala</h1>
        <hr className="hr-gold opacity-60" />

        {!roomCode ? (
          <div className="space-y-6 text-center">
            <p className="opacity-90">Quantos rounds você quer jogar?</p>

            <input
              type="number"
              min={3}
              max={20}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="input-afro w-40 mx-auto text-center"
            />

            <button className="btn-primary w-full rounded-xl" onClick={createRoom}>
              Criar Sala
            </button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <p className="opacity-80">Código da Sala:</p>
              <p className="text-5xl font-bold tracking-widest">{roomCode}</p>
            </div>

            <hr className="hr-gold opacity-40" />

            <h2 className="h2 text-2xl">Jogadores</h2>

            <ul className="space-y-3">
              {Object.values(players)
                .filter(p => p.name !== "Host" && p.name !== "PROJETOR")
                .map((p, i) => (
                  <li key={i} className="chip p-3 rounded-xl flex justify-between">
                    <span>{p.name}</span>
                    <span>{p.corrects ?? 0} acertos</span>
                  </li>
                ))}
            </ul>

            <hr className="hr-gold opacity-40" />

            <h2 className="h2 text-2xl">Gerenciar</h2>
            <div className="space-y-3">
              <button className="btn-secondary w-full rounded-xl" onClick={startGame}>
                Iniciar Partida
              </button>

              <button className="btn-ghost w-full rounded-xl" onClick={openProjector}>
                Abrir Projetor
              </button>
            </div>

            {finalStats && (
              <>
                <hr className="hr-gold opacity-40 mt-3" />

                <h2 className="h2 text-2xl">Personagens mais acertados</h2>

                <ol className="space-y-2">
                  {finalStats.map((c, i) => (
                    <li key={i} className="chip p-3 rounded-xl flex justify-between">
                      <span>{i + 1}. {c.name}</span>
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