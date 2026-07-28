import { validateCssPropertyValue } from "../properties/matcher.ts";
import { resolveCssProperty } from "../properties/registry.ts";
import {
  parseCssBlockContents,
  parseCssDeclaration
} from "../syntax/parser.ts";
import { serializeCssSyntax } from "../syntax/serialize.ts";

import type {
  ComponentValue,
  CssDeclaration
} from "../syntax/ast.ts";
import type { PropertyValidationOptions } from "../properties/matcher.ts";
import type { SyntaxParserOptions } from "../syntax/parser.ts";

export interface CssDeclarationBlockOptions {
  readonly parser?: SyntaxParserOptions;
  readonly validation?: PropertyValidationOptions;
}

export interface CssomDeclaration {
  readonly name: string;
  readonly value: string;
  readonly important: boolean;
}

export type CssDeclarationMutation =
  | {
      readonly status: "set";
      readonly declaration: CssomDeclaration;
      readonly previousValue: string;
    }
  | {
      readonly status: "removed";
      readonly previousValue: string;
    }
  | {
      readonly status: "ignored";
      readonly reason: "invalid-priority" | "unknown-property" | "invalid-value";
    };

interface StoredDeclaration {
  readonly key: string;
  readonly declaration: CssomDeclaration;
}

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function propertyIdentity(name: string): {
  readonly key: string;
  readonly name: string;
} | null {
  const property = resolveCssProperty(name);
  if (property === null) return null;
  if (property.kind === "custom") {
    return Object.freeze({ key: property.name, name: property.name });
  }
  return Object.freeze({
    key: lowerAscii(property.name),
    name: property.name
  });
}

function significant(
  values: readonly ComponentValue[]
): readonly ComponentValue[] {
  return values.filter((value) => value.kind !== "whitespace");
}

function serializeCssomValue(declaration: CssDeclaration): string {
  if (declaration.name.startsWith("--")) {
    return declaration.originalText ?? "";
  }

  let result = "";
  for (const value of significant(declaration.value)) {
    const serialized = serializeCssSyntax(value);
    if (value.kind === "comma") {
      result = result.trimEnd();
      result += ",";
    } else {
      if (result.length > 0) result += " ";
      result += serialized;
    }
  }
  return result.trim();
}

function normalizedDeclaration(
  declaration: CssDeclaration,
  options: CssDeclarationBlockOptions
): StoredDeclaration | null {
  const validation = validateCssPropertyValue(
    declaration,
    options.validation
  );
  if (validation.status === "invalid") return null;
  const identity = propertyIdentity(declaration.name);
  if (identity === null) return null;
  return Object.freeze({
    key: identity.key,
    declaration: Object.freeze({
      name: identity.name,
      value: serializeCssomValue(declaration),
      important: declaration.important
    })
  });
}

function parseMutationDeclaration(
  name: string,
  value: string,
  important: boolean,
  options: CssDeclarationBlockOptions
): StoredDeclaration | null {
  const source = `${name}:${value}${important ? "!important" : ""}`;
  const result = parseCssDeclaration(source, options.parser);
  return result.ok ? normalizedDeclaration(result.value, options) : null;
}

function priorityStatus(priority: string): boolean | null {
  const normalized = lowerAscii(priority.trim());
  if (normalized === "") return false;
  if (normalized === "important") return true;
  return null;
}

export class CssDeclarationBlock {
  readonly #options: CssDeclarationBlockOptions;
  readonly #entries = new Map<string, CssomDeclaration>();

  private constructor(options: CssDeclarationBlockOptions) {
    this.#options = options;
  }

  static parse(
    input: string,
    options: CssDeclarationBlockOptions = {}
  ): CssDeclarationBlock {
    const block = new CssDeclarationBlock(options);
    const parsed = parseCssBlockContents(input, options.parser);
    if (!parsed.ok) return block;
    for (const item of parsed.value) {
      if (item.kind !== "declaration") continue;
      const normalized = normalizedDeclaration(item, options);
      if (normalized === null) continue;
      block.#setNormalized(normalized);
    }
    return block;
  }

  static empty(
    options: CssDeclarationBlockOptions = {}
  ): CssDeclarationBlock {
    return new CssDeclarationBlock(options);
  }

  get length(): number {
    return this.#entries.size;
  }

  get declarations(): readonly CssomDeclaration[] {
    return Object.freeze([...this.#entries.values()]);
  }

  get cssText(): string {
    return [...this.#entries.values()]
      .map((declaration) =>
        `${declaration.name}: ${declaration.value}` +
        `${declaration.important ? " !important" : ""};`
      )
      .join(" ");
  }

  item(index: number): string {
    if (!Number.isInteger(index) || index < 0) return "";
    return [...this.#entries.values()][index]?.name ?? "";
  }

  getPropertyValue(name: string): string {
    const identity = propertyIdentity(name);
    return identity === null
      ? ""
      : this.#entries.get(identity.key)?.value ?? "";
  }

  getPropertyPriority(name: string): "" | "important" {
    const identity = propertyIdentity(name);
    return identity !== null && this.#entries.get(identity.key)?.important === true
      ? "important"
      : "";
  }

  setProperty(
    name: string,
    value: string,
    priority = ""
  ): CssDeclarationMutation {
    const important = priorityStatus(priority);
    if (important === null) {
      return Object.freeze({
        status: "ignored",
        reason: "invalid-priority"
      });
    }
    if (value.length === 0) {
      const previousValue = this.removeProperty(name);
      return Object.freeze({
        status: "removed",
        previousValue
      });
    }
    const identity = propertyIdentity(name);
    if (identity === null) {
      return Object.freeze({
        status: "ignored",
        reason: "unknown-property"
      });
    }
    const normalized = parseMutationDeclaration(
      name,
      value,
      important,
      this.#options
    );
    if (normalized === null) {
      return Object.freeze({
        status: "ignored",
        reason: "invalid-value"
      });
    }
    const previousValue = this.#entries.get(identity.key)?.value ?? "";
    this.#entries.set(normalized.key, normalized.declaration);
    return Object.freeze({
      status: "set",
      declaration: normalized.declaration,
      previousValue
    });
  }

  removeProperty(name: string): string {
    const identity = propertyIdentity(name);
    if (identity === null) return "";
    const previous = this.#entries.get(identity.key);
    this.#entries.delete(identity.key);
    return previous?.value ?? "";
  }

  #setNormalized(normalized: StoredDeclaration): void {
    const previous = this.#entries.get(normalized.key);
    if (
      previous?.important === true &&
      !normalized.declaration.important
    ) {
      return;
    }
    this.#entries.set(normalized.key, normalized.declaration);
  }
}
