import { readAsset } from '../assets';
import type { BankInfo } from './types';

type RawBank = Omit<BankInfo, 'swiftCode'> & { swift_code: string | null };

const catalog: BankInfo[] = [];
let loaded = false;

function loadCatalog(): BankInfo[] {
  if (!loaded) {
    const { data } = JSON.parse(readAsset('banks.json').toString('utf8')) as { data: RawBank[] };
    catalog.push(...data.map((bank): BankInfo => ({
      id: bank.id,
      name: bank.name,
      code: bank.code,
      bin: bank.bin,
      shortName: bank.shortName,
      logo: bank.logo,
      transferSupported: bank.transferSupported,
      lookupSupported: bank.lookupSupported,
      swiftCode: bank.swift_code,
    })));
    loaded = true;
  }
  return catalog;
}

// Keep the array API while deferring asset I/O until the catalog is first read.
export const banks: readonly BankInfo[] = new Proxy(catalog, {
  get: (_target, key, receiver) => Reflect.get(loadCatalog(), key, receiver),
  has: (_target, key) => Reflect.has(loadCatalog(), key),
  ownKeys: () => Reflect.ownKeys(loadCatalog()),
  getOwnPropertyDescriptor: (_target, key) => Reflect.getOwnPropertyDescriptor(loadCatalog(), key),
});

export function findBank(key: string): BankInfo | undefined {
  const normalized = key.trim().toLowerCase();
  if (!normalized) return undefined;
  const all = loadCatalog();
  return all.find((bank) => bank.bin === normalized)
    ?? all.find((bank) => bank.code.toLowerCase() === normalized || bank.shortName.toLowerCase() === normalized);
}

export function getBankLogo(bin: string): Buffer | undefined {
  // JavaScript's $ also accepts a final newline: reject surrounding whitespace explicitly.
  if (!/^\d{6,8}$/.test(bin) || bin.trim() !== bin) return undefined;
  try {
    return readAsset(`logos/${bin}.png`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}
