import { defineConfig } from 'vitest/config';
// base relativa: el build funciona en cualquier subcarpeta (p. ej. GitHub Pages).
export default defineConfig({ base: './', build: { chunkSizeWarningLimit: 900 }, test: { include: ['tests/*.test.ts'] } });
