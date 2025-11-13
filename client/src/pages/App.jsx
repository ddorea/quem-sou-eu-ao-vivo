import React from "react";
import { Link } from "react-router-dom";

export default function App() {
  return (
    <div className="page-center bg-origens overlay animate-tribal">
      <div className="afro-card kente-border max-w-2xl w-full box-shadow-lift space-y-8 text-center">

        <h1 className="title-afro text-6xl mb-4">Quem Sou Eu?</h1>
        <p className="opacity-90 text-xl">
           Vamos começar um desafio de memória e representatividade: você consegue reconhecer estes personagens negros que marcaram a história, a cultura e as nossas narrativas?
        </p>

        <div className="space-y-4">
          <Link
            to="/host"
            className="btn-primary w-full block text-center rounded-xl"
          >
            Criar Sala (Host)
          </Link>

          <Link
            to="/join"
            className="btn-secondary w-full block text-center rounded-xl"
          >
            Entrar como Jogador
          </Link>
        </div>

      </div>
    </div>
  );
}
