import { ResourceGuard } from "./resources.ts";
import { TokenStream } from "./token-stream.ts";
import { CssTokenizer } from "./tokenizer.ts";

import type {
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
} from "./ast.ts";
import type { CssToken, TokenizerDiagnostic } from "./tokens.ts";
import type {
  ResourceLimits,
  ResourceUsage,
  SourcePosition,
  SourceSpan
} from "./types.ts";

const CSS_SYNTAX = "https://drafts.csswg.org/css-syntax/";

export interface SyntaxParserOptions {
  readonly limits?: ResourceLimits;
  readonly signal?: AbortSignal;
}

interface ParsedInput {
  readonly stream: TokenStream;
  readonly tokenizerErrors: readonly TokenizerDiagnostic[];
}

function freezeArray<T>(values: T[]): readonly T[] {
  return Object.freeze(values);
}

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function positionAtEnd(input: string): SourcePosition {
  let line = 1;
  let column = 1;
  for (let offset = 0; offset < input.length;) {
    const first = input.charCodeAt(offset);
    if (first === 0x0d) {
      offset += input.charCodeAt(offset + 1) === 0x0a ? 2 : 1;
      line += 1;
      column = 1;
    } else if (first === 0x0a || first === 0x0c) {
      offset += 1;
      line += 1;
      column = 1;
    } else if (
      first >= 0xd800 &&
      first <= 0xdbff &&
      input.charCodeAt(offset + 1) >= 0xdc00 &&
      input.charCodeAt(offset + 1) <= 0xdfff
    ) {
      offset += 2;
      column += 1;
    } else {
      offset += 1;
      column += 1;
    }
  }
  return Object.freeze({ offset: input.length, line, column });
}

function emptySpan(input: string): SourceSpan {
  const end = positionAtEnd(input);
  return Object.freeze({ start: end, end });
}

function isClosingToken(token: CssToken): token is Extract<
  CssToken,
  { readonly kind: "close-square" | "close-paren" | "close-curly" }
> {
  return (
    token.kind === "close-square" ||
    token.kind === "close-paren" ||
    token.kind === "close-curly"
  );
}

function isPreservedToken(token: CssToken): token is PreservedToken {
  return (
    token.kind !== "eof" &&
    token.kind !== "function" &&
    token.kind !== "open-square" &&
    token.kind !== "open-paren" &&
    token.kind !== "open-curly"
  );
}

function isWhitespace(value: ComponentValue): boolean {
  return value.kind === "whitespace";
}

function remapPosition(local: SourcePosition, base: SourcePosition): SourcePosition {
  return Object.freeze({
    offset: base.offset + local.offset,
    line: base.line + local.line - 1,
    column: local.line === 1 ? base.column + local.column - 1 : local.column
  });
}

function remapSpan(local: SourceSpan, base: SourcePosition): SourceSpan {
  return Object.freeze({
    start: remapPosition(local.start, base),
    end: remapPosition(local.end, base)
  });
}

function remapToken(token: CssToken, base: SourcePosition): CssToken {
  return Object.freeze({
    ...token,
    span: remapSpan(token.span, base)
  });
}

function closingKind(
  opening: "open-square" | "open-paren" | "open-curly"
): "close-square" | "close-paren" | "close-curly" {
  switch (opening) {
    case "open-square":
      return "close-square";
    case "open-paren":
      return "close-paren";
    case "open-curly":
      return "close-curly";
  }
}

export class CssSyntaxParser {
  readonly #input: string;
  readonly #guard: ResourceGuard;
  readonly #diagnostics: ParserDiagnostic[] = [];
  #tokenizerErrors: readonly TokenizerDiagnostic[] = [];
  #nextNodeId = 1;

  constructor(input: string, options: SyntaxParserOptions = {}) {
    this.#input = input;
    this.#guard = new ResourceGuard(options.limits, options.signal);
  }

  parseStylesheet(): SyntaxResult<CssStylesheet> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    const start = stream.index;
    const rules = this.#consumeStylesheetContents(stream, 2);
    const stylesheet = this.#stylesheet(rules, stream.spanFrom(start), 1);
    return this.#success(stylesheet);
  }

  parseStylesheetContents(): SyntaxResult<readonly CssRule[]> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    return this.#success(this.#consumeStylesheetContents(stream, 1));
  }

  parseBlockContents(): SyntaxResult<readonly CssBlockItem[]> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    return this.#success(this.#consumeBlockContents(stream, 1));
  }

  parseRule(): SyntaxResult<CssRule> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    stream.discardWhitespace();
    if (stream.empty) {
      this.#diagnostic(
        "empty-input",
        "A rule was requested from empty input.",
        emptySpan(this.#input),
        "#parse-a-rule"
      );
      return this.#failure();
    }

    const rule = stream.next.kind === "at-keyword"
      ? this.#consumeAtRule(stream, false, 1)
      : this.#consumeQualifiedRule(stream, false, undefined, 1);
    if (rule === null) {
      this.#diagnostic(
        "invalid-rule",
        "The input does not contain a complete rule.",
        stream.next.span,
        "#parse-a-rule"
      );
      return this.#failure();
    }
    stream.discardWhitespace();
    if (this.#nextKind(stream) !== "eof") {
      this.#diagnostic(
        "trailing-input",
        "A single-rule input contains trailing tokens.",
        stream.next.span,
        "#parse-a-rule"
      );
      return this.#failure();
    }
    return this.#success(rule);
  }

  parseDeclaration(): SyntaxResult<CssDeclaration> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    stream.discardWhitespace();
    const declaration = this.#consumeDeclaration(stream, false, 1);
    if (declaration === null) {
      this.#diagnostic(
        "invalid-declaration",
        "The input does not contain a syntactically valid declaration.",
        stream.next.span,
        "#parse-a-declaration"
      );
      return this.#failure();
    }
    return this.#success(declaration);
  }

  parseComponentValue(): SyntaxResult<ComponentValue> {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    stream.discardWhitespace();
    if (stream.empty) {
      this.#diagnostic(
        "empty-input",
        "A component value was requested from empty input.",
        emptySpan(this.#input),
        "#parse-a-component-value"
      );
      return this.#failure();
    }
    const value = this.#consumeComponentValue(stream, 1);
    stream.discardWhitespace();
    if (this.#nextKind(stream) !== "eof") {
      this.#diagnostic(
        "trailing-input",
        "A single-component-value input contains trailing tokens.",
        stream.next.span,
        "#parse-a-component-value"
      );
      return this.#failure();
    }
    return this.#success(value);
  }

  parseComponentValues(): ComponentValuesResult {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    return this.#success(this.#consumeComponentValues(stream, undefined, false, 1));
  }

  parseCommaSeparatedComponentValues(): CommaSeparatedComponentValuesResult {
    const { stream, tokenizerErrors } = this.#tokenize();
    this.#tokenizerErrors = tokenizerErrors;
    const groups: (readonly ComponentValue[])[] = [];
    while (!stream.empty) {
      groups.push(this.#consumeComponentValues(stream, "comma", false, 1));
      stream.discard();
    }
    return this.#success(freezeArray(groups));
  }

  #tokenize(): ParsedInput {
    const tokenizer = new CssTokenizer(this.#input, { guard: this.#guard });
    const result = tokenizer.tokenize();
    return {
      stream: new TokenStream(result.tokens, result.end),
      tokenizerErrors: result.errors
    };
  }

  #consumeStylesheetContents(stream: TokenStream, depth: number): readonly CssRule[] {
    const rules: CssRule[] = [];
    while (!stream.empty) {
      const token = stream.next;
      if (
        token.kind === "whitespace" ||
        token.kind === "cdo" ||
        token.kind === "cdc"
      ) {
        stream.discard();
      } else if (token.kind === "at-keyword") {
        rules.push(this.#consumeAtRule(stream, false, depth));
      } else {
        const start = stream.next.span;
        const rule = this.#consumeQualifiedRule(stream, false, undefined, depth);
        if (rule !== null) {
          rules.push(rule);
        } else {
          this.#diagnostic(
            "invalid-rule",
            "The stylesheet contains an incomplete qualified rule.",
            start,
            "#consume-a-stylesheets-contents"
          );
        }
      }
    }
    return freezeArray(rules);
  }

  #consumeAtRule(stream: TokenStream, nested: boolean, depth: number): CssAtRule {
    const start = stream.index;
    const nameToken = stream.consume();
    if (nameToken.kind !== "at-keyword") {
      throw new Error("at-rule consumption requires an at-keyword token");
    }

    const prelude: ComponentValue[] = [];
    for (;;) {
      const token = stream.next;
      if (token.kind === "semicolon") {
        stream.discard();
        return this.#atRule(nameToken.value, prelude, null, stream.spanFrom(start), depth);
      }
      if (token.kind === "eof" || (nested && token.kind === "close-curly")) {
        return this.#atRule(nameToken.value, prelude, null, stream.spanFrom(start), depth);
      }
      if (token.kind === "open-curly") {
        const block = this.#consumeBlock(stream, depth + 1);
        return this.#atRule(nameToken.value, prelude, block, stream.spanFrom(start), depth);
      }
      prelude.push(this.#consumeComponentValue(stream, depth + 1));
    }
  }

  #consumeQualifiedRule(
    stream: TokenStream,
    nested: boolean,
    stopKind: "semicolon" | undefined,
    depth: number
  ): CssQualifiedRule | null {
    const start = stream.index;
    const prelude: ComponentValue[] = [];
    for (;;) {
      const token = stream.next;
      if (token.kind === "eof" || token.kind === stopKind) return null;
      if (token.kind === "close-curly") {
        if (nested) return null;
        this.#diagnostic(
          "unexpected-closing-token",
          "A closing curly bracket has no matching block.",
          token.span,
          "#consume-a-qualified-rule"
        );
      }
      if (token.kind === "open-curly") {
        if (this.#looksLikeCustomPropertyRule(prelude)) {
          this.#consumeBadDeclarationRemnants(stream, nested);
          return null;
        }
        const block = this.#consumeBlock(stream, depth + 1);
        return this.#qualifiedRule(prelude, block, stream.spanFrom(start), depth);
      }
      prelude.push(this.#consumeComponentValue(stream, depth + 1));
    }
  }

  #consumeBlock(stream: TokenStream, depth: number): CssBlock {
    const start = stream.index;
    const opening = stream.consume();
    if (opening.kind !== "open-curly") {
      throw new Error("block consumption requires an opening curly token");
    }
    const items = this.#consumeBlockContents(stream, depth + 1);
    if (this.#nextKind(stream) === "close-curly") stream.discard();
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "block",
      items,
      span: stream.spanFrom(start)
    });
  }

  #consumeBlockContents(stream: TokenStream, depth: number): readonly CssBlockItem[] {
    const items: CssBlockItem[] = [];
    while (!stream.empty && stream.next.kind !== "close-curly") {
      if (stream.next.kind === "whitespace" || stream.next.kind === "semicolon") {
        stream.discard();
        continue;
      }
      if (stream.next.kind === "at-keyword") {
        items.push(this.#consumeAtRule(stream, true, depth));
        continue;
      }

      const start = stream.next.span;
      const startsLikeDeclaration = stream.next.kind === "ident";
      stream.mark();
      const declaration = this.#consumeDeclaration(stream, true, depth);
      if (declaration !== null) {
        stream.discardMark();
        items.push(declaration);
        continue;
      }

      stream.restore();
      const rule = this.#consumeQualifiedRule(stream, true, "semicolon", depth);
      if (rule !== null) {
        items.push(rule);
      } else {
        this.#diagnostic(
          startsLikeDeclaration ? "invalid-declaration" : "invalid-rule",
          startsLikeDeclaration
            ? "A declaration-like construct has no valid name, colon, or value."
            : "Block content does not form a complete nested rule.",
          start,
          "#consume-a-blocks-contents"
        );
        if (
          this.#nextKind(stream) !== "semicolon" &&
          this.#nextKind(stream) !== "close-curly"
        ) {
          this.#consumeBadDeclarationRemnants(stream, true);
        }
      }
    }
    return freezeArray(items);
  }

  #consumeDeclaration(
    stream: TokenStream,
    nested: boolean,
    depth: number
  ): CssDeclaration | null {
    const start = stream.index;
    const nameToken = stream.next;
    if (nameToken.kind !== "ident") return null;
    stream.discard();
    stream.discardWhitespace();
    if (stream.next.kind !== "colon") return null;
    stream.discard();
    stream.discardWhitespace();

    let value = [...this.#consumeComponentValues(stream, "semicolon", nested, depth + 1)];
    const custom = nameToken.value.startsWith("--");
    if (!custom && this.#hasAmbiguousCurlyBlock(value)) return null;

    let important = false;
    const nonWhitespace = value
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => !isWhitespace(item));
    const last = nonWhitespace.at(-1);
    const previous = nonWhitespace.at(-2);
    if (
      previous?.item.kind === "delim" &&
      previous.item.value === 0x21 &&
      last?.item.kind === "ident" &&
      lowerAscii(last.item.value) === "important"
    ) {
      value.splice(previous.index);
      important = true;
    }
    while (value.at(-1)?.kind === "whitespace") value.pop();

    if (lowerAscii(nameToken.value) === "unicode-range") {
      value = [...this.#parseUnicodeRangeValue(value, depth + 1)];
    }

    const span = stream.spanFrom(start);
    const originalTextStart = value.at(0)?.span.start.offset;
    const originalTextEnd = value.at(-1)?.span.end.offset;
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "declaration",
      name: nameToken.value,
      value: freezeArray(value),
      important,
      ...(custom
        ? {
            originalText: originalTextStart === undefined || originalTextEnd === undefined
              ? ""
              : this.#input.slice(originalTextStart, originalTextEnd)
          }
        : {}),
      span
    });
  }

  #consumeBadDeclarationRemnants(stream: TokenStream, nested: boolean): void {
    while (!stream.empty) {
      if (stream.next.kind === "semicolon") {
        stream.discard();
        return;
      }
      if (stream.next.kind === "close-curly" && nested) return;
      this.#consumeComponentValue(stream, 1);
    }
  }

  #consumeComponentValues(
    stream: TokenStream,
    stopKind: "semicolon" | "comma" | undefined,
    nested: boolean,
    depth: number
  ): readonly ComponentValue[] {
    const values: ComponentValue[] = [];
    while (!stream.empty && stream.next.kind !== stopKind) {
      if (nested && stream.next.kind === "close-curly") break;
      values.push(this.#consumeComponentValue(stream, depth));
    }
    return freezeArray(values);
  }

  #consumeComponentValue(stream: TokenStream, depth: number): ComponentValue {
    const token = stream.next;
    if (
      token.kind === "open-square" ||
      token.kind === "open-paren" ||
      token.kind === "open-curly"
    ) {
      return this.#consumeSimpleBlock(stream, depth);
    }
    if (token.kind === "function") return this.#consumeFunction(stream, depth);

    const consumed = stream.consume();
    if (!isPreservedToken(consumed)) {
      throw new Error("unexpected non-preserved CSS token");
    }
    if (isClosingToken(consumed)) {
      this.#diagnostic(
        "unexpected-closing-token",
        "A closing token has no matching block.",
        consumed.span,
        "#consume-a-list-of-component-values"
      );
    } else if (consumed.kind === "bad-string") {
      this.#diagnostic(
        "bad-string-token",
        "A malformed string token was preserved for error recovery.",
        consumed.span,
        "#consume-a-string-token"
      );
    } else if (consumed.kind === "bad-url") {
      this.#diagnostic(
        "bad-url-token",
        "A malformed URL token was preserved for error recovery.",
        consumed.span,
        "#consume-a-url-token"
      );
    }
    return consumed;
  }

  #consumeSimpleBlock(stream: TokenStream, depth: number): CssSimpleBlock {
    const start = stream.index;
    const opening = stream.consume();
    if (
      opening.kind !== "open-square" &&
      opening.kind !== "open-paren" &&
      opening.kind !== "open-curly"
    ) {
      throw new Error("simple-block consumption requires an opening token");
    }
    const endKind = closingKind(opening.kind);
    const values: ComponentValue[] = [];
    while (!stream.empty && stream.next.kind !== endKind) {
      values.push(this.#consumeComponentValue(stream, depth + 1));
    }
    if (stream.next.kind === endKind) stream.discard();
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "simple-block",
      associatedToken: opening.kind,
      value: freezeArray(values),
      span: stream.spanFrom(start)
    });
  }

  #consumeFunction(stream: TokenStream, depth: number): CssFunction {
    const start = stream.index;
    const opening = stream.consume();
    if (opening.kind !== "function") {
      throw new Error("function consumption requires a function token");
    }
    const values: ComponentValue[] = [];
    while (!stream.empty && stream.next.kind !== "close-paren") {
      values.push(this.#consumeComponentValue(stream, depth + 1));
    }
    if (stream.next.kind === "close-paren") stream.discard();
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "function-block",
      name: opening.value,
      value: freezeArray(values),
      span: stream.spanFrom(start)
    });
  }

  #parseUnicodeRangeValue(
    currentValue: readonly ComponentValue[],
    depth: number
  ): readonly ComponentValue[] {
    const first = currentValue.at(0);
    const last = currentValue.at(-1);
    if (first === undefined || last === undefined) return currentValue;
    const source = this.#input.slice(first.span.start.offset, last.span.end.offset);
    const tokenizer = new CssTokenizer(source, {
      guard: this.#guard,
      unicodeRanges: true
    });
    const tokenized = tokenizer.tokenize();
    const remappedTokens = tokenized.tokens.map((token) => remapToken(token, first.span.start));
    if (tokenized.errors.length > 0) {
      this.#tokenizerErrors = freezeArray([
        ...this.#tokenizerErrors,
        ...tokenized.errors.map((error) => Object.freeze({
          ...error,
          span: remapSpan(error.span, first.span.start)
        }))
      ]);
    }
    return this.#consumeComponentValues(
      new TokenStream(remappedTokens, remapPosition(tokenized.end, first.span.start)),
      undefined,
      false,
      depth
    );
  }

  #looksLikeCustomPropertyRule(prelude: readonly ComponentValue[]): boolean {
    const values = prelude.filter((value) => !isWhitespace(value));
    return (
      values[0]?.kind === "ident" &&
      values[0].value.startsWith("--") &&
      values[1]?.kind === "colon"
    );
  }

  #hasAmbiguousCurlyBlock(value: readonly ComponentValue[]): boolean {
    const significant = value.filter((item) => !isWhitespace(item));
    const curlyBlocks = significant.filter(
      (item) => item.kind === "simple-block" && item.associatedToken === "open-curly"
    );
    return curlyBlocks.length > 0 && significant.length !== 1;
  }

  #stylesheet(
    rules: readonly CssRule[],
    span: SourceSpan,
    depth: number
  ): CssStylesheet {
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "stylesheet",
      rules,
      span
    });
  }

  #atRule(
    name: string,
    prelude: ComponentValue[],
    block: CssBlock | null,
    span: SourceSpan,
    depth: number
  ): CssAtRule {
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "at-rule",
      name,
      prelude: freezeArray(prelude),
      block,
      span
    });
  }

  #qualifiedRule(
    prelude: ComponentValue[],
    block: CssBlock,
    span: SourceSpan,
    depth: number
  ): CssQualifiedRule {
    this.#guard.createNode(depth);
    return Object.freeze({
      id: this.#takeNodeId(),
      kind: "qualified-rule",
      prelude: freezeArray(prelude),
      block,
      span
    });
  }

  #takeNodeId(): number {
    const id = this.#nextNodeId;
    this.#nextNodeId += 1;
    return id;
  }

  #nextKind(stream: TokenStream): CssToken["kind"] {
    return stream.next.kind;
  }

  #diagnostic(
    code: ParserDiagnosticCode,
    message: string,
    span: SourceSpan,
    anchor: string
  ): void {
    this.#diagnostics.push(Object.freeze({
      kind: "parser",
      code,
      message,
      span,
      specRef: `${CSS_SYNTAX}${anchor}`
    }));
  }

  #errors(): readonly SyntaxDiagnostic[] {
    return freezeArray([...this.#tokenizerErrors, ...this.#diagnostics]);
  }

  #usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  #success<T>(value: T): SyntaxSuccess<T> {
    return Object.freeze({
      ok: true,
      value,
      errors: this.#errors(),
      usage: this.#usage()
    });
  }

  #failure(): SyntaxFailure {
    return Object.freeze({
      ok: false,
      errors: this.#errors(),
      usage: this.#usage()
    });
  }
}

export function parseCssStylesheet(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssStylesheet> {
  return new CssSyntaxParser(input, options).parseStylesheet();
}

export function parseCssStylesheetContents(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<readonly CssRule[]> {
  return new CssSyntaxParser(input, options).parseStylesheetContents();
}

export function parseCssBlockContents(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<readonly CssBlockItem[]> {
  return new CssSyntaxParser(input, options).parseBlockContents();
}

export function parseCssRule(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssRule> {
  return new CssSyntaxParser(input, options).parseRule();
}

export function parseCssDeclaration(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<CssDeclaration> {
  return new CssSyntaxParser(input, options).parseDeclaration();
}

export function parseCssComponentValue(
  input: string,
  options: SyntaxParserOptions = {}
): SyntaxResult<ComponentValue> {
  return new CssSyntaxParser(input, options).parseComponentValue();
}

export function parseCssComponentValues(
  input: string,
  options: SyntaxParserOptions = {}
): ComponentValuesResult {
  return new CssSyntaxParser(input, options).parseComponentValues();
}

export function parseCssCommaSeparatedComponentValues(
  input: string,
  options: SyntaxParserOptions = {}
): CommaSeparatedComponentValuesResult {
  return new CssSyntaxParser(input, options).parseCommaSeparatedComponentValues();
}
