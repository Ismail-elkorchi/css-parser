export function isWhitespace(value: number | null): boolean {
  return value === 0x09 || value === 0x0a || value === 0x20;
}

export function isDigit(value: number | null): boolean {
  return value !== null && value >= 0x30 && value <= 0x39;
}

export function isHexDigit(value: number | null): boolean {
  return (
    isDigit(value) ||
    (value !== null && value >= 0x41 && value <= 0x46) ||
    (value !== null && value >= 0x61 && value <= 0x66)
  );
}

export function isAsciiLetter(value: number | null): boolean {
  return (
    (value !== null && value >= 0x41 && value <= 0x5a) ||
    (value !== null && value >= 0x61 && value <= 0x7a)
  );
}

export function isNonAsciiIdent(value: number | null): boolean {
  return (
    value === 0x00b7 ||
    (value !== null && value >= 0x00c0 && value <= 0x00d6) ||
    (value !== null && value >= 0x00d8 && value <= 0x00f6) ||
    (value !== null && value >= 0x00f8 && value <= 0x037d) ||
    (value !== null && value >= 0x037f && value <= 0x1fff) ||
    value === 0x200c ||
    value === 0x200d ||
    value === 0x203f ||
    value === 0x2040 ||
    (value !== null && value >= 0x2070 && value <= 0x218f) ||
    (value !== null && value >= 0x2c00 && value <= 0x2fef) ||
    (value !== null && value >= 0x3001 && value <= 0xd7ff) ||
    (value !== null && value >= 0xf900 && value <= 0xfdcf) ||
    (value !== null && value >= 0xfdf0 && value <= 0xfffd) ||
    (value !== null && value >= 0x10000)
  );
}

export function isIdentStart(value: number | null): boolean {
  return value === 0x5f || isAsciiLetter(value) || isNonAsciiIdent(value);
}

export function isIdent(value: number | null): boolean {
  return isIdentStart(value) || isDigit(value) || value === 0x2d;
}

export function isNonPrintable(value: number | null): boolean {
  return (
    value !== null &&
    (
      (value >= 0x00 && value <= 0x08) ||
      value === 0x0b ||
      (value >= 0x0e && value <= 0x1f) ||
      value === 0x7f
    )
  );
}
