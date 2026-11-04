// Express port of upstream VietQR.Api (QrCodes, Banks, Deeplink controllers). Run: npm install && npm start
import express, { type NextFunction, type Request, type Response } from 'express';
import {
  banks, createPayload, decodeImage, findBank, parse, render, renderDataUrl, verifyCrc, VietQrError,
  type ImageFormat, type RenderOptions, type ServiceType, type Template,
} from 'vietqr-node';
import { VietQrDeeplinkClient, type DeeplinkOptions } from 'vietqr-node/deeplink';

const MIME: Record<ImageFormat, string> = { png: 'image/png', jpeg: 'image/jpeg', webp: 'image/webp', svg: 'image/svg+xml' };

function fromQuery(q: Record<string, unknown>): { payload: string; options: RenderOptions; format: ImageFormat } {
  const str = (k: string) => (typeof q[k] === 'string' ? (q[k] as string) : undefined);
  const amount = str('amount') ? Number(str('amount')) : undefined;
  const serviceType = (str('serviceType') ?? 'account') as ServiceType;
  const format = (str('format') ?? 'png') as ImageFormat;
  const payload = createPayload({
    bankBin: str('bankBin') ?? '', accountNo: str('accountNo') ?? '', amount, description: str('description'),
    billNumber: str('billNumber'), serviceType,
  });
  const options: RenderOptions = {
    template: (str('template') ?? 'compact') as Template, format, serviceType, size: str('size') ? Number(str('size')) : undefined,
    bankBin: str('bankBin'), accountNo: str('accountNo'), accountName: str('accountName'), amount, description: str('description'),
    centerLogo: str('customLogo'),
  };
  return { payload, options, format };
}

export function createApp(opts: { deeplink?: DeeplinkOptions } = {}) {
  const app = express();
  const deeplink = new VietQrDeeplinkClient(opts.deeplink);
  const api = express.Router();
  api.use(express.json({ limit: '15mb' }));

  api.get('/generate', async (req, res) => {
    const { payload, options } = fromQuery(req.query);
    res.json({ code: '00', desc: 'Thành công', data: { qrCode: payload, qrDataURL: await renderDataUrl(payload, options) } });
  });

  api.get('/image', async (req, res) => {
    const { payload, options, format } = fromQuery(req.query);
    res.type(MIME[format] ?? MIME.png).send(await render(payload, options));
  });

  // Raw image body (Content-Type: image/*) or JSON { imageBase64 }.
  api.post('/decode', express.raw({ type: 'image/*', limit: '10mb' }), async (req, res) => {
    const bytes = Buffer.isBuffer(req.body)
      ? req.body
      : Buffer.from(String(req.body?.imageBase64 ?? '').replace(/^data:[^,]*,/, ''), 'base64');
    res.json({ code: '00', desc: 'Giải mã thành công', data: await decodeImage(bytes) });
  });

  api.post('/parse', (req, res) => {
    res.json({ code: '00', desc: 'Phân tích cú pháp thành công', data: parse(String(req.body?.qrCode ?? '').trim()) });
  });

  api.get('/banks', (_req, res) => {
    res.json({ code: '00', desc: 'Thành công', data: banks });
  });

  api.get('/banks/:binOrCode', (req, res) => {
    const bank = findBank(req.params.binOrCode);
    if (!bank) return void res.status(404).json({ code: '04', desc: `Không tìm thấy thông tin ngân hàng cho mã: ${req.params.binOrCode}.` });
    res.json({ code: '00', desc: 'Thành công', data: bank });
  });

  api.get('/deeplink/apps', async (_req, res) => {
    res.json({ code: '00', desc: 'Thành công', data: await deeplink.getSupportedApps() });
  });

  api.post('/deeplink/intents', async (req, res) => {
    const { appCode, qrCode } = req.body ?? {};
    if (typeof appCode !== 'string' || !appCode.trim() || typeof qrCode !== 'string' || !verifyCrc(qrCode.trim())) {
      return void res.status(400).json({ code: '02', desc: 'Chuỗi VietQR không hợp lệ.' });
    }
    const intent = await deeplink.createIntent(appCode, qrCode);
    if (!intent) return void res.status(404).json({ code: '04', desc: 'Không hỗ trợ mở ứng dụng này hoặc yêu cầu bị từ chối.' });
    res.set('cache-control', 'no-store').json({ code: '00', desc: 'Thành công', data: intent });
  });

  app.use('/api/v1/vietqr-core', api);
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof VietQrError) return void res.status(400).json({ code: err.code, desc: err.message });
    res.status(500).json({ code: 'qr.system_error', desc: 'Lỗi xử lý hệ thống.' });
  });
  return app;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  const port = Number(process.env.PORT ?? 3000);
  createApp().listen(port, () => console.log(`vietqr-node example on http://localhost:${port}`));
}
