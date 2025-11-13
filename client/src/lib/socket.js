import { io } from "socket.io-client";

export const socket = io("https://quem-sou-eu-server.onrender.com", {
  transports: ["websocket"],
});
