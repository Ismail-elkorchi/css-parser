export type NodeId = number;

export type ParseContext =
  | "stylesheet"
  | "atrule"
  | "atrulePrelude"
  | "mediaQueryList"
  | "mediaQuery"
  | "condition"
  | "rule"
  | "selectorList"
  | "selector"
  | "block"
  | "declarationList"
  | "declaration"
  | "value";

export interface Span {
  readonly start: number;
  readonly end: number;
}

export type SpanProvenance = "input" | "none";

export interface ParseError {
  readonly code:
    | "BUDGET_EXCEEDED"
    | "STREAM_READ_FAILED"
    | "UNSUPPORTED_ENCODING"
    | "INVALID_PARSE_CONTEXT"
    | "PARSER_ERROR";
  readonly parseErrorId: string;
  readonly message: string;
  readonly span?: Span;
  readonly line?: number;
  readonly column?: number;
}

export interface BudgetOptions {
  readonly maxInputBytes?: number;
  readonly maxBufferedBytes?: number;
  readonly maxTokens?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxTraceEvents?: number;
  readonly maxTraceBytes?: number;
  readonly maxTimeMs?: number;
}

export interface ParseOptions {
  readonly captureSpans?: boolean;
  readonly includeSpans?: boolean;
  readonly trace?: boolean;
  readonly transportEncodingLabel?: string;
  readonly context?: ParseContext;
  readonly budgets?: BudgetOptions;
}

export interface TokenizeOptions {
  readonly transportEncodingLabel?: string;
  readonly budgets?: BudgetOptions;
}

export interface StartEndToken {
  readonly kind: string;
  readonly rawKind: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export type Token = StartEndToken;

export interface TraceDecodeEvent {
  readonly seq: number;
  readonly kind: "decode";
  readonly source: "input" | "sniff";
  readonly encoding: string;
  readonly sniffSource: "input" | "bom" | "transport" | "charset" | "default";
}

export interface TraceTokenEvent {
  readonly seq: number;
  readonly kind: "token";
  readonly count: number;
}

export interface TraceParseEvent {
  readonly seq: number;
  readonly kind: "parse";
  readonly context: ParseContext;
  readonly nodeCount: number;
  readonly errorCount: number;
}

export interface TraceParseErrorEvent {
  readonly seq: number;
  readonly kind: "parseError";
  readonly parseErrorId: string;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
}

export interface TraceBudgetEvent {
  readonly seq: number;
  readonly kind: "budget";
  readonly budget: BudgetExceededPayload["budget"];
  readonly limit: number | null;
  readonly actual: number;
  readonly status: "ok" | "exceeded";
}

export interface TraceStreamEvent {
  readonly seq: number;
  readonly kind: "stream";
  readonly bytesRead: number;
}

export type TraceEvent =
  | TraceDecodeEvent
  | TraceTokenEvent
  | TraceParseEvent
  | TraceParseErrorEvent
  | TraceBudgetEvent
  | TraceStreamEvent;

export interface CssNode {
  readonly id: NodeId;
  readonly type: string;
  readonly spanProvenance: SpanProvenance;
  readonly span?: Span;
  readonly [key: string]: unknown;
}

export type NodeVisitor = (node: CssNode, depth: number) => void;

export interface StyleSheetTree {
  readonly id: NodeId;
  readonly kind: "stylesheet";
  readonly context: "stylesheet";
  readonly root: CssNode;
  readonly children: readonly CssNode[];
  readonly errors: readonly ParseError[];
  readonly trace?: readonly TraceEvent[];
}

export interface FragmentTree {
  readonly id: NodeId;
  readonly kind: "fragment";
  readonly context: ParseContext;
  readonly root: CssNode;
  readonly children: readonly CssNode[];
  readonly errors: readonly ParseError[];
  readonly trace?: readonly TraceEvent[];
}

export interface OutlineEntry {
  readonly nodeId: NodeId;
  readonly depth: number;
  readonly type: string;
  readonly text: string;
}

export interface Outline {
  readonly entries: readonly OutlineEntry[];
}

export interface Chunk {
  readonly index: number;
  readonly nodeId: NodeId;
  readonly content: string;
  readonly nodes: number;
}

export interface ChunkOptions {
  readonly maxChars?: number;
  readonly maxNodes?: number;
  readonly maxBytes?: number;
}

export interface BudgetExceededPayload {
  readonly code: "BUDGET_EXCEEDED";
  readonly budget:
    | "maxInputBytes"
    | "maxBufferedBytes"
    | "maxTokens"
    | "maxNodes"
    | "maxDepth"
    | "maxTraceEvents"
    | "maxTraceBytes"
    | "maxTimeMs";
  readonly limit: number;
  readonly actual: number;
}

export interface RemoveNodeEdit {
  readonly kind: "removeNode";
  readonly target: NodeId;
}

export interface ReplaceNodeEdit {
  readonly kind: "replaceNode";
  readonly target: NodeId;
  readonly css: string;
}

export interface InsertCssBeforeEdit {
  readonly kind: "insertCssBefore";
  readonly target: NodeId;
  readonly css: string;
}

export interface InsertCssAfterEdit {
  readonly kind: "insertCssAfter";
  readonly target: NodeId;
  readonly css: string;
}

export type Edit = RemoveNodeEdit | ReplaceNodeEdit | InsertCssBeforeEdit | InsertCssAfterEdit;

export interface PatchSliceStep {
  readonly kind: "slice";
  readonly start: number;
  readonly end: number;
}

export interface PatchInsertStep {
  readonly kind: "insert";
  readonly at: number;
  readonly text: string;
}

export type PatchStep = PatchSliceStep | PatchInsertStep;

export interface PatchPlan {
  readonly steps: readonly PatchStep[];
  readonly result: string;
}

export interface PatchPlanningErrorPayload {
  readonly code:
    | "NODE_NOT_FOUND"
    | "MISSING_NODE_SPAN"
    | "NON_INPUT_SPAN_PROVENANCE"
    | "OVERLAPPING_EDITS"
    | "INVALID_EDIT_TARGET";
  readonly target?: NodeId;
  readonly detail?: string;
}

export interface SelectorAttributeLike {
  readonly name: string;
  readonly value: string;
}

export interface SelectorNodeLike {
  readonly kind?: string;
  readonly type?: string;
  readonly tagName?: string;
  readonly attributes?: readonly SelectorAttributeLike[];
  readonly children?: readonly SelectorNodeLike[];
  readonly [key: string]: unknown;
}

export type SelectorCombinator = " " | ">";

export interface SelectorSimpleType {
  readonly kind: "type";
  readonly name: string;
  readonly universal: boolean;
}

export interface SelectorSimpleId {
  readonly kind: "id";
  readonly value: string;
}

export interface SelectorSimpleClass {
  readonly kind: "class";
  readonly value: string;
}

export interface SelectorSimpleAttribute {
  readonly kind: "attribute";
  readonly name: string;
  readonly matcher: null | "=" | "~=" | "|=" | "^=" | "$=" | "*=";
  readonly value: string | null;
  readonly flags: string | null;
}

export type SelectorSimple =
  | SelectorSimpleType
  | SelectorSimpleId
  | SelectorSimpleClass
  | SelectorSimpleAttribute;

export interface CompiledSelectorCompound {
  readonly simpleSelectors: readonly SelectorSimple[];
}

export interface SelectorUnsupportedPart {
  readonly selectorIndex: number;
  readonly partType: string;
  readonly detail: string;
}

export interface CompiledSelector {
  readonly selectorIndex: number;
  readonly compounds: readonly CompiledSelectorCompound[];
  readonly combinators: readonly SelectorCombinator[];
  readonly supported: boolean;
  readonly unsupportedParts: readonly SelectorUnsupportedPart[];
}

export interface CompiledSelectorList {
  readonly source: string;
  readonly parseErrors: readonly ParseError[];
  readonly selectors: readonly CompiledSelector[];
  readonly supported: boolean;
  readonly unsupportedParts: readonly SelectorUnsupportedPart[];
}

export interface SelectorQueryOptions {
  readonly strict?: boolean;
  readonly maxVisitedNodes?: number;
}
