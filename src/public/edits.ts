import { walkCss } from "./traversal.ts";

import type { CssStylesheet } from "../internal/syntax/ast.ts";
import type {
  CssAstNode,
  CssSourceEdit,
  PatchOperation,
  PatchPlan,
  PatchPlanningErrorCode
} from "./types.ts";

export class PatchPlanningError extends Error {
  readonly code = "CSS_PATCH_PLANNING_FAILED";

  constructor(
    readonly reason: PatchPlanningErrorCode,
    readonly target?: number
  ) {
    super(
      `Unable to plan CSS source edits: ${reason}` +
      (target === undefined ? "" : ` (node ${String(target)})`)
    );
    this.name = "PatchPlanningError";
  }
}

interface Replacement {
  readonly order: number;
  readonly target: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

function indexNodes(root: CssStylesheet): ReadonlyMap<number, CssAstNode> {
  const nodes = new Map<number, CssAstNode>();
  walkCss(root, (node) => {
    if (nodes.has(node.id)) {
      throw new PatchPlanningError("duplicate-node-id", node.id);
    }
    nodes.set(node.id, node);
  });
  return nodes;
}

function editRecord(
  value: unknown,
  order: number
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new PatchPlanningError("invalid-edit", order);
  }
  return value as Record<string, unknown>;
}

function validatedEdit(value: unknown, order: number): CssSourceEdit {
  const edit = editRecord(value, order);
  const target = edit.target;
  if (!Number.isSafeInteger(target) || (target as number) <= 0) {
    throw new PatchPlanningError("invalid-edit", order);
  }
  const kind = edit.kind;
  if (kind === "remove-node") {
    return { kind, target: target as number };
  }
  if (
    kind === "replace-node" ||
    kind === "insert-before" ||
    kind === "insert-after"
  ) {
    if (typeof edit.css !== "string") {
      throw new PatchPlanningError("invalid-edit", target as number);
    }
    return {
      kind,
      target: target as number,
      css: edit.css
    };
  }
  throw new PatchPlanningError("invalid-edit", target as number);
}

function replacementFor(
  source: string,
  nodes: ReadonlyMap<number, CssAstNode>,
  edit: CssSourceEdit,
  order: number
): Replacement {
  const node = nodes.get(edit.target);
  if (node === undefined) {
    throw new PatchPlanningError("node-not-found", edit.target);
  }
  const { start, end } = node.span;
  if (
    start.offset < 0 ||
    end.offset < start.offset ||
    end.offset > source.length
  ) {
    throw new PatchPlanningError("span-out-of-bounds", edit.target);
  }
  switch (edit.kind) {
    case "remove-node":
      return { order, target: edit.target, start: start.offset, end: end.offset, text: "" };
    case "replace-node":
      return {
        order,
        target: edit.target,
        start: start.offset,
        end: end.offset,
        text: edit.css
      };
    case "insert-before":
      return {
        order,
        target: edit.target,
        start: start.offset,
        end: start.offset,
        text: edit.css
      };
    case "insert-after":
      return {
        order,
        target: edit.target,
        start: end.offset,
        end: end.offset,
        text: edit.css
      };
  }
}

/** Builds a deterministic source-preserving edit plan against a parsed tree. */
export function computePatch(
  source: string,
  stylesheet: CssStylesheet,
  edits: readonly CssSourceEdit[]
): PatchPlan {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  if (!Array.isArray(edits)) {
    throw new PatchPlanningError("invalid-edit");
  }
  const nodes = indexNodes(stylesheet);
  const replacements = edits.map((edit, order) =>
    replacementFor(source, nodes, validatedEdit(edit, order), order)
  ).sort((left, right) =>
    left.start - right.start ||
    left.end - right.end ||
    left.order - right.order
  );

  let coveredUntil = 0;
  for (const replacement of replacements) {
    if (replacement.start < coveredUntil) {
      throw new PatchPlanningError("overlapping-edits", replacement.target);
    }
    coveredUntil = Math.max(coveredUntil, replacement.end);
  }

  const operations: PatchOperation[] = [];
  let cursor = 0;
  for (const replacement of replacements) {
    if (cursor < replacement.start) {
      operations.push({
        kind: "copy",
        start: cursor,
        end: replacement.start
      });
    }
    operations.push({
      kind: "replace",
      start: replacement.start,
      end: replacement.end,
      text: replacement.text
    });
    cursor = replacement.end;
  }
  if (cursor < source.length) {
    operations.push({ kind: "copy", start: cursor, end: source.length });
  }

  const frozenOperations = Object.freeze(operations);
  const plan = Object.freeze({
    operations: frozenOperations,
    result: applyOperations(source, frozenOperations)
  });
  return plan;
}

function applyOperations(
  source: string,
  operations: readonly unknown[]
): string {
  let cursor = 0;
  let result = "";
  for (const value of operations) {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new PatchPlanningError("invalid-plan");
    }
    const operation = value as Record<string, unknown>;
    if (operation.kind === "copy") {
      if (
        operation.start !== cursor ||
        !Number.isSafeInteger(operation.end) ||
        (operation.end as number) < cursor ||
        (operation.end as number) > source.length
      ) {
        throw new PatchPlanningError("invalid-plan");
      }
      result += source.slice(cursor, operation.end as number);
      cursor = operation.end as number;
    } else if (operation.kind === "replace") {
      if (
        operation.start !== cursor ||
        !Number.isSafeInteger(operation.end) ||
        (operation.end as number) < cursor ||
        (operation.end as number) > source.length ||
        typeof operation.text !== "string"
      ) {
        throw new PatchPlanningError("invalid-plan");
      }
      result += operation.text;
      cursor = operation.end as number;
    } else {
      throw new PatchPlanningError("invalid-plan");
    }
  }
  if (cursor !== source.length) {
    throw new PatchPlanningError("invalid-plan");
  }
  return result;
}

/** Applies a validated CSS source patch. */
export function applyPatch(source: string, plan: PatchPlan): string {
  if (typeof source !== "string") throw new TypeError("source must be a string");
  const input: unknown = plan;
  if (input === null || typeof input !== "object" || Array.isArray(input)) {
    throw new PatchPlanningError("invalid-plan");
  }
  const record = input as Record<string, unknown>;
  if (!Array.isArray(record.operations) || typeof record.result !== "string") {
    throw new PatchPlanningError("invalid-plan");
  }
  const result = applyOperations(source, record.operations);
  if (result !== record.result) {
    throw new PatchPlanningError("invalid-plan");
  }
  return result;
}
