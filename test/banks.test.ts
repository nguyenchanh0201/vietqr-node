import { tmpdir } from 'node:os';
import { expect, expectTypeOf, test } from 'vitest';
import * as api from '../src/index';

// Catch omitted records, dropped raw fields, wrong lookup normalization,
// accidental network/CDN use, and unsafe or missing local logo handling.
test('exposes all 76 embedded banks as a readonly catalog', () => {
  expect(api).toHaveProperty('banks');
  expect(api.banks).toHaveLength(76);
  expect(Array.isArray(api.banks)).toBe(true);
  expect([...api.banks]).toHaveLength(76);
  expect(Object.keys(api.banks)).toHaveLength(76);
  expectTypeOf(api.banks).toEqualTypeOf<readonly api.BankInfo[]>();
});

test('preserves the complete bank record and maps swift_code to swiftCode', () => {
  expect(api).toHaveProperty('findBank');
  expect(api.findBank('970422')).toEqual({
    id: 21,
    name: 'Ngân hàng TMCP Quân đội',
    code: 'MB',
    bin: '970422',
    shortName: 'MBBank',
    logo: 'https://cdn.vietqr.io/img/MB.png',
    transferSupported: 1,
    lookupSupported: 1,
    swiftCode: 'MSCBVNVX',
  });
  expect(api.findBank('CAKE')?.swiftCode).toBeNull();
});

test.each([
  ['970422', '970422', 'MBBank'],
  ['vcb', '970436', 'Vietcombank'],
  ['Vietcombank', '970436', 'Vietcombank'],
  ['vIeTcOmBaNk', '970436', 'Vietcombank'],
  [' \tVCB\n', '970436', 'Vietcombank'],
  [' 970422 ', '970422', 'MBBank'],
])('finds bank %j by BIN, code or shortName', (key, bin, shortName) => {
  expect(api).toHaveProperty('findBank');
  expect(api.findBank(key)).toMatchObject({ bin, shortName });
});

test.each(['000000', '', ' \t\n', 'unknown-bank'])('returns undefined for unknown or blank key %j', (key) => {
  expect(api).toHaveProperty('findBank');
  expect(api.findBank(key)).toBeUndefined();
});

test('reuses the loaded catalog records for repeated lookups', () => {
  expect(api).toHaveProperty('findBank');
  const bank = api.findBank('MB');
  expect(bank).toBeDefined();
  expect(api.findBank('MBBank')).toBe(bank);
  expect(api.banks.find((item) => item.bin === '970422')).toBe(bank);
});

test('reads the embedded bank PNG offline independently of cwd', () => {
  expect(api).toHaveProperty('getBankLogo');
  const cwd = process.cwd();
  try {
    process.chdir(tmpdir());
    const logo = api.getBankLogo('970422');
    expect(Buffer.isBuffer(logo)).toBe(true);
    expect(logo?.subarray(0, 4)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  } finally {
    process.chdir(cwd);
  }
});

test.each(['../../etc/passwd', '../970422', '970422.png', ' 970422', '970422\n', 'abc123', '12345', '123456789', ''])('rejects unsafe or malformed logo BIN %j', (bin) => {
  expect(api).toHaveProperty('getBankLogo');
  expect(api.getBankLogo(bin)).toBeUndefined();
});

test.each(['000000', '0000000', '00000000'])('returns undefined for a missing safe logo %j', (bin) => {
  expect(api).toHaveProperty('getBankLogo');
  expect(api.getBankLogo(bin)).toBeUndefined();
});
