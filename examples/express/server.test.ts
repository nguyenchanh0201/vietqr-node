import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createPayload, decodeImage } from 'vietqr-node';
import { createApp } from './server';

const app = createApp({ deeplink: { baseUrl: 'https://gw.test', fetch: (async () => new Response('', { status: 404 })) as typeof fetch } });
const base = '/api/v1/vietqr-core';
const query = { bankBin: '970422', accountNo: '0123456789', amount: '150000', description: 'Thanh toan don hang', accountName: 'NGUYỄN VĂN ĐỨC' };

describe('express example', () => {
  const payload = createPayload({ bankBin: '970422', accountNo: '0123456789', amount: 150000, description: 'Thanh toan don hang' });

  it('GET /image returns image/png that decodes back to the same payload', async () => {
    const res = await request(app).get(`${base}/image`).query(query);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect((await decodeImage(res.body as Buffer)).rawPayload).toBe(payload);
  });

  it('GET /generate returns qrCode + qrDataURL', async () => {
    const res = await request(app).get(`${base}/generate`).query({ ...query, format: 'jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.data.qrCode).toBe(payload);
    expect(res.body.data.qrDataURL).toMatch(/^data:image\/jpeg;base64,/);
  });

  it('POST /decode accepts raw image bytes and JSON imageBase64', async () => {
    const img = await request(app).get(`${base}/image`).query({ ...query, template: 'qr_only' });
    const raw = await request(app).post(`${base}/decode`).set('content-type', 'image/png').send(img.body);
    expect(raw.status).toBe(200);
    expect(raw.body.data.accountNo).toBe('0123456789');
    const json = await request(app).post(`${base}/decode`).send({ imageBase64: (img.body as Buffer).toString('base64') });
    expect(json.body.data.rawPayload).toBe(payload);
  });

  it('maps VietQrError to 400 with its code', async () => {
    const res = await request(app).get(`${base}/generate`).query({ ...query, bankBin: '12' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('qr.invalid_bin');
  });

  it('POST /parse', async () => {
    const res = await request(app).post(`${base}/parse`).send({ qrCode: payload });
    expect(res.body.data.bankBin).toBe('970422');
  });

  it('GET /banks returns 76 banks and /banks/:binOrCode finds one', async () => {
    expect((await request(app).get(`${base}/banks`)).body.data).toHaveLength(76);
    expect((await request(app).get(`${base}/banks/MB`)).body.data.bin).toBe('970422');
    expect((await request(app).get(`${base}/banks/nope`)).status).toBe(404);
  });

  it('deeplink routes', async () => {
    expect((await request(app).get(`${base}/deeplink/apps`)).body.data).toEqual([]);
    expect((await request(app).post(`${base}/deeplink/intents`).send({ appCode: 'mb', qrCode: 'bad' })).status).toBe(400);
    expect((await request(app).post(`${base}/deeplink/intents`).send({ appCode: 'mb', qrCode: payload })).status).toBe(404);
  });
});
