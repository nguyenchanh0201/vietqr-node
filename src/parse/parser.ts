import { findBank } from '../banks/catalog';
import type { BankInfo } from '../banks/types';
import { verifyCrc } from '../emv/crc';
import type { QrType, ServiceType } from '../emv/payload';
import { VietQrError } from '../errors';

export interface AdditionalDataOptions {
  billNumber: string | null;
  referenceLabel: string | null;
  purpose: string | null;
}

export interface VietQrInfo {
  bankBin: string;
  bank: BankInfo | null;
  accountNo: string;
  serviceType: ServiceType;
  qrType: QrType;
  isDynamic: boolean;
  amount: number | null;
  currency: string | null;
  countryCode: string | null;
  description: string | null;
  billNumber: string | null;
  referenceLabel: string | null;
  merchantName: string | null;
  merchantCity: string | null;
  additionalData: AdditionalDataOptions | null;
  crc: string | null;
  isValidCrc: boolean;
  rawTags: Record<string, string>;
  rawPayload: string;
}

export interface ParseOptions {
  strictCrc?: boolean;
  maxPayloadLength?: number;
}

// .NET whitespace excludes BOM and includes NEL, unlike JavaScript trim().
function trim(value: string): string {
  return value.replace(/^[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]+|[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]+$/gu, '');
}

// .NET OrdinalIgnoreCase folds ASCII only here; JS toUpperCase maps 'ı' to 'I'.
const asciiUpper = (value: string | undefined) => value?.replace(/[a-z]/g, c => c.toUpperCase());

function byteTags(value: string): Record<string, string> | null {
  const bytes = Buffer.from(value, 'utf8');
  const tags: Record<string, string> = {};
  for (let index = 0; index < bytes.length;) {
    if (index + 4 > bytes.length) return null;
    if (!bytes.subarray(index, index + 4).every(byte => byte >= 48 && byte <= 57)) return null;
    const length = (bytes[index + 2] - 48) * 10 + bytes[index + 3] - 48;
    if (index + 4 + length > bytes.length) return null;
    const tag = bytes.toString('ascii', index, index + 2);
    tags[tag] = bytes.toString('utf8', index + 4, index + 4 + length);
    index += 4 + length;
  }
  return tags;
}

// decimal.TryParse(NumberStyles.Any, InvariantCulture): signs, parentheses,
// currency symbol, grouping and exponent; decimal has a 96-bit coefficient.
function parseAmount(value: string): number | null {
  const text = trim(value);
  let negative = false;
  let signed = false;
  let paren = false;
  let currency = false;
  let i = 0;
  // .NET ParseNumber: leading white is rejected once a sign/'(' is seen, unless currency was seen too.
  for (; i < text.length; i++) {
    const ch = text[i];
    if (/[\t-\r ]/.test(ch) && (!signed || currency)) continue;
    if (!signed && (ch === '+' || ch === '-')) { signed = true; negative = ch === '-'; continue; }
    if (!signed && ch === '(') { signed = paren = negative = true; continue; }
    if (!currency && ch === '¤') { currency = true; continue; }
    break;
  }
  const number = /(?:([0-9][0-9,]*)(?:\.([0-9]*))?|\.([0-9]+))(?:[eE]([+-]?[0-9]+))?/y;
  number.lastIndex = i;
  const match = number.exec(text);
  if (!match) return null;
  for (i = number.lastIndex; i < text.length; i++) {
    const ch = text[i];
    if (/[\t-\r ]/.test(ch)) continue;
    if (!signed && (ch === '+' || ch === '-')) { signed = true; negative = ch === '-'; continue; }
    if (paren && ch === ')') { paren = false; continue; }
    if (!currency && ch === '¤') { currency = true; continue; }
    return null;
  }
  if (paren) return null;
  let coefficient = BigInt((match[1] ?? '').replaceAll(',', '') + (match[2] ?? match[3] ?? ''));
  let scale = (match[2] ?? match[3] ?? '').length - Number(match[4] ?? 0);
  if (coefficient === 0n) return 0;
  if (scale < -29) return null;
  if (scale < 0) { coefficient *= 10n ** BigInt(-scale); scale = 0; }
  const maximum = 79228162514264337593543950335n;
  let discarded = Math.max(0, scale - 28);
  if (discarded > coefficient.toString().length) return 0;
  // Round once from the original coefficient, midpoint-to-even as in Decimal.
  for (; discarded <= scale; discarded++) {
    const divisor = 10n ** BigInt(discarded);
    const quotient = coefficient / divisor;
    const remainder = coefficient % divisor;
    const rounded = quotient + (remainder * 2n > divisor || (remainder * 2n === divisor && quotient % 2n !== 0n) ? 1n : 0n);
    if (rounded <= maximum) {
      const number = Number(`${rounded}e-${scale - discarded}`);
      return negative ? -number : number;
    }
  }
  return null;
}

/** Pinned upstream parser: no input trimming or Unicode TLV/CRC repairs. */
export function parse(payload: string, options: ParseOptions = {}): VietQrInfo {
  if (typeof payload !== 'string' || !trim(payload) || payload.length > (options.maxPayloadLength ?? 1024)) {
    throw new VietQrError('qr.invalid_payload');
  }
  const isValidCrc = verifyCrc(payload);
  if ((options.strictCrc ?? true) && !isValidCrc) throw new VietQrError('qr.invalid_crc');
  const root = byteTags(payload);
  if (!root) throw new VietQrError('qr.invalid_payload');
  if (root['38'] === undefined) throw new VietQrError('qr.not_vietqr');
  const account = byteTags(root['38']);
  if (!account) throw new VietQrError('qr.invalid_payload');
  if (asciiUpper(account['00']) !== 'A000000727' || account['01'] === undefined) throw new VietQrError('qr.not_vietqr');
  const beneficiary = byteTags(account['01']);
  if (!beneficiary) throw new VietQrError('qr.invalid_payload');
  if (!trim(beneficiary['00'] ?? '')) throw new VietQrError('qr.not_vietqr');
  const bankBin = trim(beneficiary['00']);
  const qrType: QrType = trim(root['01'] ?? '') === '12' ? 'dynamic' : 'static';
  const field = (tag: string): string | null => root[tag] === undefined ? null : trim(root[tag]);
  let additionalData: AdditionalDataOptions | null = null;
  if (root['62'] !== undefined) {
    const additional = byteTags(root['62']);
    if (additional) {
      const addField = (tag: string): string | null => additional[tag] === undefined ? null : trim(additional[tag]);
      additionalData = { billNumber: addField('01'), referenceLabel: addField('05'), purpose: addField('08') };
    }
  }
  return {
    bankBin, bank: findBank(bankBin) ?? null, accountNo: trim(beneficiary['01'] ?? ''),
    serviceType: asciiUpper(account['02']) === 'QRIBFTTC' ? 'card' : 'account',
    qrType, isDynamic: qrType === 'dynamic',
    amount: root['54'] === undefined ? null : parseAmount(root['54']),
    currency: field('53'), countryCode: field('58'),
    description: additionalData?.purpose ?? null,
    billNumber: additionalData?.billNumber ?? null, referenceLabel: additionalData?.referenceLabel ?? null,
    merchantName: field('59'), merchantCity: field('60'), additionalData,
    crc: field('63'), isValidCrc, rawTags: root, rawPayload: payload,
  };
}

export function tryParse(payload: string, options?: ParseOptions): VietQrInfo | null {
  try { return parse(payload, options); }
  catch (error) {
    if (error instanceof VietQrError) return null;
    throw error;
  }
}
