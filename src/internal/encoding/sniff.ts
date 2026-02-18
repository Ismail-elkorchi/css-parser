export interface EncodingSniffOptions {
  readonly transportEncodingLabel?: string;
  readonly maxPrescanBytes?: number;
  readonly defaultEncoding?: string;
}

export interface EncodingSniffResult {
  readonly encoding: string;
  readonly source: "bom" | "transport" | "charset" | "default";
}

const WINDOWS_1252_ALIASES = new Set([
  "iso-8859-1",
  "iso8859-1",
  "latin1",
  "latin-1",
  "us-ascii"
]);

function detectBom(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }

  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }

  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }

  return null;
}

function stripQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith("\"") && trimmed.endsWith("\"")) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function canonicalizeLabel(label: string): string | null {
  const normalized = stripQuotes(label).toLowerCase();
  if (normalized.length === 0) {
    return null;
  }

  if (WINDOWS_1252_ALIASES.has(normalized)) {
    return "windows-1252";
  }

  try {
    const resolved = new TextDecoder(normalized).encoding.toLowerCase();
    if (resolved === "iso-8859-1") {
      return "windows-1252";
    }
    return resolved;
  } catch {
    return null;
  }
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 1) {
    const value = bytes[index];
    if (value !== undefined) {
      out += String.fromCharCode(value);
    }
  }
  return out;
}

function sniffCharsetRule(bytes: Uint8Array, maxPrescanBytes: number): string | null {
  const scanSize = Math.min(bytes.length, maxPrescanBytes);
  let scan = decodeLatin1(bytes.subarray(0, scanSize));
  if (scan.charCodeAt(0) === 0xfeff) {
    scan = scan.slice(1);
  }

  const match = scan.match(/^\s*@charset\s+("([^"]+)"|'([^']+)')\s*;/i);
  if (!match) {
    return null;
  }

  const label = match[2] ?? match[3] ?? "";
  return canonicalizeLabel(label);
}

export function sniffCssEncoding(bytes: Uint8Array, options: EncodingSniffOptions = {}): EncodingSniffResult {
  const defaultEncoding = canonicalizeLabel(options.defaultEncoding ?? "utf-8") ?? "utf-8";

  const bom = detectBom(bytes);
  if (bom) {
    return { encoding: bom, source: "bom" };
  }

  if (options.transportEncodingLabel) {
    const transport = canonicalizeLabel(options.transportEncodingLabel);
    if (transport) {
      return { encoding: transport, source: "transport" };
    }
  }

  const charset = sniffCharsetRule(bytes, options.maxPrescanBytes ?? 1024);
  if (charset) {
    return { encoding: charset, source: "charset" };
  }

  return { encoding: defaultEncoding, source: "default" };
}

export function decodeCssBytes(
  bytes: Uint8Array,
  options: EncodingSniffOptions = {}
): { text: string; sniff: EncodingSniffResult } {
  const sniff = sniffCssEncoding(bytes, options);
  const decoder = new TextDecoder(sniff.encoding);
  return {
    text: decoder.decode(bytes),
    sniff
  };
}
