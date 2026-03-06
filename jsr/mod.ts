/**
 * Deno/JSR entrypoint for CSS parsing with stylesheet structure, selector utilities, and tokenization helpers.
 *
 * Quickstart:
 * @example
 * ```ts
 * import { parse, serialize } from "./mod.ts";
 * // Published package form:
 * // import { parse, serialize } from "jsr:@ismail-elkorchi/css-parser";
 *
 * const tree = parse(".card { color: red; }");
 * console.log(tree.kind);
 * console.log(serialize(tree));
 * ```
 *
 * Additional docs:
 * - `./docs/index.md`
 * - `./docs/reference/options.md`
 */
import {
  compileSelectorList as compileSelectorListInternal,
  parse as parseInternal,
  parseBytes as parseBytesInternal,
  parseDeclarationList as parseDeclarationListInternal,
  parseFragment as parseFragmentInternal,
  parseRuleList as parseRuleListInternal,
  parseStream as parseStreamInternal,
  querySelectorAll as querySelectorAllInternal,
  serialize as serializeInternal,
  tokenize as tokenizeInternal,
  tokenizeStream as tokenizeStreamInternal
} from "../src/public/mod.ts";

/**
 * Parse budget controls for bounding CSS parse/token workloads.
 */
export interface ParseBudgets {
  /** Maximum input bytes accepted for one parse call. */
  readonly maxInputBytes?: number;
  /** Maximum buffered bytes while decoding streams. */
  readonly maxBufferedBytes?: number;
  /** Maximum token count. */
  readonly maxTokens?: number;
  /** Maximum parse tree node count. */
  readonly maxNodes?: number;
  /** Maximum parse tree depth. */
  readonly maxDepth?: number;
  /** Maximum trace event count. */
  readonly maxTraceEvents?: number;
  /** Maximum serialized trace size in bytes. */
  readonly maxTraceBytes?: number;
  /** Maximum parse/decode time in milliseconds. */
  readonly maxTimeMs?: number;
}

/**
 * Parse options shared by CSS parse entrypoints.
 */
export interface ParseOptions {
  /** Include source spans on parsed nodes. */
  readonly captureSpans?: boolean;
  /** Backward-compatible alias for `captureSpans`. */
  readonly includeSpans?: boolean;
  /** Emit structured trace events. */
  readonly trace?: boolean;
  /** Optional transport encoding hint for byte parsing. */
  readonly transportEncodingLabel?: string;
  /** Optional parse context for fragment-oriented parsing. */
  readonly context?: string;
  /** Optional budget controls. */
  readonly budgets?: ParseBudgets;
}

/**
 * Tokenization options used by `tokenize` and `tokenizeStream`.
 */
export interface TokenizeOptions {
  /** Optional transport encoding hint for stream decode. */
  readonly transportEncodingLabel?: string;
  /** Optional budget controls for tokenization. */
  readonly budgets?: ParseBudgets;
}

/**
 * Tree-like node shape accepted by selector query APIs.
 */
export interface SelectorNodeLike {
  /** Optional normalized node kind. */
  readonly kind?: string;
  /** Optional parser node type discriminator. */
  readonly type?: string;
  /** Optional element tag name. */
  readonly tagName?: string;
  /** Optional attributes collection. */
  readonly attributes?: readonly { readonly name: string; readonly value: string }[];
  /** Optional child node collection. */
  readonly children?: readonly SelectorNodeLike[];
}

/**
 * Selector query controls for strictness and traversal limits.
 */
export interface SelectorQueryOptions {
  /** Reject unsupported selector parts instead of best-effort matching. */
  readonly strict?: boolean;
  /** Maximum nodes visited during selector traversal. */
  readonly maxVisitedNodes?: number;
}

/**
 * Parsed stylesheet tree shape returned by stylesheet parse APIs.
 */
export interface StyleSheetTree {
  /** Discriminator for full-stylesheet parse results. */
  readonly kind: string;
  /** Top-level CSS nodes in source order. */
  readonly children: readonly CssNode[];
  /** Structured parse diagnostics produced for this input. */
  readonly errors: readonly ParseError[];
}

/**
 * Parsed fragment tree shape returned by fragment parse APIs.
 */
export interface FragmentTree {
  /** Discriminator for fragment parse results. */
  readonly kind: string;
  /** Parse context used for the fragment parse operation. */
  readonly context?: string;
  /** Parsed CSS nodes in source order. */
  readonly children: readonly CssNode[];
  /** Structured parse diagnostics produced for this input. */
  readonly errors: readonly ParseError[];
}

/**
 * Structured parse diagnostic emitted by parser/tokenizer entrypoints.
 */
export interface ParseError {
  /** Stable parser error category. */
  readonly code: string;
  /** Deterministic parser-specific error id. */
  readonly parseErrorId: string;
  /** Human-readable error message. */
  readonly message: string;
}

/**
 * Minimal CSS AST node shape used by serialization and selector helpers.
 */
export interface CssNode {
  /** Node category (rule, declaration, at-rule, etc.). */
  readonly kind: string;
  /** Optional nested child nodes. */
  readonly children?: readonly CssNode[];
}

/**
 * Input accepted by `serialize`.
 */
export type CssSerializable = StyleSheetTree | FragmentTree | CssNode;

/**
 * Token emitted by CSS tokenization APIs.
 */
export interface CssToken {
  /** Token category in CSS Syntax token stream. */
  readonly kind: string;
  /** Optional token text or normalized value payload. */
  readonly value?: string;
}

/**
 * Compiled selector program returned by `compileSelectorList`.
 */
export interface CompiledSelectorList {
  /** Original selector list source text. */
  readonly source?: string;
  /** Optional parser diagnostics for unsupported selector syntax. */
  readonly errors?: readonly ParseError[];
}

/**
 * Parses a full stylesheet into a deterministic syntax tree.
 *
 * @param input CSS stylesheet source text.
 * @param options Parse controls for spans, tracing, context, and budgets.
 * @returns Parsed stylesheet tree with deterministic structure.
 * @throws {Error} When parsing fails fatally or configured budgets are exceeded.
 *
 * Security and limits:
 * - Use explicit budgets for untrusted CSS.
 * - Parsing is structural analysis, not execution-time sanitization.
 *
 * @example
 * ```ts
 * import { parse } from "./mod.ts";
 *
 * const tree = parse(".card { color: #0057b8; }", {
 *   budgets: { maxInputBytes: 8_192, maxTokens: 512, maxNodes: 512, maxDepth: 64 }
 * });
 *
 * console.log(tree.kind);
 * ```
 */
export function parse(input: string, options: ParseOptions = {}): StyleSheetTree {
  return parseInternal(input, options as Parameters<typeof parseInternal>[1]);
}

/**
 * Parses encoded CSS bytes using CSS charset sniffing.
 *
 * @param input CSS bytes.
 * @param options Parse controls including transport encoding and budgets.
 * @returns Parsed stylesheet tree.
 * @throws {Error} When decoding/parsing fails or budgets are exceeded.
 */
export function parseBytes(input: Uint8Array, options: ParseOptions = {}): StyleSheetTree {
  return parseBytesInternal(input, options as Parameters<typeof parseBytesInternal>[1]);
}

/**
 * Parses CSS as a fragment under an explicit parse context.
 *
 * @param input CSS fragment text.
 * @param contextTagName Parse context tag (for example `"rule"`, `"selectorList"`, `"declarationList"`).
 * @param options Parse controls and budgets.
 * @returns Parsed fragment tree in requested context.
 * @throws {Error} When context is unsupported or budgets are exceeded.
 */
export function parseFragment(
  input: string,
  contextTagName: string,
  options: ParseOptions = {}
): FragmentTree {
  return parseFragmentInternal(
    input,
    contextTagName,
    options as Parameters<typeof parseFragmentInternal>[2]
  );
}

/**
 * Parses CSS rule-list input.
 *
 * @param input CSS rule list text.
 * @param options Parse controls and budgets.
 * @returns Parsed fragment tree in rule context.
 */
export function parseRuleList(input: string, options: ParseOptions = {}): FragmentTree {
  return parseRuleListInternal(input, options as Parameters<typeof parseRuleListInternal>[1]);
}

/**
 * Parses CSS declaration-list input.
 *
 * @param input CSS declaration list text.
 * @param options Parse controls and budgets.
 * @returns Parsed fragment tree in declaration-list context.
 *
 * @example
 * ```ts
 * import { parseDeclarationList } from "./mod.ts";
 *
 * const fragment = parseDeclarationList("display:flex; gap: 8px;");
 * console.log(fragment.kind);
 * ```
 */
export function parseDeclarationList(input: string, options: ParseOptions = {}): FragmentTree {
  return parseDeclarationListInternal(
    input,
    options as Parameters<typeof parseDeclarationListInternal>[1]
  );
}

/**
 * Parses CSS bytes from a readable stream.
 *
 * @param input CSS byte stream.
 * @param options Parse controls, including stream budgets.
 * @returns Promise resolving to parsed stylesheet tree.
 * @throws {Error} When stream/decode/parse fails or budgets are exceeded.
 *
 * @example
 * ```ts
 * import { parseStream } from "./mod.ts";
 *
 * const stream = new ReadableStream({
 *   start(controller) {
 *     controller.enqueue(new TextEncoder().encode(".a{"));
 *     controller.enqueue(new TextEncoder().encode("display:block}"));
 *     controller.close();
 *   }
 * });
 *
 * const tree = await parseStream(stream, {
 *   budgets: { maxInputBytes: 8_192, maxBufferedBytes: 1_024, maxNodes: 512 }
 * });
 *
 * console.log(tree.kind);
 * ```
 */
export async function parseStream(
  input: ReadableStream<Uint8Array>,
  options: ParseOptions = {}
): Promise<StyleSheetTree> {
  return parseStreamInternal(input, options as Parameters<typeof parseStreamInternal>[1]);
}

/**
 * Serializes a parsed stylesheet, fragment, or node back to normalized CSS text.
 *
 * @param input Parsed stylesheet/fragment/node.
 * @returns Deterministic CSS serialization output.
 */
export function serialize(input: CssSerializable): string {
  return serializeInternal(input as Parameters<typeof serializeInternal>[0]);
}

/**
 * Tokenizes CSS source text.
 *
 * @param input CSS source text.
 * @param options Tokenization controls and budgets.
 * @returns Parser-compatible token sequence.
 * @throws {Error} When tokenization fails or configured budgets are exceeded.
 */
export function tokenize(input: string, options: TokenizeOptions = {}): readonly CssToken[] {
  return tokenizeInternal(input, options as Parameters<typeof tokenizeInternal>[1]);
}

/**
 * Tokenizes CSS bytes from a readable stream.
 *
 * @param input CSS byte stream.
 * @param options Tokenization controls and budgets.
 * @returns Async iterator yielding parser-compatible CSS tokens.
 * @throws {Error} When stream/decode/tokenization fails or budgets are exceeded.
 */
export async function* tokenizeStream(
  input: ReadableStream<Uint8Array>,
  options: TokenizeOptions = {}
): AsyncIterableIterator<CssToken> {
  for await (const token of tokenizeStreamInternal(
    input,
    options as Parameters<typeof tokenizeStreamInternal>[1]
  )) {
    yield token;
  }
}

/**
 * Compiles selector text into a reusable selector program.
 *
 * @param selectorText CSS selector list source text.
 * @returns Compiled selector representation with parse diagnostics.
 * @throws {Error} When selector parsing fails.
 *
 * @example
 * ```ts
 * import { compileSelectorList } from "./mod.ts";
 *
 * const compiled = compileSelectorList(".card[data-kind='promo']");
 * console.log(compiled.selectors.length);
 * console.log(compiled.supported);
 * ```
 */
export function compileSelectorList(selectorText: string): CompiledSelectorList {
  return compileSelectorListInternal(selectorText);
}

/**
 * Queries selector matches from a tree-like node graph.
 *
 * @param selector Selector text or compiled selector list.
 * @param root Root node to search from.
 * @param options Strictness and traversal limit controls.
 * @returns Matching nodes in deterministic traversal order.
 * @throws {Error} When strict mode rejects unsupported selector constructs.
 *
 * @example
 * ```ts
 * import { compileSelectorList, querySelectorAll } from "./mod.ts";
 *
 * const selector = compileSelectorList("#content .card");
 * const root = {
 *   tagName: "main",
 *   attributes: [{ name: "id", value: "content" }],
 *   children: [{
 *     tagName: "div",
 *     attributes: [{ name: "class", value: "card" }],
 *     children: []
 *   }]
 * };
 *
 * const matches = querySelectorAll(selector, root, { strict: true });
 * console.log(matches.length);
 * ```
 */
export function querySelectorAll<TNode extends SelectorNodeLike>(
  selector: string | CompiledSelectorList,
  root: TNode,
  options: SelectorQueryOptions = {}
): readonly TNode[] {
  return querySelectorAllInternal(
    selector as Parameters<typeof querySelectorAllInternal>[0],
    root as Parameters<typeof querySelectorAllInternal>[1],
    options as Parameters<typeof querySelectorAllInternal>[2]
  ) as readonly TNode[];
}
