import { fromPlainObject, generate } from "../csstree-runtime.js";

import type { CssAstNode } from "../tree/types.js";

const METADATA_KEYS = new Set(["id", "span", "spanProvenance"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function hasLeadingWhitespace(value: string): boolean {
  if (value.length === 0) {
    return false;
  }
  const first = value.charCodeAt(0);
  return first === 0x20 || first === 0x09 || first === 0x0a || first === 0x0d || first === 0x0c;
}

function normalizeCustomPropertyValue(valueNode: Record<string, unknown>): void {
  const valueType = valueNode["type"];

  if (valueType === "Raw") {
    const rawValue = valueNode["value"];
    if (typeof rawValue !== "string" || rawValue.length === 0 || hasLeadingWhitespace(rawValue)) {
      return;
    }
    valueNode["value"] = ` ${rawValue}`;
    return;
  }

  if (valueType !== "Value") {
    return;
  }

  const children = valueNode["children"];
  if (!Array.isArray(children) || children.length === 0) {
    return;
  }

  const [first] = children as unknown[];
  if (isRecord(first) && first["type"] === "WhiteSpace") {
    return;
  }

  children.unshift({
    type: "WhiteSpace",
    loc: null,
    value: " "
  });
}

function normalizeCustomPropertySpacing(node: unknown): void {
  if (Array.isArray(node)) {
    for (const entry of node) {
      normalizeCustomPropertySpacing(entry);
    }
    return;
  }

  if (!isRecord(node)) {
    return;
  }

  if (node["type"] === "Declaration") {
    const property = node["property"];
    const value = node["value"];
    if (typeof property === "string" && property.startsWith("--") && isRecord(value)) {
      normalizeCustomPropertyValue(value);
    }
  }

  for (const entry of Object.values(node)) {
    normalizeCustomPropertySpacing(entry);
  }
}

function sanitizeForRuntime(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForRuntime(entry));
  }

  if (!isRecord(value)) {
    return value;
  }

  const next: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (METADATA_KEYS.has(key)) {
      continue;
    }
    next[key] = sanitizeForRuntime(entry);
  }
  return next;
}

export function sanitizeCssNode(node: unknown): Record<string, unknown> {
  const sanitized = sanitizeForRuntime(node);
  if (!isRecord(sanitized)) {
    throw new Error("CSS node must be an object");
  }
  return sanitized;
}

export function serializeTreeNode(node: CssAstNode | Record<string, unknown>): string {
  const sanitized = sanitizeCssNode(node);
  normalizeCustomPropertySpacing(sanitized);
  const runtimeNode = fromPlainObject(sanitized);
  return generate(runtimeNode);
}
