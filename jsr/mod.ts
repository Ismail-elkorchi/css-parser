import {
  compileSelectorList as compileSelectorListInternal,
  parse as parseInternal,
  parseBytes as parseBytesInternal,
  parseFragment as parseFragmentInternal,
  parseStream as parseStreamInternal,
  querySelectorAll as querySelectorAllInternal,
  serialize as serializeInternal,
  tokenize as tokenizeInternal,
  tokenizeStream as tokenizeStreamInternal
} from "../src/public/mod.ts";

/**
 * Parse a full stylesheet into a deterministic syntax tree.
 */
export function parse(input: string, options?: Record<string, unknown>): unknown {
  return parseInternal(input, options as Parameters<typeof parseInternal>[1]);
}

/**
 * Parse stylesheet bytes after encoding sniffing.
 */
export function parseBytes(input: Uint8Array, options?: Record<string, unknown>): unknown {
  return parseBytesInternal(input, options as Parameters<typeof parseBytesInternal>[1]);
}

/**
 * Parse a CSS fragment relative to a context tag.
 */
export function parseFragment(
  input: string,
  contextTagName: string,
  options?: Record<string, unknown>
): unknown {
  return parseFragmentInternal(
    input,
    contextTagName,
    options as Parameters<typeof parseFragmentInternal>[2]
  );
}

/**
 * Parse stylesheet bytes from a stream.
 */
export async function parseStream(
  input: ReadableStream<Uint8Array>,
  options?: Record<string, unknown>
): Promise<unknown> {
  return parseStreamInternal(input, options as Parameters<typeof parseStreamInternal>[1]);
}

/**
 * Serialize a parsed stylesheet tree back to CSS text.
 */
export function serialize(input: unknown): string {
  return serializeInternal(input as Parameters<typeof serializeInternal>[0]);
}

/**
 * Tokenize CSS source text.
 */
export function tokenize(input: string, options?: Record<string, unknown>): readonly unknown[] {
  return tokenizeInternal(input, options as Parameters<typeof tokenizeInternal>[1]);
}

/**
 * Tokenize CSS bytes from a stream.
 */
export async function* tokenizeStream(
  input: ReadableStream<Uint8Array>,
  options?: Record<string, unknown>
): AsyncIterableIterator<unknown> {
  for await (const token of tokenizeStreamInternal(
    input,
    options as Parameters<typeof tokenizeStreamInternal>[1]
  )) {
    yield token;
  }
}

/**
 * Compile a selector list string into a query program.
 */
export function compileSelectorList(selectorText: string): unknown {
  return compileSelectorListInternal(selectorText);
}

/**
 * Query a tree-like node structure with a compiled selector list.
 */
export function querySelectorAll(selector: unknown, root: unknown): readonly unknown[] {
  return querySelectorAllInternal(
    selector as Parameters<typeof querySelectorAllInternal>[0],
    root as Parameters<typeof querySelectorAllInternal>[1]
  ) as readonly unknown[];
}
