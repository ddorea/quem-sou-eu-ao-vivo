import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function Join() {
  const [roomCode, setRoomCode] = useState("");
  const [name, setName] = useState("");
  const [team, setTeam] = useState("");
  const nav = useNavigate();

  function go() {
    if (!roomCode || !name) return;
    nav(`/play/${roomCode}?name=${encodeURIComponent(name)}&team=${encodeURIComponent(team)}`);
  }

  return (
    <div className="page-center bg-origens overlay animate-tribal">
      <div className="afro-card kente-border max-w-md w-full box-shadow-lift space-y-6">

        <h1 className="title-afro text-4xl text-center">Entrar na Sala</h1>
        <hr className="hr-gold opacity-60" />

        <div className="space-y-4">
          <input
            className="input-afro"
            placeholder="Código da Sala"
            value={roomCode}
            onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
          />

          <input
            className="input-afro"
            placeholder="Seu nome"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <input
            className="input-afro"
            placeholder="Equipe (opcional)"
            value={team}
            onChange={(e) => setTeam(e.target.value)}
          />

          <button className="btn-primary w-full rounded-xl" onClick={go}>
            Entrar
          </button>
        </div>
      </div>
    </div>
  );
}
