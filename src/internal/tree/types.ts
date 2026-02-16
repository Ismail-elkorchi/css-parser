import type { CssTreeParseContext } from "../csstree-runtime.js";

export interface TreeSpan {
  readonly start: number;
  readonly end: number;
}

export interface CssAstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

export interface TreeBuilderError {
  readonly message: string;
  readonly formattedMessage?: string;
  readonly offset?: number;
  readonly line?: number;
  readonly column?: number;
}

export interface TreeBuildOptions {
  readonly context?: CssTreeParseContext;
  readonly captureSpans?: boolean;
  readonly onParseError?: (error: TreeBuilderError) => void;
}

export interface TreeBuildResult {
  readonly root: CssAstNode;
  readonly errors: readonly TreeBuilderError[];
}
