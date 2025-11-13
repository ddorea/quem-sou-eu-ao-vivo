import { io } from "socket.io-client";

// URL do seu servidor hospedado no Render
const SERVER_URL = "https://quem-sou-eu-server.onrender.com";

let socket = null;

// Função para criar ou retornar o socket
export function getSocket() {
  if (!socket) {
    socket = io(SERVER_URL, {
      transports: ["websocket"],
    });
  }
  return socket;
}
