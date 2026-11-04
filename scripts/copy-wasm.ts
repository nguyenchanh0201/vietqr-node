// Build/test-time: copy the version-matched zxing reader WASM from the pinned dependency into assets/.
import { copyFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const root = process.cwd();
copyFileSync(createRequire(join(root, 'package.json')).resolve('zxing-wasm/reader/zxing_reader.wasm'), join(root, 'assets/zxing_reader.wasm'));
