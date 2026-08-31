import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

function srcDir(name: string): string {
  return fileURLToPath(new URL(`./src/${name}`, import.meta.url));
}

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/wx-iem": {
        target: "https://mesonet.agron.iastate.edu",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/wx-iem/, ""),
      },
    },
  },
  resolve: {
    alias: {
      "@core": srcDir("core"),
      "@parse": srcDir("parse"),
      "@pilot": srcDir("pilot"),
      "@scope": srcDir("scope"),
      "@speech": srcDir("speech"),
      "@scenario": srcDir("scenario"),
      "@ui": srcDir("ui"),
    },
  },
  test: {
    environment: "node",
    include: [
      "src/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "tests/**/*.{test,spec}.?(c|m)[jt]s?(x)",
      "tools/**/*.{test,spec}.?(c|m)[jt]s?(x)",
    ],
  },
});
