export interface GrammarSpan {
  readonly start: number;
  readonly end: number;
}

interface GrammarNodeBase {
  readonly span: GrammarSpan;
}

export interface GrammarKeyword extends GrammarNodeBase {
  readonly kind: "keyword";
  readonly value: string;
}

export interface GrammarLiteral extends GrammarNodeBase {
  readonly kind: "literal";
  readonly value: string;
}

export interface GrammarRangeBoundary {
  readonly value: number;
  readonly unit: string | null;
}

export interface GrammarRange {
  readonly minimum: GrammarRangeBoundary;
  readonly maximum: GrammarRangeBoundary;
}

export type GrammarReferenceConstraint =
  | {
      readonly kind: "range";
      readonly value: GrammarRange;
    }
  | {
      readonly kind: "parameter";
      readonly value: string;
    };

export interface GrammarReference extends GrammarNodeBase {
  readonly kind: "reference";
  readonly name: string;
  readonly referenceKind: "type" | "property" | "function";
  readonly constraint: GrammarReferenceConstraint | null;
}

export interface GrammarFunction extends GrammarNodeBase {
  readonly kind: "function";
  readonly name: string;
  readonly value: ValueDefinition | null;
}

export interface GrammarCombination extends GrammarNodeBase {
  readonly kind: "sequence" | "all-of" | "any-of" | "one-of";
  readonly values: readonly ValueDefinition[];
}

export interface GrammarMultiplier extends GrammarNodeBase {
  readonly kind: "multiplier";
  readonly value: ValueDefinition;
  readonly minimum: number;
  readonly maximum: number;
  readonly separator: "space" | "comma";
}

export interface GrammarRequired extends GrammarNodeBase {
  readonly kind: "required";
  readonly value: ValueDefinition;
}

export type ValueDefinition =
  | GrammarKeyword
  | GrammarLiteral
  | GrammarReference
  | GrammarFunction
  | GrammarCombination
  | GrammarMultiplier
  | GrammarRequired;

const INFINITY = Number.POSITIVE_INFINITY;

export class CssValueDefinitionSyntaxError extends SyntaxError {
  readonly offset: number;

  constructor(message: string, offset: number) {
    super(`${message} at offset ${String(offset)}.`);
    this.name = "CssValueDefinitionSyntaxError";
    this.offset = offset;
  }
}

function freezeSpan(start: number, end: number): GrammarSpan {
  return Object.freeze({ start, end });
}

function freezeValues(values: ValueDefinition[]): readonly ValueDefinition[] {
  return Object.freeze(values);
}

function boundary(value: number, unit: string | null): GrammarRangeBoundary {
  return Object.freeze({ value, unit });
}

class ValueDefinitionParser {
  readonly #source: string;
  #offset = 0;

  constructor(source: string) {
    this.#source = source;
  }

  parse(): ValueDefinition {
    this.#skipWhitespace();
    if (this.#done) {
      throw this.#error("A value definition cannot be empty");
    }
    const result = this.#parseOneOf(null);
    this.#skipWhitespace();
    if (this.#source.slice(this.#offset).length > 0) {
      throw this.#error(`Unexpected ${JSON.stringify(this.#next)}`);
    }
    return result;
  }

  #parseOneOf(terminator: "]" | ")" | null): ValueDefinition {
    const start = this.#offset;
    const values = [this.#parseAnyOf(terminator)];
    while (this.#consumeCombinator("|", "||")) {
      values.push(this.#parseAnyOf(terminator));
    }
    return this.#combine("one-of", values, start);
  }

  #parseAnyOf(terminator: "]" | ")" | null): ValueDefinition {
    const start = this.#offset;
    const values = [this.#parseAllOf(terminator)];
    while (this.#consumeExact("||")) {
      values.push(this.#parseAllOf(terminator));
    }
    return this.#combine("any-of", values, start);
  }

  #parseAllOf(terminator: "]" | ")" | null): ValueDefinition {
    const start = this.#offset;
    const values = [this.#parseSequence(terminator)];
    while (this.#consumeExact("&&")) {
      values.push(this.#parseSequence(terminator));
    }
    return this.#combine("all-of", values, start);
  }

  #parseSequence(terminator: "]" | ")" | null): ValueDefinition {
    const start = this.#offset;
    const values: ValueDefinition[] = [];
    while (this.#canStartTerm(terminator)) {
      values.push(this.#parseTerm(terminator));
    }
    if (values.length === 0) {
      throw this.#error("Expected a grammar component");
    }
    return this.#combine("sequence", values, start);
  }

  #parseTerm(terminator: "]" | ")" | null): ValueDefinition {
    let value = this.#parsePrimary(terminator);
    let refinableCommaMultiplier = false;
    for (;;) {
      this.#skipWhitespace();
      const start = value.span.start;
      if (this.#consumeExact("*")) {
        value = this.#multiplier(value, 0, INFINITY, "space", start);
        refinableCommaMultiplier = false;
      } else if (this.#consumeExact("+")) {
        value = this.#multiplier(value, 1, INFINITY, "space", start);
        refinableCommaMultiplier = false;
      } else if (this.#consumeExact("?")) {
        value = this.#multiplier(value, 0, 1, "space", start);
        refinableCommaMultiplier = false;
      } else if (this.#consumeExact("#")) {
        value = this.#multiplier(value, 1, INFINITY, "comma", start);
        refinableCommaMultiplier = true;
      } else {
        const repetition = this.#consumeRepetition();
        if (repetition !== null) {
          if (refinableCommaMultiplier && value.kind === "multiplier") {
            value = this.#multiplier(
              value.value,
              repetition.minimum,
              repetition.maximum,
              "comma",
              start
            );
          } else {
            value = this.#multiplier(
              value,
              repetition.minimum,
              repetition.maximum,
              "space",
              start
            );
          }
          refinableCommaMultiplier = false;
        } else if (this.#consumeExact("!")) {
          value = Object.freeze({
            kind: "required",
            value,
            span: freezeSpan(start, this.#offset)
          });
          refinableCommaMultiplier = false;
        } else {
          return value;
        }
      }
    }
  }

  #parsePrimary(terminator: "]" | ")" | null): ValueDefinition {
    this.#skipWhitespace();
    const start = this.#offset;
    if (this.#consumeExact("[")) {
      const value = this.#parseOneOf("]");
      this.#skipWhitespace();
      this.#expect("]");
      return this.#withSpan(value, start, this.#offset);
    }
    if (this.#consumeExact("<")) {
      return this.#consumeReference(start);
    }
    if (this.#next === "'") {
      return this.#consumeQuotedLiteral();
    }
    if (this.#isLiteralPunctuation(this.#next)) {
      this.#offset += 1;
      return Object.freeze({
        kind: "literal",
        value: this.#source.slice(start, this.#offset),
        span: freezeSpan(start, this.#offset)
      });
    }

    const name = this.#consumeWord(terminator);
    if (name.length === 0) {
      throw this.#error("Expected a grammar component");
    }
    if (this.#next === "(") {
      this.#offset += 1;
      this.#skipWhitespace();
      let body: ValueDefinition | null = null;
      if (!this.#at(")")) {
        body = this.#parseOneOf(")");
        this.#skipWhitespace();
      }
      this.#expect(")");
      return Object.freeze({
        kind: "function",
        name,
        value: body,
        span: freezeSpan(start, this.#offset)
      });
    }
    return Object.freeze({
      kind: "keyword",
      value: name,
      span: freezeSpan(start, this.#offset)
    });
  }

  #consumeReference(start: number): GrammarReference {
    let quote: "'" | null = null;
    let nestedAngles = 0;
    let content = "";
    while (!this.#done) {
      const character = this.#next;
      if (character === "'" && quote === null) {
        quote = "'";
      } else if (character === "'" && quote === "'") {
        quote = null;
      } else if (quote === null) {
        if (character === "<") {
          nestedAngles += 1;
        } else if (character === ">") {
          if (nestedAngles === 0) break;
          nestedAngles -= 1;
        }
      }
      content += character;
      this.#offset += 1;
    }
    if (this.#done) {
      throw this.#error("Unterminated type reference");
    }
    this.#offset += 1;

    const trimmed = content.trim();
    if (trimmed.length === 0) {
      throw new CssValueDefinitionSyntaxError("A type reference cannot be empty", start);
    }
    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      const name = trimmed.slice(1, -1);
      if (name.length === 0 || name.includes("'")) {
        throw new CssValueDefinitionSyntaxError(
          "Invalid property reference",
          start
        );
      }
      return Object.freeze({
        kind: "reference",
        name,
        referenceKind: "property",
        constraint: null,
        span: freezeSpan(start, this.#offset)
      });
    }

    const range = this.#splitConstraint(trimmed);
    const name = range.name.endsWith("()") ? range.name.slice(0, -2) : range.name;
    if (name.length === 0) {
      throw new CssValueDefinitionSyntaxError("A type name cannot be empty", start);
    }
    return Object.freeze({
      kind: "reference",
      name,
      referenceKind: range.name.endsWith("()") ? "function" : "type",
      constraint: range.constraint,
      span: freezeSpan(start, this.#offset)
    });
  }

  #splitConstraint(value: string): {
    readonly name: string;
    readonly constraint: GrammarReferenceConstraint | null;
  } {
    if (!value.endsWith("]")) {
      return { name: value, constraint: null };
    }
    const opening = value.indexOf("[");
    if (opening < 1) {
      return { name: value, constraint: null };
    }
    const name = value.slice(0, opening).trim();
    const constraint = value.slice(opening + 1, -1).trim();
    const comma = constraint.indexOf(",");
    if (comma < 0) {
      return {
        name,
        constraint: Object.freeze({ kind: "parameter", value: constraint })
      };
    }
    const minimum = this.#parseRangeBoundary(constraint.slice(0, comma).trim());
    const maximum = this.#parseRangeBoundary(constraint.slice(comma + 1).trim());
    return {
      name,
      constraint: Object.freeze({
        kind: "range",
        value: Object.freeze({ minimum, maximum })
      })
    };
  }

  #parseRangeBoundary(source: string): GrammarRangeBoundary {
    if (source === "∞") {
      return boundary(INFINITY, null);
    }
    if (source === "-∞") {
      return boundary(Number.NEGATIVE_INFINITY, null);
    }
    const match = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))([A-Za-z%]*)$/u.exec(source);
    if (match === null) {
      throw this.#error(`Invalid range boundary ${JSON.stringify(source)}`);
    }
    const numeric = match[1];
    const unit = match[2];
    if (numeric === undefined || unit === undefined) {
      throw this.#error(`Invalid range boundary ${JSON.stringify(source)}`);
    }
    return boundary(Number(numeric), unit.length === 0 ? null : unit);
  }

  #consumeQuotedLiteral(): GrammarLiteral {
    const start = this.#offset;
    this.#offset += 1;
    const contentStart = this.#offset;
    while (!this.#done && this.#next !== "'") {
      this.#offset += 1;
    }
    if (this.#done) {
      throw this.#error("Unterminated quoted literal");
    }
    const value = this.#source.slice(contentStart, this.#offset);
    this.#offset += 1;
    if (value.length === 0) {
      throw new CssValueDefinitionSyntaxError(
        "A quoted literal cannot be empty",
        start
      );
    }
    return Object.freeze({
      kind: "literal",
      value,
      span: freezeSpan(start, this.#offset)
    });
  }

  #consumeWord(terminator: "]" | ")" | null): string {
    const start = this.#offset;
    while (!this.#done) {
      const character = this.#next;
      if (
        this.#isWhitespace(character) ||
        character === "<" ||
        character === "'" ||
        character === "[" ||
        character === "(" ||
        character === "|" ||
        character === "&" ||
        character === "?" ||
        character === "*" ||
        character === "+" ||
        character === "#" ||
        character === "!" ||
        character === "," ||
        character === "/" ||
        character === ":" ||
        character === ";" ||
        character === "{" ||
        character === "}" ||
        character === terminator
      ) {
        break;
      }
      this.#offset += 1;
    }
    return this.#source.slice(start, this.#offset);
  }

  #consumeRepetition(): {
    readonly minimum: number;
    readonly maximum: number;
  } | null {
    this.#skipWhitespace();
    const remainder = this.#source.slice(this.#offset);
    const match = /^\{\s*(\d+)\s*(?:,\s*(\d*)\s*)?\}/u.exec(remainder);
    if (match === null) {
      return null;
    }
    const minimumText = match[1];
    const maximumText = match[2];
    if (minimumText === undefined) {
      return null;
    }
    const minimum = Number(minimumText);
    const maximum = maximumText === undefined
      ? minimum
      : maximumText.length === 0
        ? INFINITY
        : Number(maximumText);
    if (minimum > maximum) {
      throw this.#error("A repetition minimum cannot exceed its maximum");
    }
    this.#offset += match[0].length;
    return { minimum, maximum };
  }

  #multiplier(
    value: ValueDefinition,
    minimum: number,
    maximum: number,
    separator: "space" | "comma",
    start: number
  ): GrammarMultiplier {
    return Object.freeze({
      kind: "multiplier",
      value,
      minimum,
      maximum,
      separator,
      span: freezeSpan(start, this.#offset)
    });
  }

  #combine(
    kind: GrammarCombination["kind"],
    values: ValueDefinition[],
    start: number
  ): ValueDefinition {
    if (values.length === 1) {
      const value = values[0];
      if (value === undefined) {
        throw this.#error("Expected a grammar component");
      }
      return value;
    }
    return Object.freeze({
      kind,
      values: freezeValues(values),
      span: freezeSpan(start, this.#offset)
    });
  }

  #withSpan(value: ValueDefinition, start: number, end: number): ValueDefinition {
    return Object.freeze({ ...value, span: freezeSpan(start, end) });
  }

  #canStartTerm(terminator: "]" | ")" | null): boolean {
    this.#skipWhitespace();
    if (this.#done || this.#next === terminator) {
      return false;
    }
    if (this.#source.startsWith("&&", this.#offset)) {
      return false;
    }
    return this.#next !== "|";
  }

  #consumeCombinator(single: string, longer: string): boolean {
    this.#skipWhitespace();
    if (
      this.#source.startsWith(longer, this.#offset) ||
      !this.#source.startsWith(single, this.#offset)
    ) {
      return false;
    }
    this.#offset += single.length;
    this.#skipWhitespace();
    return true;
  }

  #consumeExact(value: string): boolean {
    this.#skipWhitespace();
    if (!this.#source.startsWith(value, this.#offset)) {
      return false;
    }
    this.#offset += value.length;
    this.#skipWhitespace();
    return true;
  }

  #expect(value: string): void {
    if (!this.#consumeExact(value)) {
      throw this.#error(`Expected ${JSON.stringify(value)}`);
    }
  }

  #at(value: string): boolean {
    return this.#next === value;
  }

  #isLiteralPunctuation(value: string): boolean {
    return value === "," ||
      value === "/" ||
      value === ":" ||
      value === ";" ||
      value === "{" ||
      value === "}" ||
      value === "(";
  }

  #skipWhitespace(): void {
    while (!this.#done && this.#isWhitespace(this.#next)) {
      this.#offset += 1;
    }
  }

  #isWhitespace(value: string): boolean {
    return value === " " || value === "\n" || value === "\r" || value === "\t";
  }

  #error(message: string): CssValueDefinitionSyntaxError {
    return new CssValueDefinitionSyntaxError(message, this.#offset);
  }

  get #done(): boolean {
    return this.#offset >= this.#source.length;
  }

  get #next(): string {
    return this.#source[this.#offset] ?? "";
  }
}

export function parseCssValueDefinition(source: string): ValueDefinition {
  return new ValueDefinitionParser(source).parse();
}
