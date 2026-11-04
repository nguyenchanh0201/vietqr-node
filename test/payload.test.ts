import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as api from '../src/index';
import { verifyCrc } from '../src/emv/crc';

type Case = { id: string; kind: string; operation?: string; request?: Record<string, unknown>; amountSpecial?: string };
type Observation = { ok: true; payload: string } | { ok: false; origin: string; error: string; paramName?: string; message: string };
const cases: Case[] = JSON.parse(readFileSync(new URL('./fixtures/upstream/cases.json', import.meta.url), 'utf8'));
const payloads: Record<string, Observation> = JSON.parse(readFileSync(new URL('./fixtures/upstream/payloads.json', import.meta.url), 'utf8'));

// Independent oracle contract: removing field validation or changing type inference,
// normalization, tag ordering, truncation, or CRC must break the corresponding case.
function mapUpstreamError(c: Case, exp: Exclude<Observation, { ok: true }>): string {
  if (exp.error.startsWith('qr.')) return exp.error;
  const table: Record<string, string> = {};
  for (const operation of ['request', 'extended']) {
    table[`adapter/${operation}/InvalidAmount/amount`] = 'qr.invalid_amount';
    table[`upstream/${operation}/ArgumentException/raw`] = 'qr.invalid_bin';
    table[`upstream/${operation}/ArgumentException/acquirerId`] = 'qr.invalid_bin';
    table[`upstream/${operation}/ArgumentException/consumerId`] = 'qr.missing_param';
    table[`upstream/${operation}/ArgumentOutOfRangeException/amount`] = 'qr.invalid_amount';
    table[`upstream/${operation}/ArgumentException/money`] = 'qr.invalid_amount';
  }
  const key = `${exp.origin}/${c.operation}/${exp.error}/${exp.paramName}`;
  if (!table[key]) throw new Error(`Unmapped oracle error: ${key}`);
  return table[key];
}
for (const c of cases.filter(c => c.kind === 'payload')) {
  test(c.id, () => {
    const req = { ...c.request };
    if (c.amountSpecial) req.amount = Number(c.amountSpecial);
    const exp = payloads[c.id];
    // Namespace access ensures RED is an assertion failure for the missing API,
    // rather than an unresolved-module/import startup error.
    expect(api).toHaveProperty('createPayload');
    if (exp.ok) expect(api.createPayload(req as unknown as api.PayloadRequest)).toBe(exp.payload);
    else expect(() => api.createPayload(req as unknown as api.PayloadRequest)).toThrow(expect.objectContaining({ code: mapUpstreamError(c, exp) }));
  });
}
test('lossless oracle preserves the upstream dangling surrogate and CRC', () => {
  const exp = payloads['description-surrogate-boundary'];
  if (!exp.ok) throw new Error('Expected successful upstream boundary payload');
  expect(exp.payload.charCodeAt(117)).toBe(0xd83d);
  expect(exp.payload.slice(-4)).toBe('A632');
  expect(verifyCrc(exp.payload)).toBe(true);
});
for (const serviceType of ['account', 'card'] as const) {
  test(`${serviceType} helpers preserve explicit static/dynamic request semantics`, () => {
    expect(api).toHaveProperty('createStatic');
    const req = { bankBin: '970422', accountNo: '9704222028493997', description: 'x', serviceType };
    const staticExpected = api.createPayload({ ...req, qrType: 'static' });
    const dynamicExpected = api.createPayload({ ...req, amount: 2000, billNumber: 'bill', qrType: 'dynamic' });
    expect(api.createStatic(req.bankBin, req.accountNo, 'x', serviceType)).toBe(staticExpected);
    expect(api.createDynamic(req.bankBin, req.accountNo, 2000, 'x', 'bill', serviceType)).toBe(dynamicExpected);
    const staticHelper = serviceType === 'card' ? api.createStaticCard : api.createStaticAccount;
    const dynamicHelper = serviceType === 'card' ? api.createDynamicCard : api.createDynamicAccount;
    expect(staticHelper(req.bankBin, req.accountNo, 'x')).toBe(staticExpected);
    expect(dynamicHelper(req.bankBin, req.accountNo, 2000, 'x', 'bill')).toBe(dynamicExpected);
    expect(() => dynamicHelper(req.bankBin, req.accountNo, 0)).toThrow(expect.objectContaining({ code: 'qr.invalid_amount' }));
  });
}
test('extracts BIN from payloads without requiring valid CRC and supports upstream fallback', () => {
  expect(api).toHaveProperty('extractBinFromEmvCo');
  const exp = payloads.readme;
  if (!exp.ok) throw new Error('Expected README payload');
  expect(api.extractBinFromEmvCo(exp.payload.slice(0, -4) + '0000')).toBe('970422');
  expect(api.extractBinFromEmvCo('a000000727 junk 0006970422')).toBe('970422');
  expect(api.extractBinFromEmvCo('A0000007270006abcdef')).toBeNull();
  expect(api.extractBinFromEmvCo('')).toBeNull();
  expect(api.extractBinFromEmvCo('not a payload')).toBeNull();
});
for (const prefix of ['ß', 'ﬃ']) {
  for (const aid of ['A000000727', 'a000000727']) {
    test(`fallback preserves original offsets after ${prefix} before ${aid}`, () => {
      expect(api.extractBinFromEmvCo(`${prefix}${aid}0006970422`)).toBe('970422');
    });
  }
}
test('extraction prefers parsed nested bank over substring collisions', () => {
  expect(api).toHaveProperty('extractBinFromEmvCo');
  // A valid root has a misleading AID/0006 in tag00; nested bank need not be six digits.
  const payload = '0020A000000727000611111138270010A00000072701090005HELLO';
  expect(api.extractBinFromEmvCo(payload)).toBe('HELLO');
});
