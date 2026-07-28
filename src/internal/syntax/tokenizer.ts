import { InputCursor, utf8ByteLength } from "./input.ts";
import { ResourceGuard } from "./resources.ts";
import {
  isDigit,
  isHexDigit,
  isIdent,
  isIdentStart,
  isNonPrintable,
  isWhitespace
} from "./characters.ts";

import type { InputCursorMark } from "./input.ts";
import type {
  AtKeywordToken,
  BadStringToken,
  BadUrlToken,
  CssToken,
  DelimToken,
  DimensionToken,
  EofToken,
  FunctionToken,
  HashToken,
  IdentToken,
  NumberToken,
  NumericValue,
  PercentageToken,
  StringToken,
  TokenizationResult,
  TokenizerDiagnostic,
  TokenizerDiagnosticCode,
  UnicodeRangeToken,
  UrlToken
} from "./tokens.ts";
import type {
  ResourceLimits,
  ResourceUsage,
  SourcePosition,
  SourceSpan
} from "./types.ts";

const CSS_SYNTAX = "https://drafts.csswg.org/css-syntax/";
const REPLACEMENT_CHARACTER = 0xfffd;

export interface TokenizerOptions {
  readonly limits?: ResourceLimits;
  readonly signal?: AbortSignal;
  readonly unicodeRanges?: boolean;
  readonly guard?: ResourceGuard;
}

function asciiLower(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function span(start: InputCursorMark, end: SourcePosition): SourceSpan {
  return Object.freeze({
    start: Object.freeze({ ...start }),
    end
  });
}

function fixedToken<TKind extends CssToken["kind"]>(
  kind: TKind,
  start: InputCursorMark,
  end: SourcePosition
): Extract<CssToken, { readonly kind: TKind }> {
  return Object.freeze({ kind, span: span(start, end) }) as Extract<
    CssToken,
    { readonly kind: TKind }
  >;
}

function validEscape(first: number | null, second: number | null): boolean {
  return first === 0x5c && second !== null && second !== 0x0a;
}

function wouldStartIdent(first: number | null, second: number | null, third: number | null): boolean {
  if (first === 0x2d) {
    return isIdentStart(second) || second === 0x2d || validEscape(second, third);
  }
  if (isIdentStart(first)) {
    return true;
  }
  return validEscape(first, second);
}

function wouldStartNumber(first: number | null, second: number | null, third: number | null): boolean {
  if (first === 0x2b || first === 0x2d) {
    return isDigit(second) || (second === 0x2e && isDigit(third));
  }
  if (first === 0x2e) {
    return isDigit(second);
  }
  return isDigit(first);
}

function wouldStartUnicodeRange(
  first: number | null,
  second: number | null,
  third: number | null
): boolean {
  return (
    (first === 0x55 || first === 0x75) &&
    second === 0x2b &&
    (isHexDigit(third) || third === 0x3f)
  );
}

function hexValue(value: number): number {
  if (value >= 0x30 && value <= 0x39) return value - 0x30;
  if (value >= 0x41 && value <= 0x46) return value - 0x41 + 10;
  return value - 0x61 + 10;
}

function numericValue(representation: string, numberType: "integer" | "number"): NumericValue {
  return Object.freeze({
    value: Number(representation),
    numberType,
    representation,
    sign: representation.startsWith("+") ? "+" : representation.startsWith("-") ? "-" : null
  });
}

export class CssTokenizer {
  readonly #cursor: InputCursor;
  readonly #guard: ResourceGuard;
  readonly #unicodeRanges: boolean;
  readonly #errors: TokenizerDiagnostic[] = [];
  #emittedEof = false;

  constructor(input: string, options: TokenizerOptions = {}) {
    this.#guard = options.guard ?? new ResourceGuard(options.limits, options.signal);
    this.#guard.setInputBytes(utf8ByteLength(input));
    this.#cursor = new InputCursor(input, this.#guard);
    this.#unicodeRanges = options.unicodeRanges ?? false;
  }

  get errors(): readonly TokenizerDiagnostic[] {
    return this.#errors;
  }

  get usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  next(): CssToken {
    if (this.#emittedEof) {
      const position = this.#cursor.position();
      return fixedToken("eof", position, position);
    }

    this.#consumeComments();
    const start = this.#cursor.mark();
    const current = this.#cursor.consume();
    if (current === null) {
      this.#emittedEof = true;
      return fixedToken("eof", start, this.#cursor.position());
    }

    const value = current.value;
    let token: CssToken;
    if (isWhitespace(value)) {
      while (isWhitespace(this.#cursor.peek())) this.#cursor.consume();
      token = fixedToken("whitespace", start, this.#cursor.position());
    } else if (value === 0x22 || value === 0x27) {
      token = this.#consumeString(value, start);
    } else if (value === 0x23) {
      token = this.#consumeHash(start);
    } else if (value === 0x28) {
      token = fixedToken("open-paren", start, this.#cursor.position());
    } else if (value === 0x29) {
      token = fixedToken("close-paren", start, this.#cursor.position());
    } else if (value === 0x2b) {
      token = wouldStartNumber(value, this.#cursor.peek(), this.#cursor.peek(1))
        ? this.#consumeNumeric(start, true)
        : this.#delim(value, start);
    } else if (value === 0x2c) {
      token = fixedToken("comma", start, this.#cursor.position());
    } else if (value === 0x2d) {
      if (wouldStartNumber(value, this.#cursor.peek(), this.#cursor.peek(1))) {
        token = this.#consumeNumeric(start, true);
      } else if (this.#cursor.peek() === 0x2d && this.#cursor.peek(1) === 0x3e) {
        this.#cursor.consume();
        this.#cursor.consume();
        token = fixedToken("cdc", start, this.#cursor.position());
      } else if (wouldStartIdent(value, this.#cursor.peek(), this.#cursor.peek(1))) {
        this.#cursor.reconsume();
        token = this.#consumeIdentLike(start);
      } else {
        token = this.#delim(value, start);
      }
    } else if (value === 0x2e) {
      token = wouldStartNumber(value, this.#cursor.peek(), this.#cursor.peek(1))
        ? this.#consumeNumeric(start, true)
        : this.#delim(value, start);
    } else if (value === 0x2f) {
      token = this.#delim(value, start);
    } else if (value === 0x3a) {
      token = fixedToken("colon", start, this.#cursor.position());
    } else if (value === 0x3b) {
      token = fixedToken("semicolon", start, this.#cursor.position());
    } else if (value === 0x3c) {
      if (
        this.#cursor.peek() === 0x21 &&
        this.#cursor.peek(1) === 0x2d &&
        this.#cursor.peek(2) === 0x2d
      ) {
        this.#cursor.consume();
        this.#cursor.consume();
        this.#cursor.consume();
        token = fixedToken("cdo", start, this.#cursor.position());
      } else {
        token = this.#delim(value, start);
      }
    } else if (value === 0x40) {
      token = this.#consumeAtKeyword(start);
    } else if (value === 0x5b) {
      token = fixedToken("open-square", start, this.#cursor.position());
    } else if (value === 0x5c) {
      if (validEscape(value, this.#cursor.peek())) {
        this.#cursor.reconsume();
        token = this.#consumeIdentLike(start);
      } else {
        this.#diagnostic(
          "invalid-escape",
          "A reverse solidus followed by a newline does not start an escape.",
          start,
          "#consume-token"
        );
        token = this.#delim(value, start);
      }
    } else if (value === 0x5d) {
      token = fixedToken("close-square", start, this.#cursor.position());
    } else if (value === 0x7b) {
      token = fixedToken("open-curly", start, this.#cursor.position());
    } else if (value === 0x7d) {
      token = fixedToken("close-curly", start, this.#cursor.position());
    } else if (
      this.#unicodeRanges &&
      (value === 0x55 || value === 0x75) &&
      wouldStartUnicodeRange(value, this.#cursor.peek(), this.#cursor.peek(1))
    ) {
      token = this.#consumeUnicodeRange(start);
    } else if (isDigit(value)) {
      token = this.#consumeNumeric(start, true);
    } else if (isIdentStart(value)) {
      this.#cursor.reconsume();
      token = this.#consumeIdentLike(start);
    } else {
      token = this.#delim(value, start);
    }

    this.#guard.emitToken();
    return token;
  }

  tokenize(): TokenizationResult {
    const tokens: Exclude<CssToken, EofToken>[] = [];
    for (;;) {
      const token = this.next();
      if (token.kind === "eof") break;
      tokens.push(token);
    }
    return Object.freeze({
      tokens: Object.freeze(tokens),
      errors: Object.freeze([...this.#errors]),
      end: this.#cursor.position(),
      usage: this.#guard.snapshot()
    });
  }

  #consumeComments(): void {
    for (;;) {
      if (this.#cursor.peek() !== 0x2f || this.#cursor.peek(1) !== 0x2a) {
        return;
      }
      const start = this.#cursor.mark();
      this.#cursor.consume();
      this.#cursor.consume();
      for (;;) {
        const next = this.#cursor.consume();
        if (next === null) {
          this.#diagnostic(
            "unexpected-eof-in-comment",
            "The input ended before the comment was closed.",
            start,
            "#consume-comments"
          );
          return;
        }
        if (next.value === 0x2a && this.#cursor.peek() === 0x2f) {
          this.#cursor.consume();
          break;
        }
      }
    }
  }

  #consumeHash(start: InputCursorMark): HashToken | DelimToken {
    const first = this.#cursor.peek();
    const second = this.#cursor.peek(1);
    const third = this.#cursor.peek(2);
    if (!isIdent(first) && !validEscape(first, second)) {
      return this.#delim(0x23, start);
    }
    const hashType = wouldStartIdent(first, second, third) ? "id" : "unrestricted";
    const value = this.#consumeIdentSequence();
    return Object.freeze({
      kind: "hash",
      value,
      hashType,
      span: span(start, this.#cursor.position())
    });
  }

  #consumeAtKeyword(start: InputCursorMark): AtKeywordToken | DelimToken {
    if (!wouldStartIdent(this.#cursor.peek(), this.#cursor.peek(1), this.#cursor.peek(2))) {
      return this.#delim(0x40, start);
    }
    return Object.freeze({
      kind: "at-keyword",
      value: this.#consumeIdentSequence(),
      span: span(start, this.#cursor.position())
    });
  }

  #consumeIdentSequence(): string {
    let result = "";
    for (;;) {
      const next = this.#cursor.peek();
      if (isIdent(next)) {
        const consumed = this.#cursor.consume();
        if (consumed !== null) result += String.fromCodePoint(consumed.value);
      } else if (validEscape(next, this.#cursor.peek(1))) {
        this.#cursor.consume();
        result += String.fromCodePoint(this.#consumeEscapedCodePoint());
      } else {
        return result;
      }
    }
  }

  #consumeEscapedCodePoint(): number {
    const start = this.#cursor.mark();
    const next = this.#cursor.consume();
    if (next === null) {
      this.#diagnostic(
        "unexpected-eof-in-escape",
        "The input ended in an escape sequence.",
        start,
        "#consume-escaped-code-point"
      );
      return REPLACEMENT_CHARACTER;
    }
    if (!isHexDigit(next.value)) {
      return next.value;
    }

    let value = hexValue(next.value);
    let digits = 1;
    while (digits < 6 && isHexDigit(this.#cursor.peek())) {
      const digit = this.#cursor.consume();
      if (digit === null) break;
      value = (value * 16) + hexValue(digit.value);
      digits += 1;
    }
    if (isWhitespace(this.#cursor.peek())) this.#cursor.consume();
    if (value === 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
      return REPLACEMENT_CHARACTER;
    }
    return value;
  }

  #consumeIdentLike(start: InputCursorMark): IdentToken | FunctionToken | UrlToken | BadUrlToken {
    const value = this.#consumeIdentSequence();
    if (asciiLower(value) === "url" && this.#cursor.peek() === 0x28) {
      this.#cursor.consume();
      while (isWhitespace(this.#cursor.peek()) && isWhitespace(this.#cursor.peek(1))) {
        this.#cursor.consume();
      }
      const next = this.#cursor.peek();
      if (
        next === 0x22 ||
        next === 0x27 ||
        (isWhitespace(next) && (this.#cursor.peek(1) === 0x22 || this.#cursor.peek(1) === 0x27))
      ) {
        return Object.freeze({
          kind: "function",
          value,
          span: span(start, this.#cursor.position())
        });
      }
      return this.#consumeUrl(start);
    }
    if (this.#cursor.peek() === 0x28) {
      this.#cursor.consume();
      return Object.freeze({
        kind: "function",
        value,
        span: span(start, this.#cursor.position())
      });
    }
    return Object.freeze({
      kind: "ident",
      value,
      span: span(start, this.#cursor.position())
    });
  }

  #consumeString(ending: number, start: InputCursorMark): StringToken | BadStringToken {
    let value = "";
    for (;;) {
      const next = this.#cursor.consume();
      if (next === null) {
        this.#diagnostic(
          "unexpected-eof-in-string",
          "The input ended before the string was closed.",
          start,
          "#consume-string-token"
        );
        return Object.freeze({
          kind: "string",
          value,
          span: span(start, this.#cursor.position())
        });
      }
      if (next.value === ending) {
        return Object.freeze({
          kind: "string",
          value,
          span: span(start, this.#cursor.position())
        });
      }
      if (next.value === 0x0a) {
        this.#diagnostic(
          "newline-in-string",
          "An unescaped newline ended the string.",
          next.span.start,
          "#consume-string-token"
        );
        this.#cursor.reconsume();
        return fixedToken("bad-string", start, this.#cursor.position());
      }
      if (next.value === 0x5c) {
        const following = this.#cursor.peek();
        if (following === null) {
          continue;
        }
        if (following === 0x0a) {
          this.#cursor.consume();
          continue;
        }
        value += String.fromCodePoint(this.#consumeEscapedCodePoint());
        continue;
      }
      value += String.fromCodePoint(next.value);
    }
  }

  #consumeUrl(start: InputCursorMark): UrlToken | BadUrlToken {
    let value = "";
    for (;;) {
      const next = this.#cursor.consume();
      if (next === null) {
        this.#diagnostic(
          "unexpected-eof-in-url",
          "The input ended before the URL token was closed.",
          start,
          "#consume-url-token"
        );
        return Object.freeze({
          kind: "url",
          value,
          span: span(start, this.#cursor.position())
        });
      }
      if (next.value === 0x29) {
        return Object.freeze({
          kind: "url",
          value,
          span: span(start, this.#cursor.position())
        });
      }
      if (isWhitespace(next.value)) {
        while (isWhitespace(this.#cursor.peek())) this.#cursor.consume();
        if (this.#cursor.peek() === 0x29) {
          this.#cursor.consume();
          return Object.freeze({
            kind: "url",
            value,
            span: span(start, this.#cursor.position())
          });
        }
        if (this.#cursor.peek() === null) {
          this.#diagnostic(
            "unexpected-eof-in-url",
            "The input ended before the URL token was closed.",
            start,
            "#consume-url-token"
          );
          return Object.freeze({
            kind: "url",
            value,
            span: span(start, this.#cursor.position())
          });
        }
        return this.#badUrl(start, "Whitespace was followed by content instead of a closing parenthesis.");
      }
      if (
        next.value === 0x22 ||
        next.value === 0x27 ||
        next.value === 0x28 ||
        isNonPrintable(next.value)
      ) {
        return this.#badUrl(start, "The URL token contained a forbidden code point.");
      }
      if (next.value === 0x5c) {
        if (!validEscape(next.value, this.#cursor.peek())) {
          return this.#badUrl(start, "The URL token contained an invalid escape.");
        }
        value += String.fromCodePoint(this.#consumeEscapedCodePoint());
      } else {
        value += String.fromCodePoint(next.value);
      }
    }
  }

  #badUrl(start: InputCursorMark, message: string): BadUrlToken {
    this.#diagnostic("invalid-url", message, start, "#consume-url-token");
    for (;;) {
      const next = this.#cursor.consume();
      if (next === null || next.value === 0x29) break;
      if (validEscape(next.value, this.#cursor.peek())) {
        this.#consumeEscapedCodePoint();
      }
    }
    return fixedToken("bad-url", start, this.#cursor.position());
  }

  #consumeNumber(): NumericValue {
    const start = this.#cursor.offset;
    let numberType: "integer" | "number" = "integer";
    if (this.#cursor.peek() === 0x2b || this.#cursor.peek() === 0x2d) this.#cursor.consume();
    while (isDigit(this.#cursor.peek())) this.#cursor.consume();
    if (this.#cursor.peek() === 0x2e && isDigit(this.#cursor.peek(1))) {
      numberType = "number";
      this.#cursor.consume();
      while (isDigit(this.#cursor.peek())) this.#cursor.consume();
    }

    const exponent = this.#cursor.peek();
    const exponentSecond = this.#cursor.peek(1);
    const exponentThird = this.#cursor.peek(2);
    if (
      (exponent === 0x45 || exponent === 0x65) &&
      (
        isDigit(exponentSecond) ||
        ((exponentSecond === 0x2b || exponentSecond === 0x2d) && isDigit(exponentThird))
      )
    ) {
      numberType = "number";
      this.#cursor.consume();
      if (this.#cursor.peek() === 0x2b || this.#cursor.peek() === 0x2d) this.#cursor.consume();
      while (isDigit(this.#cursor.peek())) this.#cursor.consume();
    }

    return numericValue(this.#cursor.slice(start, this.#cursor.offset), numberType);
  }

  #consumeNumeric(start: InputCursorMark, reconsume: boolean): NumberToken | PercentageToken | DimensionToken {
    if (reconsume) this.#cursor.reconsume();
    const number = this.#consumeNumber();
    if (wouldStartIdent(this.#cursor.peek(), this.#cursor.peek(1), this.#cursor.peek(2))) {
      return Object.freeze({
        kind: "dimension",
        ...number,
        unit: this.#consumeIdentSequence(),
        span: span(start, this.#cursor.position())
      });
    }
    if (this.#cursor.peek() === 0x25) {
      this.#cursor.consume();
      return Object.freeze({
        kind: "percentage",
        ...number,
        span: span(start, this.#cursor.position())
      });
    }
    return Object.freeze({
      kind: "number",
      ...number,
      span: span(start, this.#cursor.position())
    });
  }

  #consumeUnicodeRange(start: InputCursorMark): UnicodeRangeToken {
    this.#cursor.consume();
    let startValue = 0;
    let digits = 0;
    while (digits < 6 && isHexDigit(this.#cursor.peek())) {
      const next = this.#cursor.consume();
      if (next === null) break;
      startValue = (startValue * 16) + hexValue(next.value);
      digits += 1;
    }

    let questionMarks = 0;
    while (digits + questionMarks < 6 && this.#cursor.peek() === 0x3f) {
      this.#cursor.consume();
      questionMarks += 1;
    }
    if (questionMarks > 0) {
      const multiplier = 16 ** questionMarks;
      return Object.freeze({
        kind: "unicode-range",
        start: startValue * multiplier,
        end: (startValue * multiplier) + multiplier - 1,
        span: span(start, this.#cursor.position())
      });
    }

    let endValue = startValue;
    if (this.#cursor.peek() === 0x2d && isHexDigit(this.#cursor.peek(1))) {
      this.#cursor.consume();
      endValue = 0;
      let endDigits = 0;
      while (endDigits < 6 && isHexDigit(this.#cursor.peek())) {
        const next = this.#cursor.consume();
        if (next === null) break;
        endValue = (endValue * 16) + hexValue(next.value);
        endDigits += 1;
      }
    }
    return Object.freeze({
      kind: "unicode-range",
      start: startValue,
      end: endValue,
      span: span(start, this.#cursor.position())
    });
  }

  #delim(value: number, start: InputCursorMark): DelimToken {
    return Object.freeze({
      kind: "delim",
      value,
      span: span(start, this.#cursor.position())
    });
  }

  #diagnostic(
    code: TokenizerDiagnosticCode,
    message: string,
    start: InputCursorMark | SourcePosition,
    anchor: string
  ): void {
    this.#errors.push(Object.freeze({
      kind: "tokenizer",
      code,
      message,
      span: span(start, this.#cursor.position()),
      specRef: `${CSS_SYNTAX}${anchor}`
    }));
  }
}

export function tokenizeCss(input: string, options: TokenizerOptions = {}): TokenizationResult {
  return new CssTokenizer(input, options).tokenize();
}
