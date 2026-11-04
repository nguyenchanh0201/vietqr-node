// Shared consumer checks; copied next to each consumer and handed that consumer's own module objects.
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');

exports.run = async function run(label, main, deeplink, req) {
  const pkgDir = path.resolve(path.dirname(req.resolve('vietqr-node')), '..');
  assert.ok(!process.cwd().startsWith(pkgDir), 'cwd must differ from the installed package');
  assert.throws(() => req.resolve('@nestjs/common'), /Cannot find module/, 'NestJS must not be installed');

  const payload = main.createDynamicAccount('970422', '0123456789', 150000, 'Thanh toán đơn hàng Đ123');
  assert.equal(main.parse(payload).accountNo, '0123456789');
  assert.equal(main.findBank('970422').shortName, 'MBBank');
  assert.ok(main.getBankLogo('970422').length > 1000);

  const opts = { bankBin: '970422', accountNo: '0123456789', amount: 150000, accountName: 'NGUYỄN VĂN ĐỨC', description: 'Thanh toán' };
  const outputs = {};
  for (const template of ['compact', 'print']) {
    for (const format of ['png', 'jpeg', 'webp', 'svg']) {
      const out = await main.render(payload, { ...opts, template, format });
      assert.ok(out.length > 1000, `${template}/${format} is empty`);
      if (format === 'svg') assert.ok(!out.includes('<text'), 'card SVG must convert text to paths');
      outputs[`${template}.${format}`] = out;
    }
  }
  // First decode in this process: WASM comes from the package's assets, never the network.
  const info = await main.decodeImage(outputs['compact.png']);
  assert.equal(info.rawPayload, payload);
  for (const key of ['compact.jpeg', 'compact.webp', 'print.png']) {
    assert.equal((await main.decodeImage(outputs[key])).rawPayload, payload, key);
  }

  assert.equal(new deeplink.VietQrDeeplinkClient().isConfigured, true);
  assert.deepEqual(globalThis.__netAttempts, [], 'no network attempts');
  console.log(`${label} smoke OK (package at ${pkgDir}, cwd ${process.cwd()})`);
};
