import QRCode from 'qrcode';
import type { SKRSContext2D } from '@napi-rs/canvas';

/** Module matrix without quiet zone, ECC level Q (upstream QRCoder `ECCLevel.Q`). */
export function buildMatrix(payload: string): boolean[][] {
  const { modules } = QRCode.create(payload, { errorCorrectionLevel: 'Q' });
  return Array.from({ length: modules.size }, (_, r) => Array.from({ length: modules.size }, (_, c) => Boolean(modules.get(r, c))));
}

/** Upstream draws non-antialiased rects; snapping edges to whole pixels gives the same result on canvas. */
export function drawModules(ctx: SKRSContext2D, matrix: boolean[][], x: number, y: number, inner: number): void {
  const n = matrix.length;
  const m = inner / n;
  ctx.fillStyle = '#000000';
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (!matrix[row][col]) continue;
      const l = Math.round(x + col * m), t = Math.round(y + row * m);
      ctx.fillRect(l, t, Math.round(x + (col + 1) * m) - l, Math.round(y + (row + 1) * m) - t);
    }
  }
}
