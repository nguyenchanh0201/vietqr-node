/** Port of upstream DiacriticsNormalizer.Normalize, including UTF-16 iteration. */
export function removeDiacritics(text: string): string {
  // .NET IsWhiteSpace excludes BOM (unlike JS trim) and includes NEXT LINE.
  if (/^[\u0009-\u000d\u0085\p{Zs}\p{Zl}\p{Zp}]*$/u.test(text)) return '';
  let result = '';
  const normalized = text.normalize('NFD');
  for (let i = 0; i < normalized.length; i++) {
    const char = normalized[i];
    if (/[\p{Cc}\p{Mn}]/u.test(char)) continue;
    result += char === 'đ' ? 'd' : char === 'Đ' ? 'D' : char;
  }
  return result.normalize('NFC');
}
