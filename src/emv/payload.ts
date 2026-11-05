import { VietQrError } from '../errors';
import { genCrcCode } from './crc';
import { removeDiacritics } from './diacritics';

export type ServiceType = 'account' | 'card';
export type QrType = 'static' | 'dynamic';
export interface PayloadRequest {
  bankBin: string;
  accountNo: string;
  serviceType?: ServiceType;
  qrType?: QrType;
  amount?: number;
  description?: string;
  billNumber?: string;
  referenceLabel?: string;
  merchantName?: string;
  merchantCity?: string;
}

// Match .NET Trim/IsNullOrWhiteSpace, not JS's BOM-inclusive trim.
function trim(value: string): string {
  return value.replace(/^[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]+|[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]+$/gu, '');
}
// .NET invariant casing uses simple mappings, not JS full-case expansions.
export function upperInvariant(value: string): string {
  return Array.from(value, char => {
    const upper = char.toUpperCase();
    return char === '\u0131' || upper.length !== char.length ? char : upper;
  }).join('');
}
function tlv(tag: string, value: string): string {
  if (value.length > 99) throw new VietQrError('qr.invalid_payload');
  return tag + String(value.length).padStart(2, '0') + value;
}

/** Ordered port of VietQrPayload.Create with supplementary direct-builder fields. */
export function createPayload(req: PayloadRequest): string {
  const amount = req.amount;
  if (amount != null && (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < -9223372036854775808 || amount >= 9223372036854775808)) {
    throw new VietQrError('qr.invalid_amount');
  }
  const bin = trim(req.bankBin ?? '');
  if (!/^[0-9]{6}$/.test(bin)) throw new VietQrError('qr.invalid_bin');
  const qrType = req.qrType ?? (amount != null && amount > 0 ? 'dynamic' : 'static');
  if (qrType === 'dynamic' && (amount == null || amount <= 0)) throw new VietQrError('qr.invalid_amount');
  const account = trim(req.accountNo ?? '');
  if (!account || account.length > 25) throw new VietQrError('qr.missing_param');
  const beneficiary = tlv('01', tlv('00', bin) + tlv('01', account));
  const tag38 = tlv('38', tlv('00', 'A000000727') + beneficiary + tlv('02', req.serviceType === 'card' ? 'QRIBFTTC' : 'QRIBFTTA'));
  let transaction = '';
  if (amount != null && amount > 0) {
    if (amount > 9999999999999) throw new VietQrError('qr.invalid_amount');
    transaction = tlv('54', String(amount));
  }
  let additional = '';
  for (const [tag, value] of [['01', req.billNumber], ['05', req.referenceLabel], ['08', req.description]] as const) {
    if (value == null || !trim(value)) continue;
    const remaining = 99 - additional.length - 4;
    if (remaining <= 0) continue;
    // UTF-16 slice intentionally preserves upstream dangling-surrogate behavior.
    const clean = removeDiacritics(trim(value)).slice(0, Math.min(25, remaining));
    additional += tlv(tag, clean);
  }
  let merchant = '';
  if (req.merchantName !== undefined || req.merchantCity !== undefined) {
    for (const [tag, value, limit] of [
      ['59', req.merchantName, 25],
      ['60', req.merchantCity === undefined ? 'HANOI' : req.merchantCity, 15],
    ] as const) {
      if (value == null || !trim(value)) continue;
      merchant += tlv(tag, upperInvariant(removeDiacritics(trim(value))).slice(0, limit));
    }
  }
  const content = '000201' + tlv('01', qrType === 'dynamic' ? '12' : '11') + tag38 + '5303704' + transaction + '5802VN' + merchant + (additional ? tlv('62', additional) : '') + '6304';
  return content + genCrcCode(content);
}

export function createStatic(bankBin: string, accountNo: string, description?: string, serviceType: ServiceType = 'account'): string {
  return createPayload({ bankBin, accountNo, description, serviceType, qrType: 'static' });
}
export function createDynamic(bankBin: string, accountNo: string, amount: number, description?: string, billNumber?: string, serviceType: ServiceType = 'account'): string {
  return createPayload({ bankBin, accountNo, amount, description, billNumber, serviceType, qrType: 'dynamic' });
}
export function createStaticAccount(bankBin: string, no: string, description?: string): string {
  return createStatic(bankBin, no, description, 'account');
}
export function createStaticCard(bankBin: string, no: string, description?: string): string {
  return createStatic(bankBin, no, description, 'card');
}
export function createDynamicAccount(bankBin: string, no: string, amount: number, description?: string, billNumber?: string): string {
  return createDynamic(bankBin, no, amount, description, billNumber, 'account');
}
export function createDynamicCard(bankBin: string, no: string, amount: number, description?: string, billNumber?: string): string {
  return createDynamic(bankBin, no, amount, description, billNumber, 'card');
}

// Only the byte-TLV walk needed by extraction, not a public parser or Task4 stub.
function byteTags(value: string): Map<string, string> | null {
  const bytes = Buffer.from(value, 'utf8');
  const tags = new Map<string, string>();
  for (let index = 0; index < bytes.length;) {
    if (index + 4 > bytes.length) return null;
    const header = bytes.toString('ascii', index, index + 4);
    if (![...bytes.subarray(index, index + 4)].every(b => b >= 48 && b <= 57)) return null;
    const length = Number(header.slice(2));
    if (index + 4 + length > bytes.length) return null;
    tags.set(header.slice(0, 2), bytes.toString('utf8', index + 4, index + 4 + length));
    index += 4 + length;
  }
  return tags;
}

/** Upstream prefers non-strict parser extraction, then its permissive AID fallback. */
export function extractBinFromEmvCo(payload: string): string | null {
  if (!trim(payload)) return null;
  if (payload.length <= 1024) {
    const root = byteTags(payload);
    const account = root?.has('38') ? byteTags(root.get('38')!) : null;
    if (account?.get('00')?.toUpperCase() === 'A000000727') {
      const beneficiary = account.has('01') ? byteTags(account.get('01')!) : null;
      const bank = beneficiary?.get('00');
      if (bank != null && trim(bank)) return trim(bank);
    }
  }
  const aid = payload.search(/A000000727/i);
  if (aid >= 0) {
    const sub = payload.indexOf('0006', aid + 10);
    if (sub >= 0 && sub + 10 <= payload.length) {
      const candidate = payload.slice(sub + 4, sub + 10);
      if (/^\p{Nd}{6}$/u.test(candidate)) return candidate;
    }
  }
  return null;
}
