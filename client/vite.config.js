import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/quem-sou-eu-ao-vivo/",  // 👈 nome exato do repositório!
});
