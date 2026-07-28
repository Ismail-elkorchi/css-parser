import { isDigit, isIdent, isIdentStart, isNonAsciiIdent } from "./characters.ts";

import type {
  ComponentValue,
  CssBlock,
  CssDeclaration,
  CssRule,
  CssStylesheet,
  PreservedToken
} from "./ast.ts";
import type { SourcePosition, SourceSpan } from "./types.ts";

export type CssSyntaxSerializable =
  | CssStylesheet
  | CssRule
  | CssBlock
  | CssDeclaration
  | ComponentValue;

export type CssSerializationErrorCode =
  | "invalid-structure"
  | "cyclic-structure"
  | "shared-structure"
  | "duplicate-node-id"
  | "unserializable-token";

export class CssSerializationError extends TypeError {
  constructor(
    readonly code: CssSerializationErrorCode,
    readonly path: string,
    message: string
  ) {
    super(`${message} at ${path}`);
    this.name = "CssSerializationError";
  }
}

type BoundaryKind =
  | PreservedToken["kind"]
  | "function"
  | "open-square"
  | "open-paren"
  | "open-curly"
  | "delim-hash"
  | "delim-minus"
  | "delim-at"
  | "delim-dot"
  | "delim-plus"
  | "delim-slash"
  | "delim-star"
  | "delim-percent"
  | "delim-less";

interface Fragment {
  readonly text: string;
  readonly first: BoundaryKind | null;
  readonly last: BoundaryKind | null;
}

interface ValidationState {
  readonly active: WeakSet<object>;
  readonly seen: WeakSet<object>;
  readonly nodeIds: Set<number>;
}

function fail(
  code: CssSerializationErrorCode,
  path: string,
  message: string
): never {
  throw new CssSerializationError(code, path, message);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    fail("invalid-structure", path, "Expected an object");
  }
  return value as Record<string, unknown>;
}

function stringField(
  value: Record<string, unknown>,
  field: string,
  path: string,
  allowEmpty = false
): string {
  const fieldValue = value[field];
  if (
    typeof fieldValue !== "string" ||
    (!allowEmpty && fieldValue.length === 0)
  ) {
    fail("invalid-structure", `${path}.${field}`, "Expected a non-empty string");
  }
  assertScalarString(fieldValue, `${path}.${field}`);
  return fieldValue;
}

function booleanField(
  value: Record<string, unknown>,
  field: string,
  path: string
): boolean {
  const fieldValue = value[field];
  if (typeof fieldValue !== "boolean") {
    fail("invalid-structure", `${path}.${field}`, "Expected a boolean");
  }
  return fieldValue;
}

function arrayField(
  value: Record<string, unknown>,
  field: string,
  path: string
): readonly unknown[] {
  const fieldValue = value[field];
  if (!Array.isArray(fieldValue)) {
    fail("invalid-structure", `${path}.${field}`, "Expected an array");
  }
  return fieldValue;
}

function assertScalarString(value: string, path: string): void {
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (
      codePoint === undefined ||
      codePoint === 0 ||
      (codePoint >= 0xd800 && codePoint <= 0xdfff)
    ) {
      fail("invalid-structure", path, "Strings must contain non-null Unicode scalar values");
    }
  }
}

function assertPosition(value: unknown, path: string): asserts value is SourcePosition {
  const position = record(value, path);
  for (const field of ["offset", "line", "column"] as const) {
    const fieldValue = position[field];
    const minimum = field === "offset" ? 0 : 1;
    if (!Number.isSafeInteger(fieldValue) || (fieldValue as number) < minimum) {
      fail("invalid-structure", `${path}.${field}`, "Expected a valid source coordinate");
    }
  }
}

function assertSpan(value: unknown, path: string): asserts value is SourceSpan {
  const span = record(value, path);
  assertPosition(span.start, `${path}.start`);
  assertPosition(span.end, `${path}.end`);
  if (span.end.offset < span.start.offset) {
    fail("invalid-structure", path, "A source span cannot end before it starts");
  }
}

function enter(value: object, path: string, state: ValidationState): void {
  if (state.active.has(value)) {
    fail("cyclic-structure", path, "CSS syntax structures must be acyclic");
  }
  if (state.seen.has(value)) {
    fail("shared-structure", path, "CSS syntax structures must be trees, not shared graphs");
  }
  state.active.add(value);
  state.seen.add(value);
}

function leave(value: object, state: ValidationState): void {
  state.active.delete(value);
}

function assertNode(
  value: Record<string, unknown>,
  path: string,
  state: ValidationState
): void {
  const id = value.id;
  if (!Number.isSafeInteger(id) || (id as number) <= 0) {
    fail("invalid-structure", `${path}.id`, "Expected a positive safe node identifier");
  }
  if (state.nodeIds.has(id as number)) {
    fail("duplicate-node-id", `${path}.id`, "Node identifiers must be unique");
  }
  state.nodeIds.add(id as number);
  assertSpan(value.span, `${path}.span`);
}

function escapeHex(codePoint: number): string {
  return `\\${codePoint.toString(16)} `;
}

function serializeIdentifier(value: string, path: string): string {
  assertScalarString(value, path);
  if (value.length === 0) {
    fail("invalid-structure", path, "Identifiers cannot be empty");
  }

  const codePoints = Array.from(value, (character) => {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) fail("invalid-structure", path, "Invalid identifier code point");
    return { character, codePoint };
  });
  if (codePoints.length === 1 && codePoints[0]?.codePoint === 0x2d) return "\\-";

  let result = "";
  for (let index = 0; index < codePoints.length; index += 1) {
    const entry = codePoints[index];
    if (entry === undefined) continue;
    const { character, codePoint } = entry;
    const mustEscapeAsHex =
      (index === 0 && isDigit(codePoint)) ||
      (
        index === 1 &&
        codePoints[0]?.codePoint === 0x2d &&
        isDigit(codePoint)
      ) ||
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0x80 && !isNonAsciiIdent(codePoint));
    if (mustEscapeAsHex) {
      result += escapeHex(codePoint);
    } else if (isIdent(codePoint)) {
      result += character;
    } else {
      result += `\\${character}`;
    }
  }
  return result;
}

function serializeNameContinuation(value: string, path: string): string {
  assertScalarString(value, path);
  let result = "";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) fail("invalid-structure", path, "Invalid name code point");
    if (
      codePoint <= 0x1f ||
      codePoint === 0x7f ||
      (codePoint >= 0x80 && !isNonAsciiIdent(codePoint))
    ) {
      result += escapeHex(codePoint);
    } else if (isIdent(codePoint)) {
      result += character;
    } else {
      result += `\\${character}`;
    }
  }
  return result;
}

function serializeUnrestrictedHash(value: string, path: string): string {
  const codePoints = Array.from(value);
  const first = codePoints.shift();
  if (first === undefined) fail("invalid-structure", path, "Hash values cannot be empty");
  const firstCodePoint = first.codePointAt(0);
  if (firstCodePoint === undefined) fail("invalid-structure", path, "Invalid hash value");
  if (isDigit(firstCodePoint)) {
    return `${first}${serializeNameContinuation(codePoints.join(""), path)}`;
  }
  const second = codePoints.shift();
  if (first !== "-" || second === undefined || !isDigit(second.codePointAt(0) ?? null)) {
    fail("invalid-structure", path, "An unrestricted hash must begin with a digit or hyphen-digit");
  }
  return `-${second}${serializeNameContinuation(codePoints.join(""), path)}`;
}

function serializeDimensionUnit(value: string, path: string): string {
  const codePoints = Array.from(value);
  const first = codePoints.shift();
  if (first === undefined) fail("invalid-structure", path, "Dimension units cannot be empty");
  const firstCodePoint = first.codePointAt(0);
  if (firstCodePoint === undefined) fail("invalid-structure", path, "Invalid dimension unit");
  return `${escapeHex(firstCodePoint)}${serializeNameContinuation(codePoints.join(""), path)}`;
}

function serializeString(value: string, path: string): string {
  assertScalarString(value, path);
  let result = "\"";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) fail("invalid-structure", path, "Invalid string code point");
    if (character === "\"" || character === "\\") {
      result += `\\${character}`;
    } else if (codePoint <= 0x1f || codePoint === 0x7f) {
      result += escapeHex(codePoint);
    } else {
      result += character;
    }
  }
  return `${result}"`;
}

function serializeUrl(value: string, path: string): string {
  assertScalarString(value, path);
  let result = "url(";
  for (const character of value) {
    const codePoint = character.codePointAt(0);
    if (codePoint === undefined) fail("invalid-structure", path, "Invalid URL code point");
    if (
      character === "\"" ||
      character === "'" ||
      character === "(" ||
      character === ")" ||
      character === "\\" ||
      codePoint <= 0x20 ||
      codePoint === 0x7f
    ) {
      result += escapeHex(codePoint);
    } else {
      result += character;
    }
  }
  return `${result})`;
}

function validateNumericToken(
  token: Record<string, unknown>,
  path: string
): string {
  const representation = stringField(token, "representation", path);
  if (!/^[+-]?(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?$/u.test(representation)) {
    fail("invalid-structure", `${path}.representation`, "Expected a CSS number representation");
  }
  const numericValue = token.value;
  if (typeof numericValue !== "number" || Number.isNaN(numericValue)) {
    fail("invalid-structure", `${path}.value`, "Expected a numeric token value");
  }
  if (!Object.is(Number(representation), numericValue)) {
    fail("invalid-structure", path, "Numeric value and representation disagree");
  }
  const numberType = token.numberType;
  if (
    numberType !== "integer" &&
    numberType !== "number"
  ) {
    fail("invalid-structure", `${path}.numberType`, "Expected a numeric type flag");
  }
  const hasFractionOrExponent = /[.eE]/u.test(representation);
  if ((numberType === "integer") === hasFractionOrExponent) {
    fail("invalid-structure", path, "Numeric representation and type flag disagree");
  }
  const expectedSign = representation.startsWith("+")
    ? "+"
    : representation.startsWith("-")
      ? "-"
      : null;
  if (token.sign !== expectedSign) {
    fail("invalid-structure", `${path}.sign`, "Numeric sign metadata is inconsistent");
  }
  return representation;
}

function fragment(
  text: string,
  first: BoundaryKind | null,
  last = first
): Fragment {
  return Object.freeze({ text, first, last });
}

function columnClass(kind: BoundaryKind): string {
  return kind;
}

function rowClass(kind: BoundaryKind): string {
  return kind;
}

function needsComment(left: BoundaryKind | null, right: BoundaryKind | null): boolean {
  if (left === null || right === null) return false;
  const row = rowClass(left);
  const column = columnClass(right);
  const identColumns = new Set([
    "ident",
    "function",
    "url",
    "bad-url",
    "delim-minus",
    "number",
    "percentage",
    "dimension",
    "cdc"
  ]);
  if (row === "ident") {
    return identColumns.has(column) || column === "open-paren";
  }
  if (row === "at-keyword" || row === "hash" || row === "dimension") {
    return identColumns.has(column);
  }
  if (row === "number") {
    return (
      column === "ident" ||
      column === "function" ||
      column === "url" ||
      column === "bad-url" ||
      column === "number" ||
      column === "percentage" ||
      column === "dimension" ||
      column === "cdc" ||
      column === "delim-percent"
    );
  }
  if (row === "delim-hash" || row === "delim-minus") {
    return identColumns.has(column);
  }
  if (row === "delim-at") {
    return (
      column === "ident" ||
      column === "function" ||
      column === "url" ||
      column === "bad-url" ||
      column === "delim-minus" ||
      column === "cdc"
    );
  }
  if (row === "delim-dot" || row === "delim-plus") {
    return column === "number" || column === "percentage" || column === "dimension";
  }
  if (row === "delim-less") return true;
  return row === "delim-slash" && column === "delim-star";
}

function joinFragments(parts: readonly Fragment[]): Fragment {
  let text = "";
  let first: BoundaryKind | null = null;
  let last: BoundaryKind | null = null;
  for (const part of parts) {
    if (part.text.length === 0) continue;
    if (needsComment(last, part.first)) text += "/**/";
    text += part.text;
    first ??= part.first;
    last = part.last;
  }
  return fragment(text, first, last);
}

function delimBoundary(value: number): BoundaryKind {
  switch (value) {
    case 0x23:
      return "delim-hash";
    case 0x2d:
      return "delim-minus";
    case 0x40:
      return "delim-at";
    case 0x2e:
      return "delim-dot";
    case 0x2b:
      return "delim-plus";
    case 0x2f:
      return "delim-slash";
    case 0x2a:
      return "delim-star";
    case 0x25:
      return "delim-percent";
    case 0x3c:
      return "delim-less";
    default:
      return "delim";
  }
}

function serializeToken(
  token: Record<string, unknown>,
  path: string
): Fragment {
  const kind = token.kind;
  assertSpan(token.span, `${path}.span`);
  switch (kind) {
    case "ident":
      return fragment(serializeIdentifier(stringField(token, "value", path), `${path}.value`), kind);
    case "at-keyword":
      return fragment(`@${serializeIdentifier(stringField(token, "value", path), `${path}.value`)}`, kind);
    case "hash": {
      const value = stringField(token, "value", path);
      const hashType = token.hashType;
      if (hashType !== "id" && hashType !== "unrestricted") {
        fail("invalid-structure", `${path}.hashType`, "Expected a hash type flag");
      }
      if (
        hashType === "unrestricted" &&
        !(/^\d/u.test(value) || /^-\d/u.test(value))
      ) {
        fail("invalid-structure", path, "An unrestricted hash must begin with a digit or hyphen-digit");
      }
      const serialized = hashType === "id"
        ? serializeIdentifier(value, `${path}.value`)
        : serializeUnrestrictedHash(value, `${path}.value`);
      return fragment(`#${serialized}`, kind);
    }
    case "string":
      return fragment(serializeString(stringField(token, "value", path, true), `${path}.value`), kind);
    case "bad-string":
      fail("unserializable-token", path, "A bad-string token has no isolated round-trip serialization");
    case "url":
      return fragment(serializeUrl(stringField(token, "value", path, true), `${path}.value`), kind);
    case "bad-url":
      return fragment("url(()", kind);
    case "delim": {
      const value = token.value;
      if (
        !Number.isSafeInteger(value) ||
        (value as number) < 1 ||
        (value as number) > 0x10ffff ||
        ((value as number) >= 0xd800 && (value as number) <= 0xdfff)
      ) {
        fail("invalid-structure", `${path}.value`, "Expected a scalar delimiter code point");
      }
      const codePoint = value as number;
      if (
        isIdentStart(codePoint) ||
        isDigit(codePoint) ||
        codePoint === 0x09 ||
        codePoint === 0x0a ||
        codePoint === 0x20 ||
        codePoint === 0x22 ||
        codePoint === 0x27 ||
        codePoint === 0x28 ||
        codePoint === 0x29 ||
        codePoint === 0x2c ||
        codePoint === 0x3a ||
        codePoint === 0x3b ||
        codePoint === 0x5b ||
        codePoint === 0x5d ||
        codePoint === 0x7b ||
        codePoint === 0x7d
      ) {
        fail("invalid-structure", `${path}.value`, "The code point cannot form a delimiter token");
      }
      const text = codePoint === 0x5c ? "\\\n" : String.fromCodePoint(codePoint);
      const boundary = delimBoundary(codePoint);
      return fragment(text, boundary);
    }
    case "number":
      return fragment(validateNumericToken(token, path), kind);
    case "percentage":
      return fragment(`${validateNumericToken(token, path)}%`, kind);
    case "dimension": {
      const number = validateNumericToken(token, path);
      const unit = stringField(token, "unit", path);
      return fragment(`${number}${serializeDimensionUnit(unit, `${path}.unit`)}`, kind);
    }
    case "unicode-range": {
      const start = token.start;
      const end = token.end;
      if (
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        (start as number) < 0 ||
        (end as number) < 0 ||
        (start as number) > 0xffffff ||
        (end as number) > 0xffffff
      ) {
        fail("invalid-structure", path, "Expected six-digit Unicode range endpoints");
      }
      const first = (start as number).toString(16).toUpperCase();
      const last = (end as number).toString(16).toUpperCase();
      return fragment(`U+${first}${start === end ? "" : `-${last}`}`, kind);
    }
    case "whitespace":
      return fragment(" ", kind);
    case "cdo":
      return fragment("<!--", kind);
    case "cdc":
      return fragment("-->", kind);
    case "colon":
      return fragment(":", kind);
    case "semicolon":
      return fragment(";", kind);
    case "comma":
      return fragment(",", kind);
    case "close-square":
      return fragment("]", kind);
    case "close-paren":
      return fragment(")", kind);
    case "close-curly":
      return fragment("}", kind);
    default:
      fail("invalid-structure", `${path}.kind`, "Unknown preserved token kind");
  }
}

function serializeArray(
  values: readonly unknown[],
  path: string,
  state: ValidationState,
  serializer: (value: unknown, path: string, state: ValidationState) => Fragment
): Fragment {
  enter(values, path, state);
  try {
    return joinFragments(
      values.map((value, index) => serializer(value, `${path}[${String(index)}]`, state))
    );
  } finally {
    leave(values, state);
  }
}

function serializeComponent(
  value: unknown,
  path: string,
  state: ValidationState
): Fragment {
  const object = record(value, path);
  enter(object, path, state);
  try {
    const kind = object.kind;
    if (kind === "function-block") {
      assertNode(object, path, state);
      const name = stringField(object, "name", path);
      const values = serializeArray(
        arrayField(object, "value", path),
        `${path}.value`,
        state,
        serializeComponent
      );
      return fragment(
        `${serializeIdentifier(name, `${path}.name`)}(${values.text})`,
        "function",
        "close-paren"
      );
    }
    if (kind === "simple-block") {
      assertNode(object, path, state);
      const associated = object.associatedToken;
      if (
        associated !== "open-square" &&
        associated !== "open-paren" &&
        associated !== "open-curly"
      ) {
        fail("invalid-structure", `${path}.associatedToken`, "Expected an opening token");
      }
      const delimiters = {
        "open-square": ["[", "]"],
        "open-paren": ["(", ")"],
        "open-curly": ["{", "}"]
      } as const;
      const values = serializeArray(
        arrayField(object, "value", path),
        `${path}.value`,
        state,
        serializeComponent
      );
      const [open, close] = delimiters[associated];
      const last = associated === "open-square"
        ? "close-square"
        : associated === "open-paren"
          ? "close-paren"
          : "close-curly";
      return fragment(`${open}${values.text}${close}`, associated, last);
    }
    return serializeToken(object, path);
  } finally {
    leave(object, state);
  }
}

function serializeDeclaration(
  object: Record<string, unknown>,
  path: string,
  state: ValidationState
): Fragment {
  assertNode(object, path, state);
  const name = stringField(object, "name", path);
  if (object.originalText !== undefined) {
    if (typeof object.originalText !== "string") {
      fail("invalid-structure", `${path}.originalText`, "Expected original text to be a string");
    }
    assertScalarString(object.originalText, `${path}.originalText`);
  }
  const values = serializeArray(
    arrayField(object, "value", path),
    `${path}.value`,
    state,
    serializeComponent
  );
  const important = booleanField(object, "important", path);
  return fragment(
    `${serializeIdentifier(name, `${path}.name`)}:${values.text}${important ? "!important" : ""};`,
    "ident",
    "semicolon"
  );
}

function serializeBlock(
  object: Record<string, unknown>,
  path: string,
  state: ValidationState
): Fragment {
  assertNode(object, path, state);
  const items = serializeArray(
    arrayField(object, "items", path),
    `${path}.items`,
    state,
    serializeBlockItem
  );
  return fragment(`{${items.text}}`, "open-curly", "close-curly");
}

function serializeAtRule(
  object: Record<string, unknown>,
  path: string,
  state: ValidationState
): Fragment {
  assertNode(object, path, state);
  const name = stringField(object, "name", path);
  const head = fragment(`@${serializeIdentifier(name, `${path}.name`)}`, "at-keyword");
  const prelude = serializeArray(
    arrayField(object, "prelude", path),
    `${path}.prelude`,
    state,
    serializeComponent
  );
  const block = object.block;
  if (block === null) {
    const joined = joinFragments([head, prelude]);
    return fragment(`${joined.text};`, joined.first, "semicolon");
  }
  const serializedBlock = serializeUnknown(block, `${path}.block`, state);
  return joinFragments([head, prelude, serializedBlock]);
}

function serializeQualifiedRule(
  object: Record<string, unknown>,
  path: string,
  state: ValidationState
): Fragment {
  assertNode(object, path, state);
  const prelude = serializeArray(
    arrayField(object, "prelude", path),
    `${path}.prelude`,
    state,
    serializeComponent
  );
  const block = serializeUnknown(object.block, `${path}.block`, state);
  return joinFragments([prelude, block]);
}

function serializeRule(
  value: unknown,
  path: string,
  state: ValidationState
): Fragment {
  const object = record(value, path);
  enter(object, path, state);
  try {
    if (object.kind === "at-rule") return serializeAtRule(object, path, state);
    if (object.kind === "qualified-rule") {
      return serializeQualifiedRule(object, path, state);
    }
    fail("invalid-structure", `${path}.kind`, "Expected a CSS rule");
  } finally {
    leave(object, state);
  }
}

function serializeBlockItem(
  value: unknown,
  path: string,
  state: ValidationState
): Fragment {
  const object = record(value, path);
  if (object.kind === "declaration") {
    enter(object, path, state);
    try {
      return serializeDeclaration(object, path, state);
    } finally {
      leave(object, state);
    }
  }
  return serializeRule(value, path, state);
}

function serializeUnknown(
  value: unknown,
  path: string,
  state: ValidationState
): Fragment {
  const object = record(value, path);
  const kind = object.kind;
  if (kind === "stylesheet") {
    enter(object, path, state);
    try {
      assertNode(object, path, state);
      return serializeArray(
        arrayField(object, "rules", path),
        `${path}.rules`,
        state,
        serializeRule
      );
    } finally {
      leave(object, state);
    }
  }
  if (kind === "at-rule" || kind === "qualified-rule") {
    return serializeRule(value, path, state);
  }
  if (kind === "block") {
    enter(object, path, state);
    try {
      return serializeBlock(object, path, state);
    } finally {
      leave(object, state);
    }
  }
  if (kind === "declaration") {
    enter(object, path, state);
    try {
      return serializeDeclaration(object, path, state);
    } finally {
      leave(object, state);
    }
  }
  return serializeComponent(value, path, state);
}

export function serializeCssSyntax(value: CssSyntaxSerializable): string;
export function serializeCssSyntax(value: unknown): string {
  const state: ValidationState = {
    active: new WeakSet(),
    seen: new WeakSet(),
    nodeIds: new Set()
  };
  return serializeUnknown(value, "$", state).text;
}
