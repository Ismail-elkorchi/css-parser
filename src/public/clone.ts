import type {
  ComponentValue,
  CssFunction,
  CssSimpleBlock,
  PreservedToken
} from "../internal/syntax/ast.ts";
import { ResourceGuard } from "../internal/syntax/resources.ts";
import type {
  ParserResourceLimits,
  SourcePosition,
  SourceSpan
} from "../internal/syntax/types.ts";
import { CssTreeStructureError } from "./traversal.ts";

export interface CloneCssComponentValuesOptions {
  readonly limits?: Pick<
    ParserResourceLimits,
    "maxTokens" | "maxNodes" | "maxDepth" | "maxSteps"
  >;
  readonly signal?: AbortSignal;
}

function clonePosition(position: SourcePosition): SourcePosition {
  return Object.freeze({
    offset: position.offset,
    line: position.line,
    column: position.column
  });
}

function cloneSpan(span: SourceSpan): SourceSpan {
  return Object.freeze({
    start: clonePosition(span.start),
    end: clonePosition(span.end)
  });
}

interface CloneState {
  readonly active: WeakSet<object>;
  readonly guard: ResourceGuard;
  nextNodeId: number;
}

function enter(value: object, state: CloneState): void {
  if (state.active.has(value)) throw new CssTreeStructureError("cycle");
  state.active.add(value);
}

function takeNodeId(state: CloneState): number {
  const id = state.nextNodeId;
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new RangeError("The cloned component-value tree has too many structural nodes");
  }
  state.nextNodeId += 1;
  return id;
}

function cloneToken(value: PreservedToken): PreservedToken {
  return Object.freeze({ ...value, span: cloneSpan(value.span) });
}

function cloneValues(
  values: readonly ComponentValue[],
  depth: number,
  state: CloneState
): readonly ComponentValue[] {
  state.guard.step();
  enter(values, state);
  try {
    return Object.freeze(values.map((value) => cloneValue(value, depth, state)));
  } finally {
    state.active.delete(values);
  }
}

function cloneValue(
  value: ComponentValue,
  depth: number,
  state: CloneState
): ComponentValue {
  state.guard.step();
  enter(value, state);
  try {
    if (value.kind === "function-block") {
      state.guard.createNode(depth);
      const cloned: CssFunction = Object.freeze({
        kind: value.kind,
        id: takeNodeId(state),
        span: cloneSpan(value.span),
        name: value.name,
        value: cloneValues(value.value, depth + 1, state)
      });
      return cloned;
    }
    if (value.kind === "simple-block") {
      state.guard.createNode(depth);
      const cloned: CssSimpleBlock = Object.freeze({
        kind: value.kind,
        id: takeNodeId(state),
        span: cloneSpan(value.span),
        associatedToken: value.associatedToken,
        value: cloneValues(value.value, depth + 1, state)
      });
      return cloned;
    }
    state.guard.emitToken();
    return cloneToken(value);
  } finally {
    state.active.delete(value);
  }
}

/**
 * Clones an acyclic component-value graph into an independent syntax tree.
 *
 * Every occurrence receives fresh object identity. Function and simple-block
 * nodes also receive deterministic, tree-local identifiers in depth-first
 * order. Shared input nodes are intentionally unfolded; cycles are rejected.
 */
export function cloneCssComponentValues(
  values: readonly ComponentValue[],
  options: CloneCssComponentValuesOptions = {}
): readonly ComponentValue[] {
  const state: CloneState = {
    active: new WeakSet(),
    guard: new ResourceGuard(options.limits, options.signal),
    nextNodeId: 1
  };
  return cloneValues(values, 0, state);
}
