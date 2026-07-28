import type { CssToken, EofToken } from "./tokens.ts";
import type { SourcePosition, SourceSpan } from "./types.ts";

function position(offset: number, line: number, column: number): SourcePosition {
  return Object.freeze({ offset, line, column });
}

function eofAt(tokens: readonly CssToken[], explicitEnd?: SourcePosition): EofToken {
  const last = tokens.at(-1);
  const end = explicitEnd ?? last?.span.end ?? position(0, 1, 1);
  return Object.freeze({
    kind: "eof",
    span: Object.freeze({ start: end, end })
  });
}

export class TokenStream {
  readonly #tokens: readonly CssToken[];
  readonly #eof: EofToken;
  readonly #marks: number[] = [];
  #index = 0;

  constructor(tokens: readonly CssToken[], end?: SourcePosition) {
    this.#tokens = tokens;
    this.#eof = eofAt(tokens, end);
  }

  get index(): number {
    return this.#index;
  }

  get empty(): boolean {
    return this.next.kind === "eof";
  }

  get next(): CssToken {
    return this.#tokens[this.#index] ?? this.#eof;
  }

  consume(): CssToken {
    const token = this.next;
    if (token.kind !== "eof") this.#index += 1;
    return token;
  }

  discard(): void {
    if (!this.empty) this.#index += 1;
  }

  discardWhitespace(): void {
    while (this.next.kind === "whitespace") this.#index += 1;
  }

  mark(): void {
    this.#marks.push(this.#index);
  }

  restore(): void {
    const index = this.#marks.pop();
    if (index === undefined) throw new Error("no token-stream mark is available to restore");
    this.#index = index;
  }

  discardMark(): void {
    if (this.#marks.pop() === undefined) {
      throw new Error("no token-stream mark is available to discard");
    }
  }

  spanFrom(startIndex: number): SourceSpan {
    if (!Number.isSafeInteger(startIndex) || startIndex < 0 || startIndex > this.#tokens.length) {
      throw new RangeError("invalid token-stream start index");
    }
    const start = this.#tokens[startIndex]?.span.start ?? this.#eof.span.start;
    const end = this.#tokens[this.#index - 1]?.span.end ?? start;
    return Object.freeze({ start, end });
  }
}
