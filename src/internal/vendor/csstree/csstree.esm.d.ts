export const version: string;
export const tokenNames: readonly string[];

export function parse(source: string, options?: object): unknown;
export function generate(ast: unknown): string;
export function tokenize(
  source: string,
  callback: (type: number, start: number, end: number) => void
): void;
export function toPlainObject(ast: unknown): unknown;
export function fromPlainObject(ast: Record<string, unknown>): unknown;
