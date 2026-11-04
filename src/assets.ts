import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDir = typeof __dirname === 'string' ? __dirname : dirname(fileURLToPath(import.meta.url));

export function assetPath(rel: string): string {
  let directory = moduleDir;
  for (;;) {
    const manifest = join(directory, 'package.json');
    if (existsSync(manifest) && JSON.parse(readFileSync(manifest, 'utf8')).name === 'vietqr-node') {
      return join(directory, 'assets', rel);
    }
    const parent = dirname(directory);
    if (parent === directory) throw new Error('Cannot locate vietqr-node package assets.');
    directory = parent;
  }
}

export function readAsset(rel: string): Buffer {
  return readFileSync(assetPath(rel));
}
