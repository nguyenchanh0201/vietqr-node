/** CRC-16/CCITT-FALSE over the low byte of each upstream UTF-16 char. */
export function calcCrc(s: string): number {
  let crc = 0xffff;
  for (let i = 0; i < s.length; i++) {
    crc ^= (s.charCodeAt(i) & 0xff) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = ((crc << 1) ^ ((crc & 0x8000) ? 0x1021 : 0)) & 0xffff;
    }
  }
  return crc;
}

export function genCrcCode(s: string): string {
  return calcCrc(s).toString(16).toUpperCase().padStart(4, '0');
}

export function verifyCrc(payload: string): boolean {
  if (payload.length < 8 || payload.slice(-8, -4) !== '6304') return false;
  const hex = payload.slice(-4);
  // NumberStyles.HexNumber permits ASCII whitespace around the hex digits.
  if (!/^[\t-\r ]*[0-9a-fA-F]+[\t-\r ]*$/.test(hex)) return false;
  return Number.parseInt(hex.trim(), 16) === calcCrc(payload.slice(0, -4));
}
