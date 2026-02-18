export interface CssTokenInternal {
  readonly type: number;
  readonly kind: string;
  readonly rawKind: string;
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

export interface TokenizerParseError {
  readonly code: string;
  readonly index: number;
}

export interface TokenizerBudgets {
  readonly maxTokens?: number;
  readonly maxTimeMs?: number;
}

export interface TokenizeOptions {
  readonly budgets?: TokenizerBudgets;
}

export interface TokenizeResult {
  readonly tokens: readonly CssTokenInternal[];
  readonly errors: readonly TokenizerParseError[];
}
