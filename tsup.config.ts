import { defineConfig } from 'tsup';
import './scripts/copy-wasm';

export default defineConfig({
  entry: { index: 'src/index.ts', 'deeplink/index': 'src/deeplink/index.ts' },
  format: ['esm', 'cjs'],
  target: 'node20',
  dts: true,
  shims: true,
  clean: true,
});
