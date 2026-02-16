import { tokenNames, tokenize as tokenizeWithCssTree } from "../csstree-runtime.js";

import type { CssTokenInternal, TokenizeOptions, TokenizeResult, TokenizerParseError } from "./tokens.js";

function normalizeTokenKind(rawKind: string): string {
  return rawKind.endsWith("-token") ? rawKind.slice(0, -6) : rawKind;
}

export function tokenize(input: string, options: TokenizeOptions = {}): TokenizeResult {
  const startedAt = Date.now();
  const tokens: CssTokenInternal[] = [];
  const errors: TokenizerParseError[] = [];

  tokenizeWithCssTree(input, (type, start, end) => {
    const rawKind = tokenNames[type] ?? `token-${String(type)}`;
    const kind = normalizeTokenKind(rawKind);

    tokens.push({
      type,
      kind,
      rawKind,
      value: input.slice(start, end),
      start,
      end
    });
  });

  const maxTokens = options.budgets?.maxTokens;
  if (maxTokens !== undefined && tokens.length > maxTokens) {
    errors.push({
      code: "max-tokens-exceeded",
      index: tokens[maxTokens]?.start ?? input.length
    });
  }

  const maxTimeMs = options.budgets?.maxTimeMs;
  if (maxTimeMs !== undefined && Date.now() - startedAt > maxTimeMs) {
    errors.push({
      code: "soft-time-budget-exceeded",
      index: input.length
    });
  }

  return {
    tokens: Object.freeze(tokens),
    errors: Object.freeze(errors)
  };
}
