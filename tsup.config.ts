import { defineConfig } from 'tsup';
import './scripts/copy-wasm';

export default defineConfig({
  entry: { index: 'src/index.ts', 'deeplink/index': 'src/deeplink/index.ts', 'nestjs/index': 'src/nestjs/index.ts' },
  external: [/^@nestjs\//, 'reflect-metadata'],
  format: ['esm', 'cjs'],
  target: 'node20',
  dts: true,
  shims: true,
  clean: true,
});
