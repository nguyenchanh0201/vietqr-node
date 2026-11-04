import { defineConfig } from 'tsup';
import './scripts/copy-wasm';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node20',
  dts: true,
  shims: true,
  clean: true,
});
