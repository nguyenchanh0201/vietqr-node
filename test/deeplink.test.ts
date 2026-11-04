import { afterEach, describe, expect, it, vi } from 'vitest';
import { VietQrDeeplinkClient, type DeeplinkOptions } from '../src/deeplink';
import { createDynamicAccount } from '../src/emv/payload';

const qr = createDynamicAccount('970422', '0123456789', 1000, 'test');
const DISCOVERY = 'https://raw.githubusercontent.com/Ngochiendev/vietqr-core/main/vietqr-discovery.json';
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const intentBody = { code: '00', desc: 'ok', data: { url: 'https://app.test/open', expiresInSeconds: 300 } };

type Handler = (url: string, init: RequestInit | undefined) => Response | Promise<Response>;
function mockFetch(handler: Handler) {
  return vi.fn((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    return new Promise<Response>((resolve, reject) => {
      if (init?.signal?.aborted) return reject(init.signal.reason); // like real fetch
      init?.signal?.addEventListener('abort', () => reject(init.signal!.reason), { once: true });
      Promise.resolve().then(() => handler(url, init)).then(resolve, reject);
    });
  });
}
const hang: Handler = () => new Promise(() => {});
function gateway(discovery: Handler = () => json({ gateway: 'https://gw.test/' })): Handler {
  return (url, init) => {
    if (url === DISCOVERY) return discovery(url, init);
    if (url.endsWith('/v1/intents')) return json(intentBody);
    if (url.endsWith('/v1/apps')) return json({ code: '00', desc: 'ok', data: [{ appCode: 'mb', bin: '970422', shortName: 'MB', appName: 'MB Bank', logo: 'x' }] });
    return new Response('nope', { status: 404 });
  };
}
const client = (handler: Handler, opts: DeeplinkOptions = {}) => {
  const fetch = mockFetch(handler);
  return { fetch, c: new VietQrDeeplinkClient({ ...opts, fetch: fetch as unknown as typeof globalThis.fetch }) };
};
const urls = (f: ReturnType<typeof mockFetch>) => f.mock.calls.map((c) => String(c[0]));

afterEach(() => vi.useRealTimers());

describe('defaults and configuration', () => {
  it('is configured by default (discovery on)', () => {
    expect(new VietQrDeeplinkClient().isConfigured).toBe(true);
    expect(new VietQrDeeplinkClient({ enableDiscovery: false, defaultGateway: ' ' }).isConfigured).toBe(false);
  });
  it('not configured → null / []', async () => {
    const { fetch, c } = client(gateway(), { enableDiscovery: false, defaultGateway: '' });
    expect(await c.createIntent('mb', qr)).toBeNull();
    expect(await c.getSupportedApps()).toEqual([]);
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('gateway resolution', () => {
  it('uses the discovered gateway and posts { appCode, qrContent }', async () => {
    const { fetch, c } = client(gateway());
    expect(await c.createIntent(' mb ', ` ${qr} `)).toEqual({ url: 'https://app.test/open', expiresInSeconds: 300 });
    expect(urls(fetch)).toEqual([DISCOVERY, 'https://gw.test/v1/intents']);
    const init = fetch.mock.calls[1][1]!;
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ appCode: 'mb', qrContent: qr });
  });

  it('falls back to the default gateway when discovery fails', async () => {
    const { fetch, c } = client(gateway(() => new Response('', { status: 500 })));
    await c.createIntent('mb', qr);
    expect(urls(fetch)[1]).toBe('https://vietqr.hiendev.io.vn/v1/intents');
  });

  it('baseUrl skips discovery', async () => {
    const { fetch, c } = client(gateway(), { baseUrl: 'https://mine.test/' });
    await c.createIntent('mb', qr);
    expect(urls(fetch)).toEqual(['https://mine.test/v1/intents']);
  });

  it('enableDiscovery: false uses defaultGateway', async () => {
    const { fetch, c } = client(gateway(), { enableDiscovery: false, defaultGateway: 'https://def.test' });
    await c.getSupportedApps();
    expect(urls(fetch)).toEqual(['https://def.test/v1/apps']);
  });

  it('caches discovery between calls', async () => {
    const { fetch, c } = client(gateway());
    await c.createIntent('mb', qr);
    await c.getSupportedApps();
    expect(urls(fetch).filter((u) => u === DISCOVERY)).toHaveLength(1);
  });
});

describe('results', () => {
  it('maps apps with upstream defaults', async () => {
    const { c } = client(gateway());
    expect(await c.getSupportedApps()).toEqual([{
      appCode: 'mb', bin: '970422', shortName: 'MB', appName: 'MB Bank', logo: 'x', supportsAutofill: false, supportsIos: true, supportsAndroid: true,
    }]);
  });
  it('bad CRC or blank input → null without fetching', async () => {
    const { fetch, c } = client(gateway());
    expect(await c.createIntent('mb', qr.slice(0, -1) + (qr.endsWith('0') ? '1' : '0'))).toBeNull();
    expect(await c.createIntent(' ', qr)).toBeNull();
    expect(await c.createIntent('mb', '  ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
  it('gateway 404 → null / []', async () => {
    const { c } = client((url) => (url === DISCOVERY ? json({ gateway: 'https://gw.test' }) : new Response('', { status: 404 })));
    expect(await c.createIntent('mb', qr)).toBeNull();
    expect(await c.getSupportedApps()).toEqual([]);
  });
  it('fetch throwing → null / []', async () => {
    const { c } = client(() => { throw new TypeError('network down'); }, { baseUrl: 'https://mine.test' });
    expect(await c.createIntent('mb', qr)).toBeNull();
    expect(await c.getSupportedApps()).toEqual([]);
  });
});

describe('cancellation and timeouts', () => {
  it('aborted caller signal rejects with AbortError', async () => {
    const { c } = client(gateway(), { baseUrl: 'https://mine.test' });
    const ac = new AbortController();
    ac.abort();
    await expect(c.createIntent('mb', qr, ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
    await expect(c.getSupportedApps(ac.signal)).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('gateway timeout returns null (not an abort error)', async () => {
    vi.useFakeTimers();
    const { c } = client((url) => (url.includes('mine') ? hang(url, undefined) : json({})), { baseUrl: 'https://mine.test', timeoutSeconds: 2 });
    const p = c.createIntent('mb', qr);
    await vi.advanceTimersByTimeAsync(1999);
    let settled = false;
    p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBeNull();
  });

  it('caller abort during a hanging gateway request rejects', async () => {
    const { c } = client(hang, { baseUrl: 'https://mine.test' });
    const ac = new AbortController();
    const p = c.createIntent('mb', qr, ac.signal);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('A cancels while B shares the discovery; B succeeds, one discovery fetch, A never posts', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const { fetch, c } = client(gateway(async () => { await gate; return json({ gateway: 'https://gw.test' }); }));
    const a = new AbortController();
    const pa = c.createIntent('a', qr, a.signal);
    const pb = c.createIntent('b', qr);
    await Promise.resolve();
    a.abort();
    await expect(pa).rejects.toMatchObject({ name: 'AbortError' });
    release();
    expect(await pb).toEqual(intentBody.data);
    expect(urls(fetch).filter((u) => u === DISCOVERY)).toHaveLength(1);
    const posted = fetch.mock.calls.filter((call) => String(call[0]).endsWith('/v1/intents')).map((call) => JSON.parse(call[1]!.body as string).appCode);
    expect(posted).toEqual(['b']);
  });

  it('hanging discovery times out after 4s and falls back', async () => {
    vi.useFakeTimers();
    const { fetch, c } = client(gateway(hang));
    const p = c.createIntent('mb', qr);
    await vi.advanceTimersByTimeAsync(4000);
    expect(await p).toEqual(intentBody.data);
    expect(urls(fetch)[1]).toBe('https://vietqr.hiendev.io.vn/v1/intents');
  });

  it('discovery cache expires at discoveryCacheHours; fallback cache at 15 minutes; failures retry', async () => {
    vi.useFakeTimers();
    let ok = false;
    const { fetch, c } = client(gateway(() => (ok ? json({ gateway: 'https://gw.test' }) : new Response('', { status: 503 }))), { discoveryCacheHours: 2 });
    const discoveries = () => urls(fetch).filter((u) => u === DISCOVERY).length;
    await c.getSupportedApps();
    expect(discoveries()).toBe(1);
    ok = true;
    vi.advanceTimersByTime(15 * 60_000 - 1);
    await c.getSupportedApps();
    expect(discoveries()).toBe(1); // fallback still cached
    vi.advanceTimersByTime(1);
    await c.getSupportedApps();
    expect(discoveries()).toBe(2); // retried after fallback expiry, now succeeds
    expect(urls(fetch).at(-1)).toBe('https://gw.test/v1/apps');
    vi.advanceTimersByTime(2 * 3_600_000 - 1);
    await c.getSupportedApps();
    expect(discoveries()).toBe(2);
    vi.advanceTimersByTime(1);
    await c.getSupportedApps();
    expect(discoveries()).toBe(3);
  });

  it('removes abort listeners after settled waits', async () => {
    const { c } = client(gateway());
    const ac = new AbortController();
    const add = vi.spyOn(ac.signal, 'addEventListener');
    const remove = vi.spyOn(ac.signal, 'removeEventListener');
    await c.createIntent('mb', qr, ac.signal);
    expect(add.mock.calls.length).toBeGreaterThan(0);
    expect(remove.mock.calls.length).toBe(add.mock.calls.length);
  });
});
