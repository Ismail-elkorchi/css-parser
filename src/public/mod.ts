import { decodeCssBytes, sniffCssEncoding } from "../internal/encoding/mod.js";
import { sanitizeCssNode, serializeTreeNode } from "../internal/serializer/mod.js";
import {
  tokenize as tokenizeInternal,
  type CssTokenInternal,
  type TokenizerBudgets
} from "../internal/tokenizer/mod.js";
import { buildTreeFromCss, type CssAstNode, type TreeBuilderError } from "../internal/tree/mod.js";

import type {
  BudgetExceededPayload,
  BudgetOptions,
  CompiledSelector,
  CompiledSelectorCompound,
  CompiledSelectorList,
  Chunk,
  ChunkOptions,
  CssNode,
  Edit,
  FragmentTree,
  NodeId,
  NodeVisitor,
  Outline,
  OutlineEntry,
  ParseContext,
  ParseError,
  ParseOptions,
  PatchPlan,
  PatchPlanningErrorPayload,
  PatchStep,
  Span,
  SpanProvenance,
  SelectorCombinator,
  SelectorNodeLike,
  SelectorQueryOptions,
  SelectorSimple,
  SelectorUnsupportedPart,
  StyleSheetTree,
  Token,
  TokenizeOptions,
  TraceEvent
} from "./types.js";

export type {
  BudgetExceededPayload,
  BudgetOptions,
  CompiledSelector,
  CompiledSelectorCompound,
  CompiledSelectorList,
  Chunk,
  ChunkOptions,
  CssNode,
  Edit,
  FragmentTree,
  NodeId,
  NodeVisitor,
  Outline,
  OutlineEntry,
  ParseContext,
  ParseError,
  ParseOptions,
  PatchInsertStep,
  PatchPlan,
  PatchPlanningErrorPayload,
  PatchSliceStep,
  PatchStep,
  Span,
  SpanProvenance,
  SelectorCombinator,
  SelectorNodeLike,
  SelectorQueryOptions,
  SelectorSimple,
  SelectorUnsupportedPart,
  StartEndToken,
  StyleSheetTree,
  Token,
  TokenizeOptions,
  TraceEvent
} from "./types.js";

const STREAM_ENCODING_PRESCAN_BYTES = 1024;
const CSS_PARSE_ERRORS_SECTION_URL = "https://drafts.csswg.org/css-syntax/#error-handling";

const SUPPORTED_PARSE_CONTEXTS = new Set<ParseContext>([
  "stylesheet",
  "atrule",
  "atrulePrelude",
  "mediaQueryList",
  "mediaQuery",
  "condition",
  "rule",
  "selectorList",
  "selector",
  "block",
  "declarationList",
  "declaration",
  "value"
]);

export class BudgetExceededError extends Error {
  readonly payload: BudgetExceededPayload;

  constructor(payload: BudgetExceededPayload) {
    super(
      `Budget exceeded: ${payload.budget} limit=${String(payload.limit)} actual=${String(payload.actual)}`
    );
    this.name = "BudgetExceededError";
    this.payload = payload;
  }
}

export class PatchPlanningError extends Error {
  readonly payload: PatchPlanningErrorPayload;

  constructor(payload: PatchPlanningErrorPayload) {
    super(
      `Patch planning failed: ${payload.code}${
        payload.target === undefined ? "" : ` target=${String(payload.target)}`
      }`
    );
    this.name = "PatchPlanningError";
    this.payload = payload;
  }
}

class NodeIdAssigner {
  #next: NodeId = 1;

  next(): NodeId {
    const value = this.#next;
    this.#next += 1;
    return value;
  }
}

interface NodeMetrics {
  readonly nodes: number;
  readonly maxDepth: number;
}

interface StreamDecodeResult {
  readonly text: string;
  readonly sniff: { encoding: string; source: "bom" | "transport" | "charset" | "default" };
  readonly totalBytes: number;
  readonly maxBufferedObserved: number;
}

interface ParsedTreeResult {
  readonly root: CssNode;
  readonly children: readonly CssNode[];
  readonly errors: readonly ParseError[];
  readonly trace?: readonly TraceEvent[];
}

interface IndexedNodeSpan {
  readonly span?: Span;
  readonly provenance: SpanProvenance;
}

interface PlannedReplacement {
  readonly sourceIndex: number;
  readonly target: NodeId;
  readonly start: number;
  readonly end: number;
  readonly replacementCss: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isInternalNode(value: unknown): value is CssAstNode {
  return isRecord(value) && typeof value["type"] === "string";
}

function isPublicNode(value: unknown): value is CssNode {
  return isRecord(value) && typeof value["id"] === "number" && typeof value["type"] === "string";
}

function normalizeParseErrorId(message: string): string {
  const normalized = message.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized.length > 0 ? normalized : "css-syntax-error";
}

function normalizeFragmentContext(contextTagName: string): ParseContext {
  const normalized = contextTagName.trim().toLowerCase();

  switch (normalized) {
    case "stylesheet":
      return "stylesheet";
    case "atrule":
    case "at-rule":
      return "atrule";
    case "atruleprelude":
    case "at-rule-prelude":
      return "atrulePrelude";
    case "mediaquerylist":
    case "media-query-list":
      return "mediaQueryList";
    case "mediaquery":
    case "media-query":
      return "mediaQuery";
    case "condition":
      return "condition";
    case "rule":
    case "rulelist":
    case "rule-list":
      return "rule";
    case "selectorlist":
    case "selector-list":
      return "selectorList";
    case "selector":
      return "selector";
    case "block":
      return "block";
    case "declarationlist":
    case "declaration-list":
      return "declarationList";
    case "declaration":
      return "declaration";
    case "value":
      return "value";
    default:
      throw new Error(`Unsupported parse context: ${contextTagName}`);
  }
}

function enforceBudget(
  budget: BudgetExceededPayload["budget"],
  limit: number | undefined,
  actual: number
): void {
  if (limit === undefined || actual <= limit) {
    return;
  }

  throw new BudgetExceededError({
    code: "BUDGET_EXCEEDED",
    budget,
    limit,
    actual
  });
}

function eventSize(event: TraceEvent): number {
  return JSON.stringify(event).length;
}

type TraceEventInput =
  TraceEvent extends infer Event
    ? Event extends { readonly seq: number }
      ? Omit<Event, "seq">
      : never
    : never;

function pushTrace(
  trace: TraceEvent[] | undefined,
  event: TraceEventInput,
  budgets: BudgetOptions | undefined
): TraceEvent[] | undefined {
  if (!trace) {
    return undefined;
  }

  const nextEvent = {
    seq: trace.length + 1,
    ...event
  } as TraceEvent;

  const next = [...trace, nextEvent];
  enforceBudget("maxTraceEvents", budgets?.maxTraceEvents, next.length);

  const bytes = next.reduce((total, item) => total + eventSize(item), 0);
  enforceBudget("maxTraceBytes", budgets?.maxTraceBytes, bytes);

  return next;
}

function pushBudgetTrace(
  trace: TraceEvent[] | undefined,
  budget: BudgetExceededPayload["budget"],
  limit: number | undefined,
  actual: number,
  budgets: BudgetOptions | undefined
): TraceEvent[] | undefined {
  return pushTrace(
    trace,
    {
      kind: "budget",
      budget,
      limit: limit ?? null,
      actual,
      status: limit === undefined || actual <= limit ? "ok" : "exceeded"
    },
    budgets
  );
}

function toPublicSpanFromLoc(loc: unknown, captureSpans: boolean): Span | undefined {
  if (!captureSpans || !isRecord(loc)) {
    return undefined;
  }

  const start = loc["start"];
  const end = loc["end"];
  if (!isRecord(start) || !isRecord(end)) {
    return undefined;
  }

  const startOffset = start["offset"];
  const endOffset = end["offset"];
  if (
    typeof startOffset !== "number" ||
    typeof endOffset !== "number" ||
    startOffset < 0 ||
    endOffset < startOffset
  ) {
    return undefined;
  }

  return {
    start: startOffset,
    end: endOffset
  };
}

function convertNodeValue(value: unknown, assigner: NodeIdAssigner, captureSpans: boolean): unknown {
  if (isInternalNode(value)) {
    return convertNode(value, assigner, captureSpans);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => convertNodeValue(entry, assigner, captureSpans));
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    next[key] = convertNodeValue(entry, assigner, captureSpans);
  }
  return next;
}

function convertNode(rawNode: CssAstNode, assigner: NodeIdAssigner, captureSpans: boolean): CssNode {
  const span = toPublicSpanFromLoc(rawNode["loc"], captureSpans);
  const converted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(rawNode)) {
    if (key === "loc" || key === "type") {
      continue;
    }
    converted[key] = convertNodeValue(value, assigner, captureSpans);
  }

  return {
    id: assigner.next(),
    type: rawNode.type,
    spanProvenance: span ? "input" : "none",
    ...(span ? { span } : {}),
    ...converted
  };
}

function collectChildNodes(value: unknown, into: CssNode[]): void {
  if (isPublicNode(value)) {
    into.push(value);
    return;
  }

  if (Array.isArray(value)) {
    for (const entry of value) {
      collectChildNodes(entry, into);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const entry of Object.values(value)) {
    collectChildNodes(entry, into);
  }
}

function childNodes(node: CssNode): readonly CssNode[] {
  const result: CssNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "id" || key === "type" || key === "span" || key === "spanProvenance") {
      continue;
    }
    collectChildNodes(value, result);
  }
  return result;
}

function collectMetrics(root: CssNode, depth: number): NodeMetrics {
  let nodes = 1;
  let maxDepth = depth;

  for (const child of childNodes(root)) {
    const childMetrics = collectMetrics(child, depth + 1);
    nodes += childMetrics.nodes;
    if (childMetrics.maxDepth > maxDepth) {
      maxDepth = childMetrics.maxDepth;
    }
  }

  return { nodes, maxDepth };
}

function toParseErrors(errors: readonly TreeBuilderError[]): readonly ParseError[] {
  return errors.map((error) => {
    const offset = typeof error.offset === "number" && error.offset >= 0 ? error.offset : null;
    const parseErrorId = normalizeParseErrorId(error.message);

    return {
      code: "PARSER_ERROR",
      parseErrorId,
      message: error.message,
      ...(offset !== null
        ? {
            span: {
              start: offset,
              end: offset + 1
            }
          }
        : {}),
      ...(typeof error.line === "number" ? { line: error.line } : {}),
      ...(typeof error.column === "number" ? { column: error.column } : {})
    };
  });
}

function tokenizerBudgetsFromParseOptions(
  budgets: ParseOptions["budgets"] | undefined
): TokenizerBudgets | undefined {
  if (!budgets) {
    return undefined;
  }

  const next: TokenizerBudgets = {
    ...(budgets.maxTokens !== undefined ? { maxTokens: budgets.maxTokens } : {}),
    ...(budgets.maxTimeMs !== undefined ? { maxTimeMs: budgets.maxTimeMs } : {})
  };

  return Object.keys(next).length > 0 ? next : undefined;
}

function toPublicToken(token: CssTokenInternal): Token {
  return {
    kind: token.kind,
    rawKind: token.rawKind,
    value: token.value,
    start: token.start,
    end: token.end
  };
}

function topLevelChildren(root: CssNode): readonly CssNode[] {
  const maybeChildren = root["children"];
  if (!Array.isArray(maybeChildren)) {
    return [];
  }

  return maybeChildren.filter((entry) => isPublicNode(entry));
}

function isStyleSheetTree(value: unknown): value is StyleSheetTree {
  return (
    isRecord(value) &&
    value["kind"] === "stylesheet" &&
    isPublicNode(value["root"])
  );
}

function isFragmentTree(value: unknown): value is FragmentTree {
  return (
    isRecord(value) &&
    value["kind"] === "fragment" &&
    isPublicNode(value["root"])
  );
}

function parseInternal(css: string, context: ParseContext, options: ParseOptions = {}): ParsedTreeResult {
  const startedAt = Date.now();
  const budgets = options.budgets;
  const captureSpans = options.captureSpans ?? options.includeSpans ?? false;
  let trace: TraceEvent[] | undefined = options.trace ? [] : undefined;

  enforceBudget("maxInputBytes", budgets?.maxInputBytes, css.length);

  trace = pushTrace(
    trace,
    {
      kind: "decode",
      source: "input",
      encoding: "utf-8",
      sniffSource: "input"
    },
    budgets
  );
  trace = pushBudgetTrace(trace, "maxInputBytes", budgets?.maxInputBytes, css.length, budgets);

  const tokenizerBudgets = tokenizerBudgetsFromParseOptions(budgets);
  const tokenized = tokenizerBudgets
    ? tokenizeInternal(css, { budgets: tokenizerBudgets })
    : tokenizeInternal(css);

  enforceBudget("maxTokens", budgets?.maxTokens, tokenized.tokens.length);
  trace = pushTrace(
    trace,
    {
      kind: "token",
      count: tokenized.tokens.length
    },
    budgets
  );

  const parseErrors: TreeBuilderError[] = [];
  const built = buildTreeFromCss(css, {
    context,
    captureSpans,
    onParseError(error) {
      parseErrors.push(error);
    }
  });

  const assigner = new NodeIdAssigner();
  const treeId = assigner.next();
  const root = convertNode(built.root, assigner, captureSpans);
  const children = topLevelChildren(root);
  const metrics = collectMetrics(root, 1);

  enforceBudget("maxNodes", budgets?.maxNodes, metrics.nodes);
  enforceBudget("maxDepth", budgets?.maxDepth, metrics.maxDepth);
  enforceBudget("maxTimeMs", budgets?.maxTimeMs, Date.now() - startedAt);

  trace = pushTrace(
    trace,
    {
      kind: "parse",
      context,
      nodeCount: metrics.nodes,
      errorCount: built.errors.length
    },
    budgets
  );

  const publicErrors = toParseErrors(parseErrors.length > 0 ? parseErrors : built.errors);
  for (const parseError of publicErrors) {
    trace = pushTrace(
      trace,
      {
        kind: "parseError",
        parseErrorId: parseError.parseErrorId,
        startOffset: parseError.span?.start ?? null,
        endOffset: parseError.span?.end ?? null
      },
      budgets
    );
  }

  trace = pushBudgetTrace(trace, "maxTokens", budgets?.maxTokens, tokenized.tokens.length, budgets);
  trace = pushBudgetTrace(trace, "maxNodes", budgets?.maxNodes, metrics.nodes, budgets);
  trace = pushBudgetTrace(trace, "maxDepth", budgets?.maxDepth, metrics.maxDepth, budgets);

  return {
    root: {
      ...root,
      id: treeId
    },
    children,
    errors: publicErrors,
    ...(trace ? { trace } : {})
  };
}

export function parse(css: string, options: ParseOptions = {}): StyleSheetTree {
  if (options.context !== undefined && options.context !== "stylesheet") {
    throw new Error("parse() only supports context \"stylesheet\"; use parseFragment() for other contexts");
  }

  const parsed = parseInternal(css, "stylesheet", options);
  return {
    id: parsed.root.id,
    kind: "stylesheet",
    context: "stylesheet",
    root: parsed.root,
    children: parsed.children,
    errors: parsed.errors,
    ...(parsed.trace ? { trace: parsed.trace } : {})
  };
}

export function parseFragment(css: string, contextTagName: string, options: ParseOptions = {}): FragmentTree {
  const context = normalizeFragmentContext(contextTagName);
  if (!SUPPORTED_PARSE_CONTEXTS.has(context)) {
    throw new Error(`Unsupported parse context: ${contextTagName}`);
  }

  const parsed = parseInternal(css, context, options);
  return {
    id: parsed.root.id,
    kind: "fragment",
    context,
    root: parsed.root,
    children: parsed.children,
    errors: parsed.errors,
    ...(parsed.trace ? { trace: parsed.trace } : {})
  };
}

export function parseRuleList(css: string, options: ParseOptions = {}): FragmentTree {
  return parseFragment(css, "rule", options);
}

export function parseDeclarationList(css: string, options: ParseOptions = {}): FragmentTree {
  return parseFragment(css, "declarationList", options);
}

export function getParseErrorSpecRef(parseErrorId: string): string {
  void parseErrorId;
  return CSS_PARSE_ERRORS_SECTION_URL;
}

function decodeStreamError(error: unknown): Error {
  if (error instanceof Error) {
    return new Error(`STREAM_READ_FAILED: ${error.message}`);
  }
  return new Error(`STREAM_READ_FAILED: ${String(error)}`);
}

async function decodeStreamToText(
  stream: ReadableStream<Uint8Array>,
  options: { readonly transportEncodingLabel?: string; readonly budgets?: ParseOptions["budgets"] }
): Promise<StreamDecodeResult> {
  const startedAt = Date.now();
  const budgets = options.budgets;

  const reader = stream.getReader();
  let total = 0;
  const pendingChunks: Uint8Array[] = [];
  let pendingBytes = 0;
  let maxBufferedObserved = 0;
  let sniff: { encoding: string; source: "bom" | "transport" | "charset" | "default" } | null = null;
  let decoder: TextDecoder | undefined;
  const decodedParts: string[] = [];

  const readPendingBytes = (): Uint8Array => {
    if (pendingBytes === 0) {
      return new Uint8Array(0);
    }

    const combined = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const chunk of pendingChunks) {
      combined.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return combined;
  };

  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) {
        break;
      }

      const chunkValue = next.value;
      total += chunkValue.byteLength;

      enforceBudget("maxInputBytes", budgets?.maxInputBytes, total);
      enforceBudget("maxTimeMs", budgets?.maxTimeMs, Date.now() - startedAt);

      if (!sniff) {
        pendingChunks.push(chunkValue);
        pendingBytes += chunkValue.byteLength;
        maxBufferedObserved = Math.max(maxBufferedObserved, pendingBytes);
        enforceBudget("maxBufferedBytes", budgets?.maxBufferedBytes, pendingBytes);

        const shouldSniffNow =
          options.transportEncodingLabel !== undefined || pendingBytes >= STREAM_ENCODING_PRESCAN_BYTES;
        if (!shouldSniffNow) {
          continue;
        }

        const bufferedBytes = readPendingBytes();
        sniff = sniffCssEncoding(bufferedBytes, {
          ...(options.transportEncodingLabel !== undefined
            ? { transportEncodingLabel: options.transportEncodingLabel }
            : {}),
          maxPrescanBytes: STREAM_ENCODING_PRESCAN_BYTES
        });
        decoder = new TextDecoder(sniff.encoding);
        const decoded = decoder.decode(bufferedBytes, { stream: true });
        if (decoded.length > 0) {
          decodedParts.push(decoded);
        }
        pendingChunks.length = 0;
        pendingBytes = 0;
        continue;
      }

      maxBufferedObserved = Math.max(maxBufferedObserved, chunkValue.byteLength);
      enforceBudget("maxBufferedBytes", budgets?.maxBufferedBytes, chunkValue.byteLength);

      if (!decoder) {
        throw new Error("stream decoder unavailable");
      }

      const decoded = decoder.decode(chunkValue, { stream: true });
      if (decoded.length > 0) {
        decodedParts.push(decoded);
      }
    }
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      throw error;
    }
    throw decodeStreamError(error);
  }

  if (!sniff) {
    const bufferedBytes = readPendingBytes();
    sniff = sniffCssEncoding(bufferedBytes, {
      ...(options.transportEncodingLabel !== undefined
        ? { transportEncodingLabel: options.transportEncodingLabel }
        : {}),
      maxPrescanBytes: STREAM_ENCODING_PRESCAN_BYTES
    });
    decoder = new TextDecoder(sniff.encoding);
    const decoded = decoder.decode(bufferedBytes, { stream: true });
    if (decoded.length > 0) {
      decodedParts.push(decoded);
    }
  }

  if (!decoder) {
    throw new Error("stream decoder initialization failed");
  }

  const decodedTail = decoder.decode();
  if (decodedTail.length > 0) {
    decodedParts.push(decodedTail);
  }

  return {
    text: decodedParts.join(""),
    sniff,
    totalBytes: total,
    maxBufferedObserved
  };
}

export function tokenize(css: string, options: TokenizeOptions = {}): readonly Token[] {
  enforceBudget("maxInputBytes", options.budgets?.maxInputBytes, css.length);
  const tokenized = tokenizeInternal(css, {
    budgets: {
      ...(options.budgets?.maxTokens !== undefined ? { maxTokens: options.budgets.maxTokens } : {}),
      ...(options.budgets?.maxTimeMs !== undefined ? { maxTimeMs: options.budgets.maxTimeMs } : {})
    }
  });
  enforceBudget("maxTokens", options.budgets?.maxTokens, tokenized.tokens.length);
  return tokenized.tokens.map((token) => toPublicToken(token));
}

export async function* tokenizeStream(
  stream: ReadableStream<Uint8Array>,
  options: TokenizeOptions = {}
): AsyncIterable<Token> {
  const decoded = await decodeStreamToText(stream, options);
  const tokens = tokenize(decoded.text, options);
  for (const token of tokens) {
    yield token;
  }
}

export function parseBytes(bytes: Uint8Array, options: ParseOptions = {}): StyleSheetTree {
  enforceBudget("maxInputBytes", options.budgets?.maxInputBytes, bytes.byteLength);

  const decoded = decodeCssBytes(bytes, {
    ...(options.transportEncodingLabel ? { transportEncodingLabel: options.transportEncodingLabel } : {})
  });

  const parsed = parse(decoded.text, options);
  if (!parsed.trace) {
    return parsed;
  }

  const withDecodeTrace = pushTrace(
    [...parsed.trace],
    {
      kind: "decode",
      source: "sniff",
      encoding: decoded.sniff.encoding,
      sniffSource: decoded.sniff.source
    },
    options.budgets
  );

  if (!withDecodeTrace) {
    return parsed;
  }

  return {
    ...parsed,
    trace: withDecodeTrace
  };
}

export async function parseStream(
  stream: ReadableStream<Uint8Array>,
  options: ParseOptions = {}
): Promise<StyleSheetTree> {
  const budgets = options.budgets;
  const decoded = await decodeStreamToText(stream, options);
  const parsed = parse(decoded.text, options);

  if (!parsed.trace) {
    return parsed;
  }

  let trace = [...parsed.trace];
  trace =
    pushTrace(
      trace,
      {
        kind: "decode",
        source: "sniff",
        encoding: decoded.sniff.encoding,
        sniffSource: decoded.sniff.source
      },
      budgets
    ) ?? trace;
  trace =
    pushTrace(
      trace,
      {
        kind: "stream",
        bytesRead: decoded.totalBytes
      },
      budgets
    ) ?? trace;
  trace =
    pushBudgetTrace(
      trace,
      "maxBufferedBytes",
      budgets?.maxBufferedBytes,
      decoded.maxBufferedObserved,
      budgets
    ) ?? trace;

  return {
    ...parsed,
    trace
  };
}

function nodeFromTree(treeOrNode: StyleSheetTree | FragmentTree | CssNode): CssNode {
  if (isStyleSheetTree(treeOrNode)) {
    return treeOrNode.root;
  }

  if (isFragmentTree(treeOrNode)) {
    return treeOrNode.root;
  }

  return treeOrNode;
}

export function serialize(treeOrNode: StyleSheetTree | FragmentTree | CssNode): string {
  const node = nodeFromTree(treeOrNode);
  const sanitized = sanitizeCssNode(node);
  return serializeTreeNode(sanitized);
}

function walkNode(node: CssNode, depth: number, visitor: NodeVisitor): void {
  visitor(node, depth);
  for (const child of childNodes(node)) {
    walkNode(child, depth + 1, visitor);
  }
}

export function walk(tree: StyleSheetTree | FragmentTree, visitor: NodeVisitor): void {
  walkNode(tree.root, 0, visitor);
}

export function walkByType(
  tree: StyleSheetTree | FragmentTree,
  type: string,
  visitor: NodeVisitor
): void {
  const normalizedType = type.toLowerCase();
  walk(tree, (node, depth) => {
    if (node.type.toLowerCase() === normalizedType) {
      visitor(node, depth);
    }
  });
}

export function findById(tree: StyleSheetTree | FragmentTree, id: NodeId): CssNode | null {
  let matched: CssNode | null = null;
  walk(tree, (node) => {
    if (matched === null && node.id === id) {
      matched = node;
    }
  });
  return matched;
}

export function* findAllByType(tree: StyleSheetTree | FragmentTree, type: string): IterableIterator<CssNode> {
  const normalizedType = type.toLowerCase();
  const found: CssNode[] = [];
  walk(tree, (node) => {
    if (node.type.toLowerCase() === normalizedType) {
      found.push(node);
    }
  });

  for (const node of found) {
    yield node;
  }
}

export function outline(tree: StyleSheetTree | FragmentTree): Outline {
  const entries: OutlineEntry[] = [];

  walk(tree, (node, depth) => {
    if (
      node.type === "Rule" ||
      node.type === "Atrule" ||
      node.type === "Declaration" ||
      node.type === "Selector"
    ) {
      entries.push({
        nodeId: node.id,
        depth,
        type: node.type,
        text: serialize(node).slice(0, 200)
      });
    }
  });

  return {
    entries
  };
}

function countNodes(node: CssNode): number {
  let total = 1;
  for (const child of childNodes(node)) {
    total += countNodes(child);
  }
  return total;
}

function topLevelNodes(tree: StyleSheetTree | FragmentTree): readonly CssNode[] {
  return tree.children.length > 0 ? tree.children : [tree.root];
}

export function chunk(tree: StyleSheetTree | FragmentTree, options: ChunkOptions = {}): Chunk[] {
  const maxChars = options.maxChars ?? 8192;
  const maxNodes = options.maxNodes ?? 256;
  const maxBytes = options.maxBytes ?? Number.POSITIVE_INFINITY;
  const encoder = new TextEncoder();

  const chunks: Chunk[] = [];
  let activeContent = "";
  let activeNodes = 0;
  let activeBytes = 0;
  let activeNodeId: NodeId | null = null;
  let index = 0;

  const flush = (): void => {
    if (activeNodeId === null) {
      return;
    }

    chunks.push({
      index,
      nodeId: activeNodeId,
      content: activeContent,
      nodes: activeNodes
    });

    index += 1;
    activeContent = "";
    activeNodes = 0;
    activeBytes = 0;
    activeNodeId = null;
  };

  for (const node of topLevelNodes(tree)) {
    const content = serialize(node);
    const nodes = countNodes(node);
    const bytes = encoder.encode(content).length;

    const nextChars = activeContent.length + content.length;
    const nextNodes = activeNodes + nodes;
    const nextBytes = activeBytes + bytes;

    if (activeNodeId !== null && (nextChars > maxChars || nextNodes > maxNodes || nextBytes > maxBytes)) {
      flush();
    }

    if (activeNodeId === null) {
      activeNodeId = node.id;
    }

    activeContent += content;
    activeNodes += nodes;
    activeBytes += bytes;
  }

  flush();
  return chunks;
}

function indexNodeSpans(node: CssNode, into: Map<NodeId, IndexedNodeSpan>): void {
  into.set(node.id, {
    provenance: node.spanProvenance,
    ...(node.span ? { span: node.span } : {})
  });

  for (const child of childNodes(node)) {
    indexNodeSpans(child, into);
  }
}

function indexNodes(node: CssNode, into: Map<NodeId, CssNode>): void {
  into.set(node.id, node);
  for (const child of childNodes(node)) {
    indexNodes(child, into);
  }
}

function failPatchPlanning(payload: PatchPlanningErrorPayload): never {
  throw new PatchPlanningError(payload);
}

function requireNode(nodeById: Map<NodeId, CssNode>, target: NodeId): CssNode {
  const node = nodeById.get(target);
  if (!node) {
    failPatchPlanning({ code: "NODE_NOT_FOUND", target });
  }
  return node;
}

function requireNodeSpan(spanByNode: Map<NodeId, IndexedNodeSpan>, target: NodeId): Span {
  const indexedSpan = spanByNode.get(target);
  if (!indexedSpan) {
    failPatchPlanning({ code: "MISSING_NODE_SPAN", target });
  }
  if (indexedSpan.provenance !== "input") {
    failPatchPlanning({ code: "NON_INPUT_SPAN_PROVENANCE", target, detail: indexedSpan.provenance });
  }
  if (!indexedSpan.span) {
    failPatchPlanning({ code: "MISSING_NODE_SPAN", target });
  }
  return indexedSpan.span;
}

function buildReplacement(
  spanByNode: Map<NodeId, IndexedNodeSpan>,
  nodeById: Map<NodeId, CssNode>,
  edit: Edit,
  sourceIndex: number
): PlannedReplacement {
  if (edit.kind === "removeNode") {
    const span = requireNodeSpan(spanByNode, edit.target);
    return {
      sourceIndex,
      target: edit.target,
      start: span.start,
      end: span.end,
      replacementCss: ""
    };
  }

  if (edit.kind === "replaceNode") {
    requireNode(nodeById, edit.target);
    const span = requireNodeSpan(spanByNode, edit.target);
    return {
      sourceIndex,
      target: edit.target,
      start: span.start,
      end: span.end,
      replacementCss: edit.css
    };
  }

  if (edit.kind === "insertCssBefore") {
    requireNode(nodeById, edit.target);
    const span = requireNodeSpan(spanByNode, edit.target);
    return {
      sourceIndex,
      target: edit.target,
      start: span.start,
      end: span.start,
      replacementCss: edit.css
    };
  }

  requireNode(nodeById, edit.target);
  const span = requireNodeSpan(spanByNode, edit.target);
  return {
    sourceIndex,
    target: edit.target,
    start: span.end,
    end: span.end,
    replacementCss: edit.css
  };
}

export function applyPatchPlan(originalCss: string, plan: PatchPlan): string {
  let cursor = 0;
  let output = "";

  for (const step of plan.steps) {
    if (step.kind === "slice") {
      if (step.start < cursor || step.end < step.start || step.end > originalCss.length) {
        throw new Error("invalid patch slice bounds");
      }

      output += originalCss.slice(step.start, step.end);
      cursor = step.end;
      continue;
    }

    if (step.at !== cursor || step.at > originalCss.length) {
      throw new Error("invalid patch insertion offset");
    }

    output += step.text;
  }

  return output;
}

export function computePatch(originalCss: string, edits: readonly Edit[]): PatchPlan {
  if (edits.length === 0) {
    const steps: readonly PatchStep[] = [
      {
        kind: "slice",
        start: 0,
        end: originalCss.length
      }
    ];

    return {
      steps,
      result: originalCss
    };
  }

  const parsed = parse(originalCss, { captureSpans: true });
  const spanByNode = new Map<NodeId, IndexedNodeSpan>();
  const nodeById = new Map<NodeId, CssNode>();

  indexNodeSpans(parsed.root, spanByNode);
  indexNodes(parsed.root, nodeById);

  const replacements = edits.map((edit, sourceIndex) =>
    buildReplacement(spanByNode, nodeById, edit, sourceIndex)
  );

  replacements.sort((left, right) => {
    if (left.start !== right.start) {
      return left.start - right.start;
    }
    if (left.end !== right.end) {
      return left.end - right.end;
    }
    return left.sourceIndex - right.sourceIndex;
  });

  let previousEnd = 0;
  for (const replacement of replacements) {
    if (
      replacement.start < 0 ||
      replacement.end < replacement.start ||
      replacement.end > originalCss.length
    ) {
      failPatchPlanning({ code: "OVERLAPPING_EDITS", target: replacement.target, detail: "invalid replacement bounds" });
    }

    if (replacement.start < previousEnd) {
      failPatchPlanning({ code: "OVERLAPPING_EDITS", target: replacement.target });
    }

    previousEnd = Math.max(previousEnd, replacement.end);
  }

  const steps: PatchStep[] = [];
  let cursor = 0;

  for (const replacement of replacements) {
    if (cursor < replacement.start) {
      steps.push({
        kind: "slice",
        start: cursor,
        end: replacement.start
      });
    }

    steps.push({
      kind: "insert",
      at: replacement.start,
      text: replacement.replacementCss
    });
    cursor = replacement.end;
  }

  if (cursor < originalCss.length) {
    steps.push({
      kind: "slice",
      start: cursor,
      end: originalCss.length
    });
  }

  const result = applyPatchPlan(originalCss, {
    steps,
    result: ""
  });

  return {
    steps,
    result
  };
}

interface SelectorTreeIndex<TNode extends SelectorNodeLike> {
  readonly parentByNode: ReadonlyMap<TNode, TNode | null>;
  readonly elements: readonly TNode[];
}

type SelectorAttributeMatcher = null | "=" | "~=" | "|=" | "^=" | "$=" | "*=";

type SelectorRecord = Record<string, unknown>;

function isSelectorRecord(value: unknown): value is SelectorRecord {
  return value !== null && typeof value === "object";
}

function selectorNodeKind(node: SelectorNodeLike): string {
  if (typeof node.kind === "string") {
    return node.kind.toLowerCase();
  }
  if (typeof node.type === "string") {
    return node.type.toLowerCase();
  }
  return "";
}

function isSelectorElementNode(node: SelectorNodeLike): boolean {
  return selectorNodeKind(node) === "element";
}

function selectorChildrenFromNode<TNode extends SelectorNodeLike>(node: TNode): readonly TNode[] {
  if (!Array.isArray(node.children)) {
    return [];
  }

  const children: TNode[] = [];
  for (const child of node.children) {
    if (isSelectorRecord(child)) {
      children.push(child as TNode);
    }
  }
  return children;
}

function selectorTagName(node: SelectorNodeLike): string | null {
  if (!isSelectorElementNode(node) || typeof node.tagName !== "string") {
    return null;
  }
  return node.tagName.toLowerCase();
}

function selectorAttributes(node: SelectorNodeLike): readonly { name: string; value: string }[] {
  if (!isSelectorElementNode(node) || !Array.isArray(node.attributes)) {
    return [];
  }

  const attributes: { name: string; value: string }[] = [];
  for (const attribute of node.attributes) {
    if (!isSelectorRecord(attribute)) {
      continue;
    }
    if (typeof attribute.name !== "string" || typeof attribute.value !== "string") {
      continue;
    }
    attributes.push({
      name: attribute.name.toLowerCase(),
      value: attribute.value
    });
  }

  return attributes;
}

function selectorAttributeValue(node: SelectorNodeLike, name: string): string | null {
  const target = name.toLowerCase();
  for (const attribute of selectorAttributes(node)) {
    if (attribute.name === target) {
      return attribute.value;
    }
  }
  return null;
}

function selectorAttributeMatch(
  actualValue: string | null,
  matcher: SelectorAttributeMatcher,
  expectedValue: string | null,
  flags: string | null
): boolean {
  if (actualValue === null) {
    return false;
  }

  if (matcher === null) {
    return true;
  }

  if (expectedValue === null) {
    return false;
  }

  const caseInsensitive = (flags ?? "").toLowerCase().includes("i");
  const left = caseInsensitive ? actualValue.toLowerCase() : actualValue;
  const right = caseInsensitive ? expectedValue.toLowerCase() : expectedValue;

  switch (matcher) {
    case "=":
      return left === right;
    case "~=":
      return left.split(/\s+/).filter((token) => token.length > 0).includes(right);
    case "|=":
      return left === right || left.startsWith(`${right}-`);
    case "^=":
      return left.startsWith(right);
    case "$=":
      return left.endsWith(right);
    case "*=":
      return left.includes(right);
    default:
      return false;
  }
}

function matchesSelectorSimple(node: SelectorNodeLike, simple: SelectorSimple): boolean {
  if (!isSelectorElementNode(node)) {
    return false;
  }

  if (simple.kind === "type") {
    if (simple.universal) {
      return true;
    }
    return selectorTagName(node) === simple.name.toLowerCase();
  }

  if (simple.kind === "id") {
    return selectorAttributeValue(node, "id") === simple.value;
  }

  if (simple.kind === "class") {
    const classes = selectorAttributeValue(node, "class");
    if (classes === null) {
      return false;
    }
    return classes.split(/\s+/).filter((token) => token.length > 0).includes(simple.value);
  }

  return selectorAttributeMatch(
    selectorAttributeValue(node, simple.name),
    simple.matcher,
    simple.value,
    simple.flags
  );
}

function matchesSelectorCompound(node: SelectorNodeLike, compound: CompiledSelectorCompound): boolean {
  if (compound.simpleSelectors.length === 0) {
    return false;
  }

  for (const simple of compound.simpleSelectors) {
    if (!matchesSelectorSimple(node, simple)) {
      return false;
    }
  }
  return true;
}

function buildSelectorTreeIndex<TNode extends SelectorNodeLike>(
  root: TNode,
  options: SelectorQueryOptions
): SelectorTreeIndex<TNode> {
  const parentByNode = new Map<TNode, TNode | null>();
  const elements: TNode[] = [];
  const stack: Array<{ node: TNode; parent: TNode | null }> = [{ node: root, parent: null }];

  let visited = 0;
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    if (parentByNode.has(current.node)) {
      continue;
    }

    visited += 1;
    if (options.maxVisitedNodes !== undefined && visited > options.maxVisitedNodes) {
      throw new BudgetExceededError({
        code: "BUDGET_EXCEEDED",
        budget: "maxNodes",
        limit: options.maxVisitedNodes,
        actual: visited
      });
    }

    parentByNode.set(current.node, current.parent);
    if (isSelectorElementNode(current.node)) {
      elements.push(current.node);
    }

    const children = selectorChildrenFromNode(current.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (!child) {
        continue;
      }
      stack.push({
        node: child,
        parent: current.node
      });
    }
  }

  return {
    parentByNode,
    elements
  };
}

function matchesCompiledSelector<TNode extends SelectorNodeLike>(
  selector: CompiledSelector,
  node: TNode,
  treeIndex: SelectorTreeIndex<TNode>
): boolean {
  if (!selector.supported || selector.compounds.length === 0) {
    return false;
  }

  const matchAt = (compoundIndex: number, candidate: TNode): boolean => {
    const compound = selector.compounds[compoundIndex];
    if (!compound) {
      return false;
    }
    if (!matchesSelectorCompound(candidate, compound)) {
      return false;
    }

    if (compoundIndex === 0) {
      return true;
    }

    const combinator = selector.combinators[compoundIndex - 1];
    if (combinator === ">") {
      const parent = treeIndex.parentByNode.get(candidate) ?? null;
      if (parent === null || !isSelectorElementNode(parent)) {
        return false;
      }
      return matchAt(compoundIndex - 1, parent);
    }

    let parent = treeIndex.parentByNode.get(candidate) ?? null;
    while (parent !== null) {
      if (isSelectorElementNode(parent) && matchAt(compoundIndex - 1, parent)) {
        return true;
      }
      parent = treeIndex.parentByNode.get(parent) ?? null;
    }

    return false;
  };

  return matchAt(selector.compounds.length - 1, node);
}

function assertSelectorStrict(compiled: CompiledSelectorList, strict: boolean): void {
  if (!strict) {
    return;
  }

  if (compiled.parseErrors.length > 0) {
    throw new Error(`selector parse failed in strict mode: ${compiled.parseErrors[0]?.message ?? "unknown error"}`);
  }

  if (compiled.unsupportedParts.length > 0) {
    const sample = compiled.unsupportedParts[0];
    throw new Error(`selector unsupported in strict mode: ${sample?.partType ?? "unknown"} ${sample?.detail ?? ""}`.trim());
  }
}

function selectorSimpleFromNode(
  selectorNode: SelectorRecord,
  selectorIndex: number,
  unsupported: SelectorUnsupportedPart[]
): SelectorSimple | null {
  const type = typeof selectorNode.type === "string" ? selectorNode.type : "";

  if (type === "TypeSelector") {
    const rawName = typeof selectorNode.name === "string" ? selectorNode.name : "";
    if (rawName.length === 0) {
      unsupported.push({
        selectorIndex,
        partType: type,
        detail: "missing type name"
      });
      return null;
    }

    return {
      kind: "type",
      name: rawName.toLowerCase(),
      universal: rawName === "*"
    };
  }

  if (type === "IdSelector") {
    const value = typeof selectorNode.name === "string" ? selectorNode.name : "";
    if (value.length === 0) {
      unsupported.push({
        selectorIndex,
        partType: type,
        detail: "missing id value"
      });
      return null;
    }
    return {
      kind: "id",
      value
    };
  }

  if (type === "ClassSelector") {
    const value = typeof selectorNode.name === "string" ? selectorNode.name : "";
    if (value.length === 0) {
      unsupported.push({
        selectorIndex,
        partType: type,
        detail: "missing class value"
      });
      return null;
    }
    return {
      kind: "class",
      value
    };
  }

  if (type === "AttributeSelector") {
    const rawNameNode = isSelectorRecord(selectorNode.name) ? selectorNode.name : null;
    const rawName = rawNameNode && typeof rawNameNode.name === "string" ? rawNameNode.name : "";
    if (rawName.length === 0) {
      unsupported.push({
        selectorIndex,
        partType: type,
        detail: "missing attribute name"
      });
      return null;
    }

    const rawMatcher = selectorNode.matcher;
    let matcher: SelectorAttributeMatcher = null;
    if (rawMatcher !== null && rawMatcher !== undefined) {
      if (
        rawMatcher === "=" ||
        rawMatcher === "~=" ||
        rawMatcher === "|=" ||
        rawMatcher === "^=" ||
        rawMatcher === "$=" ||
        rawMatcher === "*="
      ) {
        matcher = rawMatcher;
      } else {
        const rawMatcherDetail = typeof rawMatcher === "string" ? rawMatcher : typeof rawMatcher;
        unsupported.push({
          selectorIndex,
          partType: type,
          detail: `unsupported matcher ${rawMatcherDetail}`
        });
        return null;
      }
    }
    const rawValueNode = isSelectorRecord(selectorNode.value) ? selectorNode.value : null;
    const value = rawValueNode
      ? (typeof rawValueNode.value === "string"
          ? rawValueNode.value
          : (typeof rawValueNode.name === "string" ? rawValueNode.name : null))
      : null;

    const flags = typeof selectorNode.flags === "string" ? selectorNode.flags : null;
    return {
      kind: "attribute",
      name: rawName.toLowerCase(),
      matcher,
      value,
      flags
    };
  }

  unsupported.push({
    selectorIndex,
    partType: type.length > 0 ? type : "unknown",
    detail: "unsupported simple selector"
  });
  return null;
}

function normalizeSelectorCombinator(
  rawName: unknown,
  selectorIndex: number,
  unsupported: SelectorUnsupportedPart[]
): SelectorCombinator {
  const combinatorName = typeof rawName === "string" ? rawName : "";
  const trimmed = combinatorName.trim();
  if (trimmed === ">") {
    return ">";
  }
  if (trimmed.length === 0) {
    return " ";
  }

  unsupported.push({
    selectorIndex,
    partType: "Combinator",
    detail: `unsupported combinator ${trimmed}`
  });
  return " ";
}

function compileSingleSelector(selectorNode: SelectorRecord, selectorIndex: number): CompiledSelector {
  const unsupported: SelectorUnsupportedPart[] = [];
  const compounds: CompiledSelectorCompound[] = [];
  const combinators: SelectorCombinator[] = [];
  let currentSimpleSelectors: SelectorSimple[] = [];

  const children = Array.isArray(selectorNode.children) ? selectorNode.children : [];
  for (const child of children) {
    if (!isSelectorRecord(child)) {
      continue;
    }

    const childType = typeof child.type === "string" ? child.type : "";
    if (childType === "Combinator") {
      if (currentSimpleSelectors.length === 0) {
        unsupported.push({
          selectorIndex,
          partType: "Combinator",
          detail: "combinator without left compound"
        });
        continue;
      }

      compounds.push({
        simpleSelectors: currentSimpleSelectors
      });
      combinators.push(normalizeSelectorCombinator(child.name, selectorIndex, unsupported));
      currentSimpleSelectors = [];
      continue;
    }

    const simple = selectorSimpleFromNode(child, selectorIndex, unsupported);
    if (simple) {
      currentSimpleSelectors.push(simple);
    }
  }

  if (currentSimpleSelectors.length > 0) {
    compounds.push({
      simpleSelectors: currentSimpleSelectors
    });
  } else if (combinators.length > 0) {
    unsupported.push({
      selectorIndex,
      partType: "Combinator",
      detail: "selector ends with combinator"
    });
  }

  if (compounds.length === 0) {
    unsupported.push({
      selectorIndex,
      partType: "Selector",
      detail: "empty selector"
    });
  }

  if (compounds.length > 0 && combinators.length !== compounds.length - 1) {
    unsupported.push({
      selectorIndex,
      partType: "Selector",
      detail: "invalid combinator count"
    });
  }

  return {
    selectorIndex,
    compounds,
    combinators,
    supported: unsupported.length === 0,
    unsupportedParts: unsupported
  };
}

export function compileSelectorList(selectorText: string): CompiledSelectorList {
  const parsed = parseFragment(selectorText, "selectorList");
  const selectorNodes = Array.isArray(parsed.root.children)
    ? parsed.root.children.filter(
        (child): child is CssNode => isSelectorRecord(child) && child.type === "Selector"
      )
    : [];

  const selectors = selectorNodes.map((selectorNode, selectorIndex) =>
    compileSingleSelector(selectorNode as unknown as SelectorRecord, selectorIndex)
  );

  const unsupportedParts = selectors.flatMap((selector) => selector.unsupportedParts);
  const supported = parsed.errors.length === 0 && selectors.length > 0 && unsupportedParts.length === 0;

  return {
    source: selectorText,
    parseErrors: parsed.errors,
    selectors,
    supported,
    unsupportedParts
  };
}

function resolveCompiledSelectorList(selector: string | CompiledSelectorList): CompiledSelectorList {
  if (typeof selector === "string") {
    return compileSelectorList(selector);
  }
  return selector;
}

export function matchesSelector<TNode extends SelectorNodeLike>(
  selector: string | CompiledSelectorList,
  node: TNode,
  root: TNode,
  options: SelectorQueryOptions = {}
): boolean {
  const compiled = resolveCompiledSelectorList(selector);
  assertSelectorStrict(compiled, options.strict === true);

  const treeIndex = buildSelectorTreeIndex(root, options);
  if (!treeIndex.parentByNode.has(node)) {
    return false;
  }

  if (!isSelectorElementNode(node)) {
    return false;
  }

  for (const selectorEntry of compiled.selectors) {
    if (matchesCompiledSelector(selectorEntry, node, treeIndex)) {
      return true;
    }
  }

  return false;
}

export function querySelectorAll<TNode extends SelectorNodeLike>(
  selector: string | CompiledSelectorList,
  root: TNode,
  options: SelectorQueryOptions = {}
): readonly TNode[] {
  const compiled = resolveCompiledSelectorList(selector);
  assertSelectorStrict(compiled, options.strict === true);

  const treeIndex = buildSelectorTreeIndex(root, options);
  const matches: TNode[] = [];

  for (const elementNode of treeIndex.elements) {
    for (const selectorEntry of compiled.selectors) {
      if (matchesCompiledSelector(selectorEntry, elementNode, treeIndex)) {
        matches.push(elementNode);
        break;
      }
    }
  }

  return matches;
}
