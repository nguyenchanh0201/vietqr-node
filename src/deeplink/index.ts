// Only module in the package allowed to touch the network. Imports crc directly to stay free of native/rendering code.
import { verifyCrc } from '../emv/crc';

export interface DeeplinkOptions {
  baseUrl?: string; discoveryUrl?: string; defaultGateway?: string; enableDiscovery?: boolean;
  discoveryCacheHours?: number; timeoutSeconds?: number; fetch?: typeof fetch;
}
export interface DeeplinkBankAppInfo {
  appCode: string; bin: string | null; shortName: string; appName: string; logo: string;
  supportsAutofill: boolean; supportsIos: boolean; supportsAndroid: boolean;
}
export interface DeeplinkIntentResult { url: string; expiresInSeconds: number }

const DISCOVERY_TIMEOUT_MS = 4000;
const FALLBACK_CACHE_MS = 15 * 60_000;
const trimSlash = (s: string) => s.replace(/\/+$/, '');
const blank = (s: string | undefined | null) => !s || !s.trim();

/** Waits for a shared promise; a caller abort rejects only this caller. */
function waitFor<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

export class VietQrDeeplinkClient {
  private readonly opts: Required<Omit<DeeplinkOptions, 'baseUrl' | 'fetch'>> & Pick<DeeplinkOptions, 'baseUrl' | 'fetch'>;
  private cache?: { url: string; expires: number };
  private inflight?: Promise<string>;

  constructor(opts: DeeplinkOptions = {}) {
    this.opts = {
      discoveryUrl: 'https://raw.githubusercontent.com/Ngochiendev/vietqr-core/main/vietqr-discovery.json',
      defaultGateway: 'https://vietqr.hiendev.io.vn',
      enableDiscovery: true,
      discoveryCacheHours: 12,
      timeoutSeconds: 10,
      ...Object.fromEntries(Object.entries(opts).filter(([, v]) => v !== undefined)),
    };
  }

  get isConfigured(): boolean {
    return !blank(this.opts.baseUrl) || this.opts.enableDiscovery || !blank(this.opts.defaultGateway);
  }

  async getSupportedApps(signal?: AbortSignal): Promise<DeeplinkBankAppInfo[]> {
    if (!this.isConfigured) return [];
    const body = await this.call('v1/apps', undefined, signal);
    const data = (body as { data?: unknown } | null)?.data;
    return Array.isArray(data) ? data.map(toApp) : [];
  }

  async createIntent(appCode: string, qrContent: string, signal?: AbortSignal): Promise<DeeplinkIntentResult | null> {
    if (!this.isConfigured || blank(appCode) || blank(qrContent)) return null;
    const qr = qrContent.trim();
    if (!verifyCrc(qr)) return null;
    const init = { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appCode: appCode.trim(), qrContent: qr }) };
    const data = ((await this.call('v1/intents', init, signal)) as { data?: Partial<DeeplinkIntentResult> } | null)?.data;
    return data ? { url: String(data.url ?? ''), expiresInSeconds: Number(data.expiresInSeconds ?? 0) } : null;
  }

  /** Resolves the gateway, then requests `path`; returns parsed JSON or null. Rethrows only the caller's abort. */
  private async call(path: string, init: RequestInit | undefined, signal?: AbortSignal): Promise<unknown> {
    try {
      const base = await this.resolveBaseUrl(signal);
      if (blank(base)) return null;
      const timeoutMs = this.opts.timeoutSeconds > 0 ? this.opts.timeoutSeconds * 1000 : undefined;
      return await this.fetchJson(new URL(path, `${base}/`).toString(), init, timeoutMs, signal);
    } catch {
      if (signal?.aborted) throw signal.reason;
      return null;
    }
  }

  /** fetch + JSON with an internal timeout and the caller's signal (no AbortSignal.any: Node 20.0 lacks it). */
  private async fetchJson(url: string, init: RequestInit | undefined, timeoutMs: number | undefined, signal?: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    const timer = timeoutMs === undefined ? undefined : setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), timeoutMs);
    const onAbort = () => controller.abort(signal!.reason);
    if (signal?.aborted) onAbort();
    signal?.addEventListener('abort', onAbort, { once: true });
    try {
      const res = await (this.opts.fetch ?? globalThis.fetch)(url, { ...init, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
    }
  }

  private resolveBaseUrl(signal?: AbortSignal): Promise<string> {
    if (!blank(this.opts.baseUrl)) return Promise.resolve(trimSlash(this.opts.baseUrl!.trim()));
    if (!this.opts.enableDiscovery) return Promise.resolve(trimSlash(this.opts.defaultGateway));
    if (this.cache && Date.now() < this.cache.expires) return Promise.resolve(this.cache.url);
    // Shared discovery with its own timeout: one caller's abort never cancels it for others.
    this.inflight ??= this.discover().finally(() => { this.inflight = undefined; });
    return waitFor(this.inflight, signal);
  }

  private async discover(): Promise<string> {
    let gateway: unknown;
    try {
      gateway = ((await this.fetchJson(this.opts.discoveryUrl, undefined, DISCOVERY_TIMEOUT_MS)) as { gateway?: unknown } | null)?.gateway;
    } catch {
      gateway = undefined;
    }
    this.cache = typeof gateway === 'string' && gateway.trim()
      ? { url: trimSlash(gateway.trim()), expires: Date.now() + Math.max(1, this.opts.discoveryCacheHours) * 3_600_000 }
      : { url: trimSlash(this.opts.defaultGateway), expires: Date.now() + FALLBACK_CACHE_MS };
    return this.cache.url;
  }
}

function toApp(raw: Record<string, unknown>): DeeplinkBankAppInfo {
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return {
    appCode: str(raw.appCode), bin: typeof raw.bin === 'string' ? raw.bin : null, shortName: str(raw.shortName),
    appName: str(raw.appName), logo: str(raw.logo), supportsAutofill: raw.supportsAutofill === true,
    supportsIos: raw.supportsIos !== false, supportsAndroid: raw.supportsAndroid !== false,
  };
}
