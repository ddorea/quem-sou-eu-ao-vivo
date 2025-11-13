import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "/quem-sou-eu-ao-vivo/",
  plugins: [react()],
});
