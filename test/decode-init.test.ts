import { describe, expect, it, vi } from 'vitest';

const prepareSpy = vi.hoisted(() => vi.fn());
vi.mock('zxing-wasm/reader', async (original) => {
  const actual = await original<typeof import('zxing-wasm/reader')>();
  return {
    ...actual,
    prepareZXingModule: (...args: Parameters<typeof actual.prepareZXingModule>) => {
      prepareSpy(...args);
      return actual.prepareZXingModule(...args);
    },
  };
});
// Same Buffer instance every call, so a retry cannot rely on zxing-wasm seeing "new" overrides.
vi.mock('../src/assets', async (original) => {
  const actual = await original<typeof import('../src/assets')>();
  const cache = new Map<string, Buffer>();
  return { ...actual, readAsset: (rel: string) => cache.get(rel) ?? cache.set(rel, actual.readAsset(rel)).get(rel)! };
});

import { createDynamicAccount } from '../src/emv/payload';
import { render } from '../src/render';

const payload = createDynamicAccount('970422', '0123456789', 150000, 'retry');

describe('zxing init', () => {
  it('a failed first init is retried by the next call; concurrent calls share one init', async () => {
    const { readQrText } = await import('../src/decode/decoder');
    const png = (await render(payload, { template: 'qr_only' })) as Buffer;

    const instantiate = vi.spyOn(WebAssembly, 'instantiate').mockRejectedValueOnce(new Error('transient wasm failure'));
    await expect(readQrText(png)).rejects.toThrow();
    instantiate.mockRestore();

    prepareSpy.mockClear();
    const texts = await Promise.all(Array.from({ length: 5 }, () => readQrText(png)));
    expect(texts).toEqual(Array(5).fill(payload));
    expect(prepareSpy).toHaveBeenCalledTimes(1);
  });
});
