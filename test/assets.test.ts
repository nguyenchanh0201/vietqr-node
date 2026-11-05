import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute } from 'node:path';
import { expect, test } from 'vitest';
import { assetPath, readAsset } from '../src/assets';

test('assets resolve independent of cwd', () => {
  const cwd = process.cwd();
  try {
    process.chdir(tmpdir());
    expect(readAsset('banks.json').length).toBeGreaterThan(1000);
    expect(isAbsolute(assetPath('banks.json'))).toBe(true);
    expect(readFileSync(assetPath('banks.json'))).toEqual(readAsset('banks.json'));
    expect(JSON.parse(readAsset('banks.json').toString()).data.length).toBe(76);
    for (const rel of ['fonts/GoogleSans-Regular.ttf', 'logos/970422.png', 'vietqr.png', 'vietqr_icon.png', 'napas247.png']) {
      expect(readAsset(rel).length).toBeGreaterThan(100);
    }
  } finally {
    process.chdir(cwd);
  }
});
