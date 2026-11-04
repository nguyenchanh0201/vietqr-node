import { defineConfig } from 'vitest/config';
import './scripts/copy-wasm';

export default defineConfig({
  test: { include: ['test/**/*.test.ts'], pool: 'forks' },
});
