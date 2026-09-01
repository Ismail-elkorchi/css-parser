import { CSS_WEBREF_DATA } from "../generated/css-data.ts";
import { parseCssValueDefinition } from "../grammar/value-definition.ts";
import { resolveCssProperty } from "./registry.ts";
import { ResourceGuard } from "../syntax/resources.ts";

import type { CssGrammarData } from "../grammar/catalog-types.ts";
import type {
  GrammarRange,
  GrammarReference,
  ValueDefinition
} from "../grammar/value-definition.ts";
import type {
  CssDeclaration,
  CssFunction,
  ComponentValue
} from "../syntax/ast.ts";
import type { ResourceUsage } from "../syntax/types.ts";
import type {
  CssPropertySemantics
} from "./registry.ts";

export interface PropertyValidationOptions {
  readonly maxSteps?: number;
  readonly signal?: AbortSignal;
}

export interface PropertyValidationSessionOptions extends PropertyValidationOptions {
  /** Maximum distinct canonical property/value pairs retained by this session. */
  readonly maxEntries?: number;
}

export interface PropertyValidationSessionStatistics {
  readonly entries: number;
  readonly hits: number;
  readonly misses: number;
  readonly evictions: number;
}

/**
 * Validates already parsed values and retains a bounded semantic-result cache.
 * Component-value arrays remain caller-owned: keys use their deterministic
 * structure rather than object identity, so later caller mutation cannot make
 * a cached result apply to different syntax.
 */
export interface PropertyValidationSession {
  validate(
    propertyName: string,
    value: readonly ComponentValue[]
  ): PropertyValueValidation;
  validateDeclaration(declaration: CssDeclaration): PropertyValueValidation;
  statistics(): PropertyValidationSessionStatistics;
  clear(): void;
}

interface PropertyValidationBase {
  readonly property: CssPropertySemantics | null;
  readonly usage: ResourceUsage;
}

export interface ValidPropertyValue extends PropertyValidationBase {
  readonly status: "valid";
  readonly property: CssPropertySemantics;
  readonly valueKind: "custom" | "css-wide" | "grammar";
}

export interface InvalidPropertyValue extends PropertyValidationBase {
  readonly status: "invalid";
  readonly reason: "unknown-property" | "invalid-value";
}

export interface UnsupportedPropertyValue extends PropertyValidationBase {
  readonly status: "unsupported";
  readonly property: CssPropertySemantics;
  readonly reason:
    | "missing-property-syntax"
    | "unresolved-grammar"
    | "dynamic-custom-property-reference"
    | "arbitrary-substitution";
  readonly unresolvedReferences: readonly string[];
}

export type PropertyValueValidation =
  | ValidPropertyValue
  | InvalidPropertyValue
  | UnsupportedPropertyValue;

interface MatchResult {
  readonly ends: ReadonlySet<number>;
  readonly unsupported: ReadonlySet<string>;
}

const CSS_WIDE_KEYWORDS = new Set([
  "initial",
  "inherit",
  "unset",
  "revert",
  "revert-layer",
  "revert-rule"
]);

const LENGTH_UNITS = new Set([
  "cap", "ch", "cm", "dvb", "dvh", "dvi", "dvmax", "dvmin", "dvw",
  "em", "ex", "ic", "in", "lh", "lvb", "lvh", "lvi", "lvmax", "lvmin",
  "lvw", "mm", "pc", "pt", "px", "q", "rcap", "rch", "rem", "rex", "ric",
  "rlh", "svb", "svh", "svi", "svmax", "svmin", "svw", "vb", "vh", "vi",
  "vmax", "vmin", "vw"
]);
const ANGLE_UNITS = new Set(["deg", "grad", "rad", "turn"]);
const TIME_UNITS = new Set(["ms", "s"]);
const FREQUENCY_UNITS = new Set(["hz", "khz"]);
const RESOLUTION_UNITS = new Set(["dpcm", "dpi", "dppx", "x"]);
const FLEX_UNITS = new Set(["fr"]);
const MATH_FUNCTIONS = new Set([
  "abs", "acos", "asin", "atan", "atan2", "calc", "clamp", "cos", "exp",
  "hypot", "log", "max", "min", "mod", "pow", "progress", "random",
  "random-item-mix", "rem", "round", "sign", "sin", "sqrt", "tan"
]);

type MathDimension = "number" | "percentage" | "length" | "angle" | "time" | "frequency" | "resolution" | "flex";

interface MathValue {
  readonly dimensions: ReadonlySet<MathDimension>;
  readonly number: number | null;
}

function mathValue(dimension: MathDimension, number: number | null = null): MathValue {
  return { dimensions: new Set([dimension]), number };
}

function sameDimensions(left: ReadonlySet<MathDimension>, right: ReadonlySet<MathDimension>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) if (!right.has(value)) return false;
  return true;
}

function additiveDimensions(
  left: ReadonlySet<MathDimension>,
  right: ReadonlySet<MathDimension>
): ReadonlySet<MathDimension> | null {
  if (sameDimensions(left, right)) return new Set(left);
  const combined = new Set([...left, ...right]);
  return [...combined].every((value) => value === "length" || value === "percentage")
    ? combined : null;
}

class CssMathAnalyzer {
  readonly #step: () => void;

  constructor(step: () => void) {
    this.#step = step;
  }

  analyze(value: CssFunction): MathValue | null {
    this.#step();
    const name = lowerAscii(value.name);
    if (name === "calc") return new CssMathExpressionParser(value.value, this).parse();
    if (name !== "min" && name !== "max" && name !== "clamp") return null;
    const groups: ComponentValue[][] = [[]];
    for (const component of value.value) {
      this.#step();
      if (component.kind === "comma") groups.push([]);
      else groups.at(-1)?.push(component);
    }
    if (name === "clamp" ? groups.length !== 3 : groups.length < 1) return null;
    const parsed: MathValue[] = [];
    for (const group of groups) {
      const entry = new CssMathExpressionParser(group, this).parse();
      if (entry === null) return null;
      parsed.push(entry);
    }
    let dimensions = parsed[0]?.dimensions;
    if (dimensions === undefined) return null;
    for (const entry of parsed.slice(1)) {
      const combined = additiveDimensions(dimensions, entry.dimensions);
      if (combined === null) return null;
      dimensions = combined;
    }
    return { dimensions, number: null };
  }

  primary(value: ComponentValue): MathValue | null {
    this.#step();
    if (value.kind === "number") return mathValue("number", value.value);
    if (value.kind === "percentage") return mathValue("percentage");
    if (value.kind === "dimension") {
      const unit = lowerAscii(value.unit);
      if (LENGTH_UNITS.has(unit)) return mathValue("length");
      if (ANGLE_UNITS.has(unit)) return mathValue("angle");
      if (TIME_UNITS.has(unit)) return mathValue("time");
      if (FREQUENCY_UNITS.has(unit)) return mathValue("frequency");
      if (RESOLUTION_UNITS.has(unit)) return mathValue("resolution");
      if (FLEX_UNITS.has(unit)) return mathValue("flex");
      return null;
    }
    if (value.kind === "simple-block" && value.associatedToken === "open-paren") {
      return new CssMathExpressionParser(value.value, this).parse();
    }
    if (value.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) {
      return this.analyze(value);
    }
    return null;
  }
}

class CssMathExpressionParser {
  readonly #values: readonly ComponentValue[];
  readonly #analyzer: CssMathAnalyzer;
  #position = 0;

  constructor(values: readonly ComponentValue[], analyzer: CssMathAnalyzer) {
    this.#values = values.filter((value) => value.kind !== "whitespace");
    this.#analyzer = analyzer;
  }

  parse(): MathValue | null {
    const value = this.#sum();
    return value !== null && this.#position === this.#values.length ? value : null;
  }

  #peek(): ComponentValue | undefined { return this.#values[this.#position]; }

  #consume(): ComponentValue | undefined {
    const value = this.#peek();
    this.#position += 1;
    return value;
  }

  #delimiter(code: number): boolean {
    const value = this.#peek();
    if (value?.kind !== "delim" || value.value !== code) return false;
    this.#position += 1;
    return true;
  }

  #sum(): MathValue | null {
    let left = this.#product();
    if (left === null) return null;
    for (;;) {
      const operator = this.#peek();
      if (operator?.kind !== "delim" || (operator.value !== 43 && operator.value !== 45)) return left;
      this.#position += 1;
      const right = this.#product();
      if (right === null) return null;
      const dimensions = additiveDimensions(left.dimensions, right.dimensions);
      if (dimensions === null) return null;
      const number: number | null = left.number !== null && right.number !== null
        ? operator.value === 43 ? left.number + right.number : left.number - right.number
        : null;
      left = { dimensions, number };
    }
  }

  #product(): MathValue | null {
    let left = this.#unary();
    if (left === null) return null;
    for (;;) {
      const operator = this.#peek();
      if (operator?.kind !== "delim" || (operator.value !== 42 && operator.value !== 47)) return left;
      this.#position += 1;
      const right = this.#unary();
      if (right === null) return null;
      const leftNumber: boolean = left.dimensions.size === 1 && left.dimensions.has("number");
      const rightNumber: boolean = right.dimensions.size === 1 && right.dimensions.has("number");
      if (operator.value === 42) {
        if (!leftNumber && !rightNumber) return null;
        if (leftNumber && rightNumber) {
          left = mathValue("number", left.number === null || right.number === null ? null : left.number * right.number);
        } else left = leftNumber ? { dimensions: right.dimensions, number: null } : { dimensions: left.dimensions, number: null };
      } else {
        if (!rightNumber || right.number === 0) return null;
        left = leftNumber
          ? mathValue("number", left.number === null || right.number === null ? null : left.number / right.number)
          : { dimensions: left.dimensions, number: null };
      }
    }
  }

  #unary(): MathValue | null {
    if (this.#delimiter(43)) return this.#unary();
    if (this.#delimiter(45)) {
      const value = this.#unary();
      return value === null ? null : { ...value, number: value.number === null ? null : -value.number };
    }
    const value = this.#consume();
    return value === undefined ? null : this.#analyzer.primary(value);
  }
}

const BORDER_STYLES = new Set([
  "none", "hidden", "dotted", "dashed", "solid", "double", "groove",
  "ridge", "inset", "outset"
]);
const BORDER_WIDTH_KEYWORDS = new Set(["hairline", "thin", "medium", "thick"]);
const CSS_GENERIC_KEYWORD_EXCLUSIONS = new Set([...CSS_WIDE_KEYWORDS, "default"]);
const DEFAULT_MAX_STEPS = 250_000;
const PAINT_SYNTAX =
  "none | <color> | <url> [ none | <color> ]? | context-fill | context-stroke | <image> | <svg-paint>";

const TYPE_DATA = groupGrammarData(CSS_WEBREF_DATA.types);
const FUNCTION_DATA = groupGrammarData(CSS_WEBREF_DATA.functions);
const GRAMMAR_CACHE = new Map<string, ValueDefinition>();

function groupGrammarData(
  entries: readonly CssGrammarData[]
): ReadonlyMap<string, readonly CssGrammarData[]> {
  const grouped = new Map<string, CssGrammarData[]>();
  for (const entry of entries) {
    const values = grouped.get(entry.name);
    if (values === undefined) grouped.set(entry.name, [entry]);
    else values.push(entry);
  }
  return grouped;
}

function grammar(source: string): ValueDefinition {
  const cached = GRAMMAR_CACHE.get(source);
  if (cached !== undefined) return cached;
  const parsed = parseCssValueDefinition(source);
  GRAMMAR_CACHE.set(source, parsed);
  return parsed;
}

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function significant(values: readonly ComponentValue[]): readonly ComponentValue[] {
  return Object.freeze(values.filter((value) => value.kind !== "whitespace"));
}

function result(
  ends: Iterable<number> = [],
  unsupported: Iterable<string> = []
): MatchResult {
  return {
    ends: new Set(ends),
    unsupported: new Set(unsupported)
  };
}

function mergeResults(results: readonly MatchResult[]): MatchResult {
  const ends = new Set<number>();
  const unsupported = new Set<string>();
  for (const item of results) {
    for (const end of item.ends) ends.add(end);
    for (const name of item.unsupported) unsupported.add(name);
  }
  return { ends, unsupported };
}

function singleEnd(end: number): MatchResult {
  return result([end]);
}

function emptyResult(): MatchResult {
  return result();
}

class PropertyGrammarMatcher {
  readonly #guard: ResourceGuard;
  readonly #arrayIds = new WeakMap<object, number>();
  readonly #activeReferences = new Set<string>();
  #nextArrayId = 1;

  constructor(options: PropertyValidationOptions) {
    this.#guard = new ResourceGuard(
      { maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS },
      options.signal
    );
  }

  match(definition: ValueDefinition, values: readonly ComponentValue[]): MatchResult {
    return this.#match(definition, values, 0);
  }

  usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  step(): void {
    this.#guard.step();
  }

  #match(
    definition: ValueDefinition,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    this.#guard.step();
    switch (definition.kind) {
      case "keyword":
        return this.#matchKeyword(definition.value, values, start);
      case "literal":
        return this.#matchLiteral(definition.value, values, start);
      case "reference":
        return this.#matchReference(definition, values, start);
      case "function":
        return this.#matchFunction(definition.name, definition.value, values, start);
      case "sequence":
        return this.#matchSequence(definition.values, values, start);
      case "one-of":
        return mergeResults(
          definition.values.map((value) => this.#match(value, values, start))
        );
      case "all-of":
        return this.#matchShuffle(definition.values, values, start, true);
      case "any-of":
        return this.#matchShuffle(definition.values, values, start, false);
      case "multiplier":
        return this.#matchMultiplier(definition, values, start);
      case "required":
        return this.#match(definition.value, values, start);
    }
  }

  #matchSequence(
    definitions: readonly ValueDefinition[],
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const ends = new Set<number>();
    const unsupported = new Set<string>();
    this.#matchSequenceFrom(
      definitions,
      values,
      0,
      start,
      false,
      false,
      ends,
      unsupported,
      new Set()
    );
    return result(ends, unsupported);
  }

  #matchSequenceFrom(
    definitions: readonly ValueDefinition[],
    values: readonly ComponentValue[],
    definitionIndex: number,
    position: number,
    hasContent: boolean,
    contentSinceComma: boolean,
    ends: Set<number>,
    unsupported: Set<string>,
    visited: Set<string>
  ): void {
    this.#guard.step();
    const state = [
      definitionIndex,
      position,
      hasContent ? 1 : 0,
      contentSinceComma ? 1 : 0
    ].join(":");
    if (visited.has(state)) return;
    visited.add(state);
    if (definitionIndex === definitions.length) {
      ends.add(position);
      return;
    }
    const definition = definitions[definitionIndex];
    if (definition === undefined) return;
    const comma = definition.kind === "literal" && definition.value === ",";
    const matched = this.#match(definition, values, position);
    for (const name of matched.unsupported) unsupported.add(name);
    for (const end of matched.ends) {
      const consumed = end > position;
      this.#matchSequenceFrom(
        definitions,
        values,
        definitionIndex + 1,
        end,
        hasContent || (consumed && !comma),
        comma && consumed ? false : contentSinceComma || consumed,
        ends,
        unsupported,
        visited
      );
    }
    if (
      comma &&
      (
        !hasContent ||
        !contentSinceComma ||
        this.#sequenceSuffixCanBeEmpty(definitions, definitionIndex + 1)
      )
    ) {
      this.#matchSequenceFrom(
        definitions,
        values,
        definitionIndex + 1,
        position,
        hasContent,
        contentSinceComma,
        ends,
        unsupported,
        visited
      );
    }
  }

  #sequenceSuffixCanBeEmpty(
    definitions: readonly ValueDefinition[],
    start: number
  ): boolean {
    for (let index = start; index < definitions.length; index += 1) {
      const definition = definitions[index];
      if (definition !== undefined && !this.#canBeEmpty(definition)) return false;
    }
    return true;
  }

  #canBeEmpty(definition: ValueDefinition): boolean {
    switch (definition.kind) {
      case "multiplier":
        return definition.minimum === 0;
      case "sequence":
      case "all-of":
        return definition.values.every((value) => this.#canBeEmpty(value));
      case "one-of":
      case "any-of":
        return definition.values.some((value) => this.#canBeEmpty(value));
      case "required":
      case "keyword":
      case "literal":
      case "reference":
      case "function":
        return false;
    }
  }

  #matchMultiplier(
    definition: Extract<ValueDefinition, { readonly kind: "multiplier" }>,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const ends = new Set<number>();
    const unsupported = new Set<string>();
    let states = new Set([start]);
    const inputBound = values.length - start + 1;
    const maximum = Math.min(definition.maximum, inputBound);

    for (let count = 0; count <= maximum; count += 1) {
      this.#guard.step();
      if (count >= definition.minimum) {
        for (const state of states) ends.add(state);
      }
      if (count === maximum || states.size === 0) break;

      const next = new Set<number>();
      for (const state of states) {
        let itemStart = state;
        if (count > 0 && definition.separator === "comma") {
          if (values[state]?.kind !== "comma") continue;
          itemStart += 1;
        }
        const matched = this.#matchRepeatedItem(
          definition.value,
          values,
          itemStart,
          definition.separator
        );
        for (const end of matched.ends) {
          if (end > state) next.add(end);
        }
        for (const name of matched.unsupported) unsupported.add(name);
      }
      states = next;
    }
    return result(ends, unsupported);
  }

  #matchRepeatedItem(
    definition: ValueDefinition,
    values: readonly ComponentValue[],
    start: number,
    separator: "space" | "comma"
  ): MatchResult {
    if (separator === "space") return this.#match(definition, values, start);
    const nextComma = values.findIndex(
      (value, index) => index >= start && value.kind === "comma"
    );
    const boundary = nextComma < 0 ? values.length : nextComma;
    const item = values.slice(start, boundary);
    const isolated = this.#match(definition, item, 0);
    if (isolated.ends.has(item.length)) {
      return result([boundary], isolated.unsupported);
    }
    return mergeResults([
      result([], isolated.unsupported),
      this.#match(definition, values, start)
    ]);
  }

  #matchShuffle(
    definitions: readonly ValueDefinition[],
    values: readonly ComponentValue[],
    start: number,
    requireAll: boolean
  ): MatchResult {
    const ends = new Set<number>();
    const unsupported = new Set<string>();
    this.#permuteCombination(
      definitions,
      values,
      start,
      Array.from({ length: definitions.length }, () => false),
      0,
      requireAll,
      ends,
      unsupported,
      new Set()
    );
    return result(ends, unsupported);
  }

  #permuteCombination(
    definitions: readonly ValueDefinition[],
    values: readonly ComponentValue[],
    position: number,
    used: boolean[],
    usedCount: number,
    requireAll: boolean,
    ends: Set<number>,
    unsupported: Set<string>,
    visited: Set<string>
  ): void {
    this.#guard.step();
    const state = `${String(position)}:${used.map((value) => value ? "1" : "0").join("")}`;
    if (visited.has(state)) return;
    visited.add(state);

    if ((requireAll && usedCount === definitions.length) || (!requireAll && usedCount > 0)) {
      ends.add(position);
    }
    if (usedCount === definitions.length) return;
    for (let itemIndex = 0; itemIndex < definitions.length; itemIndex += 1) {
      if (used[itemIndex] === true) continue;
      const definition = definitions[itemIndex];
      if (definition === undefined) continue;
      const matched = this.#match(definition, values, position);
      for (const name of matched.unsupported) unsupported.add(name);
      used[itemIndex] = true;
      for (const end of matched.ends) {
        this.#permuteCombination(
          definitions,
          values,
          end,
          used,
          usedCount + 1,
          requireAll,
          ends,
          unsupported,
          visited
        );
      }
      used[itemIndex] = false;
    }
  }

  #matchKeyword(
    keyword: string,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const value = values[start];
    if (value === undefined) return emptyResult();
    if (keyword.startsWith("@")) {
      return value.kind === "at-keyword" &&
          lowerAscii(value.value) === lowerAscii(keyword.slice(1))
        ? singleEnd(start + 1)
        : emptyResult();
    }
    if (value.kind === "ident" && lowerAscii(value.value) === lowerAscii(keyword)) {
      return singleEnd(start + 1);
    }
    const numeric = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+))(%|[A-Za-z]+)?$/u.exec(keyword);
    if (numeric === null) return emptyResult();
    const numberText = numeric[1];
    const unit = numeric[2] ?? null;
    if (numberText === undefined) return emptyResult();
    const number = Number(numberText);
    if (unit === null && value.kind === "number" && value.value === number) {
      return singleEnd(start + 1);
    }
    if (unit === "%" && value.kind === "percentage" && value.value === number) {
      return singleEnd(start + 1);
    }
    return unit !== null &&
        unit !== "%" &&
        value.kind === "dimension" &&
        value.value === number &&
        lowerAscii(value.unit) === lowerAscii(unit)
      ? singleEnd(start + 1)
      : emptyResult();
  }

  #matchLiteral(
    literal: string,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const value = values[start];
    if (value === undefined) return emptyResult();
    const tokenKind = {
      ",": "comma",
      ":": "colon",
      ";": "semicolon"
    }[literal];
    if (tokenKind !== undefined) {
      return value.kind === tokenKind ? singleEnd(start + 1) : emptyResult();
    }
    if (
      literal === "(" &&
      value.kind === "simple-block" &&
      value.associatedToken === "open-paren"
    ) {
      return singleEnd(start + 1);
    }
    const codePoint = literal.codePointAt(0);
    return codePoint !== undefined &&
        String.fromCodePoint(codePoint) === literal &&
        value.kind === "delim" &&
        value.value === codePoint
      ? singleEnd(start + 1)
      : emptyResult();
  }

  #matchFunction(
    name: string,
    definition: ValueDefinition | null,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const value = values[start];
    if (
      value?.kind !== "function-block" ||
      lowerAscii(value.name) !== lowerAscii(name)
    ) {
      return emptyResult();
    }
    if (definition === null) {
      return value.value.every((item) => item.kind === "whitespace")
        ? singleEnd(start + 1)
        : emptyResult();
    }
    const contents = significant(value.value);
    const matched = this.#match(definition, contents, 0);
    return {
      ends: matched.ends.has(contents.length) ? new Set([start + 1]) : new Set(),
      unsupported: matched.unsupported
    };
  }

  #matchReference(
    reference: GrammarReference,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    const key = `${reference.referenceKind}:${reference.name}:${String(
      this.#arrayId(values)
    )}:${String(start)}`;
    if (this.#activeReferences.has(key)) {
      return result([], [`<${reference.name}>`]);
    }
    this.#activeReferences.add(key);
    try {
      if (reference.referenceKind === "property") {
        const property = resolveCssProperty(reference.name);
        if (property?.kind !== "standard" || property.syntax === null) {
          return result([], [`<'${reference.name}'>`]);
        }
        let propertyGrammar = grammar(property.syntax);
        if (
          propertyGrammar.kind === "multiplier" &&
          propertyGrammar.separator === "comma"
        ) {
          propertyGrammar = propertyGrammar.value;
        }
        return this.#match(propertyGrammar, values, start);
      }
      if (reference.referenceKind === "function") {
        return this.#matchCatalog(
          FUNCTION_DATA.get(`${reference.name}()`) ?? [],
          reference,
          values,
          start
        );
      }

      const builtin = this.#matchBuiltin(reference, values, start);
      if (builtin !== null) return builtin;
      return this.#applyReferenceRange(
        reference,
        this.#matchCatalog(
        TYPE_DATA.get(reference.name) ?? [],
        reference,
        values,
        start
        ),
        values,
        start
      );
    } finally {
      this.#activeReferences.delete(key);
    }
  }

  #matchCatalog(
    entries: readonly CssGrammarData[],
    reference: GrammarReference,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    if (reference.constraint?.kind === "parameter") {
      return result([], [`<${reference.name}[${reference.constraint.value}]>`]);
    }
    const definitions = entries
      .map((entry) => entry.syntax)
      .filter((syntax): syntax is string => syntax !== undefined);
    if (definitions.length === 0) {
      return result([], [`<${reference.name}>`]);
    }
    return mergeResults(
      definitions.map((source) => this.#match(grammar(source), values, start))
    );
  }

  #applyReferenceRange(
    reference: GrammarReference,
    matched: MatchResult,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult {
    if (reference.constraint?.kind !== "range") return matched;
    const value = values[start];
    if (value?.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) return matched;
    return value !== undefined &&
        matched.ends.has(start + 1) &&
        this.#rangeMatches(reference, value)
      ? result([start + 1], matched.unsupported)
      : result([], matched.unsupported);
  }

  #matchBuiltin(
    reference: GrammarReference,
    values: readonly ComponentValue[],
    start: number
  ): MatchResult | null {
    const value = values[start];
    const atomic = (matches: boolean): MatchResult =>
      matches && value !== undefined && this.#rangeMatches(reference, value)
        ? singleEnd(start + 1)
        : emptyResult();

    switch (reference.name) {
      case "ident":
      case "ident-token":
      case "identifier":
      case "id":
        return atomic(value?.kind === "ident");
      case "custom-ident":
        return atomic(
          value?.kind === "ident" &&
          !CSS_GENERIC_KEYWORD_EXCLUSIONS.has(lowerAscii(value.value))
        );
      case "dashed-ident":
      case "custom-property-name":
        return atomic(
          value?.kind === "ident" &&
          value.value.startsWith("--") &&
          value.value.length > 2
        );
      case "string":
      case "string-token":
        return atomic(value?.kind === "string");
      case "url":
      case "uri":
      case "url-token":
        return atomic(
          value?.kind === "url" ||
          (value?.kind === "function-block" && lowerAscii(value.name) === "url")
        );
      case "hash-token":
        return atomic(value?.kind === "hash");
      case "hex-color":
        return atomic(
          value?.kind === "hash" &&
          /^[0-9A-Fa-f]{3,4}(?:[0-9A-Fa-f]{2}){0,2}$/u.test(value.value)
        );
      case "number":
      case "number-token":
        return this.#matchNumeric(reference, value, start, false);
      case "integer":
        return this.#matchNumeric(reference, value, start, true);
      case "zero":
        return atomic(value?.kind === "number" && value.value === 0);
      case "percentage":
      case "percentage-token":
        if (value?.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) {
          return this.#matchMath(reference, value, start, new Set(["percentage"]));
        }
        return atomic(value?.kind === "percentage");
      case "dimension":
      case "dimension-token":
        return atomic(value?.kind === "dimension");
      case "length":
      case "quirky-length":
        return this.#matchDimensionType(reference, value, start, LENGTH_UNITS, true);
      case "length-percentage":
        if (value?.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) {
          return this.#matchMath(reference, value, start, new Set(["length", "percentage"]));
        }
        return atomic(
          value?.kind === "percentage" ||
          (value?.kind === "dimension" && LENGTH_UNITS.has(lowerAscii(value.unit))) ||
          (value?.kind === "number" && value.value === 0)
        );
      case "angle":
        return this.#matchDimensionType(reference, value, start, ANGLE_UNITS, false);
      case "time":
        return this.#matchDimensionType(reference, value, start, TIME_UNITS, false);
      case "frequency":
        return this.#matchDimensionType(reference, value, start, FREQUENCY_UNITS, false);
      case "resolution":
        return this.#matchDimensionType(reference, value, start, RESOLUTION_UNITS, false);
      case "flex":
        return this.#matchDimensionType(reference, value, start, FLEX_UNITS, false);
      case "unicode-range-token":
        return atomic(value?.kind === "unicode-range");
      case "at-keyword-token":
        return atomic(value?.kind === "at-keyword");
      case "function-token":
        return atomic(value?.kind === "function-block");
      case "comma-token":
        return atomic(value?.kind === "comma");
      case "colon-token":
        return atomic(value?.kind === "colon");
      case "semicolon-token":
        return atomic(value?.kind === "semicolon");
      case "delim-token":
        return atomic(value?.kind === "delim");
      case "bad-string-token":
        return atomic(value?.kind === "bad-string");
      case "bad-url-token":
        return atomic(value?.kind === "bad-url");
      case "CDO-token":
        return atomic(value?.kind === "cdo");
      case "CDC-token":
        return atomic(value?.kind === "cdc");
      case "(-token":
        return atomic(
          value?.kind === "simple-block" && value.associatedToken === "open-paren"
        );
      case "[-token":
        return atomic(
          value?.kind === "simple-block" && value.associatedToken === "open-square"
        );
      case "{-token":
        return atomic(
          value?.kind === "simple-block" && value.associatedToken === "open-curly"
        );
      case "border-style":
        return atomic(
          value?.kind === "ident" && BORDER_STYLES.has(lowerAscii(value.value))
        );
      case "border-width":
      case "line-width":
        if (
          value?.kind === "ident" &&
          BORDER_WIDTH_KEYWORDS.has(lowerAscii(value.value))
        ) {
          return singleEnd(start + 1);
        }
        return this.#matchDimensionType(reference, value, start, LENGTH_UNITS, true);
      case "line-names": {
        if (
          value?.kind !== "simple-block" ||
          value.associatedToken !== "open-square"
        ) {
          return emptyResult();
        }
        const names = significant(value.value);
        return names.every(
          (name) =>
            name.kind === "ident" &&
            !CSS_GENERIC_KEYWORD_EXCLUSIONS.has(lowerAscii(name.value))
        )
          ? singleEnd(start + 1)
          : emptyResult();
      }
      case "paint":
        return this.#match(grammar(PAINT_SYNTAX), values, start);
      case "any-value":
        return result(
          Array.from(
            { length: values.length - start + 1 },
            (_, index) => start + index
          )
        );
      case "declaration-value":
        return result(
          Array.from(
            { length: Math.max(0, values.length - start) },
            (_, index) => start + index + 1
          )
        );
      case "whitespace-token":
      case "eof-token":
      case ")-token":
      case "]-token":
      case "}-token":
        return emptyResult();
      default:
        return null;
    }
  }

  #matchNumeric(
    reference: GrammarReference,
    value: ComponentValue | undefined,
    start: number,
    integer: boolean
  ): MatchResult {
    if (value?.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) {
      const matched = this.#matchMath(reference, value, start, new Set(["number"]));
      if (!integer || !matched.ends.has(start + 1)) return matched;
      const math = new CssMathAnalyzer(() => { this.#guard.step(); }).analyze(value);
      return Number.isInteger(math?.number) ? matched : emptyResult();
    }
    return value?.kind === "number" &&
        (!integer || value.numberType === "integer") &&
        this.#rangeMatches(reference, value)
      ? singleEnd(start + 1)
      : emptyResult();
  }

  #matchDimensionType(
    reference: GrammarReference,
    value: ComponentValue | undefined,
    start: number,
    units: ReadonlySet<string>,
    acceptsZero: boolean
  ): MatchResult {
    if (value === undefined) return emptyResult();
    if (value.kind === "function-block" && MATH_FUNCTIONS.has(lowerAscii(value.name))) {
      const expected: MathDimension | null = units === LENGTH_UNITS ? "length"
        : units === ANGLE_UNITS ? "angle"
          : units === TIME_UNITS ? "time"
            : units === FREQUENCY_UNITS ? "frequency"
              : units === RESOLUTION_UNITS ? "resolution"
                : units === FLEX_UNITS ? "flex" : null;
      return expected === null
        ? result([], [`<${reference.name}:math-function>`])
        : this.#matchMath(reference, value, start, new Set([expected]));
    }
    const matches =
      (value.kind === "dimension" && units.has(lowerAscii(value.unit))) ||
      (acceptsZero && value.kind === "number" && value.value === 0);
    return matches && this.#rangeMatches(reference, value)
      ? singleEnd(start + 1)
      : emptyResult();
  }

  #matchMath(
    reference: GrammarReference,
    value: CssFunction,
    start: number,
    allowed: ReadonlySet<MathDimension>
  ): MatchResult {
    const math = new CssMathAnalyzer(() => { this.#guard.step(); }).analyze(value);
    if (math === null) return ["calc", "min", "max", "clamp"].includes(lowerAscii(value.name))
      ? emptyResult() : result([], [`<${reference.name}:math-function>`]);
    for (const dimension of math.dimensions) if (!allowed.has(dimension)) return emptyResult();
    return singleEnd(start + 1);
  }

  #rangeMatches(reference: GrammarReference, value: ComponentValue): boolean {
    if (reference.constraint?.kind !== "range") return true;
    const numeric = this.#numericValue(value, reference.constraint.value);
    return numeric !== null &&
      numeric >= reference.constraint.value.minimum.value &&
      numeric <= reference.constraint.value.maximum.value;
  }

  #numericValue(value: ComponentValue, range: GrammarRange): number | null {
    if (
      value.kind !== "number" &&
      value.kind !== "percentage" &&
      value.kind !== "dimension"
    ) {
      return null;
    }
    const boundaryUnit = range.minimum.unit ?? range.maximum.unit;
    if (boundaryUnit === null || value.kind !== "dimension") return value.value;
    return convertUnit(value.value, lowerAscii(value.unit), lowerAscii(boundaryUnit));
  }

  #arrayId(values: readonly ComponentValue[]): number {
    const existing = this.#arrayIds.get(values);
    if (existing !== undefined) return existing;
    const id = this.#nextArrayId;
    this.#nextArrayId += 1;
    this.#arrayIds.set(values, id);
    return id;
  }
}

function convertUnit(value: number, from: string, to: string): number | null {
  if (from === to) return value;
  const angleToDegrees: Readonly<Record<string, number>> = {
    deg: 1,
    grad: 0.9,
    rad: 180 / Math.PI,
    turn: 360
  };
  const timeToSeconds: Readonly<Record<string, number>> = { ms: 0.001, s: 1 };
  const frequencyToHertz: Readonly<Record<string, number>> = { hz: 1, khz: 1000 };
  const groups = [angleToDegrees, timeToSeconds, frequencyToHertz];
  for (const group of groups) {
    const sourceFactor = group[from];
    const targetFactor = group[to];
    if (sourceFactor !== undefined && targetFactor !== undefined) {
      return value * sourceFactor / targetFactor;
    }
  }
  return null;
}

function isCssWideKeyword(values: readonly ComponentValue[]): boolean {
  return (
    values.length === 1 &&
    values[0]?.kind === "ident" &&
    CSS_WIDE_KEYWORDS.has(lowerAscii(values[0].value))
  );
}

function customPropertyValueStatus(
  values: readonly ComponentValue[],
  matcher: PropertyGrammarMatcher,
  topLevel = true
): "valid" | "invalid" | "unsupported" {
  let unsupported = false;
  for (const value of values) {
    matcher.step();
    if (
      value.kind === "bad-string" ||
      value.kind === "bad-url" ||
      value.kind === "close-paren" ||
      value.kind === "close-square" ||
      value.kind === "close-curly" ||
      (topLevel && value.kind === "semicolon") ||
      (topLevel && value.kind === "delim" && value.value === 0x21)
    ) {
      return "invalid";
    }
    if (value.kind === "simple-block") {
      const child = customPropertyValueStatus(value.value, matcher, false);
      if (child === "invalid") return "invalid";
      if (child === "unsupported") unsupported = true;
    } else if (value.kind === "function-block") {
      if (lowerAscii(value.name) === "var") {
        const reference = customReferenceStatus(value);
        if (reference === "invalid") return "invalid";
        if (reference === "unsupported") unsupported = true;
      }
      const child = customPropertyValueStatus(value.value, matcher, false);
      if (child === "invalid") return "invalid";
      if (child === "unsupported") unsupported = true;
    }
  }
  return unsupported ? "unsupported" : "valid";
}

function customReferenceStatus(
  value: CssFunction
): "valid" | "invalid" | "unsupported" {
  const arguments_ = significant(value.value);
  const comma = arguments_.findIndex((argument) => argument.kind === "comma");
  const name = arguments_.slice(0, comma < 0 ? arguments_.length : comma);
  if (
    name.length === 1 &&
    name[0]?.kind === "ident" &&
    resolveCssProperty(name[0].value)?.kind === "custom"
  ) {
    return "valid";
  }
  return name.some(
    (argument) =>
      argument.kind === "function-block" &&
      lowerAscii(argument.name) === "var"
  )
    ? "unsupported"
    : "invalid";
}

function substitutionStatus(
  values: readonly ComponentValue[],
  matcher: PropertyGrammarMatcher
): "none" | "present" | "invalid" | "unsupported" {
  let found = false;
  let unsupported = false;
  for (const value of values) {
    matcher.step();
    if (value.kind === "simple-block") {
      const child = substitutionStatus(value.value, matcher);
      if (child === "invalid") return "invalid";
      if (child === "present") found = true;
      if (child === "unsupported") unsupported = true;
    } else if (value.kind === "function-block") {
      if (lowerAscii(value.name) === "var") {
        found = true;
        const reference = customReferenceStatus(value);
        if (reference === "invalid") return "invalid";
        if (reference === "unsupported") unsupported = true;
      }
      const child = substitutionStatus(value.value, matcher);
      if (child === "invalid") return "invalid";
      if (child === "present") found = true;
      if (child === "unsupported") unsupported = true;
    }
  }
  return unsupported ? "unsupported" : found ? "present" : "none";
}

function frozenUsage(matcher: PropertyGrammarMatcher): ResourceUsage {
  return matcher.usage();
}

function validateParsedPropertyValue(
  propertyName: string,
  declarationValue: readonly ComponentValue[],
  options: PropertyValidationOptions = {}
): PropertyValueValidation {
  const matcher = new PropertyGrammarMatcher(options);
  const property = resolveCssProperty(propertyName);
  if (property === null) {
    return Object.freeze({
      status: "invalid",
      reason: "unknown-property",
      property: null,
      usage: frozenUsage(matcher)
    });
  }
  if (property.kind === "custom") {
    const customStatus = customPropertyValueStatus(declarationValue, matcher);
    if (customStatus === "invalid") {
      return Object.freeze({
        status: "invalid",
        reason: "invalid-value",
        property,
        usage: frozenUsage(matcher)
      });
    }
    if (customStatus === "unsupported") {
      return Object.freeze({
        status: "unsupported",
        property,
        reason: "dynamic-custom-property-reference",
        unresolvedReferences: Object.freeze(["var(dynamic-name)"]),
        usage: frozenUsage(matcher)
      });
    }
    return Object.freeze({
      status: "valid",
      property,
      valueKind: "custom",
      usage: frozenUsage(matcher)
    });
  }

  const values = significant(declarationValue);
  if (isCssWideKeyword(values)) {
    return Object.freeze({
      status: "valid",
      property,
      valueKind: "css-wide",
      usage: frozenUsage(matcher)
    });
  }
  const substitution = substitutionStatus(values, matcher);
  if (substitution === "invalid") {
    return Object.freeze({
      status: "invalid",
      reason: "invalid-value",
      property,
      usage: frozenUsage(matcher)
    });
  }
  if (substitution === "present" || substitution === "unsupported") {
    return Object.freeze({
      status: "unsupported",
      property,
      reason: "arbitrary-substitution",
      unresolvedReferences: Object.freeze([
        substitution === "unsupported" ? "var(dynamic-name)" : "var()"
      ]),
      usage: frozenUsage(matcher)
    });
  }
  if (property.syntax === null) {
    return Object.freeze({
      status: "unsupported",
      property,
      reason: "missing-property-syntax",
      unresolvedReferences: Object.freeze([]),
      usage: frozenUsage(matcher)
    });
  }

  const matched = matcher.match(grammar(property.syntax), values);
  if (matched.ends.has(values.length)) {
    return Object.freeze({
      status: "valid",
      property,
      valueKind: "grammar",
      usage: frozenUsage(matcher)
    });
  }
  if (matched.unsupported.size > 0) {
    return Object.freeze({
      status: "unsupported",
      property,
      reason: "unresolved-grammar",
      unresolvedReferences: Object.freeze([...matched.unsupported].sort()),
      usage: frozenUsage(matcher)
    });
  }
  return Object.freeze({
    status: "invalid",
    reason: "invalid-value",
    property,
    usage: frozenUsage(matcher)
  });
}

function fingerprintText(value: string): string {
  return `${String(value.length)}:${value}`;
}

function fingerprintComponentValues(
  values: readonly ComponentValue[],
  options: PropertyValidationOptions
): string {
  const guard = new ResourceGuard(
    { maxSteps: options.maxSteps ?? DEFAULT_MAX_STEPS },
    options.signal
  );
  const parts: string[] = [];
  const visit = (value: ComponentValue): void => {
    guard.step();
    parts.push(value.kind, "(");
    switch (value.kind) {
      case "ident":
      case "at-keyword":
      case "string":
      case "url":
        parts.push(fingerprintText(value.value));
        break;
      case "hash":
        parts.push(fingerprintText(value.value), value.hashType);
        break;
      case "delim":
        parts.push(String(value.value));
        break;
      case "number":
      case "percentage":
        parts.push(String(value.value), value.numberType);
        break;
      case "dimension":
        parts.push(String(value.value), value.numberType, fingerprintText(value.unit));
        break;
      case "unicode-range":
        parts.push(String(value.start), ":", String(value.end));
        break;
      case "function-block":
        parts.push(fingerprintText(value.name), "[");
        for (const child of value.value) visit(child);
        parts.push("]");
        break;
      case "simple-block":
        parts.push(value.associatedToken, "[");
        for (const child of value.value) visit(child);
        parts.push("]");
        break;
      case "bad-string":
      case "bad-url":
      case "whitespace":
      case "cdo":
      case "cdc":
      case "colon":
      case "semicolon":
      case "comma":
      case "close-square":
      case "close-paren":
      case "close-curly":
        break;
    }
    parts.push(")");
  };
  for (const value of values) visit(value);
  return parts.join("");
}

class BoundedPropertyValidationSession implements PropertyValidationSession {
  readonly #options: PropertyValidationOptions;
  readonly #maxEntries: number;
  readonly #results = new Map<string, PropertyValueValidation>();
  #hits = 0;
  #misses = 0;
  #evictions = 0;

  constructor(options: PropertyValidationSessionOptions) {
    const maxEntries = options.maxEntries ?? 1_024;
    if (!Number.isSafeInteger(maxEntries) || maxEntries < 0) {
      throw new RangeError("maxEntries must be a non-negative safe integer");
    }
    this.#maxEntries = maxEntries;
    this.#options = Object.freeze({
      ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
      ...(options.signal === undefined ? {} : { signal: options.signal })
    });
  }

  validate(
    propertyName: string,
    value: readonly ComponentValue[]
  ): PropertyValueValidation {
    const property = resolveCssProperty(propertyName);
    const identity = property === null
      ? `unknown:${fingerprintText(propertyName)}`
      : property.kind === "custom"
        ? `custom:${fingerprintText(property.name)}`
        : `standard:${fingerprintText(property.requestedName)}`;
    const key = `${identity}:${fingerprintComponentValues(value, this.#options)}`;
    const retained = this.#results.get(key);
    if (retained !== undefined) {
      this.#hits += 1;
      this.#results.delete(key);
      this.#results.set(key, retained);
      return retained;
    }
    this.#misses += 1;
    const result = validateParsedPropertyValue(propertyName, value, this.#options);
    if (this.#maxEntries > 0) {
      this.#results.set(key, result);
      if (this.#results.size > this.#maxEntries) {
        const oldest = this.#results.keys().next().value;
        if (oldest !== undefined) this.#results.delete(oldest);
        this.#evictions += 1;
      }
    }
    return result;
  }

  validateDeclaration(declaration: CssDeclaration): PropertyValueValidation {
    return this.validate(declaration.name, declaration.value);
  }

  statistics(): PropertyValidationSessionStatistics {
    return Object.freeze({
      entries: this.#results.size,
      hits: this.#hits,
      misses: this.#misses,
      evictions: this.#evictions
    });
  }

  clear(): void {
    this.#results.clear();
  }
}

export function createPropertyValidationSession(
  options: PropertyValidationSessionOptions = {}
): PropertyValidationSession {
  return new BoundedPropertyValidationSession(options);
}

export function validateCssPropertyValue(
  declaration: CssDeclaration,
  options: PropertyValidationOptions = {}
): PropertyValueValidation {
  return validateParsedPropertyValue(declaration.name, declaration.value, options);
}
