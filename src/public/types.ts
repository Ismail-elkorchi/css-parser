/** Stable identifier assigned to a node within one parsed tree. */
export type NodeId = number;

/** Grammar production used to interpret a CSS input fragment. */
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

/** Half-open UTF-16 source range. */
export interface Span {
  /** Inclusive offset in the decoded CSS input. */
  readonly start: number;
  /** Exclusive offset in the decoded CSS input. */
  readonly end: number;
}

/** Whether a node's span maps directly to the input. */
export type SpanProvenance = "input" | "none";

/** Structured diagnostic reported while decoding or parsing CSS. */
export interface ParseError {
  /** Stable category for programmatic error handling. */
  readonly code:
    | "BUDGET_EXCEEDED"
    | "STREAM_READ_FAILED"
    | "UNSUPPORTED_ENCODING"
    | "INVALID_PARSE_CONTEXT"
    | "PARSER_ERROR";
  /** Parser-specific diagnostic identifier. */
  readonly parseErrorId: string;
  /** Human-readable diagnostic. */
  readonly message: string;
  /** Input range associated with the diagnostic, when available. */
  readonly span?: Span;
  /** One-based input line, when available. */
  readonly line?: number;
  /** One-based input column, when available. */
  readonly column?: number;
}

/** Optional hard limits for parser work and retained data. */
export interface BudgetOptions {
  /** Maximum decoded input size. */
  readonly maxInputBytes?: number;
  /** Maximum bytes buffered while consuming a stream. */
  readonly maxBufferedBytes?: number;
  /** Maximum emitted token count. */
  readonly maxTokens?: number;
  /** Maximum parsed node count. */
  readonly maxNodes?: number;
  /** Maximum tree depth. */
  readonly maxDepth?: number;
  /** Maximum retained trace event count. */
  readonly maxTraceEvents?: number;
  /** Maximum serialized size of retained trace events. */
  readonly maxTraceBytes?: number;
  /** Maximum elapsed parser time in milliseconds. */
  readonly maxTimeMs?: number;
}

/** Controls parsing, source locations, tracing, decoding, and resource limits. */
export interface ParseOptions {
  /** Records input ranges on nodes when true. */
  readonly captureSpans?: boolean;
  /** Records deterministic parser trace events when true. */
  readonly trace?: boolean;
  /** Encoding label supplied by the transport layer. */
  readonly transportEncodingLabel?: string;
  /** Resource limits enforced during parsing. */
  readonly budgets?: BudgetOptions;
}

/** Controls tokenization, decoding, and resource limits. */
export interface TokenizeOptions {
  /** Encoding label supplied by the transport layer. */
  readonly transportEncodingLabel?: string;
  /** Resource limits enforced during tokenization. */
  readonly budgets?: BudgetOptions;
}

/** Public CSS token with its decoded source range. */
export interface StartEndToken {
  /** Normalized token category. */
  readonly kind: string;
  /** Token category reported by the underlying CSS tokenizer. */
  readonly rawKind: string;
  /** Token text or normalized value. */
  readonly value: string;
  /** Inclusive UTF-16 input offset. */
  readonly start: number;
  /** Exclusive UTF-16 input offset. */
  readonly end: number;
}

/** Token emitted by {@link tokenize} and {@link tokenizeStream}. */
export type Token = StartEndToken;

/** Trace event describing a decoding decision. */
export interface TraceDecodeEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "decode";
  /** Stage that reported the decoding decision. */
  readonly source: "input" | "sniff";
  /** Canonical encoding name. */
  readonly encoding: string;
  /** Evidence used to select the encoding. */
  readonly sniffSource: "input" | "bom" | "transport" | "charset" | "default";
}

/** Trace event describing the emitted token count. */
export interface TraceTokenEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "token";
  /** Number of emitted tokens. */
  readonly count: number;
}

/** Trace event describing a completed parse. */
export interface TraceParseEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "parse";
  /** Grammar production used for the parse. */
  readonly context: ParseContext;
  /** Number of nodes produced. */
  readonly nodeCount: number;
  /** Number of parse diagnostics produced. */
  readonly errorCount: number;
}

/** Trace event describing one parse diagnostic. */
export interface TraceParseErrorEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "parseError";
  /** Parser-specific diagnostic identifier. */
  readonly parseErrorId: string;
  /** Inclusive input offset, or `null` when unavailable. */
  readonly startOffset: number | null;
  /** Exclusive input offset, or `null` when unavailable. */
  readonly endOffset: number | null;
}

/** Trace event describing observed resource use. */
export interface TraceBudgetEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "budget";
  /** Resource limit being reported. */
  readonly budget: BudgetExceededPayload["budget"];
  /** Configured limit, or `null` when no limit was set. */
  readonly limit: number | null;
  /** Observed value. */
  readonly actual: number;
  /** Whether the observed value exceeded the configured limit. */
  readonly status: "ok" | "exceeded";
}

/** Trace event describing stream consumption. */
export interface TraceStreamEvent {
  /** One-based event sequence number. */
  readonly seq: number;
  /** Event discriminator. */
  readonly kind: "stream";
  /** Total bytes consumed from the stream. */
  readonly bytesRead: number;
}

/** Deterministic diagnostic event emitted when tracing is enabled. */
export type TraceEvent =
  | TraceDecodeEvent
  | TraceTokenEvent
  | TraceParseEvent
  | TraceParseErrorEvent
  | TraceBudgetEvent
  | TraceStreamEvent;

/** Read-only public view of a parsed CSS node. */
export interface CssNode {
  /** Identifier unique within the parsed tree. */
  readonly id: NodeId;
  /** CSS node category. */
  readonly type: string;
  /** Relationship between the node span and original input. */
  readonly spanProvenance?: SpanProvenance;
  /** Half-open input range when source capture is enabled. */
  readonly span?: Span;
  /** Node-specific fields from the CSS syntax tree. */
  readonly [key: string]: unknown;
}

/** Callback invoked for each visited node and its zero-based depth. */
export type NodeVisitor = (node: CssNode, depth: number) => void;

/** Result of parsing a complete stylesheet. */
export interface StyleSheetTree {
  /** Identifier of the root node. */
  readonly id: NodeId;
  /** Result discriminator. */
  readonly kind: "stylesheet";
  /** Grammar production used for the parse. */
  readonly context: "stylesheet";
  /** Root syntax-tree node. */
  readonly root: CssNode;
  /** Top-level stylesheet nodes. */
  readonly children: readonly CssNode[];
  /** Diagnostics reported by the parser. */
  readonly errors: readonly ParseError[];
  /** Trace events, when tracing was enabled. */
  readonly trace?: readonly TraceEvent[];
}

/** Result of parsing a CSS grammar fragment. */
export interface FragmentTree {
  /** Identifier of the root node. */
  readonly id: NodeId;
  /** Result discriminator. */
  readonly kind: "fragment";
  /** Grammar production used for the parse. */
  readonly context: ParseContext;
  /** Root syntax-tree node. */
  readonly root: CssNode;
  /** Top-level fragment nodes. */
  readonly children: readonly CssNode[];
  /** Diagnostics reported by the parser. */
  readonly errors: readonly ParseError[];
  /** Trace events, when tracing was enabled. */
  readonly trace?: readonly TraceEvent[];
}

/** Compact description of a structurally significant CSS node. */
export interface OutlineEntry {
  /** Identifier of the described node. */
  readonly nodeId: NodeId;
  /** Zero-based depth in the tree. */
  readonly depth: number;
  /** CSS node category. */
  readonly type: string;
  /** Bounded serialized preview of the node. */
  readonly text: string;
}

/** Ordered structural summary of a parsed tree. */
export interface Outline {
  /** Significant nodes in traversal order. */
  readonly entries: readonly OutlineEntry[];
}

/** Bounded serialized group of top-level CSS nodes. */
export interface Chunk {
  /** Zero-based chunk index. */
  readonly index: number;
  /** Identifier of the first node in the chunk. */
  readonly nodeId: NodeId;
  /** Serialized CSS content. */
  readonly content: string;
  /** Number of nodes represented by the chunk. */
  readonly nodes: number;
}

/** Limits used when grouping a parsed tree into chunks. */
export interface ChunkOptions {
  /** Maximum UTF-16 code units per chunk. */
  readonly maxChars?: number;
  /** Maximum top-level nodes per chunk. */
  readonly maxNodes?: number;
  /** Maximum UTF-8 bytes per chunk. */
  readonly maxBytes?: number;
}

/** Structured details attached to {@link BudgetExceededError}. */
export interface BudgetExceededPayload {
  /** Error discriminator. */
  readonly code: "BUDGET_EXCEEDED";
  /** Resource limit that was exceeded. */
  readonly budget:
    | "maxInputBytes"
    | "maxBufferedBytes"
    | "maxTokens"
    | "maxNodes"
    | "maxDepth"
    | "maxTraceEvents"
    | "maxTraceBytes"
    | "maxTimeMs";
  /** Configured maximum value. */
  readonly limit: number;
  /** Observed value. */
  readonly actual: number;
}

/** Edit that removes a node's source range. */
export interface RemoveNodeEdit {
  /** Edit discriminator. */
  readonly kind: "removeNode";
  /** Identifier of the node to remove. */
  readonly target: NodeId;
}

/** Edit that replaces a node's source range with CSS. */
export interface ReplaceNodeEdit {
  /** Edit discriminator. */
  readonly kind: "replaceNode";
  /** Identifier of the node to replace. */
  readonly target: NodeId;
  /** Replacement CSS. */
  readonly css: string;
}

/** Edit that inserts CSS immediately before a node. */
export interface InsertCssBeforeEdit {
  /** Edit discriminator. */
  readonly kind: "insertCssBefore";
  /** Identifier of the insertion anchor. */
  readonly target: NodeId;
  /** CSS to insert. */
  readonly css: string;
}

/** Edit that inserts CSS immediately after a node. */
export interface InsertCssAfterEdit {
  /** Edit discriminator. */
  readonly kind: "insertCssAfter";
  /** Identifier of the insertion anchor. */
  readonly target: NodeId;
  /** CSS to insert. */
  readonly css: string;
}

/** Source-preserving edit accepted by {@link computePatch}. */
export type Edit = RemoveNodeEdit | ReplaceNodeEdit | InsertCssBeforeEdit | InsertCssAfterEdit;

/** Patch step that copies a source range. */
export interface PatchSliceStep {
  /** Step discriminator. */
  readonly kind: "slice";
  /** Inclusive source offset. */
  readonly start: number;
  /** Exclusive source offset. */
  readonly end: number;
}

/** Patch step that inserts text at the current source offset. */
export interface PatchInsertStep {
  /** Step discriminator. */
  readonly kind: "insert";
  /** Source offset at which text is inserted. */
  readonly at: number;
  /** Text to insert. */
  readonly text: string;
}

/** Operation in a deterministic source patch plan. */
export type PatchStep = PatchSliceStep | PatchInsertStep;

/** Validated operations and resulting CSS for a set of edits. */
export interface PatchPlan {
  /** Ordered operations that transform the original CSS. */
  readonly steps: readonly PatchStep[];
  /** CSS produced by applying the operations. */
  readonly result: string;
}

/** Structured details attached to {@link PatchPlanningError}. */
export interface PatchPlanningErrorPayload {
  /** Stable patch-planning failure category. */
  readonly code:
    | "NODE_NOT_FOUND"
    | "MISSING_NODE_SPAN"
    | "NON_INPUT_SPAN_PROVENANCE"
    | "OVERLAPPING_EDITS"
    | "INVALID_EDIT_TARGET";
  /** Affected node identifier, when known. */
  readonly target?: NodeId;
  /** Additional diagnostic context. */
  readonly detail?: string;
}

/** Attribute exposed by a node supplied to selector helpers. */
export interface SelectorAttributeLike {
  /** Attribute name. */
  readonly name: string;
  /** Attribute value. */
  readonly value: string;
}

/** Minimal structural contract accepted by selector helpers. */
export interface SelectorNodeLike {
  /** Optional application-specific node category. */
  readonly kind?: string;
  /** Optional syntax-tree node category. */
  readonly type?: string;
  /** Element local name. */
  readonly tagName?: string;
  /** Element attributes. */
  readonly attributes?: readonly SelectorAttributeLike[];
  /** Child nodes in tree order. */
  readonly children?: readonly SelectorNodeLike[];
  /** Application-specific node data ignored by selector matching. */
  readonly [key: string]: unknown;
}

/** Supported selector relationship between adjacent compounds. */
export type SelectorCombinator = " " | ">";

/** Type or universal selector. */
export interface SelectorSimpleType {
  /** Selector discriminator. */
  readonly kind: "type";
  /** Type name, excluding the universal marker. */
  readonly name: string;
  /** Whether the selector is universal. */
  readonly universal: boolean;
}

/** ID selector. */
export interface SelectorSimpleId {
  /** Selector discriminator. */
  readonly kind: "id";
  /** Required element ID. */
  readonly value: string;
}

/** Class selector. */
export interface SelectorSimpleClass {
  /** Selector discriminator. */
  readonly kind: "class";
  /** Required class token. */
  readonly value: string;
}

/** Attribute selector. */
export interface SelectorSimpleAttribute {
  /** Selector discriminator. */
  readonly kind: "attribute";
  /** Attribute name. */
  readonly name: string;
  /** Attribute comparison operator, or `null` for presence matching. */
  readonly matcher: null | "=" | "~=" | "|=" | "^=" | "$=" | "*=";
  /** Comparison value, or `null` for presence matching. */
  readonly value: string | null;
  /** Selector flags, or `null` when none were supplied. */
  readonly flags: string | null;
}

/** Supported simple selector representation. */
export type SelectorSimple =
  | SelectorSimpleType
  | SelectorSimpleId
  | SelectorSimpleClass
  | SelectorSimpleAttribute;

/** Sequence of simple selectors that applies to one element. */
export interface CompiledSelectorCompound {
  /** Simple selectors in source order. */
  readonly simpleSelectors: readonly SelectorSimple[];
}

/** Selector component the matcher cannot evaluate. */
export interface SelectorUnsupportedPart {
  /** Zero-based selector index within the selector list. */
  readonly selectorIndex: number;
  /** Unsupported syntax-tree node category. */
  readonly partType: string;
  /** Human-readable explanation. */
  readonly detail: string;
}

/** Compiled representation of one complex selector. */
export interface CompiledSelector {
  /** Zero-based selector index within the selector list. */
  readonly selectorIndex: number;
  /** Compounds in source order. */
  readonly compounds: readonly CompiledSelectorCompound[];
  /** Relationships between adjacent compounds. */
  readonly combinators: readonly SelectorCombinator[];
  /** Whether the matcher supports every selector component. */
  readonly supported: boolean;
  /** Unsupported selector components. */
  readonly unsupportedParts: readonly SelectorUnsupportedPart[];
}

/** Parsed and compiled selector-list result. */
export interface CompiledSelectorList {
  /** Original selector text. */
  readonly source: string;
  /** CSS parse diagnostics. */
  readonly parseErrors: readonly ParseError[];
  /** Compiled selectors in source order. */
  readonly selectors: readonly CompiledSelector[];
  /** Whether the matcher supports the complete selector list. */
  readonly supported: boolean;
  /** Unsupported components from all selectors. */
  readonly unsupportedParts: readonly SelectorUnsupportedPart[];
}

/** Controls selector matching and traversal limits. */
export interface SelectorQueryOptions {
  /** Throws when the selector contains unsupported syntax. */
  readonly strict?: boolean;
  /** Maximum nodes examined while indexing the supplied tree. */
  readonly maxVisitedNodes?: number;
}

/** Three-column CSS selector specificity. */
export interface StyleSignalSpecificity {
  /** ID-selector count. */
  readonly a: number;
  /** Class, attribute, and pseudo-class count. */
  readonly b: number;
  /** Type and pseudo-element count. */
  readonly c: number;
}

/** Declaration information used for downstream style analysis. */
export interface StyleDeclarationSignal {
  /** Identifier of the declaration node. */
  readonly declarationNodeId: NodeId;
  /** Normalized property name. */
  readonly property: string;
  /** Serialized property value. */
  readonly value: string;
  /** Whether the declaration contains `!important`. */
  readonly important: boolean;
  /** Zero-based declaration order within its block. */
  readonly declarationOrder: number;
}

/** Style-rule information used for downstream style analysis. */
export interface StyleRuleSignal {
  /** Identifier of the rule node. */
  readonly ruleNodeId: NodeId;
  /** Serialized selector text. */
  readonly selectorText: string;
  /** Compiled selector-list result. */
  readonly selector: CompiledSelectorList;
  /** Whether the matcher supports the complete selector. */
  readonly selectorSupported: boolean;
  /** Greatest specificity among compiled selectors. */
  readonly specificityMax: StyleSignalSpecificity;
  /** Zero-based rule order in the stylesheet. */
  readonly cascadeOrder: number;
  /** Declarations in source order. */
  readonly declarations: readonly StyleDeclarationSignal[];
}

/** Controls style-signal extraction. */
export interface StyleSignalOptions {
  /** Retains rules whose selectors are not fully supported. */
  readonly includeUnsupportedSelectors?: boolean;
  /** Throws when a selector contains unsupported syntax. */
  readonly strictSelectors?: boolean;
}

/** Downstream rendering behavior represented by a render signal. */
export type RenderSignalClass =
  | "visibility-hidden-subtree"
  | "visibility-hidden-self"
  | "control-affordance";

/** CSS declaration with enough context for downstream rendering decisions. */
export interface RenderSignal {
  /** Rendering behavior represented by the declaration. */
  readonly signalClass: RenderSignalClass;
  /** Whether the declaration came from a rule or inline style. */
  readonly source: "rule" | "inline";
  /** Normalized property name. */
  readonly property: string;
  /** Serialized property value. */
  readonly value: string;
  /** Whether the declaration contains `!important`. */
  readonly important: boolean;
  /** Zero-based declaration order within its block. */
  readonly declarationOrder: number;
  /** Rule selector text, or `null` for inline styles. */
  readonly selectorText: string | null;
  /** Identifier of the declaration node. */
  readonly declarationNodeId: NodeId;
  /** Identifier of the containing rule, or `null` for inline styles. */
  readonly ruleNodeId: NodeId | null;
  /** Zero-based rule order, or `null` for inline styles. */
  readonly cascadeOrder: number | null;
}

/** Controls which render signals are emitted. */
export interface RenderSignalOptions extends StyleSignalOptions {
  /** Emits signals for control-affecting properties. */
  readonly includeControlAffordance?: boolean;
  /** Emits signals for visibility-affecting properties. */
  readonly includeVisibilitySignals?: boolean;
}
