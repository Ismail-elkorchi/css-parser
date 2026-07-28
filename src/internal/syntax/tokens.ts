import type { ResourceUsage, SourcePosition, SourceSpan } from "./types.ts";

interface TokenBase {
  readonly span: SourceSpan;
}

export interface IdentToken extends TokenBase {
  readonly kind: "ident";
  readonly value: string;
}

export interface FunctionToken extends TokenBase {
  readonly kind: "function";
  readonly value: string;
}

export interface AtKeywordToken extends TokenBase {
  readonly kind: "at-keyword";
  readonly value: string;
}

export interface HashToken extends TokenBase {
  readonly kind: "hash";
  readonly value: string;
  readonly hashType: "id" | "unrestricted";
}

export interface StringToken extends TokenBase {
  readonly kind: "string";
  readonly value: string;
}

export interface BadStringToken extends TokenBase {
  readonly kind: "bad-string";
}

export interface UrlToken extends TokenBase {
  readonly kind: "url";
  readonly value: string;
}

export interface BadUrlToken extends TokenBase {
  readonly kind: "bad-url";
}

export interface DelimToken extends TokenBase {
  readonly kind: "delim";
  readonly value: number;
}

export interface NumericValue {
  readonly value: number;
  readonly numberType: "integer" | "number";
  readonly representation: string;
  readonly sign: "+" | "-" | null;
}

export interface NumberToken extends TokenBase, NumericValue {
  readonly kind: "number";
}

export interface PercentageToken extends TokenBase, NumericValue {
  readonly kind: "percentage";
}

export interface DimensionToken extends TokenBase, NumericValue {
  readonly kind: "dimension";
  readonly unit: string;
}

export interface UnicodeRangeToken extends TokenBase {
  readonly kind: "unicode-range";
  readonly start: number;
  readonly end: number;
}

export interface WhitespaceToken extends TokenBase {
  readonly kind: "whitespace";
}

export interface CdoToken extends TokenBase {
  readonly kind: "cdo";
}

export interface CdcToken extends TokenBase {
  readonly kind: "cdc";
}

export interface ColonToken extends TokenBase {
  readonly kind: "colon";
}

export interface SemicolonToken extends TokenBase {
  readonly kind: "semicolon";
}

export interface CommaToken extends TokenBase {
  readonly kind: "comma";
}

export interface OpenSquareToken extends TokenBase {
  readonly kind: "open-square";
}

export interface CloseSquareToken extends TokenBase {
  readonly kind: "close-square";
}

export interface OpenParenToken extends TokenBase {
  readonly kind: "open-paren";
}

export interface CloseParenToken extends TokenBase {
  readonly kind: "close-paren";
}

export interface OpenCurlyToken extends TokenBase {
  readonly kind: "open-curly";
}

export interface CloseCurlyToken extends TokenBase {
  readonly kind: "close-curly";
}

export interface EofToken extends TokenBase {
  readonly kind: "eof";
}

export type CssToken =
  | IdentToken
  | FunctionToken
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
  | OpenSquareToken
  | CloseSquareToken
  | OpenParenToken
  | CloseParenToken
  | OpenCurlyToken
  | CloseCurlyToken
  | EofToken;

export type TokenizerDiagnosticCode =
  | "unexpected-eof-in-comment"
  | "unexpected-eof-in-string"
  | "newline-in-string"
  | "unexpected-eof-in-escape"
  | "invalid-escape"
  | "unexpected-eof-in-url"
  | "invalid-url";

export interface TokenizerDiagnostic {
  readonly kind: "tokenizer";
  readonly code: TokenizerDiagnosticCode;
  readonly message: string;
  readonly span: SourceSpan;
  readonly specRef: string;
}

export interface TokenizationResult {
  readonly tokens: readonly Exclude<CssToken, EofToken>[];
  readonly errors: readonly TokenizerDiagnostic[];
  readonly end: SourcePosition;
  readonly usage: ResourceUsage;
}
