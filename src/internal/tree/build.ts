import {
  parse as parseCssTree,
  toPlainObject,
  type CssTreeParseContext,
  type CssTreeParseError
} from "../csstree-runtime.js";

import type { CssAstNode, TreeBuildOptions, TreeBuildResult, TreeBuilderError } from "./types.js";

const SUPPORTED_CONTEXTS = new Set<CssTreeParseContext>([
  "stylesheet",
  "atrule",
  "atrulePrelude",
  "mediaQueryList",
  "mediaQuery",
  "condition",
  "rule",
  "selectorList",
  "selector",
  "block",
  "declarationList",
  "declaration",
  "value"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function toTreeError(error: CssTreeParseError): TreeBuilderError {
  return {
    message: error.message,
    ...(typeof error.formattedMessage === "string" ? { formattedMessage: error.formattedMessage } : {}),
    ...(typeof error.offset === "number" ? { offset: error.offset } : {}),
    ...(typeof error.line === "number" ? { line: error.line } : {}),
    ...(typeof error.column === "number" ? { column: error.column } : {})
  };
}

function fallbackRoot(context: CssTreeParseContext, input: string): CssAstNode {
  if (context === "stylesheet") {
    return {
      type: "StyleSheet",
      loc: null,
      children: [
        {
          type: "Raw",
          loc: null,
          value: input
        }
      ]
    };
  }

  return {
    type: "Raw",
    loc: null,
    value: input
  };
}

export function buildTreeFromCss(input: string, options: TreeBuildOptions = {}): TreeBuildResult {
  const context = options.context ?? "stylesheet";
  if (!SUPPORTED_CONTEXTS.has(context)) {
    throw new Error(`Unsupported parse context: ${context}`);
  }

  const errors: TreeBuilderError[] = [];

  try {
    const parsed = parseCssTree(input, {
      context,
      positions: options.captureSpans ?? false,
      onParseError(error) {
        const next = toTreeError(error);
        errors.push(next);
        options.onParseError?.(next);
      }
    });

    const plain = toPlainObject(parsed);
    if (!isRecord(plain) || typeof plain["type"] !== "string") {
      throw new Error("CSSTree parse result was not a valid AST node");
    }

    return {
      root: plain as CssAstNode,
      errors
    };
  } catch (error) {
    const fallbackError: TreeBuilderError = {
      message: error instanceof Error ? error.message : String(error)
    };
    errors.push(fallbackError);
    options.onParseError?.(fallbackError);

    return {
      root: fallbackRoot(context, input),
      errors
    };
  }
}
