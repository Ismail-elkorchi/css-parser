import type {
  CssAtRule,
  CssBlock,
  CssDeclaration,
  CssFunction,
  CssQualifiedRule,
  CssSimpleBlock,
  CssStylesheet,
  SyntaxFailure,
  SyntaxSuccess
} from "../internal/syntax/ast.ts";
import type { TokenizationResult } from "../internal/syntax/tokens.ts";
import type {
  EncodingDecision,
  EncodingOptions,
  ResourceLimits
} from "../internal/syntax/types.ts";

export type {
  CommaSeparatedComponentValuesResult,
  ComponentValue,
  ComponentValuesResult,
  CssAtRule,
  CssBlock,
  CssBlockItem,
  CssDeclaration,
  CssFunction,
  CssQualifiedRule,
  CssRule,
  CssSimpleBlock,
  CssStylesheet,
  ParserDiagnostic,
  ParserDiagnosticCode,
  PreservedToken,
  SyntaxDiagnostic,
  SyntaxFailure,
  SyntaxResult,
  SyntaxSuccess
} from "../internal/syntax/ast.ts";
export type {
  CssToken,
  TokenizationResult,
  TokenizerDiagnostic,
  TokenizerDiagnosticCode
} from "../internal/syntax/tokens.ts";
export type {
  EncodingDecision,
  EncodingOptions,
  ResourceLimitName,
  ResourceLimits,
  ResourceUsage,
  SourcePosition,
  SourceSpan
} from "../internal/syntax/types.ts";
export type { SyntaxParserOptions } from "../internal/syntax/parser.ts";
export type { TokenizerOptions } from "../internal/syntax/tokenizer.ts";
export type {
  CssSerializationErrorCode,
  CssSyntaxSerializable
} from "../internal/syntax/serialize.ts";

export type {
  CssDeclarationBlockOptions,
  CssDeclarationMutation,
  CssomDeclaration
} from "../internal/cssom/declarations.ts";
export type {
  CssPropertySemantics,
  CustomPropertySemantics,
  StandardPropertySemantics
} from "../internal/properties/registry.ts";
export type {
  InvalidPropertyValue,
  PropertyValidationOptions,
  PropertyValueValidation,
  UnsupportedPropertyValue,
  ValidPropertyValue
} from "../internal/properties/matcher.ts";

export type {
  ComplexSelector,
  CompoundSelector,
  SelectorAttribute,
  SelectorAttributeMatcher,
  SelectorClass,
  SelectorCombinator,
  SelectorDiagnostic,
  SelectorDiagnosticCode,
  SelectorId,
  SelectorList,
  SelectorNesting,
  SelectorParseFailure,
  SelectorParserOptions,
  SelectorParseResult,
  SelectorParseSuccess,
  SelectorPseudoArgument,
  SelectorPseudoClass,
  SelectorPseudoElement,
  SelectorSpecificity,
  SelectorSpecificityOptions,
  SelectorType,
  SimpleSelector
} from "../internal/selectors/types.ts";
export type {
  SelectorAttributeData,
  SelectorDecision,
  SelectorDefaultNamespace,
  SelectorDocumentMode,
  SelectorElementData,
  SelectorEnvironment,
  SelectorMatchOptions,
  SelectorMatchResult,
  SelectorNamespaceResolution,
  SelectorNodeData,
  SelectorOtherNodeData,
  SelectorPseudoContext,
  SelectorQueryResult,
  SelectorQueryUnknown,
  SelectorTextData,
  SelectorTreeAdapter,
  SelectorUnknownReason
} from "../internal/selectors/matcher.ts";

/** Options shared by byte-array and byte-stream operations. */
export interface CssByteInputOptions extends EncodingOptions {
  /** Deterministic limits applied to raw input and parser work. */
  readonly limits?: ResourceLimits;
  /** Cancels decoding or parsing. */
  readonly signal?: AbortSignal;
}

/** Parse or tokenization result with the byte-decoding decision. */
export type DecodedSyntaxResult<T> =
  | (SyntaxSuccess<T> & {
      readonly encoding: EncodingDecision;
    })
  | (SyntaxFailure & {
      readonly encoding: EncodingDecision;
    });

/** Tokenization result with the byte-decoding decision. */
export interface DecodedTokenizationResult extends TokenizationResult {
  readonly encoding: EncodingDecision;
}

/** Structural nodes assigned stable tree-local identifiers. */
export type CssAstNode =
  | CssStylesheet
  | CssAtRule
  | CssQualifiedRule
  | CssBlock
  | CssDeclaration
  | CssFunction
  | CssSimpleBlock;

/** A structural node narrowed by its `kind` discriminator. */
export type CssAstNodeOfKind<K extends CssAstNode["kind"]> =
  Extract<CssAstNode, { readonly kind: K }>;

/** Called in depth-first order for each structural node. */
export type CssNodeVisitor = (
  node: CssAstNode,
  depth: number,
  parent: CssAstNode | null
) => void;

/** Removes the input range represented by a parsed node. */
export interface RemoveNodeEdit {
  readonly kind: "remove-node";
  readonly target: number;
}

/** Replaces the input range represented by a parsed node. */
export interface ReplaceNodeEdit {
  readonly kind: "replace-node";
  readonly target: number;
  readonly css: string;
}

/** Inserts CSS at a parsed node boundary. */
export interface InsertCssEdit {
  readonly kind: "insert-before" | "insert-after";
  readonly target: number;
  readonly css: string;
}

/** Source-preserving edit addressed by a tree-local node identifier. */
export type CssSourceEdit =
  | RemoveNodeEdit
  | ReplaceNodeEdit
  | InsertCssEdit;

/** Copies an unchanged half-open source range. */
export interface PatchCopy {
  readonly kind: "copy";
  readonly start: number;
  readonly end: number;
}

/** Replaces a half-open source range; an empty range is an insertion. */
export interface PatchReplace {
  readonly kind: "replace";
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

/** One operation in a validated source patch. */
export type PatchOperation = PatchCopy | PatchReplace;

/** Deterministic source transformation produced by {@link computePatch}. */
export interface PatchPlan {
  readonly operations: readonly PatchOperation[];
  readonly result: string;
}

export type PatchPlanningErrorCode =
  | "node-not-found"
  | "duplicate-node-id"
  | "span-out-of-bounds"
  | "overlapping-edits"
  | "invalid-edit"
  | "invalid-plan";
