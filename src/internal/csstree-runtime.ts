// Vendored CSSTree runtime entrypoint.
// @ts-expect-error Vendored JS module does not include local .d.ts in this repository.
import * as runtime from "./vendor/csstree/csstree.esm.js";

export type CssTreeParseContext =
  | "stylesheet"
  | "atrule"
  | "atrulePrelude"
  | "mediaQueryList"
  | "mediaQuery"
  | "condition"
  | "rule"
  | "selectorList"
  | "selector"
  | "block"
  | "declarationList"
  | "declaration"
  | "value";

export interface CssTreeParseError {
  readonly message: string;
  readonly formattedMessage?: string;
  readonly offset?: number;
  readonly line?: number;
  readonly column?: number;
}

export interface CssTreeParseOptions {
  readonly context?: CssTreeParseContext;
  readonly positions?: boolean;
  readonly onParseError?: (error: CssTreeParseError) => void;
}

type CssTreeRuntimeFacade = {
  parse(source: string, options?: CssTreeParseOptions): unknown;
  generate(ast: unknown): string;
  tokenize(source: string, callback: (type: number, start: number, end: number) => void): void;
  toPlainObject(ast: unknown): unknown;
  fromPlainObject(ast: Record<string, unknown>): unknown;
  tokenNames: readonly string[];
  version: string;
};

const csstree = runtime as unknown as CssTreeRuntimeFacade;

export function parse(source: string, options?: CssTreeParseOptions): unknown {
  return csstree.parse(source, options);
}

export function generate(ast: unknown): string {
  return csstree.generate(ast);
}

export function tokenize(source: string, callback: (type: number, start: number, end: number) => void): void {
  csstree.tokenize(source, callback);
}

export function toPlainObject(ast: unknown): unknown {
  return csstree.toPlainObject(ast);
}

export function fromPlainObject(ast: Record<string, unknown>): unknown {
  return csstree.fromPlainObject(ast);
}

export const tokenNames = csstree.tokenNames;
export const CSSTREE_VERSION = csstree.version;
