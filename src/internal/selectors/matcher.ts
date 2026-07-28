import { ResourceGuard } from "../syntax/resources.ts";

import type {
  ComplexSelector,
  CompoundSelector,
  SelectorAttribute,
  SelectorCombinator,
  SelectorList,
  SelectorPseudoClass,
  SelectorType,
  SimpleSelector
} from "./types.ts";
import type {
  ResourceLimits,
  ResourceUsage,
  SourceSpan
} from "../syntax/types.ts";

export type SelectorDecision = "match" | "no-match" | "unknown";

export interface SelectorAttributeData {
  readonly namespace: string | null;
  readonly localName: string;
  readonly value: string;
}

export interface SelectorElementData {
  readonly kind: "element";
  readonly namespace: string | null;
  readonly localName: string;
  readonly attributes: readonly SelectorAttributeData[];
}

export interface SelectorTextData {
  readonly kind: "text";
  readonly value: string;
}

export interface SelectorOtherNodeData {
  readonly kind: "other";
}

export type SelectorNodeData =
  | SelectorElementData
  | SelectorTextData
  | SelectorOtherNodeData;

export interface SelectorTreeAdapter<TNode extends object> {
  readonly data: (node: TNode) => SelectorNodeData;
  readonly children: (node: TNode) => readonly TNode[];
}

export type SelectorNamespaceResolution =
  | {
      readonly status: "resolved";
      readonly namespace: string | null;
    }
  | {
      readonly status: "unknown";
    };

export type SelectorDefaultNamespace =
  | {
      readonly kind: "any";
    }
  | {
      readonly kind: "namespace";
      readonly namespace: string | null;
    };

export type SelectorDocumentMode =
  | {
      readonly syntax: "html";
      readonly quirks: "no-quirks" | "limited-quirks" | "quirks";
    }
  | {
      readonly syntax: "xml";
    };

export interface SelectorPseudoContext<TNode extends object> {
  readonly root: TNode;
  readonly scopes: ReadonlySet<TNode>;
}

export interface SelectorEnvironment<TNode extends object> {
  readonly tree: SelectorTreeAdapter<TNode>;
  readonly documentMode: SelectorDocumentMode;
  readonly defaultNamespace: SelectorDefaultNamespace;
  readonly idValues: (
    node: TNode,
    element: SelectorElementData
  ) => readonly string[];
  readonly classNames: (
    node: TNode,
    element: SelectorElementData
  ) => readonly string[];
  readonly resolveNamespacePrefix: (
    prefix: string
  ) => SelectorNamespaceResolution;
  readonly attributeValueCaseSensitivity: (
    element: SelectorElementData,
    attribute: SelectorAttributeData
  ) => "sensitive" | "ascii-insensitive";
  readonly matchPseudoClass: (
    node: TNode,
    pseudo: SelectorPseudoClass,
    context: SelectorPseudoContext<TNode>
  ) => SelectorDecision;
}

export interface SelectorMatchOptions<TNode extends object = object> {
  readonly limits?: ResourceLimits;
  readonly signal?: AbortSignal;
  readonly scopes?: ReadonlySet<TNode>;
  readonly nesting?: SelectorList;
}

export interface SelectorUnknownReason {
  readonly code:
    | "namespace-prefix"
    | "pseudo-class";
  readonly name: string;
  readonly span: SourceSpan;
}

export type SelectorMatchResult =
  | {
      readonly status: "match";
      readonly usage: ResourceUsage;
    }
  | {
      readonly status: "no-match";
      readonly usage: ResourceUsage;
    }
  | {
      readonly status: "unknown";
      readonly reasons: readonly SelectorUnknownReason[];
      readonly usage: ResourceUsage;
    };

export interface SelectorQueryUnknown<TNode extends object> {
  readonly node: TNode;
  readonly reasons: readonly SelectorUnknownReason[];
}

export interface SelectorQueryResult<TNode extends object> {
  readonly matches: readonly TNode[];
  readonly unknown: readonly SelectorQueryUnknown<TNode>[];
  readonly usage: ResourceUsage;
}

export class SelectorTreeError extends TypeError {
  readonly code = "CSS_SELECTOR_INVALID_TREE";

  constructor(readonly reason: "cycle" | "shared-node") {
    super(`Selector trees cannot contain a ${reason === "cycle" ? "cycle" : "shared node"}.`);
    this.name = "SelectorTreeError";
  }
}

interface TreeIndex<TNode extends object> {
  readonly root: TNode;
  readonly parent: ReadonlyMap<TNode, TNode | null>;
  readonly children: ReadonlyMap<TNode, readonly TNode[]>;
  readonly elements: readonly TNode[];
}

interface DecisionResult {
  readonly decision: SelectorDecision;
  readonly reasons: readonly SelectorUnknownReason[];
}

function known(decision: "match" | "no-match"): DecisionResult {
  return Object.freeze({ decision, reasons: Object.freeze([]) });
}

function unknown(reason: SelectorUnknownReason): DecisionResult {
  return Object.freeze({
    decision: "unknown",
    reasons: Object.freeze([reason])
  });
}

function uniqueReasons(
  values: readonly SelectorUnknownReason[]
): readonly SelectorUnknownReason[] {
  const keys = new Set<string>();
  const result: SelectorUnknownReason[] = [];
  for (const value of values) {
    const key = `${value.code}:${value.name}:${String(value.span.start.offset)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(value);
  }
  return Object.freeze(result);
}

function and(left: DecisionResult, right: DecisionResult): DecisionResult {
  if (left.decision === "no-match" || right.decision === "no-match") {
    return known("no-match");
  }
  if (left.decision === "match" && right.decision === "match") {
    return known("match");
  }
  return Object.freeze({
    decision: "unknown",
    reasons: uniqueReasons([...left.reasons, ...right.reasons])
  });
}

function or(values: readonly DecisionResult[]): DecisionResult {
  const reasons: SelectorUnknownReason[] = [];
  for (const value of values) {
    if (value.decision === "match") return known("match");
    if (value.decision === "unknown") reasons.push(...value.reasons);
  }
  return reasons.length === 0
    ? known("no-match")
    : Object.freeze({
        decision: "unknown",
        reasons: uniqueReasons(reasons)
      });
}

function invert(value: DecisionResult): DecisionResult {
  if (value.decision === "unknown") return value;
  return known(value.decision === "match" ? "no-match" : "match");
}

function lowerAscii(value: string): string {
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function equalAsciiInsensitive(left: string, right: string): boolean {
  return lowerAscii(left) === lowerAscii(right);
}

function isAsciiWhitespace(character: string): boolean {
  return (
    character === "\t" ||
    character === "\n" ||
    character === "\f" ||
    character === "\r" ||
    character === " "
  );
}

function whitespaceTokens(value: string): readonly string[] {
  const result: string[] = [];
  let token = "";
  for (const character of value) {
    if (isAsciiWhitespace(character)) {
      if (token.length > 0) result.push(token);
      token = "";
    } else {
      token += character;
    }
  }
  if (token.length > 0) result.push(token);
  return Object.freeze(result);
}

function buildTreeIndex<TNode extends object>(
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  guard: ResourceGuard
): TreeIndex<TNode> {
  const parent = new Map<TNode, TNode | null>();
  const children = new Map<TNode, readonly TNode[]>();
  const elements: TNode[] = [];
  const active = new Set<TNode>();
  const stack: {
    readonly node: TNode;
    readonly parent: TNode | null;
    readonly depth: number;
    readonly leaving: boolean;
  }[] = [{ node: root, parent: null, depth: 0, leaving: false }];

  while (stack.length > 0) {
    guard.step();
    const frame = stack.pop();
    if (frame === undefined) continue;
    if (frame.leaving) {
      active.delete(frame.node);
      continue;
    }
    if (active.has(frame.node)) throw new SelectorTreeError("cycle");
    if (parent.has(frame.node)) throw new SelectorTreeError("shared-node");
    active.add(frame.node);
    parent.set(frame.node, frame.parent);
    guard.createNode(frame.depth);
    if (environment.tree.data(frame.node).kind === "element") {
      elements.push(frame.node);
    }
    const nodeChildren = Object.freeze([
      ...environment.tree.children(frame.node)
    ]);
    children.set(frame.node, nodeChildren);
    stack.push({ ...frame, leaving: true });
    for (let index = nodeChildren.length - 1; index >= 0; index -= 1) {
      const child = nodeChildren[index];
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
  return Object.freeze({
    root,
    parent,
    children,
    elements: Object.freeze(elements)
  });
}

class SelectorMatcher<TNode extends object> {
  readonly #guard: ResourceGuard;
  readonly #index: TreeIndex<TNode>;
  readonly #scopes: ReadonlySet<TNode>;

  constructor(
    root: TNode,
    readonly environment: SelectorEnvironment<TNode>,
    readonly options: SelectorMatchOptions<TNode>
  ) {
    this.#guard = new ResourceGuard(options.limits, options.signal);
    this.#index = buildTreeIndex(root, environment, this.#guard);
    this.#scopes = options.scopes === undefined
      ? new Set([root])
      : new Set(
          [...options.scopes].filter((node) => this.#index.parent.has(node))
        );
  }

  usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  elements(): readonly TNode[] {
    return this.#index.elements;
  }

  matches(list: SelectorList, node: TNode): DecisionResult {
    if (!this.#index.parent.has(node)) return known("no-match");
    return or(
      list.selectors.map((selector) =>
        this.#complex(selector, node, null)
      )
    );
  }

  #complex(
    selector: ComplexSelector,
    node: TNode,
    anchor: TNode | null
  ): DecisionResult {
    return this.#complexAt(
      selector,
      selector.compounds.length - 1,
      node,
      anchor
    );
  }

  #complexAt(
    selector: ComplexSelector,
    index: number,
    node: TNode,
    anchor: TNode | null
  ): DecisionResult {
    this.#guard.step();
    const compound = selector.compounds[index];
    if (compound === undefined) return known("no-match");
    const own = this.#compound(compound, node);
    if (own.decision === "no-match") return own;
    if (index === 0) {
      const relation = anchor === null
        ? known("match")
        : this.#anchorRelation(
            selector.leadingCombinator ?? " ",
            anchor,
            node
          );
      return and(own, relation);
    }
    const combinator = selector.combinators[index - 1];
    const candidates = this.#leftCandidates(node, combinator);
    const related = or(
      candidates.map((candidate) =>
        this.#complexAt(selector, index - 1, candidate, anchor)
      )
    );
    return and(own, related);
  }

  #compound(compound: CompoundSelector, node: TNode): DecisionResult {
    const data = this.environment.tree.data(node);
    if (data.kind !== "element") return known("no-match");
    let result = compound.type === null
      ? known("match")
      : this.#type(compound.type, data);
    for (const simple of compound.simples) {
      result = and(result, this.#simple(simple, node, data));
      if (result.decision === "no-match") return result;
    }
    return result;
  }

  #type(
    selector: SelectorType,
    element: SelectorElementData
  ): DecisionResult {
    const namespace = this.#namespace(
      selector.namespace,
      true,
      element,
      selector.name,
      selector.span
    );
    if (namespace.decision !== "match") return namespace;
    if (selector.name === "*") return known("match");
    const equal = this.environment.documentMode.syntax === "html" &&
      element.namespace === "http://www.w3.org/1999/xhtml"
      ? equalAsciiInsensitive(element.localName, selector.name)
      : element.localName === selector.name;
    return known(equal ? "match" : "no-match");
  }

  #simple(
    simple: SimpleSelector,
    node: TNode,
    element: SelectorElementData
  ): DecisionResult {
    this.#guard.step();
    switch (simple.kind) {
      case "id":
        return known(
          this.environment.idValues(node, element).some((value) =>
            this.#identityEqual(value, simple.value)
          )
            ? "match"
            : "no-match"
        );
      case "class": {
        return known(
          this.environment.classNames(node, element).some((value) =>
            this.#identityEqual(value, simple.value)
          )
            ? "match"
            : "no-match"
        );
      }
      case "attribute":
        return this.#attributeSelector(simple, element);
      case "pseudo-class":
        return this.#pseudo(simple, node, element);
      case "pseudo-element":
        return known("no-match");
      case "nesting":
        return this.options.nesting === undefined
          ? known(this.#scopes.has(node) ? "match" : "no-match")
          : this.matches(this.options.nesting, node);
    }
  }

  #identityEqual(left: string, right: string): boolean {
    return this.environment.documentMode.syntax === "html" &&
        this.environment.documentMode.quirks === "quirks"
      ? equalAsciiInsensitive(left, right)
      : left === right;
  }

  #attributeSelector(
    selector: SelectorAttribute,
    element: SelectorElementData
  ): DecisionResult {
    const namespace = this.#attributeNamespace(selector);
    if (namespace.status === "unknown") {
      return unknown({
        code: "namespace-prefix",
        name: selector.namespace ?? "",
        span: selector.span
      });
    }
    const attribute = this.#attribute(
      element,
      namespace.namespace,
      selector.name
    );
    if (attribute === null) return known("no-match");
    if (selector.matcher === null) return known("match");
    const expected = selector.value;
    if (expected === null) return known("no-match");
    const sensitivity = selector.modifier === "i"
      ? "ascii-insensitive"
      : selector.modifier === "s"
        ? "sensitive"
        : this.environment.attributeValueCaseSensitivity(element, attribute);
    const left = sensitivity === "ascii-insensitive"
      ? lowerAscii(attribute.value)
      : attribute.value;
    const right = sensitivity === "ascii-insensitive"
      ? lowerAscii(expected)
      : expected;
    if (
      right.length === 0 &&
      (selector.matcher === "^=" ||
        selector.matcher === "$=" ||
        selector.matcher === "*=")
    ) {
      return known("no-match");
    }
    switch (selector.matcher) {
      case "=":
        return known(left === right ? "match" : "no-match");
      case "~=":
        return known(
          whitespaceTokens(left).includes(right) ? "match" : "no-match"
        );
      case "|=":
        return known(
          left === right || left.startsWith(`${right}-`)
            ? "match"
            : "no-match"
        );
      case "^=":
        return known(left.startsWith(right) ? "match" : "no-match");
      case "$=":
        return known(left.endsWith(right) ? "match" : "no-match");
      case "*=":
        return known(left.includes(right) ? "match" : "no-match");
    }
  }

  #pseudo(
    pseudo: SelectorPseudoClass,
    node: TNode,
    element: SelectorElementData
  ): DecisionResult {
    const name = pseudo.name;
    if (
      (name === "is" || name === "where") &&
      pseudo.argument.kind === "selector-list"
    ) {
      return or(
        pseudo.argument.selectors.map((selector) =>
          this.#complex(selector, node, null)
        )
      );
    }
    if (
      name === "not" &&
      pseudo.argument.kind === "selector-list"
    ) {
      return invert(or(
        pseudo.argument.selectors.map((selector) =>
          this.#complex(selector, node, null)
        )
      ));
    }
    if (
      name === "has" &&
      pseudo.argument.kind === "selector-list"
    ) {
      const results: DecisionResult[] = [];
      for (const selector of pseudo.argument.selectors) {
        for (const candidate of this.#index.elements) {
          results.push(this.#complex(selector, candidate, node));
        }
      }
      return or(results);
    }
    if (name === "scope") {
      if (pseudo.argument.kind !== "none") return known("no-match");
      return known(this.#scopes.has(node) ? "match" : "no-match");
    }
    if (name === "root") {
      if (pseudo.argument.kind !== "none") return known("no-match");
      const parent = this.#index.parent.get(node) ?? null;
      return known(
        parent === null ||
        this.environment.tree.data(parent).kind !== "element"
          ? "match"
          : "no-match"
      );
    }
    if (name === "empty") {
      return pseudo.argument.kind === "none"
        ? this.#empty(node)
        : known("no-match");
    }
    const indexed = this.#indexedPseudo(name, pseudo, node, element);
    if (indexed !== null) return indexed;
    const decision = this.environment.matchPseudoClass(
      node,
      pseudo,
      Object.freeze({
        root: this.#index.root,
        scopes: this.#scopes
      })
    );
    return decision === "unknown"
      ? unknown({
          code: "pseudo-class",
          name,
          span: pseudo.span
        })
      : known(decision);
  }

  #empty(node: TNode): DecisionResult {
    for (const child of this.#index.children.get(node) ?? []) {
      const data = this.environment.tree.data(child);
      if (data.kind === "element") return known("no-match");
      if (data.kind === "text" && data.value.length > 0) {
        return known("no-match");
      }
    }
    return known("match");
  }

  #indexedPseudo(
    name: string,
    pseudo: SelectorPseudoClass,
    node: TNode,
    element: SelectorElementData
  ): DecisionResult | null {
    const aliases: Readonly<Record<string, {
      readonly a: number;
      readonly b: number;
      readonly fromEnd: boolean;
      readonly sameType: boolean;
    }>> = {
      "first-child": { a: 0, b: 1, fromEnd: false, sameType: false },
      "last-child": { a: 0, b: 1, fromEnd: true, sameType: false },
      "only-child": { a: 0, b: 1, fromEnd: false, sameType: false },
      "first-of-type": { a: 0, b: 1, fromEnd: false, sameType: true },
      "last-of-type": { a: 0, b: 1, fromEnd: true, sameType: true },
      "only-of-type": { a: 0, b: 1, fromEnd: false, sameType: true }
    };
    const alias = aliases[name];
    if (alias !== undefined) {
      if (pseudo.argument.kind !== "none") return known("no-match");
      const first = this.#indexPosition(
        node,
        element,
        alias.sameType,
        alias.fromEnd,
        Object.freeze([])
      );
      if (
        name === "only-child" ||
        name === "only-of-type"
      ) {
        const last = this.#indexPosition(
          node,
          element,
          alias.sameType,
          true,
          Object.freeze([])
        );
        const combined = and(first.result, last.result);
        return combined.decision === "match" &&
          first.index === 1 &&
          last.index === 1
          ? known("match")
          : combined.decision === "unknown"
            ? combined
            : known("no-match");
      }
      return first.result.decision === "match" && first.index === 1
        ? known("match")
        : first.result.decision === "unknown"
          ? first.result
          : known("no-match");
    }
    if (pseudo.argument.kind !== "nth") return null;
    const modes: Readonly<Record<string, {
      readonly fromEnd: boolean;
      readonly sameType: boolean;
    }>> = {
      "nth-child": { fromEnd: false, sameType: false },
      "nth-last-child": { fromEnd: true, sameType: false },
      "nth-of-type": { fromEnd: false, sameType: true },
      "nth-last-of-type": { fromEnd: true, sameType: true }
    };
    const mode = modes[name];
    if (mode === undefined) return null;
    const position = this.#indexPosition(
      node,
      element,
      mode.sameType,
      mode.fromEnd,
      pseudo.argument.of
    );
    if (position.result.decision !== "match") return position.result;
    return known(
      matchesAnPlusB(position.index, pseudo.argument.a, pseudo.argument.b)
        ? "match"
        : "no-match"
    );
  }

  #indexPosition(
    node: TNode,
    element: SelectorElementData,
    sameType: boolean,
    fromEnd: boolean,
    filter: readonly ComplexSelector[]
  ): {
    readonly index: number;
    readonly result: DecisionResult;
  } {
    const parent = this.#index.parent.get(node) ?? null;
    if (parent === null) return { index: 0, result: known("no-match") };
    const siblings = (this.#index.children.get(parent) ?? []).filter(
      (sibling) => {
        const data = this.environment.tree.data(sibling);
        return data.kind === "element" &&
          (!sameType ||
            (data.namespace === element.namespace &&
              this.#sameElementType(data, element)));
      }
    );
    const ordered = fromEnd ? [...siblings].reverse() : siblings;
    let index = 0;
    const reasons: SelectorUnknownReason[] = [];
    for (const sibling of ordered) {
      let included: DecisionResult;
      if (filter.length === 0) {
        included = known("match");
      } else {
        included = or(
          filter.map((selector) => this.#complex(selector, sibling, null))
        );
      }
      if (included.decision === "unknown") reasons.push(...included.reasons);
      if (included.decision === "match") index += 1;
      if (sibling === node) {
        if (included.decision === "no-match") {
          return { index: 0, result: known("no-match") };
        }
        return reasons.length > 0
          ? {
              index,
              result: Object.freeze({
                decision: "unknown",
                reasons: uniqueReasons(reasons)
              })
            }
          : { index, result: known("match") };
      }
    }
    return { index: 0, result: known("no-match") };
  }

  #attribute(
    element: SelectorElementData,
    namespace: string | null,
    name: string
  ): SelectorAttributeData | null {
    for (const attribute of element.attributes) {
      const nameEqual = this.environment.documentMode.syntax === "html" &&
        element.namespace === "http://www.w3.org/1999/xhtml" &&
        attribute.namespace === null
        ? equalAsciiInsensitive(attribute.localName, name)
        : attribute.localName === name;
      if (
        (namespace === "*" || attribute.namespace === namespace) &&
        nameEqual
      ) {
        return attribute;
      }
    }
    return null;
  }

  #sameElementType(
    left: SelectorElementData,
    right: SelectorElementData
  ): boolean {
    return this.environment.documentMode.syntax === "html" &&
        left.namespace === "http://www.w3.org/1999/xhtml"
      ? equalAsciiInsensitive(left.localName, right.localName)
      : left.localName === right.localName;
  }

  #attributeNamespace(
    selector: SelectorAttribute
  ): SelectorNamespaceResolution {
    if (selector.namespace === null || selector.namespace === "") {
      return Object.freeze({ status: "resolved", namespace: null });
    }
    if (selector.namespace === "*") {
      return Object.freeze({ status: "resolved", namespace: "*" });
    }
    return this.environment.resolveNamespacePrefix(selector.namespace);
  }

  #namespace(
    selectorNamespace: string | null,
    useDefault: boolean,
    element: SelectorElementData,
    name: string,
    span: SourceSpan
  ): DecisionResult {
    if (selectorNamespace === "*") return known("match");
    let resolution: SelectorNamespaceResolution;
    if (selectorNamespace === null) {
      if (!useDefault) {
        resolution = Object.freeze({ status: "resolved", namespace: null });
      } else if (this.environment.defaultNamespace.kind === "any") {
        return known("match");
      } else {
        resolution = Object.freeze({
          status: "resolved",
          namespace: this.environment.defaultNamespace.namespace
        });
      }
    } else if (selectorNamespace === "") {
      resolution = Object.freeze({ status: "resolved", namespace: null });
    } else {
      resolution = this.environment.resolveNamespacePrefix(selectorNamespace);
    }
    if (resolution.status === "unknown") {
      return unknown({
        code: "namespace-prefix",
        name: selectorNamespace ?? name,
        span
      });
    }
    return known(
      resolution.namespace === element.namespace ? "match" : "no-match"
    );
  }

  #leftCandidates(
    node: TNode,
    combinator: SelectorCombinator | undefined
  ): readonly TNode[] {
    const parent = this.#index.parent.get(node) ?? null;
    if (combinator === ">") {
      return parent !== null &&
        this.environment.tree.data(parent).kind === "element"
        ? Object.freeze([parent])
        : Object.freeze([]);
    }
    if (combinator === "+" || combinator === "~") {
      if (parent === null) return Object.freeze([]);
      const siblings = this.#index.children.get(parent) ?? [];
      const nodeIndex = siblings.indexOf(node);
      const previous = siblings
        .slice(0, nodeIndex)
        .filter(
          (sibling) => this.environment.tree.data(sibling).kind === "element"
        )
        .reverse();
      return Object.freeze(combinator === "+" ? previous.slice(0, 1) : previous);
    }
    const ancestors: TNode[] = [];
    let candidate = parent;
    while (candidate !== null) {
      if (this.environment.tree.data(candidate).kind === "element") {
        ancestors.push(candidate);
      }
      candidate = this.#index.parent.get(candidate) ?? null;
    }
    return Object.freeze(ancestors);
  }

  #anchorRelation(
    combinator: SelectorCombinator,
    anchor: TNode,
    node: TNode
  ): DecisionResult {
    if (combinator === ">") {
      return known(
        this.#index.parent.get(node) === anchor ? "match" : "no-match"
      );
    }
    const parent = this.#index.parent.get(anchor) ?? null;
    if (combinator === "+" || combinator === "~") {
      if (parent === null || this.#index.parent.get(node) !== parent) {
        return known("no-match");
      }
      const siblings = (this.#index.children.get(parent) ?? []).filter(
        (sibling) => this.environment.tree.data(sibling).kind === "element"
      );
      const anchorIndex = siblings.indexOf(anchor);
      const nodeIndex = siblings.indexOf(node);
      return known(
        combinator === "+"
          ? nodeIndex === anchorIndex + 1
            ? "match"
            : "no-match"
          : nodeIndex > anchorIndex
            ? "match"
            : "no-match"
      );
    }
    let candidate = this.#index.parent.get(node) ?? null;
    while (candidate !== null) {
      if (candidate === anchor) return known("match");
      candidate = this.#index.parent.get(candidate) ?? null;
    }
    return known("no-match");
  }
}

function matchesAnPlusB(index: number, a: number, b: number): boolean {
  if (a === 0) return index === b;
  const quotient = (index - b) / a;
  return Number.isInteger(quotient) && quotient >= 0;
}

function publicResult(
  result: DecisionResult,
  usage: ResourceUsage
): SelectorMatchResult {
  if (result.decision === "unknown") {
    return Object.freeze({
      status: "unknown",
      reasons: result.reasons,
      usage
    });
  }
  return Object.freeze({ status: result.decision, usage });
}

export function matchSelectorList<TNode extends object>(
  selector: SelectorList,
  node: TNode,
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  options: SelectorMatchOptions<TNode> = {}
): SelectorMatchResult {
  const matcher = new SelectorMatcher(root, environment, options);
  return publicResult(matcher.matches(selector, node), matcher.usage());
}

export function querySelectorList<TNode extends object>(
  selector: SelectorList,
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  options: SelectorMatchOptions<TNode> = {}
): SelectorQueryResult<TNode> {
  const matcher = new SelectorMatcher(root, environment, options);
  const matches: TNode[] = [];
  const unknownResults: SelectorQueryUnknown<TNode>[] = [];
  for (const node of matcher.elements()) {
    const result = matcher.matches(selector, node);
    if (result.decision === "match") matches.push(node);
    else if (result.decision === "unknown") {
      unknownResults.push(Object.freeze({
        node,
        reasons: result.reasons
      }));
    }
  }
  return Object.freeze({
    matches: Object.freeze(matches),
    unknown: Object.freeze(unknownResults),
    usage: matcher.usage()
  });
}
