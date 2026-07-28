import { ResourceGuard } from "./resources.ts";

import type { InputCodePoint, SourcePosition } from "./types.ts";

const CARRIAGE_RETURN = 0x0d;
const FORM_FEED = 0x0c;
const LINE_FEED = 0x0a;
const NULL = 0x00;
const REPLACEMENT_CHARACTER = 0xfffd;

export interface InputCursorMark {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

interface DecodedCodePoint {
  readonly value: number;
  readonly endOffset: number;
}

function decodeAt(input: string, offset: number): DecodedCodePoint | null {
  if (offset >= input.length) {
    return null;
  }

  const first = input.charCodeAt(offset);
  if (first === CARRIAGE_RETURN) {
    const following = input.charCodeAt(offset + 1);
    return {
      value: LINE_FEED,
      endOffset: following === LINE_FEED ? offset + 2 : offset + 1
    };
  }
  if (first === FORM_FEED) {
    return { value: LINE_FEED, endOffset: offset + 1 };
  }
  if (first === NULL) {
    return { value: REPLACEMENT_CHARACTER, endOffset: offset + 1 };
  }
  if (first >= 0xd800 && first <= 0xdbff) {
    const second = input.charCodeAt(offset + 1);
    if (second >= 0xdc00 && second <= 0xdfff) {
      return {
        value: ((first - 0xd800) * 0x400) + (second - 0xdc00) + 0x10000,
        endOffset: offset + 2
      };
    }
    return { value: REPLACEMENT_CHARACTER, endOffset: offset + 1 };
  }
  if (first >= 0xdc00 && first <= 0xdfff) {
    return { value: REPLACEMENT_CHARACTER, endOffset: offset + 1 };
  }
  return { value: first, endOffset: offset + 1 };
}

export class InputCursor {
  readonly #input: string;
  readonly #guard: ResourceGuard;
  #offset = 0;
  #line = 1;
  #column = 1;
  #lastMark: InputCursorMark | null = null;

  constructor(input: string, guard = new ResourceGuard()) {
    this.#input = input;
    this.#guard = guard;
  }

  get sourceLength(): number {
    return this.#input.length;
  }

  get offset(): number {
    return this.#offset;
  }

  get eof(): boolean {
    return this.#offset >= this.#input.length;
  }

  position(): SourcePosition {
    return Object.freeze({
      offset: this.#offset,
      line: this.#line,
      column: this.#column
    });
  }

  mark(): InputCursorMark {
    return Object.freeze({
      offset: this.#offset,
      line: this.#line,
      column: this.#column
    });
  }

  restore(mark: InputCursorMark): void {
    if (
      !Number.isSafeInteger(mark.offset) ||
      mark.offset < 0 ||
      mark.offset > this.#input.length ||
      !Number.isSafeInteger(mark.line) ||
      mark.line < 1 ||
      !Number.isSafeInteger(mark.column) ||
      mark.column < 1
    ) {
      throw new RangeError("invalid input cursor mark");
    }
    this.#offset = mark.offset;
    this.#line = mark.line;
    this.#column = mark.column;
    this.#lastMark = null;
  }

  peek(distance = 0): number | null {
    if (!Number.isSafeInteger(distance) || distance < 0) {
      throw new RangeError("peek distance must be a non-negative safe integer");
    }
    this.#guard.step();
    let offset = this.#offset;
    let decoded: DecodedCodePoint | null = null;
    for (let index = 0; index <= distance; index += 1) {
      decoded = decodeAt(this.#input, offset);
      if (decoded === null) {
        return null;
      }
      offset = decoded.endOffset;
    }
    return decoded?.value ?? null;
  }

  consume(): InputCodePoint | null {
    this.#guard.step();
    const decoded = decodeAt(this.#input, this.#offset);
    if (decoded === null) {
      this.#lastMark = null;
      return null;
    }

    const start = this.position();
    this.#lastMark = this.mark();
    this.#offset = decoded.endOffset;
    if (decoded.value === LINE_FEED) {
      this.#line += 1;
      this.#column = 1;
    } else {
      this.#column += 1;
    }

    return Object.freeze({
      value: decoded.value,
      span: Object.freeze({
        start,
        end: this.position()
      })
    });
  }

  reconsume(): void {
    if (this.#lastMark === null) {
      throw new Error("no consumed code point is available to reconsume");
    }
    const mark = this.#lastMark;
    this.restore(mark);
  }

  slice(start: number, end: number): string {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      start < 0 ||
      end < start ||
      end > this.#input.length
    ) {
      throw new RangeError("invalid source slice");
    }
    return this.#input.slice(start, end);
  }
}

export function preprocessCssInput(input: string, guard = new ResourceGuard()): string {
  const cursor = new InputCursor(input, guard);
  let result = "";
  for (;;) {
    const point = cursor.consume();
    if (point === null) {
      return result;
    }
    result += String.fromCodePoint(point.value);
  }
}
