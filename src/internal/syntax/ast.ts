import type {
  AtKeywordToken,
  BadStringToken,
  BadUrlToken,
  CdcToken,
  CdoToken,
  CloseCurlyToken,
  CloseParenToken,
  CloseSquareToken,
  ColonToken,
  CommaToken,
  DelimToken,
  DimensionToken,
  HashToken,
  IdentToken,
  NumberToken,
  PercentageToken,
  SemicolonToken,
  StringToken,
  TokenizerDiagnostic,
  UnicodeRangeToken,
  UrlToken,
  WhitespaceToken
} from "./tokens.ts";
import type { ResourceUsage, SourceSpan } from "./types.ts";

interface SyntaxNodeBase {
  readonly id: number;
  readonly span: SourceSpan;
}

export type PreservedToken =
  | IdentToken
  | AtKeywordToken
  | HashToken
  | StringToken
  | BadStringToken
  | UrlToken
  | BadUrlToken
  | DelimToken
  | NumberToken
  | PercentageToken
  | DimensionToken
  | UnicodeRangeToken
  | WhitespaceToken
  | CdoToken
  | CdcToken
  | ColonToken
  | SemicolonToken
  | CommaToken
  | CloseSquareToken
  | CloseParenToken
  | CloseCurlyToken;

export interface CssFunction extends SyntaxNodeBase {
  readonly kind: "function-block";
  readonly name: string;
  readonly value: readonly ComponentValue[];
}

export interface CssSimpleBlock extends SyntaxNodeBase {
  readonly kind: "simple-block";
  readonly associatedToken: "open-square" | "open-paren" | "open-curly";
  readonly value: readonly ComponentValue[];
}

export type ComponentValue = PreservedToken | CssFunction | CssSimpleBlock;

export interface CssDeclaration extends SyntaxNodeBase {
  readonly kind: "declaration";
  readonly name: string;
  readonly value: readonly ComponentValue[];
  readonly important: boolean;
  readonly originalText?: string;
}

export interface CssAtRule extends SyntaxNodeBase {
  readonly kind: "at-rule";
  readonly name: string;
  readonly prelude: readonly ComponentValue[];
  readonly block: CssBlock | null;
}

export interface CssQualifiedRule extends SyntaxNodeBase {
  readonly kind: "qualified-rule";
  readonly prelude: readonly ComponentValue[];
  readonly block: CssBlock;
}

export type CssRule = CssAtRule | CssQualifiedRule;
export type CssBlockItem = CssDeclaration | CssRule;

export interface CssBlock extends SyntaxNodeBase {
  readonly kind: "block";
  readonly items: readonly CssBlockItem[];
}

export interface CssStylesheet extends SyntaxNodeBase {
  readonly kind: "stylesheet";
  readonly rules: readonly CssRule[];
}

export type ParserDiagnosticCode =
  | "empty-input"
  | "trailing-input"
  | "invalid-rule"
  | "invalid-declaration"
  | "unexpected-closing-token"
  | "bad-string-token"
  | "bad-url-token";

export interface ParserDiagnostic {
  readonly kind: "parser";
  readonly code: ParserDiagnosticCode;
  readonly message: string;
  readonly span: SourceSpan;
  readonly specRef: string;
}

export type SyntaxDiagnostic = TokenizerDiagnostic | ParserDiagnostic;

interface SyntaxResultBase {
  readonly errors: readonly SyntaxDiagnostic[];
  readonly usage: ResourceUsage;
}

export interface SyntaxSuccess<T> extends SyntaxResultBase {
  readonly ok: true;
  readonly value: T;
}

export interface SyntaxFailure extends SyntaxResultBase {
  readonly ok: false;
}

export type SyntaxResult<T> = SyntaxSuccess<T> | SyntaxFailure;

export type ComponentValuesResult = SyntaxResult<readonly ComponentValue[]>;
export type CommaSeparatedComponentValuesResult =
  SyntaxResult<readonly (readonly ComponentValue[])[]>;
