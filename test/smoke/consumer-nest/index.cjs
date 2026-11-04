require('reflect-metadata');
const assert = require('node:assert/strict');
const { NestFactory } = require('@nestjs/core');
const { VietQrModule, VietQrService, VietQrDeeplinkClient } = require('vietqr-node/nestjs');

(async () => {
  const app = await NestFactory.createApplicationContext(VietQrModule.forRoot({ deeplink: { baseUrl: 'https://x.test' } }), { logger: false });
  const payload = app.get(VietQrService).createPayload({ bankBin: '970422', accountNo: '0123456789', amount: 1000 });
  assert.equal(app.get(VietQrService).parse(payload).bankBin, '970422');
  assert.equal(app.get(VietQrDeeplinkClient).isConfigured, true);
  await app.close();
  assert.deepEqual(globalThis.__netAttempts, []);
  console.log('NestJS smoke OK');
})().catch((error) => { console.error(error); process.exit(1); });
