import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import * as api from '../src/index';

type Observation = {
  payload: string;
  options: { strictCrc: boolean; maxPayloadLength: number };
  result: { ok: true; info: Record<string, unknown> & { bankInfo: string | null } }
    | { ok: false; error: string; message: string };
};
const observations: Record<string, Observation> = JSON.parse(readFileSync(new URL('./fixtures/upstream/parse.json', import.meta.url), 'utf8'));
const cases: { id: string; kind: string; request?: api.PayloadRequest }[] = JSON.parse(readFileSync(new URL('./fixtures/upstream/cases.json', import.meta.url), 'utf8'));
const builds: Record<string, { ok: boolean; payload: string }> = JSON.parse(readFileSync(new URL('./fixtures/upstream/payloads.json', import.meta.url), 'utf8'));

// Real upstream codes, mapped independently of production error handling.
const errorCodes: Record<string, string> = {
  'qr.invalid_payload': 'qr.invalid_payload',
  'qr.invalid_crc': 'qr.invalid_crc',
  'qr.not_vietqr': 'qr.not_vietqr',
};
// Changing TLV byte lengths, validation order, null/empty defaults, raw data,
// catalog lookup, option handling, or any field extraction breaks these cases.
for (const [id, observation] of Object.entries(observations)) {
  test(`upstream parse and tryParse: ${id}`, () => {
    // RED must fail on the missing public API, not an unresolved import.
    expect(api).toHaveProperty('parse');
    expect(api).toHaveProperty('tryParse');
    const { payload, options, result } = observation;
    if (result.ok) {
      const { bankInfo, ...expected } = result.info;
      const info = api.parse(payload, options);
      expect({ ...info, bank: info.bank?.bin ?? null }).toEqual({ ...expected, bank: bankInfo });
      expect(info.bank).toBe(bankInfo === null ? null : api.findBank(bankInfo));
      expect(api.tryParse(payload, options)).toEqual(info);
    } else {
      expect(errorCodes[result.error], 'unmapped upstream parse error').toBeDefined();
      expect(() => api.parse(payload, options)).toThrow(api.VietQrError);
      expect(() => api.parse(payload, options)).toThrow(expect.objectContaining({ code: errorCodes[result.error], message: result.message }));
      expect(api.tryParse(payload, options)).toBeNull();
    }
  });
}

// User-approved defect-class exceptions: builder UTF-16 lengths vs parser UTF-8.
const rejectedBuilds = new Set([
  'description-emoji', 'description-chinese', 'description-surrogate-boundary',
  'merchant-invariant-uppercase',
]);
const normalized: Record<string, Partial<api.VietQrInfo>> = {
  'bill-dynamic': { billNumber: 'HD D123' },
  'reference-static-inferred': { referenceLabel: 'Don 123' },
  'description-vietnamese': { description: 'Thanh toan don hang D123' },
  'description-decomposed': { description: 'Thanh toan don hang' },
  'description-spaces': { description: 'noi dung' },
  'description-tab': { description: 'ab' },
  'description-newline': { description: 'ab' },
  'description-forty': { description: 'xxxxxxxxxxxxxxxxxxxxxxxxx' },
  'description-control-only': { description: '' },
  'merchant-both': { merchantName: 'CUA HANG DEP', merchantCity: 'HO CHI MINH' },
  'merchant-name-default-city': { merchantName: 'DANG VAN A', merchantCity: 'HANOI' },
  'merchant-city-only': { merchantCity: 'DA NANG' },
  'merchant-truncation': { merchantName: 'AAAAAAAAAAAAAAAAAAAAAAAAA', merchantCity: 'BBBBBBBBBBBBBBB' },
};
for (const c of cases.filter(c => c.kind === 'payload' && builds[c.id].ok)) {
  test(`build round-trip with approved upstream policy: ${c.id}`, () => {
    expect(api).toHaveProperty('parse');
    const request = c.request!;
    const payload = api.createPayload(request);
    expect(payload).toBe(builds[c.id].payload);
    if (rejectedBuilds.has(c.id)) {
      expect(observations[`parse-build-${c.id}`].result).toMatchObject({ ok: false, error: 'qr.invalid_payload' });
      expect(() => api.parse(payload)).toThrow(expect.objectContaining({ code: 'qr.invalid_payload' }));
      expect(api.tryParse(payload)).toBeNull();
      return;
    }
    expect(observations[`parse-build-${c.id}`].result.ok).toBe(true);
    const type = request.qrType ?? ((request.amount ?? 0) > 0 ? 'dynamic' : 'static');
    expect(api.parse(payload)).toMatchObject({
      bankBin: request.bankBin.trim(), accountNo: request.accountNo.trim(),
      serviceType: request.serviceType ?? 'account', qrType: type, isDynamic: type === 'dynamic',
      amount: (request.amount ?? 0) > 0 ? request.amount : null,
      description: request.description ?? null, billNumber: request.billNumber ?? null,
      referenceLabel: request.referenceLabel ?? null, merchantName: request.merchantName ?? null,
      merchantCity: request.merchantCity ?? null,
      ...normalized[c.id],
    });
  });
}

test('round-trip policy accounts for all 31 builds with exactly four approved rejects', () => {
  const successful = Object.entries(builds).filter(([, result]) => result.ok);
  expect(successful).toHaveLength(31);
  const rejected = successful.filter(([id]) => !observations[`parse-build-${id}`].result.ok).map(([id]) => id);
  expect(rejected.sort()).toEqual([...rejectedBuilds].sort());
});

test('default parser resolves actual embedded MBBank rather than a lookup placeholder', () => {
  expect(api).toHaveProperty('parse');
  const info = api.parse(builds.readme.payload);
  expect(info.bank?.bin).toBe('970422');
  expect(info.bank).toBe(api.findBank('970422'));
  expect(info.bank?.code).toBe('MB');
});

test('lowercase hex CRC is accepted and preserved, not a digit-only transform', () => {
  expect(api).toHaveProperty('parse');
  const observation = observations['parse-lowercase-crc'];
  expect(observation.payload.slice(-4)).toBe('cad2');
  expect(observation.payload.slice(-4)).toMatch(/[a-f]/);
  const info = api.parse(observation.payload);
  expect(info).toMatchObject({ crc: 'cad2', isValidCrc: true, rawPayload: observation.payload, rawTags: { '63': 'cad2' } });
});

for (const [id, code] of [
  ['parse-garbage-strict', 'qr.invalid_crc'],
  ['parse-garbage-nonstrict', 'qr.invalid_payload'],
  ['parse-no-tag38', 'qr.not_vietqr'],
  ['parse-surrounding-whitespace', 'qr.invalid_crc'],
  ['parse-whitespace-nonstrict', 'qr.invalid_payload'],
] as const) {
  test(`independent error precedence: ${id} -> ${code}`, () => {
    expect(api).toHaveProperty('parse');
    const c = observations[id];
    expect(() => api.parse(c.payload, c.options)).toThrow(expect.objectContaining({ code }));
  });
}
