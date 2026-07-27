import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./", // relative asset paths so the built app loads over file:// in Electron
  server: { port: Number(process.env.PORT) || 5173 },
});
