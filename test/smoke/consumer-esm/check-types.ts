import { parse, render, renderDataUrl, VietQrError, type RenderOptions, type VietQrInfo } from 'vietqr-node';
import { VietQrDeeplinkClient, type DeeplinkIntentResult } from 'vietqr-node/deeplink';

const opts: RenderOptions = { template: 'print', accountName: 'NGUYỄN VĂN ĐỨC' };
const info: VietQrInfo | null = (() => { try { return parse('x'); } catch (e) { return e instanceof VietQrError ? null : null; } })();
const png: Promise<Buffer> = render('x', { ...opts, format: 'png' });
const svg: Promise<string> = render('x', { format: 'svg' });
const url: Promise<string> = renderDataUrl('x');
const intent: Promise<DeeplinkIntentResult | null> = new VietQrDeeplinkClient({ baseUrl: 'https://x.test' }).createIntent('mb', 'x');
export { info, png, svg, url, intent };
