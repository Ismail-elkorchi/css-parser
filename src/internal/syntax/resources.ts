import type { ResourceLimitName, ResourceLimits, ResourceUsage } from "./types.ts";

const LIMIT_NAMES: readonly ResourceLimitName[] = [
  "maxInputBytes",
  "maxBufferedBytes",
  "maxTokens",
  "maxNodes",
  "maxDepth",
  "maxSteps"
];

export class SyntaxResourceError extends Error {
  readonly code = "CSS_RESOURCE_LIMIT_EXCEEDED";

  constructor(
    readonly limitName: ResourceLimitName,
    readonly limit: number,
    readonly actual: number
  ) {
    super(`${limitName} exceeded: limit ${String(limit)}, observed ${String(actual)}`);
    this.name = "SyntaxResourceError";
  }
}

export class SyntaxAbortError extends Error {
  readonly code = "CSS_OPERATION_ABORTED";

  constructor(readonly reason: unknown) {
    super("CSS operation aborted", reason === undefined ? undefined : { cause: reason });
    this.name = "SyntaxAbortError";
  }
}

function validateLimit(name: ResourceLimitName, value: number | undefined): void {
  if (value === undefined) {
    return;
  }
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer`);
  }
}

export class ResourceGuard {
  readonly limits: ResourceLimits;

  #inputBytes = 0;
  #maxBufferedBytes = 0;
  #tokens = 0;
  #nodes = 0;
  #maxDepth = 0;
  #steps = 0;

  constructor(
    limits: ResourceLimits = {},
    readonly signal?: AbortSignal,
    initialUsage?: ResourceUsage
  ) {
    for (const name of LIMIT_NAMES) {
      validateLimit(name, limits[name]);
    }
    this.limits = Object.freeze({ ...limits });
    if (initialUsage !== undefined) {
      this.assertObservedValue(initialUsage.inputBytes, "inputBytes");
      this.assertObservedValue(
        initialUsage.maxBufferedBytes,
        "maxBufferedBytes"
      );
      this.assertObservedValue(initialUsage.tokens, "tokens");
      this.assertObservedValue(initialUsage.nodes, "nodes");
      this.assertObservedValue(initialUsage.maxDepth, "maxDepth");
      this.assertObservedValue(initialUsage.steps, "steps");
      this.#inputBytes = initialUsage.inputBytes;
      this.#maxBufferedBytes = initialUsage.maxBufferedBytes;
      this.#tokens = initialUsage.tokens;
      this.#nodes = initialUsage.nodes;
      this.#maxDepth = initialUsage.maxDepth;
      this.#steps = initialUsage.steps;
      this.#enforce("maxInputBytes", this.#inputBytes);
      this.#enforce("maxBufferedBytes", this.#maxBufferedBytes);
      this.#enforce("maxTokens", this.#tokens);
      this.#enforce("maxNodes", this.#nodes);
      this.#enforce("maxDepth", this.#maxDepth);
      this.#enforce("maxSteps", this.#steps);
    }
    this.assertActive();
  }

  assertActive(): void {
    if (this.signal?.aborted === true) {
      throw new SyntaxAbortError(this.signal.reason);
    }
  }

  setInputBytes(value: number): void {
    this.assertObservedValue(value, "inputBytes");
    this.#inputBytes = Math.max(this.#inputBytes, value);
    this.#enforce("maxInputBytes", value);
  }

  observeBufferedBytes(value: number): void {
    this.assertObservedValue(value, "bufferedBytes");
    this.#maxBufferedBytes = Math.max(this.#maxBufferedBytes, value);
    this.#enforce("maxBufferedBytes", value);
  }

  emitToken(count = 1): void {
    this.assertIncrement(count);
    this.#tokens += count;
    this.#enforce("maxTokens", this.#tokens);
  }

  createNode(depth: number): void {
    this.assertObservedValue(depth, "depth");
    this.#nodes += 1;
    this.#maxDepth = Math.max(this.#maxDepth, depth);
    this.#enforce("maxNodes", this.#nodes);
    this.#enforce("maxDepth", depth);
  }

  step(count = 1): void {
    this.assertIncrement(count);
    this.#steps += count;
    this.#enforce("maxSteps", this.#steps);
    this.assertActive();
  }

  snapshot(): ResourceUsage {
    return Object.freeze({
      inputBytes: this.#inputBytes,
      maxBufferedBytes: this.#maxBufferedBytes,
      tokens: this.#tokens,
      nodes: this.#nodes,
      maxDepth: this.#maxDepth,
      steps: this.#steps
    });
  }

  #enforce(name: ResourceLimitName, actual: number): void {
    const limit = this.limits[name];
    if (limit !== undefined && actual > limit) {
      throw new SyntaxResourceError(name, limit, actual);
    }
  }

  assertIncrement(value: number): void {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new RangeError("resource increments must be positive safe integers");
    }
  }

  assertObservedValue(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative safe integer`);
    }
  }
}
