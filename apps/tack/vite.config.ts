import solid from "solid-start/vite";
import staticAdapter from "solid-start-static";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/tack/",
  plugins: [solid({ adapter: staticAdapter(), ssr: false })],
  server: {
    host: process.env.NODE_ENV === 'development' && process.env.CODESPACES ? true : false
  }
});
