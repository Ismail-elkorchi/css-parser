import { ResourceGuard } from "../syntax/resources.ts";
import { parseCssComponentValues } from "../syntax/parser.ts";

import type {
  ComponentValue,
  CssFunction,
  CssSimpleBlock
} from "../syntax/ast.ts";
import type {
  ResourceUsage,
  SourcePosition,
  SourceSpan
} from "../syntax/types.ts";
import type {
  ComplexSelector,
  CompoundSelector,
  SelectorAttribute,
  SelectorAttributeMatcher,
  SelectorCombinator,
  SelectorDiagnostic,
  SelectorDiagnosticCode,
  SelectorList,
  SelectorParseResult,
  SelectorParserOptions,
  SelectorPseudoArgument,
  SelectorPseudoClass,
  SelectorPseudoElement,
  SelectorType,
  SimpleSelector
} from "./types.ts";

const SELECTORS = "https://drafts.csswg.org/selectors/";
const LEGACY_PSEUDO_ELEMENTS = new Set([
  "after",
  "before",
  "first-letter",
  "first-line"
]);
const FORGIVING_SELECTOR_LIST_PSEUDOS = new Set(["is", "where"]);
const NTH_PSEUDOS = new Set([
  "nth-child",
  "nth-last-child",
  "nth-of-type",
  "nth-last-of-type"
]);
const FUNCTIONAL_PSEUDO_CLASSES = new Set([
  "dir",
  "has",
  "is",
  "lang",
  "not",
  ...NTH_PSEUDOS,
  "where"
]);
const NON_FUNCTIONAL_PSEUDO_CLASSES = new Set([
  "active",
  "any-link",
  "autofill",
  "buffering",
  "checked",
  "default",
  "defined",
  "disabled",
  "empty",
  "enabled",
  "first-child",
  "first-of-type",
  "focus",
  "focus-visible",
  "focus-within",
  "fullscreen",
  "hover",
  "in-range",
  "indeterminate",
  "invalid",
  "last-child",
  "last-of-type",
  "link",
  "modal",
  "muted",
  "only-child",
  "only-of-type",
  "open",
  "optional",
  "out-of-range",
  "paused",
  "picture-in-picture",
  "placeholder-shown",
  "playing",
  "popover-open",
  "read-only",
  "read-write",
  "required",
  "root",
  "scope",
  "seeking",
  "stalled",
  "target",
  "unchecked",
  "user-invalid",
  "user-valid",
  "valid",
  "visited",
  "volume-locked"
]);
const FUNCTIONAL_PSEUDO_ELEMENTS = new Set(["part", "slotted"]);
const NON_FUNCTIONAL_PSEUDO_ELEMENTS = new Set(LEGACY_PSEUDO_ELEMENTS);

interface ParsedList {
  readonly selectors: readonly ComplexSelector[];
  readonly valid: boolean;
}

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function frozen<T>(values: T[]): readonly T[] {
  return Object.freeze(values);
}

function isDelim(value: ComponentValue | undefined, codePoint: number): boolean {
  return value?.kind === "delim" && value.value === codePoint;
}

function position(offset: number, line: number, column: number): SourcePosition {
  return Object.freeze({ offset, line, column });
}

function emptySpan(): SourceSpan {
  const start = position(0, 1, 1);
  return Object.freeze({ start, end: start });
}

function coveringSpan(values: readonly ComponentValue[]): SourceSpan {
  const first = values[0];
  const last = values.at(-1);
  return first === undefined || last === undefined
    ? emptySpan()
    : Object.freeze({ start: first.span.start, end: last.span.end });
}

function joinedSpan(start: SourceSpan, end: SourceSpan): SourceSpan {
  return Object.freeze({ start: start.start, end: end.end });
}

function splitAtCommas(
  values: readonly ComponentValue[]
): readonly (readonly ComponentValue[])[] {
  const groups: ComponentValue[][] = [[]];
  for (const value of values) {
    if (value.kind === "comma") groups.push([]);
    else groups.at(-1)?.push(value);
  }
  return Object.freeze(groups.map((group) => Object.freeze(group)));
}

function significant(values: readonly ComponentValue[]): readonly ComponentValue[] {
  return Object.freeze(values.filter((value) => value.kind !== "whitespace"));
}

class SelectorParser {
  readonly #guard: ResourceGuard;
  readonly #diagnostics: SelectorDiagnostic[] = [];
  #depth = 0;
  #hasDepth = 0;

  constructor(
    readonly values: readonly ComponentValue[],
    options: SelectorParserOptions,
    priorUsage: ResourceUsage
  ) {
    this.#guard = new ResourceGuard(
      options.limits,
      options.signal,
      priorUsage
    );
  }

  parse(
    syntaxErrors: SelectorParseResult["errors"]
  ): SelectorParseResult {
    const parsed = this.#parseList(this.values, false, false, true);
    const errors = Object.freeze([...syntaxErrors, ...this.#diagnostics]);
    if (
      syntaxErrors.length > 0 ||
      !parsed.valid ||
      parsed.selectors.length === 0
    ) {
      return Object.freeze({
        ok: false,
        errors,
        usage: this.#usage()
      });
    }
    const value: SelectorList = Object.freeze({
      selectors: parsed.selectors,
      span: coveringSpan(this.values)
    });
    this.#node();
    return Object.freeze({
      ok: true,
      value,
      errors,
      usage: this.#usage()
    });
  }

  #parseList(
    values: readonly ComponentValue[],
    forgiving: boolean,
    relative: boolean,
    allowPseudoElements: boolean
  ): ParsedList {
    return this.#nested(() => {
      const selectors: ComplexSelector[] = [];
      let valid = true;
      for (const group of splitAtCommas(values)) {
        this.#guard.step();
        const diagnosticStart = this.#diagnostics.length;
        const localDiagnostics: SelectorDiagnostic[] = [];
        const parser = new ComplexSelectorParser(
          group,
          relative,
          allowPseudoElements,
          this.#guard,
          (code, message, span) => {
            localDiagnostics.push(Object.freeze({
              kind: "selector",
              code,
              message,
              span,
              specRef: `${SELECTORS}#grammar`
            }));
          },
          (functionBlock, kind) => this.#pseudoArgument(functionBlock, kind)
        );
        const selector = parser.parse();
        if (selector === null) {
          valid = false;
          if (forgiving) {
            this.#diagnostics.splice(diagnosticStart);
          } else {
            this.#diagnostics.push(...localDiagnostics);
          }
        } else {
          this.#diagnostics.push(...localDiagnostics);
          selectors.push(selector);
        }
      }
      return Object.freeze({
        selectors: frozen(selectors),
        valid: forgiving || valid
      });
    });
  }

  #pseudoArgument(
    value: CssFunction,
    kind: "class" | "element"
  ): SelectorPseudoArgument | null {
    const name = lowerAscii(value.name);
    if (
      (kind === "class" && NON_FUNCTIONAL_PSEUDO_CLASSES.has(name)) ||
      (kind === "element" && NON_FUNCTIONAL_PSEUDO_ELEMENTS.has(name))
    ) {
      this.#diagnostic(
        "invalid-pseudo",
        `:${kind === "element" ? ":" : ""}${name} is not functional.`,
        value.span
      );
      return null;
    }
    if (
      kind === "class" &&
      FORGIVING_SELECTOR_LIST_PSEUDOS.has(name)
    ) {
      const parsed = this.#parseList(value.value, true, false, false);
      return Object.freeze({
        kind: "selector-list",
        selectors: parsed.selectors,
        forgiving: true,
        relative: false
      });
    }
    if (kind === "class" && name === "not") {
      const parsed = this.#parseList(value.value, false, false, false);
      if (!parsed.valid || parsed.selectors.length === 0) {
        this.#diagnostic(
          "invalid-pseudo",
          ":not() requires at least one valid selector.",
          value.span
        );
        return null;
      }
      return Object.freeze({
        kind: "selector-list",
        selectors: parsed.selectors,
        forgiving: false,
        relative: false
      });
    }
    if (kind === "class" && name === "has") {
      if (this.#hasDepth > 0) {
        this.#diagnostic(
          "invalid-pseudo",
          ":has() cannot be nested.",
          value.span
        );
        return null;
      }
      this.#hasDepth += 1;
      let parsed: ParsedList;
      try {
        parsed = this.#parseList(value.value, false, true, false);
      } finally {
        this.#hasDepth -= 1;
      }
      if (!parsed.valid || parsed.selectors.length === 0) {
        this.#diagnostic(
          "invalid-pseudo",
          ":has() requires at least one valid relative selector.",
          value.span
        );
        return null;
      }
      return Object.freeze({
        kind: "selector-list",
        selectors: parsed.selectors,
        forgiving: false,
        relative: true
      });
    }
    if (kind === "class" && NTH_PSEUDOS.has(name)) {
      return this.#parseNth(value);
    }
    if (kind === "class" && name === "dir") {
      const parts = significant(value.value);
      if (parts.length !== 1 || parts[0]?.kind !== "ident") {
        this.#diagnostic(
          "invalid-pseudo",
          ":dir() requires one identifier.",
          value.span
        );
        return null;
      }
    }
    if (kind === "class" && name === "lang") {
      const ranges = splitAtCommas(value.value);
      if (
        ranges.length === 0 ||
        ranges.some((range) => {
          const parts = significant(range);
          return parts.length !== 1 ||
            (parts[0]?.kind !== "ident" && parts[0]?.kind !== "string");
        })
      ) {
        this.#diagnostic(
          "invalid-pseudo",
          ":lang() requires a comma-separated list of identifiers or strings.",
          value.span
        );
        return null;
      }
    }
    if (kind === "element" && name === "slotted") {
      const parsed = this.#parseList(value.value, false, false, false);
      if (!parsed.valid || parsed.selectors.length !== 1) {
        this.#diagnostic(
          "invalid-pseudo",
          "::slotted() requires one compound selector.",
          value.span
        );
        return null;
      }
      return Object.freeze({
        kind: "selector-list",
        selectors: parsed.selectors,
        forgiving: false,
        relative: false
      });
    }
    return Object.freeze({
      kind: "raw",
      value: Object.freeze([...value.value])
    });
  }

  #parseNth(value: CssFunction): SelectorPseudoArgument | null {
    const parts = [...value.value];
    let ofIndex = -1;
    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      if (part?.kind === "ident" && lowerAscii(part.value) === "of") {
        ofIndex = index;
        break;
      }
    }
    const formulaValues = significant(
      ofIndex < 0 ? parts : parts.slice(0, ofIndex)
    );
    const formula = formulaValues.map((part) => {
      if (part.kind === "ident") return part.value;
      if (part.kind === "number") return part.representation;
      if (part.kind === "dimension") {
        return `${part.representation}${part.unit}`;
      }
      return part.kind === "delim"
        ? String.fromCodePoint(part.value)
        : "";
    }).join("");
    const coefficients = parseAnPlusB(formula);
    if (coefficients === null) {
      this.#diagnostic(
        "invalid-nth",
        "Expected an An+B expression.",
        value.span
      );
      return null;
    }
    let of: readonly ComplexSelector[] = Object.freeze([]);
    if (ofIndex >= 0) {
      const name = lowerAscii(value.name);
      if (name !== "nth-child" && name !== "nth-last-child") {
        this.#diagnostic(
          "invalid-nth",
          `:${name}() does not accept an of selector list.`,
          value.span
        );
        return null;
      }
      const parsed = this.#parseList(
        parts.slice(ofIndex + 1),
        false,
        false,
        false
      );
      if (!parsed.valid || parsed.selectors.length === 0) {
        this.#diagnostic(
          "invalid-nth",
          "The of clause requires a selector list.",
          value.span
        );
        return null;
      }
      of = parsed.selectors;
    }
    return Object.freeze({
      kind: "nth",
      ...coefficients,
      of
    });
  }

  #diagnostic(
    code: SelectorDiagnosticCode,
    message: string,
    span: SourceSpan
  ): void {
    this.#diagnostics.push(Object.freeze({
      kind: "selector",
      code,
      message,
      span,
      specRef: `${SELECTORS}#grammar`
    }));
  }

  #node(): void {
    this.#guard.createNode(this.#depth);
  }

  #usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  #nested<T>(operation: () => T): T {
    this.#depth += 1;
    try {
      this.#guard.createNode(this.#depth);
      return operation();
    } finally {
      this.#depth -= 1;
    }
  }
}

type DiagnosticSink = (
  code: SelectorDiagnosticCode,
  message: string,
  span: SourceSpan
) => void;

type PseudoArgumentParser = (
  value: CssFunction,
  kind: "class" | "element"
) => SelectorPseudoArgument | null;

class ComplexSelectorParser {
  readonly #values: readonly ComponentValue[];
  #index = 0;
  #failed = false;

  constructor(
    values: readonly ComponentValue[],
    readonly relative: boolean,
    readonly allowPseudoElements: boolean,
    readonly guard: ResourceGuard,
    readonly diagnostic: DiagnosticSink,
    readonly pseudoArgument: PseudoArgumentParser
  ) {
    this.#values = values;
  }

  parse(): ComplexSelector | null {
    this.#skipWhitespace();
    const leadingCombinator = this.relative ? this.#explicitCombinator() : null;
    if (leadingCombinator !== null) this.#skipWhitespace();

    const compounds: CompoundSelector[] = [];
    const combinators: SelectorCombinator[] = [];
    const first = this.#compound();
    if (first === null) {
      if (!this.#failed) {
        this.#fail(
          "empty-selector",
          "Expected a compound selector.",
          coveringSpan(this.#values)
        );
      }
      return null;
    }
    compounds.push(first);

    while (this.#index < this.#values.length) {
      const hadWhitespace = this.#skipWhitespace();
      let combinator = this.#explicitCombinator();
      if (combinator === null && hadWhitespace) combinator = " ";
      if (combinator === null) {
        this.#fail(
          "invalid-selector",
          "Expected a combinator or the end of the selector.",
          this.#currentSpan()
        );
        return null;
      }
      this.#skipWhitespace();
      const compound = this.#compound();
      if (compound === null) {
        this.#fail(
          "invalid-combinator",
          "A combinator must be followed by a compound selector.",
          this.#currentSpan()
        );
        return null;
      }
      combinators.push(combinator);
      compounds.push(compound);
    }

    const span = joinedSpan(
      compounds[0]?.span ?? coveringSpan(this.#values),
      compounds.at(-1)?.span ?? coveringSpan(this.#values)
    );
    this.guard.createNode(1);
    return Object.freeze({
      leadingCombinator,
      compounds: frozen(compounds),
      combinators: frozen(combinators),
      span
    });
  }

  #compound(): CompoundSelector | null {
    const start = this.#index;
    const type = this.#typeSelector();
    const simples: SimpleSelector[] = [];
    let pseudoElementSeen = false;
    for (;;) {
      this.guard.step();
      const simple = this.#simpleSelector();
      if (simple === null) break;
      if (
        pseudoElementSeen &&
        simple.kind !== "pseudo-class" &&
        simple.kind !== "pseudo-element"
      ) {
        this.#fail(
          "invalid-selector",
          "Only pseudo selectors may follow a pseudo-element.",
          simple.span
        );
        return null;
      }
      if (
        !this.allowPseudoElements &&
        simple.kind === "pseudo-element"
      ) {
        this.#fail(
          "invalid-selector",
          "Pseudo-elements are not allowed in this selector list.",
          simple.span
        );
        return null;
      }
      if (simple.kind === "pseudo-element") pseudoElementSeen = true;
      simples.push(simple);
    }
    if (type === null && simples.length === 0) return null;
    const consumed = this.#values.slice(start, this.#index);
    this.guard.createNode(2);
    return Object.freeze({
      type,
      simples: frozen(simples),
      span: coveringSpan(consumed)
    });
  }

  #typeSelector(): SelectorType | null {
    const start = this.#index;
    const first = this.#values[this.#index];
    const firstName = this.#nameOrStar(first);
    const startsEmptyNamespace = isDelim(first, 0x7c);
    if (firstName === null && !startsEmptyNamespace) return null;

    let namespace: string | null = null;
    let name = firstName;
    if (startsEmptyNamespace) {
      namespace = "";
      this.#index += 1;
      name = this.#nameOrStar(this.#values[this.#index]);
      if (name === null) {
        this.#index = start;
        return null;
      }
      this.#index += 1;
    } else if (
      isDelim(this.#values[this.#index + 1], 0x7c) &&
      !isDelim(this.#values[this.#index + 2], 0x7c)
    ) {
      namespace = firstName;
      this.#index += 2;
      name = this.#nameOrStar(this.#values[this.#index]);
      if (name === null) {
        this.#index = start;
        return null;
      }
      this.#index += 1;
    } else {
      this.#index += 1;
    }
    if (name === null) {
      this.#index = start;
      return null;
    }
    const span = coveringSpan(this.#values.slice(start, this.#index));
    this.guard.createNode(3);
    return Object.freeze({
      kind: "type",
      namespace,
      name,
      universal: name === "*",
      span
    });
  }

  #simpleSelector(): SimpleSelector | null {
    const value = this.#values[this.#index];
    if (value?.kind === "hash" && value.hashType === "id") {
      this.#index += 1;
      this.guard.createNode(3);
      return Object.freeze({ kind: "id", value: value.value, span: value.span });
    }
    if (isDelim(value, 0x2e)) {
      const name = this.#values[this.#index + 1];
      if (name?.kind !== "ident") return null;
      this.#index += 2;
      this.guard.createNode(3);
      return Object.freeze({
        kind: "class",
        value: name.value,
        span: joinedSpan(value?.span ?? name.span, name.span)
      });
    }
    if (
      value?.kind === "simple-block" &&
      value.associatedToken === "open-square"
    ) {
      this.#index += 1;
      return this.#attribute(value);
    }
    if (value?.kind === "colon") return this.#pseudo();
    if (isDelim(value, 0x26)) {
      this.#index += 1;
      this.guard.createNode(3);
      return Object.freeze({ kind: "nesting", span: value?.span ?? emptySpan() });
    }
    return null;
  }

  #attribute(block: CssSimpleBlock): SelectorAttribute | null {
    const parts = significant(block.value);
    let index = 0;
    const firstName = this.#nameOrStar(parts[index]);
    const emptyNamespace = isDelim(parts[index], 0x7c);
    let namespace: string | null = null;
    let name = firstName;
    if (emptyNamespace) {
      namespace = "";
      index += 1;
      name = this.#nameOrStar(parts[index]);
      index += 1;
    } else if (
      isDelim(parts[index + 1], 0x7c) &&
      !isDelim(parts[index + 2], 0x3d)
    ) {
      namespace = firstName;
      index += 2;
      name = this.#nameOrStar(parts[index]);
      index += 1;
    } else {
      index += 1;
    }
    if (name === null || name === "*") {
      this.#fail(
        "invalid-attribute",
        "Expected an attribute name.",
        block.span
      );
      return null;
    }

    let matcher: SelectorAttributeMatcher | null = null;
    let expected: string | null = null;
    let modifier: "i" | "s" | null = null;
    if (index < parts.length) {
      const first = parts[index];
      const second = parts[index + 1];
      if (isDelim(first, 0x3d)) {
        matcher = "=";
        index += 1;
      } else if (
        first?.kind === "delim" &&
        [0x7e, 0x7c, 0x5e, 0x24, 0x2a].includes(first.value) &&
        isDelim(second, 0x3d)
      ) {
        matcher = `${String.fromCodePoint(first.value)}=` as
          SelectorAttributeMatcher;
        index += 2;
      } else {
        this.#fail(
          "invalid-attribute",
          "Expected an attribute matcher.",
          block.span
        );
        return null;
      }
      const expectedToken = parts[index];
      if (
        expectedToken?.kind !== "ident" &&
        expectedToken?.kind !== "string"
      ) {
        this.#fail(
          "invalid-attribute",
          "Expected an identifier or string attribute value.",
          block.span
        );
        return null;
      }
      expected = expectedToken.value;
      index += 1;
      const modifierToken = parts[index];
      if (modifierToken?.kind === "ident") {
        const candidate = lowerAscii(modifierToken.value);
        if (candidate === "i" || candidate === "s") {
          modifier = candidate;
          index += 1;
        }
      }
    }
    if (index !== parts.length) {
      this.#fail(
        "invalid-attribute",
        "Unexpected content in attribute selector.",
        block.span
      );
      return null;
    }
    this.guard.createNode(3);
    return Object.freeze({
      kind: "attribute",
      namespace,
      name,
      matcher,
      value: expected,
      modifier,
      span: block.span
    });
  }

  #pseudo(): SelectorPseudoClass | SelectorPseudoElement | null {
    const firstColon = this.#values[this.#index];
    let kind: "class" | "element" = "class";
    this.#index += 1;
    if (this.#values[this.#index]?.kind === "colon") {
      kind = "element";
      this.#index += 1;
    }
    const nameValue = this.#values[this.#index];
    if (nameValue?.kind !== "ident" && nameValue?.kind !== "function-block") {
      this.#fail(
        "invalid-pseudo",
        "Expected a pseudo selector name.",
        firstColon?.span ?? emptySpan()
      );
      return null;
    }
    this.#index += 1;
    const name = lowerAscii(
      nameValue.kind === "ident" ? nameValue.value : nameValue.name
    );
    if (kind === "class" && LEGACY_PSEUDO_ELEMENTS.has(name)) kind = "element";
    if (
      nameValue.kind === "ident" &&
      ((kind === "class" && FUNCTIONAL_PSEUDO_CLASSES.has(name)) ||
        (kind === "element" && FUNCTIONAL_PSEUDO_ELEMENTS.has(name)))
    ) {
      this.#fail(
        "invalid-pseudo",
        `:${kind === "element" ? ":" : ""}${name} requires arguments.`,
        nameValue.span
      );
      return null;
    }
    const argument = nameValue.kind === "function-block"
      ? this.pseudoArgument(nameValue, kind)
      : Object.freeze({ kind: "none" } as const);
    if (argument === null) {
      this.#failed = true;
      return null;
    }
    const span = joinedSpan(firstColon?.span ?? nameValue.span, nameValue.span);
    this.guard.createNode(3);
    return kind === "class"
      ? Object.freeze({
          kind: "pseudo-class",
          name,
          argument,
          span
        })
      : Object.freeze({
          kind: "pseudo-element",
          name,
          argument,
          span
        });
  }

  #explicitCombinator(): SelectorCombinator | null {
    const value = this.#values[this.#index];
    if (isDelim(value, 0x3e)) {
      this.#index += 1;
      return ">";
    }
    if (isDelim(value, 0x2b)) {
      this.#index += 1;
      return "+";
    }
    if (isDelim(value, 0x7e)) {
      this.#index += 1;
      return "~";
    }
    return null;
  }

  #skipWhitespace(): boolean {
    const start = this.#index;
    while (this.#values[this.#index]?.kind === "whitespace") {
      this.guard.step();
      this.#index += 1;
    }
    return this.#index !== start;
  }

  #nameOrStar(value: ComponentValue | undefined): string | null {
    if (value?.kind === "ident") return value.value;
    if (isDelim(value, 0x2a)) return "*";
    return null;
  }

  #currentSpan(): SourceSpan {
    return this.#values[this.#index]?.span ??
      this.#values.at(-1)?.span ??
      emptySpan();
  }

  #fail(
    code: SelectorDiagnosticCode,
    message: string,
    span: SourceSpan
  ): void {
    this.#failed = true;
    this.diagnostic(code, message, span);
  }
}

function parseAnPlusB(source: string): {
  readonly a: number;
  readonly b: number;
} | null {
  const normalized = lowerAscii(source);
  if (normalized === "odd") return Object.freeze({ a: 2, b: 1 });
  if (normalized === "even") return Object.freeze({ a: 2, b: 0 });
  if (/^[+-]?\d+$/u.test(normalized)) {
    return Object.freeze({ a: 0, b: Number(normalized) });
  }
  const match = /^([+-]?\d*)n(?:([+-]\d+))?$/u.exec(normalized);
  if (match === null) return null;
  const coefficient = match[1];
  const a = coefficient === "" || coefficient === "+"
    ? 1
    : coefficient === "-"
      ? -1
      : Number(coefficient);
  return Object.freeze({ a, b: Number(match[2] ?? 0) });
}

export function parseSelectorList(
  source: string,
  options: SelectorParserOptions = {}
): SelectorParseResult {
  const syntax = parseCssComponentValues(source, {
    ...(options.limits === undefined ? {} : { limits: options.limits }),
    ...(options.signal === undefined ? {} : { signal: options.signal })
  });
  if (!syntax.ok) {
    return Object.freeze({
      ok: false,
      errors: syntax.errors,
      usage: syntax.usage
    });
  }
  const parser = new SelectorParser(
    syntax.value,
    options,
    syntax.usage
  );
  return parser.parse(syntax.errors);
}
