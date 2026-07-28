import { CSS_WEBREF_DATA } from "../generated/css-data.ts";
import { tokenizeCss } from "../syntax/tokenizer.ts";

import type { CssPropertyData } from "../grammar/catalog-types.ts";

export interface CustomPropertySemantics {
  readonly kind: "custom";
  readonly name: string;
}

export interface StandardPropertySemantics {
  readonly kind: "standard";
  readonly requestedName: string;
  readonly name: string;
  readonly legacyAlias: boolean;
  readonly syntax: string | null;
  readonly styleDeclaration: readonly string[];
  readonly longhands: readonly string[];
  readonly resetLonghands: readonly string[];
  readonly initial: string | null;
  readonly appliesTo: string | null;
  readonly inherited: string | null;
  readonly percentages: string | null;
  readonly computedValue: string | null;
  readonly animationType: string | null;
  readonly canonicalOrder: string | null;
  readonly specRef: string;
}

export type CssPropertySemantics =
  | CustomPropertySemantics
  | StandardPropertySemantics;

const PROPERTY_DATA = new Map(
  CSS_WEBREF_DATA.properties.map((property) => [property.name, property])
);

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function freezeStrings(values: readonly string[] | undefined): readonly string[] {
  return Object.freeze([...(values ?? [])]);
}

function isCustomPropertyName(name: string): boolean {
  if (!name.startsWith("--") || name.length === 2) return false;
  const result = tokenizeCss(name);
  return (
    result.errors.length === 0 &&
    result.tokens.length === 1 &&
    result.tokens[0]?.kind === "ident" &&
    result.tokens[0].value === name
  );
}

function standardSemantics(
  requestedName: string,
  requested: CssPropertyData
): StandardPropertySemantics | null {
  const canonicalName = requested.legacyAliasOf ?? requested.name;
  const canonical = PROPERTY_DATA.get(canonicalName);
  if (canonical === undefined) return null;
  return Object.freeze({
    kind: "standard",
    requestedName,
    name: canonical.name,
    legacyAlias: canonical !== requested,
    syntax: canonical.syntax ?? null,
    styleDeclaration: freezeStrings(canonical.styleDeclaration),
    longhands: freezeStrings(canonical.longhands),
    resetLonghands: freezeStrings(canonical.resetLonghands),
    initial: canonical.initial ?? null,
    appliesTo: canonical.appliesTo ?? null,
    inherited: canonical.inherited ?? null,
    percentages: canonical.percentages ?? null,
    computedValue: canonical.computedValue ?? null,
    animationType: canonical.animationType ?? null,
    canonicalOrder: canonical.canonicalOrder ?? null,
    specRef: canonical.href
  });
}

export function resolveCssProperty(name: string): CssPropertySemantics | null {
  if (isCustomPropertyName(name)) {
    return Object.freeze({ kind: "custom", name });
  }
  const requestedName = lowerAscii(name);
  const requested = PROPERTY_DATA.get(requestedName);
  return requested === undefined
    ? null
    : standardSemantics(requestedName, requested);
}
