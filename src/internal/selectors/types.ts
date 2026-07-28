import type { ComponentValue, SyntaxDiagnostic } from "../syntax/ast.ts";
import type {
  ParserResourceLimits,
  ResourceUsage,
  SourceSpan
} from "../syntax/types.ts";

export type SelectorCombinator = " " | ">" | "+" | "~";

export interface SelectorType {
  readonly kind: "type";
  readonly namespace: string | null;
  readonly name: string;
  readonly universal: boolean;
  readonly span: SourceSpan;
}

export interface SelectorId {
  readonly kind: "id";
  readonly value: string;
  readonly span: SourceSpan;
}

export interface SelectorClass {
  readonly kind: "class";
  readonly value: string;
  readonly span: SourceSpan;
}

export type SelectorAttributeMatcher =
  | "="
  | "~="
  | "|="
  | "^="
  | "$="
  | "*=";

export interface SelectorAttribute {
  readonly kind: "attribute";
  readonly namespace: string | null;
  readonly name: string;
  readonly matcher: SelectorAttributeMatcher | null;
  readonly value: string | null;
  readonly modifier: "i" | "s" | null;
  readonly span: SourceSpan;
}

export type SelectorPseudoArgument =
  | {
      readonly kind: "none";
    }
  | {
      readonly kind: "raw";
      readonly value: readonly ComponentValue[];
    }
  | {
      readonly kind: "selector-list";
      readonly selectors: readonly ComplexSelector[];
      readonly forgiving: boolean;
      readonly relative: boolean;
    }
  | {
      readonly kind: "nth";
      readonly a: number;
      readonly b: number;
      readonly of: readonly ComplexSelector[];
    };

export interface SelectorPseudoClass {
  readonly kind: "pseudo-class";
  readonly name: string;
  readonly argument: SelectorPseudoArgument;
  readonly span: SourceSpan;
}

export interface SelectorPseudoElement {
  readonly kind: "pseudo-element";
  readonly name: string;
  readonly argument: SelectorPseudoArgument;
  readonly span: SourceSpan;
}

export interface SelectorNesting {
  readonly kind: "nesting";
  readonly span: SourceSpan;
}

export type SimpleSelector =
  | SelectorId
  | SelectorClass
  | SelectorAttribute
  | SelectorPseudoClass
  | SelectorPseudoElement
  | SelectorNesting;

export interface CompoundSelector {
  readonly type: SelectorType | null;
  readonly simples: readonly SimpleSelector[];
  readonly span: SourceSpan;
}

export interface ComplexSelector {
  readonly leadingCombinator: SelectorCombinator | null;
  readonly compounds: readonly CompoundSelector[];
  readonly combinators: readonly SelectorCombinator[];
  readonly span: SourceSpan;
}

export interface SelectorList {
  readonly selectors: readonly ComplexSelector[];
  readonly span: SourceSpan;
}

export type SelectorDiagnosticCode =
  | "empty-selector"
  | "invalid-selector"
  | "invalid-combinator"
  | "invalid-attribute"
  | "invalid-pseudo"
  | "invalid-nth";

export interface SelectorDiagnostic {
  readonly kind: "selector";
  readonly code: SelectorDiagnosticCode;
  readonly message: string;
  readonly span: SourceSpan;
  readonly specRef: string;
}

export interface SelectorParseSuccess {
  readonly ok: true;
  readonly value: SelectorList;
  readonly errors: readonly (SyntaxDiagnostic | SelectorDiagnostic)[];
  readonly usage: ResourceUsage;
}

export interface SelectorParseFailure {
  readonly ok: false;
  readonly errors: readonly (SyntaxDiagnostic | SelectorDiagnostic)[];
  readonly usage: ResourceUsage;
}

export type SelectorParseResult =
  | SelectorParseSuccess
  | SelectorParseFailure;

export interface SelectorParserOptions {
  readonly limits?: ParserResourceLimits;
  readonly signal?: AbortSignal;
}

export interface SelectorSpecificity {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export interface SelectorSpecificityOptions {
  readonly nesting?: SelectorSpecificity;
}
