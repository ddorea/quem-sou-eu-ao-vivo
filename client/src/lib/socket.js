import { io } from "socket.io-client";
export function getSocket() {
  const url = import.meta.env.VITE_SERVER_URL || "http://localhost:4000";
  return io(url, { transports: ["websocket"] });
}
