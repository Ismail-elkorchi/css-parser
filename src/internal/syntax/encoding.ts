import type { EncodingDecision, EncodingOptions } from "./types.ts";

const DEFAULT_MAX_CHARSET_BYTES = 1024;
const CHARSET_PREFIX = Uint8Array.from([
  0x40, 0x63, 0x68, 0x61, 0x72, 0x73, 0x65, 0x74, 0x20, 0x22
]);

interface Bom {
  readonly encoding: string;
  readonly bytes: number;
}

function detectBom(bytes: Uint8Array, final: boolean): Bom | null | undefined {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { encoding: "utf-8", bytes: 3 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return { encoding: "utf-16be", bytes: 2 };
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return { encoding: "utf-16le", bytes: 2 };
  }

  if (
    !final &&
    (
      bytes.length === 0 ||
      (bytes.length === 1 && (bytes[0] === 0xef || bytes[0] === 0xfe || bytes[0] === 0xff)) ||
      (bytes.length === 2 && bytes[0] === 0xef && bytes[1] === 0xbb)
    )
  ) {
    return undefined;
  }
  return null;
}

export function canonicalizeEncodingLabel(label: string): string | null {
  const normalized = label.trim().toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  try {
    return new TextDecoder(normalized).encoding.toLowerCase();
  } catch {
    return null;
  }
}

function normalizedCharsetEncoding(label: string): string | null {
  const encoding = canonicalizeEncodingLabel(label);
  if (encoding === "utf-16be" || encoding === "utf-16le") {
    return "utf-8";
  }
  return encoding;
}

type CharsetScan =
  | { readonly kind: "pending" }
  | { readonly kind: "absent" }
  | { readonly kind: "encoding"; readonly encoding: string };

function scanCharset(bytes: Uint8Array, final: boolean, maximum: number): CharsetScan {
  const length = Math.min(bytes.length, maximum);
  for (let index = 0; index < Math.min(length, CHARSET_PREFIX.length); index += 1) {
    if (bytes[index] !== CHARSET_PREFIX[index]) {
      return { kind: "absent" };
    }
  }
  if (length < CHARSET_PREFIX.length) {
    return final || length >= maximum ? { kind: "absent" } : { kind: "pending" };
  }

  let label = "";
  for (let index = CHARSET_PREFIX.length; index < length; index += 1) {
    const byte = bytes[index];
    if (byte === 0x22) {
      if (index + 1 >= length) {
        return final || length >= maximum ? { kind: "absent" } : { kind: "pending" };
      }
      if (bytes[index + 1] !== 0x3b) {
        return { kind: "absent" };
      }
      const encoding = normalizedCharsetEncoding(label);
      return encoding === null ? { kind: "absent" } : { kind: "encoding", encoding };
    }
    if (byte === undefined || byte > 0x7f) {
      return { kind: "absent" };
    }
    label += String.fromCharCode(byte);
  }

  return final || length >= maximum ? { kind: "absent" } : { kind: "pending" };
}

function normalizedMaximum(options: EncodingOptions): number {
  const value = options.maxCharsetBytes ?? DEFAULT_MAX_CHARSET_BYTES;
  if (!Number.isSafeInteger(value) || value < CHARSET_PREFIX.length + 2) {
    throw new RangeError(
      `maxCharsetBytes must be a safe integer of at least ${String(CHARSET_PREFIX.length + 2)}`
    );
  }
  return value;
}

function fallbackDecision(options: EncodingOptions): EncodingDecision {
  const environment = options.environmentEncodingLabel === undefined
    ? null
    : canonicalizeEncodingLabel(options.environmentEncodingLabel);
  if (environment !== null) {
    return { encoding: environment, source: "environment", bomBytes: 0 };
  }

  const fallback = options.defaultEncodingLabel === undefined
    ? "utf-8"
    : canonicalizeEncodingLabel(options.defaultEncodingLabel);
  return {
    encoding: fallback ?? "utf-8",
    source: "default",
    bomBytes: 0
  };
}

function decide(
  bytes: Uint8Array,
  options: EncodingOptions,
  final: boolean
): EncodingDecision | null {
  const bom = detectBom(bytes, final);
  if (bom === undefined) {
    return null;
  }
  if (bom !== null) {
    return { encoding: bom.encoding, source: "bom", bomBytes: bom.bytes };
  }

  if (options.transportEncodingLabel !== undefined) {
    const transport = canonicalizeEncodingLabel(options.transportEncodingLabel);
    if (transport !== null) {
      return { encoding: transport, source: "transport", bomBytes: 0 };
    }
  }

  const maximum = normalizedMaximum(options);
  const charset = scanCharset(bytes, final, maximum);
  if (charset.kind === "pending") {
    return null;
  }
  if (charset.kind === "encoding") {
    return { encoding: charset.encoding, source: "charset", bomBytes: 0 };
  }
  return fallbackDecision(options);
}

export function sniffCssEncoding(
  bytes: Uint8Array,
  options: EncodingOptions = {}
): EncodingDecision {
  return decide(bytes, options, true) ?? fallbackDecision(options);
}

export function decodeCssBytes(
  bytes: Uint8Array,
  options: EncodingOptions = {}
): { readonly text: string; readonly decision: EncodingDecision } {
  const decision = sniffCssEncoding(bytes, options);
  const decoder = new TextDecoder(decision.encoding);
  return Object.freeze({
    text: decoder.decode(bytes),
    decision
  });
}

export class CssEncodingSniffer {
  readonly #options: EncodingOptions;
  readonly #buffer: Uint8Array;
  #length = 0;
  #decision: EncodingDecision | null = null;

  constructor(options: EncodingOptions = {}) {
    const maximum = normalizedMaximum(options);
    this.#options = Object.freeze({ ...options, maxCharsetBytes: maximum });
    this.#buffer = new Uint8Array(maximum);
  }

  get bufferedBytes(): number {
    return this.#length;
  }

  get decision(): EncodingDecision | null {
    return this.#decision;
  }

  write(chunk: Uint8Array): EncodingDecision | null {
    if (this.#decision !== null) {
      return this.#decision;
    }
    const available = this.#buffer.length - this.#length;
    const consumed = Math.min(available, chunk.byteLength);
    this.#buffer.set(chunk.subarray(0, consumed), this.#length);
    this.#length += consumed;
    this.#decision = decide(this.#buffer.subarray(0, this.#length), this.#options, false);
    return this.#decision;
  }

  finish(): EncodingDecision {
    this.#decision ??= decide(
      this.#buffer.subarray(0, this.#length),
      this.#options,
      true
    ) ?? fallbackDecision(this.#options);
    return this.#decision;
  }
}
