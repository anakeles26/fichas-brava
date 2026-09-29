import { defineConfig } from "vitest/config";

// O PGlite leva alguns segundos para subir o Postgres em WebAssembly.
export default defineConfig({ test: { hookTimeout: 120_000, testTimeout: 30_000 } });
