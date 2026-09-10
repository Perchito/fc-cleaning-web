// Second build: the /ops dashboard as its own React app, output to dist/ops/
// and served under the /ops path (behind the Basic-auth middleware).
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  root: "ops",
  base: "/ops/",
  build: {
    outDir: "../dist/ops",
    emptyOutDir: true,
  },
});
