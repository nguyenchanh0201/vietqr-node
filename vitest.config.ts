import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import './scripts/copy-wasm';

export default defineConfig({
  resolve: {
    // The Express example imports the package by name; point it at the sources.
    alias: [
      { find: /^vietqr-node\/deeplink$/, replacement: fileURLToPath(new URL('./src/deeplink/index.ts', import.meta.url)) },
      { find: /^vietqr-node$/, replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
    ],
  },
  test: { include: ['test/**/*.test.ts', 'examples/**/*.test.ts'], pool: 'forks' },
});
