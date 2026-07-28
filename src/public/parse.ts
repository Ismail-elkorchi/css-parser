import {
  CssEncodingSniffer,
  decodeCssBytes
} from "../internal/syntax/encoding.ts";
import {
  parseCssBlockContents,
  parseCssCommaSeparatedComponentValues,
  parseCssComponentValue,
  parseCssComponentValues,
  parseCssDeclaration,
  parseCssRule,
  parseCssStylesheet,
  parseCssStylesheetContents
} from "../internal/syntax/parser.ts";
import {
  ResourceGuard,
  SyntaxAbortError
} from "../internal/syntax/resources.ts";
import { tokenizeCss } from "../internal/syntax/tokenizer.ts";

import type {
  CommaSeparatedComponentValuesResult,
  ComponentValue,
  ComponentValuesResult,
  CssBlockItem,
  CssDeclaration,
  CssRule,
  CssStylesheet,
  SyntaxResult
} from "../internal/syntax/ast.ts";
import type { SyntaxParserOptions } from "../internal/syntax/parser.ts";
import type { TokenizationResult } from "../internal/syntax/tokens.ts";
import type { TokenizerOptions } from "../internal/syntax/tokenizer.ts";
import type {
  EncodingDecision,
  EncodingOptions,
  ResourceLimits,
  ResourceUsage
} from "../internal/syntax/types.ts";
import type {
  CssByteInputOptions,
  DecodedTokenizationResult,
  DecodedSyntaxResult
} from "./types.ts";

/** Thrown when a byte stream violates the public input contract or fails. */
export class CssStreamError extends Error {
  readonly code = "CSS_STREAM_ERROR";

  constructor(
    readonly reason: "invalid-chunk" | "read-failed",
    cause?: unknown
  ) {
    super(
      reason === "invalid-chunk"
        ? "CSS byte streams must yield Uint8Array chunks"
        : "Unable to read the CSS byte stream",
      cause === undefined ? undefined : { cause }
    );
    this.name = "CssStreamError";
  }
}

interface DecodedStream {
  readonly text: string;
  readonly decision: EncodingDecision;
  readonly inputBytes: number;
  readonly maxBufferedBytes: number;
}

function assertInput(input: unknown): asserts input is string {
  if (typeof input !== "string") {
    throw new TypeError("input must be a string");
  }
}

function assertOptions(options: unknown): asserts options is object {
  if (
    options === null ||
    typeof options !== "object" ||
    Array.isArray(options)
  ) {
    throw new TypeError("options must be an object");
  }
}

/** Parses a complete CSS stylesheet. */
export function parseStylesheet(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssStylesheet> {
  assertInput(input);
  assertOptions(options);
  return parseCssStylesheet(input, options);
}

/** Parses a list of stylesheet rules. */
export function parseStylesheetContents(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<readonly CssRule[]> {
  assertInput(input);
  assertOptions(options);
  return parseCssStylesheetContents(input, options);
}

/** Parses declarations and nested rules from a block's contents. */
export function parseBlockContents(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<readonly CssBlockItem[]> {
  assertInput(input);
  assertOptions(options);
  return parseCssBlockContents(input, options);
}

/** Parses exactly one CSS rule. */
export function parseRule(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssRule> {
  assertInput(input);
  assertOptions(options);
  return parseCssRule(input, options);
}

/** Parses one CSS declaration. */
export function parseDeclaration(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssDeclaration> {
  assertInput(input);
  assertOptions(options);
  return parseCssDeclaration(input, options);
}

/** Parses exactly one CSS component value. */
export function parseComponentValue(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<ComponentValue> {
  assertInput(input);
  assertOptions(options);
  return parseCssComponentValue(input, options);
}

/** Parses a list of CSS component values. */
export function parseComponentValues(
  input: string,
  options: SyntaxParserOptions = {}
): ComponentValuesResult {
  assertInput(input);
  assertOptions(options);
  return parseCssComponentValues(input, options);
}

/** Parses comma-separated lists of CSS component values. */
export function parseCommaSeparatedComponentValues(
  input: string,
  options: SyntaxParserOptions = {}
): CommaSeparatedComponentValuesResult {
  assertInput(input);
  assertOptions(options);
  return parseCssCommaSeparatedComponentValues(input, options);
}

/** Tokenizes a complete CSS string. */
export function tokenize(
  input: string,
  options: TokenizerOptions = {}
): TokenizationResult {
  assertInput(input);
  assertOptions(options);
  return tokenizeCss(input, options);
}

function encodingOptions(options: CssByteInputOptions): EncodingOptions {
  return {
    ...(options.transportEncodingLabel === undefined
      ? {}
      : { transportEncodingLabel: options.transportEncodingLabel }),
    ...(options.environmentEncodingLabel === undefined
      ? {}
      : { environmentEncodingLabel: options.environmentEncodingLabel }),
    ...(options.defaultEncodingLabel === undefined
      ? {}
      : { defaultEncodingLabel: options.defaultEncodingLabel }),
    ...(options.maxCharsetBytes === undefined
      ? {}
      : { maxCharsetBytes: options.maxCharsetBytes })
  };
}

function processingLimits(limits: ResourceLimits | undefined): ResourceLimits {
  if (limits === undefined) return {};
  return {
    ...(limits.maxTokens === undefined ? {} : { maxTokens: limits.maxTokens }),
    ...(limits.maxNodes === undefined ? {} : { maxNodes: limits.maxNodes }),
    ...(limits.maxDepth === undefined ? {} : { maxDepth: limits.maxDepth }),
    ...(limits.maxSteps === undefined ? {} : { maxSteps: limits.maxSteps })
  };
}

function mergeUsage(
  usage: ResourceUsage,
  inputBytes: number,
  maxBufferedBytes: number
): ResourceUsage {
  return Object.freeze({
    ...usage,
    inputBytes,
    maxBufferedBytes: Math.max(usage.maxBufferedBytes, maxBufferedBytes)
  });
}

function withEncoding<T>(
  result: SyntaxResult<T>,
  decision: EncodingDecision,
  inputBytes: number,
  maxBufferedBytes: number
): DecodedSyntaxResult<T> {
  return Object.freeze({
    ...result,
    usage: mergeUsage(result.usage, inputBytes, maxBufferedBytes),
    encoding: decision
  });
}

function combine(chunks: readonly Uint8Array[], length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function decodeStream(
  stream: ReadableStream<Uint8Array>,
  options: CssByteInputOptions
): Promise<DecodedStream> {
  const input: unknown = stream;
  if (
    input === null ||
    typeof input !== "object" ||
    !("getReader" in input) ||
    typeof input.getReader !== "function"
  ) {
    throw new TypeError("stream must be a readable byte stream");
  }

  const guard = new ResourceGuard(
    {
      ...(options.limits?.maxInputBytes === undefined
        ? {}
        : { maxInputBytes: options.limits.maxInputBytes }),
      ...(options.limits?.maxBufferedBytes === undefined
        ? {}
        : { maxBufferedBytes: options.limits.maxBufferedBytes })
    },
    options.signal
  );
  const sniffer = new CssEncodingSniffer(encodingOptions(options));
  const reader = stream.getReader();
  const pending: Uint8Array[] = [];
  const decoded: string[] = [];
  let pendingBytes = 0;
  let totalBytes = 0;
  let decoder: TextDecoder | null = null;
  let decision: EncodingDecision | null = null;

  try {
    for (;;) {
      guard.assertActive();
      let item: ReadableStreamReadResult<Uint8Array>;
      try {
        item = await reader.read();
      } catch (error) {
        throw new CssStreamError("read-failed", error);
      }
      guard.assertActive();
      if (item.done) break;
      if (!(item.value instanceof Uint8Array)) {
        throw new CssStreamError("invalid-chunk");
      }

      totalBytes += item.value.byteLength;
      guard.setInputBytes(totalBytes);
      if (decision === null) {
        pending.push(item.value);
        pendingBytes += item.value.byteLength;
        guard.observeBufferedBytes(pendingBytes);
        decision = sniffer.write(item.value);
        if (decision !== null) {
          decoder = new TextDecoder(decision.encoding);
          const text = decoder.decode(combine(pending, pendingBytes), {
            stream: true
          });
          if (text.length > 0) decoded.push(text);
          pending.length = 0;
          pendingBytes = 0;
        }
      } else {
        const text = decoder?.decode(item.value, { stream: true }) ?? "";
        if (text.length > 0) decoded.push(text);
      }
    }

    if (decision === null) {
      decision = sniffer.finish();
      decoder = new TextDecoder(decision.encoding);
      const text = decoder.decode(combine(pending, pendingBytes), {
        stream: true
      });
      if (text.length > 0) decoded.push(text);
    }
    const tail = decoder?.decode() ?? "";
    if (tail.length > 0) decoded.push(tail);
    const usage = guard.snapshot();
    return Object.freeze({
      text: decoded.join(""),
      decision,
      inputBytes: totalBytes,
      maxBufferedBytes: usage.maxBufferedBytes
    });
  } catch (error) {
    try {
      await reader.cancel(error);
    } catch {
      // Cancellation is best effort after the primary failure.
    }
    if (options.signal?.aborted === true && !(error instanceof SyntaxAbortError)) {
      throw new SyntaxAbortError(options.signal.reason);
    }
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function assertBytes(bytes: Uint8Array): void {
  if (!(bytes instanceof Uint8Array)) {
    throw new TypeError("bytes must be a Uint8Array");
  }
}

/** Decodes and parses a complete CSS stylesheet byte array. */
export function parseStylesheetBytes(
  bytes: Uint8Array,
  options: CssByteInputOptions = {}
): DecodedSyntaxResult<CssStylesheet> {
  assertBytes(bytes);
  assertOptions(options);
  const guard = new ResourceGuard(
    {
      ...(options.limits?.maxInputBytes === undefined
        ? {}
        : { maxInputBytes: options.limits.maxInputBytes })
    },
    options.signal
  );
  guard.setInputBytes(bytes.byteLength);
  const decoded = decodeCssBytes(bytes, encodingOptions(options));
  const result = parseCssStylesheet(decoded.text, {
    limits: processingLimits(options.limits),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return withEncoding(result, decoded.decision, bytes.byteLength, 0);
}

/** Reads, decodes, and parses a complete CSS stylesheet byte stream. */
export async function parseStylesheetStream(
  stream: ReadableStream<Uint8Array>,
  options: CssByteInputOptions = {}
): Promise<DecodedSyntaxResult<CssStylesheet>> {
  assertOptions(options);
  const decoded = await decodeStream(stream, options);
  const result = parseCssStylesheet(decoded.text, {
    limits: processingLimits(options.limits),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return withEncoding(
    result,
    decoded.decision,
    decoded.inputBytes,
    decoded.maxBufferedBytes
  );
}

/** Decodes and tokenizes a complete CSS byte array. */
export function tokenizeBytes(
  bytes: Uint8Array,
  options: CssByteInputOptions = {}
): DecodedTokenizationResult {
  assertBytes(bytes);
  assertOptions(options);
  const guard = new ResourceGuard(
    {
      ...(options.limits?.maxInputBytes === undefined
        ? {}
        : { maxInputBytes: options.limits.maxInputBytes })
    },
    options.signal
  );
  guard.setInputBytes(bytes.byteLength);
  const decoded = decodeCssBytes(bytes, encodingOptions(options));
  const result = tokenizeCss(decoded.text, {
    limits: processingLimits(options.limits),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return Object.freeze({
    ...result,
    usage: mergeUsage(result.usage, bytes.byteLength, 0),
    encoding: decoded.decision
  });
}

/** Reads, decodes, and tokenizes a complete CSS byte stream. */
export async function tokenizeStream(
  stream: ReadableStream<Uint8Array>,
  options: CssByteInputOptions = {}
): Promise<DecodedTokenizationResult> {
  assertOptions(options);
  const decoded = await decodeStream(stream, options);
  const result = tokenizeCss(decoded.text, {
    limits: processingLimits(options.limits),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  return Object.freeze({
    ...result,
    usage: mergeUsage(
      result.usage,
      decoded.inputBytes,
      decoded.maxBufferedBytes
    ),
    encoding: decoded.decision
  });
}
