import type {
  ComponentValue
} from "../internal/syntax/ast.ts";
import type {
  CssAstNode,
  CssAstNodeOfKind,
  CssNodeVisitor
} from "./types.ts";

/** Thrown when traversal receives a cyclic or shared syntax graph. */
export class CssTreeStructureError extends TypeError {
  readonly code = "CSS_INVALID_TREE";

  constructor(readonly reason: "cycle" | "shared-node") {
    super(
      reason === "cycle"
        ? "CSS syntax trees cannot contain cycles"
        : "CSS syntax trees cannot contain shared structural nodes"
    );
    this.name = "CssTreeStructureError";
  }
}

function structuralValues(values: readonly ComponentValue[]): CssAstNode[] {
  return values.filter(
    (value): value is Extract<
      ComponentValue,
      { readonly kind: "function-block" | "simple-block" }
    > =>
      value.kind === "function-block" || value.kind === "simple-block"
  );
}

function childNodes(node: CssAstNode): readonly CssAstNode[] {
  switch (node.kind) {
    case "stylesheet":
      return node.rules;
    case "at-rule":
      return [
        ...structuralValues(node.prelude),
        ...(node.block === null ? [] : [node.block])
      ];
    case "qualified-rule":
      return [...structuralValues(node.prelude), node.block];
    case "block":
      return node.items;
    case "declaration":
    case "function-block":
    case "simple-block":
      return structuralValues(node.value);
  }
}

interface TraversalFrame {
  readonly node: CssAstNode;
  readonly parent: CssAstNode | null;
  readonly depth: number;
  readonly leaving: boolean;
}

/** Visits every structural node in deterministic depth-first order. */
export function walkCss(root: CssAstNode, visitor: CssNodeVisitor): void {
  const active = new WeakSet<object>();
  const seen = new WeakSet<object>();
  const stack: TraversalFrame[] = [{
    node: root,
    parent: null,
    depth: 0,
    leaving: false
  }];

  while (stack.length > 0) {
    const frame = stack.pop();
    if (frame === undefined) continue;
    if (frame.leaving) {
      active.delete(frame.node);
      continue;
    }
    if (active.has(frame.node)) throw new CssTreeStructureError("cycle");
    if (seen.has(frame.node)) throw new CssTreeStructureError("shared-node");
    active.add(frame.node);
    seen.add(frame.node);
    visitor(frame.node, frame.depth, frame.parent);
    stack.push({ ...frame, leaving: true });
    const children = childNodes(frame.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) {
        stack.push({
          node: child,
          parent: frame.node,
          depth: frame.depth + 1,
          leaving: false
        });
      }
    }
  }
}

/** Finds a structural node by its tree-local identifier. */
export function findNodeById(
  root: CssAstNode,
  id: number
): CssAstNode | null {
  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new RangeError("id must be a positive safe integer");
  }
  let found: CssAstNode | null = null;
  walkCss(root, (node) => {
    if (found === null && node.id === id) found = node;
  });
  return found;
}

/** Returns structural nodes with an exact `kind` discriminator. */
export function findNodesByKind<K extends CssAstNode["kind"]>(
  root: CssAstNode,
  kind: K
): readonly CssAstNodeOfKind<K>[] {
  const found: CssAstNodeOfKind<K>[] = [];
  walkCss(root, (node) => {
    if (node.kind === kind) {
      found.push(node as CssAstNodeOfKind<K>);
    }
  });
  return Object.freeze(found);
}
