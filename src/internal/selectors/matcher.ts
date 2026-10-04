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
  SelectorResourceLimits,
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
  /**
   * Returns an exhaustive candidate set for a dynamic pseudo-class, or null
   * when the environment cannot narrow it. Candidates outside the indexed
   * tree are ignored and final results are still verified by matchPseudoClass.
   */
  readonly pseudoClassCandidates?: (
    pseudo: SelectorPseudoClass,
    context: SelectorPseudoContext<TNode>
  ) => readonly TNode[] | null;
  readonly matchPseudoClass: (
    node: TNode,
    pseudo: SelectorPseudoClass,
    context: SelectorPseudoContext<TNode>
  ) => SelectorDecision;
}

/** A fresh cumulative budget and cancellation lifetime for matching operations. */
export interface SelectorEvaluationOptions {
  readonly limits?: Pick<SelectorResourceLimits, "maxSteps">;
  readonly signal?: AbortSignal;
}

export interface SelectorMatchOptions<TNode extends object = object> {
  readonly limits?: SelectorResourceLimits;
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

/**
 * Reuses one validated selector-tree index across related match and query
 * operations. The caller-owned tree and its structural identity data must stay
 * immutable for the lifetime of the session. Dynamic pseudo-class state may
 * continue to be supplied by the environment callback.
 */
export interface SelectorMatchSession<TNode extends object> {
  /** Retains the structural index and starts a fresh cumulative matching budget. */
  beginEvaluation(options?: SelectorEvaluationOptions): void;
  match(selector: SelectorList, node: TNode): SelectorMatchResult;
  query(selector: SelectorList): SelectorQueryResult<TNode>;
  usage(): ResourceUsage;
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
  readonly elementData: ReadonlyMap<TNode, SelectorElementData>;
  readonly elementsById: ReadonlyMap<string, readonly TNode[]>;
  readonly elementsByClass: ReadonlyMap<string, readonly TNode[]>;
  readonly elementsByExactLocalName: ReadonlyMap<string, readonly TNode[]>;
  readonly caseSensitiveElementsByExactLocalName: ReadonlyMap<string, readonly TNode[]>;
  readonly elementsByQualifiedName: ReadonlyMap<string, readonly TNode[]>;
  readonly htmlElementsByLocalName: ReadonlyMap<string, readonly TNode[]>;
  readonly elementsByExactAttributeName: ReadonlyMap<string, readonly TNode[]>;
  readonly elementsByQualifiedAttributeName: ReadonlyMap<string, readonly TNode[]>;
  readonly caseSensitiveElementsByExactAttributeName: ReadonlyMap<string, readonly TNode[]>;
  readonly caseSensitiveElementsByQualifiedAttributeName: ReadonlyMap<string, readonly TNode[]>;
  readonly htmlElementsByAttributeName: ReadonlyMap<string, readonly TNode[]>;
  readonly documentElements: readonly TNode[];
  readonly elementOrder: ReadonlyMap<TNode, number>;
  readonly elementSubtreeEnd: ReadonlyMap<TNode, number>;
  readonly previousElementSibling: ReadonlyMap<TNode, TNode>;
  readonly nextElementSibling: ReadonlyMap<TNode, TNode>;
  readonly siblingRanks: ReadonlyMap<TNode, SiblingRank>;
}

interface DecisionResult {
  readonly decision: SelectorDecision;
  readonly reasons: readonly SelectorUnknownReason[];
}

const MATCH: DecisionResult = Object.freeze({ decision: "match", reasons: Object.freeze([]) });
const NO_MATCH: DecisionResult = Object.freeze({ decision: "no-match", reasons: Object.freeze([]) });

function known(decision: "match" | "no-match"): DecisionResult {
  return decision === "match" ? MATCH : NO_MATCH;
}

function unknown(reason: SelectorUnknownReason): DecisionResult {
  return Object.freeze({
    decision: "unknown",
    reasons: Object.freeze([reason])
  });
}

function uniqueReasons(
  values: readonly SelectorUnknownReason[],
  guard: ResourceGuard
): readonly SelectorUnknownReason[] {
  const keys = new Set<string>();
  const result: SelectorUnknownReason[] = [];
  for (const value of values) {
    guard.step(1 + value.name.length);
    const key = `${value.code}:${value.name}:${String(value.span.start.offset)}`;
    if (keys.has(key)) continue;
    keys.add(key);
    result.push(value);
  }
  return Object.freeze(result);
}

function and(left: DecisionResult, right: DecisionResult, guard: ResourceGuard): DecisionResult {
  if (left.decision === "no-match" || right.decision === "no-match") {
    return known("no-match");
  }
  if (left.decision === "match" && right.decision === "match") {
    return known("match");
  }
  return Object.freeze({
    decision: "unknown",
    reasons: uniqueReasons(joinReasons(left.reasons, right.reasons, guard), guard)
  });
}

function orMapped<T>(
  values: Iterable<T>,
  evaluate: (value: T) => DecisionResult,
  guard: ResourceGuard
): DecisionResult {
  const reasons: SelectorUnknownReason[] = [];
  for (const value of values) {
    guard.step();
    const result = evaluate(value);
    if (result.decision === "match") return known("match");
    if (result.decision === "unknown") {
      for (const reason of result.reasons) {
        guard.step();
        reasons.push(reason);
      }
    }
  }
  return reasons.length === 0
    ? known("no-match")
    : Object.freeze({
        decision: "unknown",
        reasons: uniqueReasons(reasons, guard)
      });
}

function copyValues<T>(values: Iterable<T>, guard: ResourceGuard): T[] {
  const result: T[] = [];
  for (const value of values) {
    guard.step();
    result.push(value);
  }
  return result;
}

function joinReasons(
  left: readonly SelectorUnknownReason[],
  right: readonly SelectorUnknownReason[],
  guard: ResourceGuard
): readonly SelectorUnknownReason[] {
  const result = copyValues(left, guard);
  for (const reason of right) {
    guard.step();
    result.push(reason);
  }
  return result;
}

function invert(value: DecisionResult): DecisionResult {
  if (value.decision === "unknown") return value;
  return known(value.decision === "match" ? "no-match" : "match");
}

function lowerAscii(value: string, guard: ResourceGuard): string {
  guard.step(1 + value.length);
  return value.replace(/[A-Z]/gu, (character) => character.toLowerCase());
}

function equalAsciiInsensitive(left: string, right: string, guard: ResourceGuard): boolean {
  return lowerAscii(left, guard) === lowerAscii(right, guard);
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

function whitespaceTokens(value: string, guard: ResourceGuard): readonly string[] {
  const result: string[] = [];
  let token = "";
  for (const character of value) {
    guard.step();
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

function appendIndexEntry<TNode extends object>(
  index: Map<string, TNode[]>,
  key: string,
  node: TNode
): void {
  const entries = index.get(key) ?? [];
  entries.push(node);
  index.set(key, entries);
}

function freezeIndex<TNode extends object>(
  index: Map<string, TNode[]>,
  guard: ResourceGuard
): ReadonlyMap<string, readonly TNode[]> {
  // These construction-owned postings already have their final contents.
  for (const nodes of index.values()) {
    guard.step(1 + nodes.length);
    Object.freeze(nodes);
  }
  return index;
}

function qualifiedNameKey(namespace: string | null, localName: string, guard: ResourceGuard): string {
  guard.step(1 + (namespace?.length ?? 0) + localName.length);
  return `${namespace ?? "\u0000"}\u0001${localName}`;
}

function elementTypeKey(element: SelectorElementData, html: boolean, guard: ResourceGuard): string {
  return qualifiedNameKey(
    element.namespace,
    html && element.namespace === "http://www.w3.org/1999/xhtml"
      ? lowerAscii(element.localName, guard) : element.localName,
    guard
  );
}

interface SiblingRank {
  readonly index: number;
  readonly count: number;
  readonly typeIndex: number;
  readonly typeCount: number;
}

function buildTreeIndex<TNode extends object>(
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  guard: ResourceGuard
): TreeIndex<TNode> {
  const parent = new Map<TNode, TNode | null>();
  const children = new Map<TNode, readonly TNode[]>();
  const elements: TNode[] = [];
  const elementData = new Map<TNode, SelectorElementData>();
  const elementsById = new Map<string, TNode[]>();
  const elementsByClass = new Map<string, TNode[]>();
  const elementsByExactLocalName = new Map<string, TNode[]>();
  const caseSensitiveElementsByExactLocalName = new Map<string, TNode[]>();
  const elementsByQualifiedName = new Map<string, TNode[]>();
  const htmlElementsByLocalName = new Map<string, TNode[]>();
  const elementsByExactAttributeName = new Map<string, TNode[]>();
  const elementsByQualifiedAttributeName = new Map<string, TNode[]>();
  const caseSensitiveElementsByExactAttributeName = new Map<string, TNode[]>();
  const caseSensitiveElementsByQualifiedAttributeName = new Map<string, TNode[]>();
  const htmlElementsByAttributeName = new Map<string, TNode[]>();
  const documentElements: TNode[] = [];
  const elementOrder = new Map<TNode, number>();
  const elementSubtreeEnd = new Map<TNode, number>();
  const previousElementSibling = new Map<TNode, TNode>();
  const nextElementSibling = new Map<TNode, TNode>();
  const lastElementChild = new Map<TNode, TNode>();
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
      if (elementData.has(frame.node)) {
        elementSubtreeEnd.set(frame.node, elements.length - 1);
      }
      active.delete(frame.node);
      continue;
    }
    if (active.has(frame.node)) throw new SelectorTreeError("cycle");
    if (parent.has(frame.node)) throw new SelectorTreeError("shared-node");
    active.add(frame.node);
    parent.set(frame.node, frame.parent);
    guard.createNode(frame.depth);
    const data = environment.tree.data(frame.node);
    guard.assertActive();
    if (data.kind === "element") {
      elementOrder.set(frame.node, elements.length);
      elements.push(frame.node);
      elementData.set(frame.node, data);
      if (frame.parent !== null) {
        const previous = lastElementChild.get(frame.parent);
        if (previous !== undefined) {
          previousElementSibling.set(frame.node, previous);
          nextElementSibling.set(previous, frame.node);
        }
        lastElementChild.set(frame.parent, frame.node);
      }
      if (
        frame.parent === null ||
        !elementData.has(frame.parent)
      ) {
        documentElements.push(frame.node);
      }
      guard.step(1 + data.localName.length);
      appendIndexEntry(elementsByExactLocalName, data.localName, frame.node);
      appendIndexEntry(
        elementsByQualifiedName,
        qualifiedNameKey(data.namespace, data.localName, guard),
        frame.node
      );
      if (
        environment.documentMode.syntax === "html" &&
        data.namespace === "http://www.w3.org/1999/xhtml"
      ) {
        appendIndexEntry(
          htmlElementsByLocalName,
          lowerAscii(data.localName, guard),
          frame.node
        );
      } else {
        appendIndexEntry(
          caseSensitiveElementsByExactLocalName,
          data.localName,
          frame.node
        );
      }
      const exactAttributeNames = new Set<string>();
      const qualifiedAttributeNames = new Set<string>();
      const htmlAttributeNames = new Set<string>();
      const caseSensitiveExactAttributeNames = new Set<string>();
      const caseSensitiveQualifiedAttributeNames = new Set<string>();
      for (const attribute of data.attributes) {
        guard.step(1 + attribute.localName.length);
        exactAttributeNames.add(attribute.localName);
        qualifiedAttributeNames.add(
          qualifiedNameKey(attribute.namespace, attribute.localName, guard)
        );
        if (
          environment.documentMode.syntax === "html" &&
          data.namespace === "http://www.w3.org/1999/xhtml" &&
          attribute.namespace === null
        ) {
          htmlAttributeNames.add(lowerAscii(attribute.localName, guard));
        } else {
          caseSensitiveExactAttributeNames.add(attribute.localName);
          caseSensitiveQualifiedAttributeNames.add(
            qualifiedNameKey(attribute.namespace, attribute.localName, guard)
          );
        }
      }
      for (const name of exactAttributeNames) {
        guard.step(1 + name.length);
        appendIndexEntry(elementsByExactAttributeName, name, frame.node);
      }
      for (const name of qualifiedAttributeNames) {
        guard.step(1 + name.length);
        appendIndexEntry(elementsByQualifiedAttributeName, name, frame.node);
      }
      for (const name of htmlAttributeNames) {
        guard.step(1 + name.length);
        appendIndexEntry(htmlElementsByAttributeName, name, frame.node);
      }
      for (const name of caseSensitiveExactAttributeNames) {
        guard.step(1 + name.length);
        appendIndexEntry(
          caseSensitiveElementsByExactAttributeName,
          name,
          frame.node
        );
      }
      for (const name of caseSensitiveQualifiedAttributeNames) {
        guard.step(1 + name.length);
        appendIndexEntry(
          caseSensitiveElementsByQualifiedAttributeName,
          name,
          frame.node
        );
      }
      guard.step();
      const ids = environment.idValues(frame.node, data);
      guard.assertActive();
      for (const value of ids) {
        guard.step(1 + value.length);
        appendIndexEntry(
          elementsById,
          environment.documentMode.syntax === "html" &&
              environment.documentMode.quirks === "quirks"
            ? lowerAscii(value, guard)
            : value,
          frame.node
        );
      }
      guard.step();
      const classes = environment.classNames(frame.node, data);
      guard.assertActive();
      for (const value of classes) {
        guard.step(1 + value.length);
        appendIndexEntry(
          elementsByClass,
          environment.documentMode.syntax === "html" &&
              environment.documentMode.quirks === "quirks"
            ? lowerAscii(value, guard)
            : value,
          frame.node
        );
      }
    }
    guard.step();
    const suppliedChildren = environment.tree.children(frame.node);
    guard.assertActive();
    const nodeChildren = Object.freeze(copyValues(suppliedChildren, guard));
    children.set(frame.node, nodeChildren);
    stack.push({ ...frame, leaving: true });
    for (let index = nodeChildren.length - 1; index >= 0; index -= 1) {
      guard.step();
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
  const siblingRanks = new Map<TNode, SiblingRank>();
  for (const siblings of children.values()) {
    guard.step();
    let count = 0;
    const counts = new Map<string, number>();
    for (const sibling of siblings) {
      guard.step();
      const data = elementData.get(sibling);
      if (data === undefined) continue;
      count += 1;
      const key = elementTypeKey(data, environment.documentMode.syntax === "html", guard);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    let index = 0;
    const positions = new Map<string, number>();
    for (const sibling of siblings) {
      guard.step();
      const data = elementData.get(sibling);
      if (data === undefined) continue;
      index += 1;
      const key = elementTypeKey(data, environment.documentMode.syntax === "html", guard);
      const typeIndex = (positions.get(key) ?? 0) + 1;
      positions.set(key, typeIndex);
      siblingRanks.set(sibling, Object.freeze({ index, count, typeIndex, typeCount: counts.get(key) ?? 0 }));
    }
  }
  guard.step(1 + elements.length + documentElements.length);
  return Object.freeze({
    root,
    parent,
    children,
    elements: Object.freeze(elements),
    elementData,
    elementsById: freezeIndex(elementsById, guard),
    elementsByClass: freezeIndex(elementsByClass, guard),
    elementsByExactLocalName: freezeIndex(elementsByExactLocalName, guard),
    caseSensitiveElementsByExactLocalName: freezeIndex(caseSensitiveElementsByExactLocalName, guard),
    elementsByQualifiedName: freezeIndex(elementsByQualifiedName, guard),
    htmlElementsByLocalName: freezeIndex(htmlElementsByLocalName, guard),
    elementsByExactAttributeName: freezeIndex(elementsByExactAttributeName, guard),
    elementsByQualifiedAttributeName: freezeIndex(elementsByQualifiedAttributeName, guard),
    caseSensitiveElementsByExactAttributeName: freezeIndex(caseSensitiveElementsByExactAttributeName, guard),
    caseSensitiveElementsByQualifiedAttributeName: freezeIndex(caseSensitiveElementsByQualifiedAttributeName, guard),
    htmlElementsByAttributeName: freezeIndex(htmlElementsByAttributeName, guard),
    documentElements: Object.freeze(documentElements),
    elementOrder,
    elementSubtreeEnd,
    previousElementSibling,
    nextElementSibling,
    siblingRanks
  });
}

const NTH_MODES: Readonly<Record<string, {
  readonly fromEnd: boolean;
  readonly sameType: boolean;
}>> = {
  "nth-child": { fromEnd: false, sameType: false },
  "nth-last-child": { fromEnd: true, sameType: false },
  "nth-of-type": { fromEnd: false, sameType: true },
  "nth-last-of-type": { fromEnd: true, sameType: true }
};

class SelectorMatcher<TNode extends object> {
  #guard: ResourceGuard;
  readonly #index: TreeIndex<TNode>;
  readonly #scopes: ReadonlySet<TNode>;
  readonly #candidates = new Map<CompoundSelector, readonly TNode[] | null>();
  readonly #matches = new Map<ComplexSelector, Map<number, Map<TNode, DecisionResult>>>();
  readonly #ancestors = new Map<ComplexSelector, Map<number, Map<TNode, DecisionResult>>>();

  constructor(
    root: TNode,
    readonly environment: SelectorEnvironment<TNode>,
    readonly options: SelectorMatchOptions<TNode>
  ) {
    this.#guard = new ResourceGuard(options.limits, options.signal);
    this.#index = buildTreeIndex(root, environment, this.#guard);
    const scopes = new Set<TNode>();
    for (const node of options.scopes ?? [root]) {
      this.#guard.step();
      if (this.#index.parent.has(node)) scopes.add(node);
    }
    this.#scopes = scopes;
  }

  beginEvaluation(options: SelectorEvaluationOptions): void {
    // Construct first so invalid limits or an already aborted signal do not
    // replace the currently active evaluation.
    this.#guard = new ResourceGuard(options.limits, options.signal);
    this.finishOperation();
  }

  beginOperation(): void {
    this.#guard.assertActive();
    this.#guard.step();
    this.finishOperation();
  }

  finishOperation(): void {
    // Namespace resolution and pseudo-class state may change between calls.
    this.#candidates.clear();
    this.#matches.clear();
    this.#ancestors.clear();
  }

  materialize(count: number): void {
    this.#guard.step(1 + count);
  }

  usage(): ResourceUsage {
    return this.#guard.snapshot();
  }

  queryCandidates(list: SelectorList): readonly TNode[] {
    const candidates: (readonly TNode[])[] = [];
    for (const selector of list.selectors) {
      this.#guard.step();
      const selected = this.#complexCandidates(selector);
      if (selected === this.#index.elements) return this.#index.elements;
      candidates.push(selected);
    }
    if (candidates.length === 0) return Object.freeze([]);
    if (candidates.length === 1) return candidates[0] ?? Object.freeze([]);
    return this.#orderedUnionMany(candidates);
  }

  matches(list: SelectorList, node: TNode): DecisionResult {
    this.#guard.step();
    if (!this.#index.parent.has(node)) return known("no-match");
    return orMapped(
      list.selectors,
      (selector) => this.#complex(selector, node),
      this.#guard
    );
  }

  #complexCandidates(selector: ComplexSelector): readonly TNode[] {
    if (selector.compounds.length === 0) return Object.freeze([]);
    let seedIndex = -1;
    let candidates: readonly TNode[] | null = null;
    const candidatesByCompound: (readonly TNode[] | null)[] = [];
    for (const [index, compound] of selector.compounds.entries()) {
      this.#guard.step();
      const indexed = this.#compoundCandidates(compound);
      if (indexed?.length === 0) return indexed;
      candidatesByCompound.push(indexed);
      if (
        indexed !== null &&
        (candidates === null || indexed.length <= candidates.length)
      ) {
        seedIndex = index;
        candidates = indexed;
      }
    }
    if (candidates === null) return this.#index.elements;
    if (candidates.length === 0) return candidates;
    for (let index = seedIndex + 1; index < selector.compounds.length; index += 1) {
      this.#guard.step();
      const compound = selector.compounds[index];
      if (compound === undefined) return candidates;
      const indexed = candidatesByCompound[index] ?? null;
      candidates = this.#rightCandidates(
        candidates,
        selector.combinators[index - 1],
        indexed
      );
      if (candidates.length === 0) return candidates;
    }
    return candidates;
  }

  #compoundCandidates(compound: CompoundSelector): readonly TNode[] | null {
    const cached = this.#candidates.get(compound);
    if (cached !== undefined) return cached;
    const candidates = this.#selectCompoundCandidates(compound);
    this.#candidates.set(compound, candidates);
    return candidates;
  }

  #selectCompoundCandidates(compound: CompoundSelector): readonly TNode[] | null {
    this.#guard.step();
    let retained: readonly TNode[] | null = this.#typeCandidates(compound.type);
    if (retained?.length === 0) return retained;
    for (const simple of compound.simples) {
      this.#guard.step();
      let indexed: readonly TNode[] | null = null;
      if (simple.kind === "id") {
        this.#guard.step(1 + simple.value.length);
        const key = this.environment.documentMode.syntax === "html" &&
            this.environment.documentMode.quirks === "quirks"
          ? lowerAscii(simple.value, this.#guard)
          : simple.value;
        indexed = this.#index.elementsById.get(key) ?? Object.freeze([]);
      } else if (simple.kind === "class") {
        this.#guard.step(1 + simple.value.length);
        const key = this.environment.documentMode.syntax === "html" &&
            this.environment.documentMode.quirks === "quirks"
          ? lowerAscii(simple.value, this.#guard)
          : simple.value;
        indexed = this.#index.elementsByClass.get(key) ?? Object.freeze([]);
      } else if (simple.kind === "attribute") {
        indexed = this.#attributeCandidates(simple);
      } else if (
        simple.kind === "pseudo-class" &&
        simple.name === "root" &&
        simple.argument.kind === "none"
      ) {
        indexed = this.#index.documentElements;
      } else if (simple.kind === "pseudo-class") {
        indexed = this.#pseudoCandidates(simple);
      }
      if (indexed !== null) {
        if (retained === null) {
          retained = indexed;
        } else if (Math.min(retained.length, indexed.length) <= 256) {
          retained = this.#intersection(retained, indexed);
        } else if (indexed.length < retained.length) {
          // Candidate sets are only a narrowing hint; the complete compound is
          // verified later. Retaining the smaller ordered seed avoids spending
          // more work joining common indexes than final verification requires.
          retained = indexed;
        }
        if (retained.length === 0) return retained;
      }
    }
    return retained;
  }

  #pseudoCandidates(
    pseudo: SelectorPseudoClass
  ): readonly TNode[] | null {
    if (
      (pseudo.name === "is" || pseudo.name === "where") &&
      pseudo.argument.kind === "selector-list"
    ) {
      const branches: (readonly TNode[])[] = [];
      for (const selector of pseudo.argument.selectors) {
        this.#guard.step();
        const candidates = this.#complexCandidates(selector);
        if (candidates === this.#index.elements) return null;
        branches.push(candidates);
      }
      return this.#orderedUnionMany(branches);
    }
    this.#guard.step();
    const candidates = this.environment.pseudoClassCandidates?.(
      pseudo,
      this.#pseudoContext()
    );
    this.#guard.assertActive();
    if (candidates === undefined || candidates === null) return null;
    return this.#orderedExternalCandidates(candidates);
  }

  #candidateOrder(node: TNode): number {
    const order = this.#index.elementOrder.get(node);
    if (order === undefined) {
      throw new TypeError("selector candidate is outside the indexed tree");
    }
    return order;
  }

  #orderedUnion(
    left: readonly TNode[],
    right: readonly TNode[]
  ): readonly TNode[] {
    if (left.length === 0) return right;
    if (right.length === 0) return left;
    const joined: TNode[] = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length || rightIndex < right.length) {
      this.#guard.step();
      const leftNode = left[leftIndex];
      const rightNode = right[rightIndex];
      if (leftNode === undefined) {
        if (rightNode !== undefined) joined.push(rightNode);
        rightIndex += 1;
        continue;
      }
      if (rightNode === undefined) {
        joined.push(leftNode);
        leftIndex += 1;
        continue;
      }
      const leftOrder = this.#candidateOrder(leftNode);
      const rightOrder = this.#candidateOrder(rightNode);
      if (leftOrder <= rightOrder) {
        joined.push(leftNode);
        leftIndex += 1;
      }
      if (rightOrder <= leftOrder) {
        if (rightOrder !== leftOrder) joined.push(rightNode);
        rightIndex += 1;
      }
    }
    return Object.freeze(joined);
  }

  #orderedUnionMany(
    lists: readonly (readonly TNode[])[]
  ): readonly TNode[] {
    const nonempty: (readonly TNode[])[] = [];
    for (const list of lists) {
      this.#guard.step();
      if (list.length > 0) nonempty.push(list);
    }
    if (nonempty.length === 0) return Object.freeze([]);
    if (nonempty.length === 1) return nonempty[0] ?? Object.freeze([]);
    interface Cursor {
      readonly list: readonly TNode[];
      index: number;
      node: TNode;
      order: number;
    }
    const heap: Cursor[] = [];
    const less = (left: Cursor, right: Cursor): boolean => {
      this.#guard.step();
      return left.order < right.order;
    };
    const push = (cursor: Cursor): void => {
      heap.push(cursor);
      let index = heap.length - 1;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        const parentCursor = heap[parent];
        if (parentCursor === undefined || !less(cursor, parentCursor)) break;
        heap[index] = parentCursor;
        index = parent;
      }
      heap[index] = cursor;
    };
    const pop = (): Cursor | undefined => {
      const first = heap[0];
      const last = heap.pop();
      if (first === undefined || last === undefined || heap.length === 0) {
        return first;
      }
      let index = 0;
      for (;;) {
        const leftIndex = index * 2 + 1;
        const rightIndex = leftIndex + 1;
        const left = heap[leftIndex];
        const right = heap[rightIndex];
        if (left === undefined) break;
        const childIndex = right !== undefined && less(right, left)
          ? rightIndex
          : leftIndex;
        const child = heap[childIndex];
        if (child === undefined || !less(child, last)) break;
        heap[index] = child;
        index = childIndex;
      }
      heap[index] = last;
      return first;
    };
    for (const list of nonempty) {
      this.#guard.step();
      const node = list[0];
      if (node !== undefined) {
        push({ list, index: 0, node, order: this.#candidateOrder(node) });
      }
    }
    const joined: TNode[] = [];
    let lastOrder = -1;
    while (heap.length > 0) {
      this.#guard.step();
      const cursor = pop();
      if (cursor === undefined) break;
      if (cursor.order !== lastOrder) {
        joined.push(cursor.node);
        lastOrder = cursor.order;
      }
      cursor.index += 1;
      const node = cursor.list[cursor.index];
      if (node !== undefined) {
        cursor.node = node;
        cursor.order = this.#candidateOrder(node);
        push(cursor);
      }
    }
    return Object.freeze(joined);
  }

  #intersection(
    left: readonly TNode[],
    right: readonly TNode[]
  ): readonly TNode[] {
    if (left.length === 0 || right.length === 0) return Object.freeze([]);
    const smaller = left.length <= right.length ? left : right;
    const larger = left.length <= right.length ? right : left;
    if (smaller.length * 8 < larger.length) {
      const retained: TNode[] = [];
      for (const candidate of smaller) {
        this.#guard.step();
        const order = this.#candidateOrder(candidate);
        let low = 0;
        let high = larger.length - 1;
        while (low <= high) {
          this.#guard.step();
          const middle = Math.floor((low + high) / 2);
          const middleNode = larger[middle];
          if (middleNode === undefined) break;
          const middleOrder = this.#candidateOrder(middleNode);
          if (middleOrder === order) {
            retained.push(candidate);
            break;
          }
          if (middleOrder < order) low = middle + 1;
          else high = middle - 1;
        }
      }
      return Object.freeze(retained);
    }
    const retained: TNode[] = [];
    let leftIndex = 0;
    let rightIndex = 0;
    while (leftIndex < left.length && rightIndex < right.length) {
      this.#guard.step();
      const leftNode = left[leftIndex];
      const rightNode = right[rightIndex];
      if (leftNode === undefined || rightNode === undefined) break;
      const leftOrder = this.#candidateOrder(leftNode);
      const rightOrder = this.#candidateOrder(rightNode);
      if (leftOrder === rightOrder) {
        retained.push(leftNode);
        leftIndex += 1;
        rightIndex += 1;
      } else if (leftOrder < rightOrder) leftIndex += 1;
      else rightIndex += 1;
    }
    return Object.freeze(retained);
  }

  #orderedExternalCandidates(candidates: readonly TNode[]): readonly TNode[] {
    const byOrder = new Map<number, TNode>();
    for (const candidate of candidates) {
      this.#guard.step();
      const order = this.#index.elementOrder.get(candidate);
      if (order !== undefined) byOrder.set(order, candidate);
    }
    const entries = copyValues(byOrder.entries(), this.#guard);
    entries.sort((left, right) => {
      this.#guard.step();
      return left[0] - right[0];
    });
    return Object.freeze(entries.map((entry) => {
      this.#guard.step();
      return entry[1];
    }));
  }

  #rightCandidates(
    nodes: readonly TNode[],
    combinator: SelectorCombinator | undefined,
    indexed: readonly TNode[] | null
  ): readonly TNode[] {
    if (indexed !== null) {
      return this.#indexedRightCandidates(nodes, combinator, indexed);
    }
    const retained = new Set<TNode>();
    if (combinator === ">") {
      for (const node of nodes) {
        this.#guard.step();
        for (const child of this.#index.children.get(node) ?? []) {
          this.#guard.step();
          if (this.#index.elementData.has(child)) retained.add(child);
        }
      }
    } else if (combinator === "+" || combinator === "~") {
      for (const node of nodes) {
        this.#guard.step();
        let sibling = this.#index.nextElementSibling.get(node);
        while (sibling !== undefined) {
          this.#guard.step();
          retained.add(sibling);
          if (combinator === "+") break;
          sibling = this.#index.nextElementSibling.get(sibling);
        }
      }
    } else {
      return this.#indexedRightCandidates(nodes, combinator, this.#index.elements);
    }
    return this.#orderedExternalCandidates(copyValues(retained, this.#guard));
  }

  #indexedRightCandidates(
    nodes: readonly TNode[],
    combinator: SelectorCombinator | undefined,
    indexed: readonly TNode[]
  ): readonly TNode[] {
    if (nodes.length === 0 || indexed.length === 0) return Object.freeze([]);
    const retained: TNode[] = [];
    const left = new Set<TNode>();
    if (combinator === ">" || combinator === "+") {
      for (const node of nodes) {
        this.#guard.step();
        left.add(node);
      }
    }
    if (combinator === ">") {
      for (const candidate of indexed) {
        this.#guard.step();
        const parent = this.#index.parent.get(candidate) ?? null;
        if (parent !== null && left.has(parent)) retained.push(candidate);
      }
      return Object.freeze(retained);
    }
    if (combinator === "+" || combinator === "~") {
      const firstByParent = new Map<TNode, number>();
      if (combinator === "~") {
        for (const node of nodes) {
          this.#guard.step();
          const parent = this.#index.parent.get(node) ?? null;
          if (parent !== null && !firstByParent.has(parent)) {
            firstByParent.set(parent, this.#candidateOrder(node));
          }
        }
      }
      for (const candidate of indexed) {
        this.#guard.step();
        if (combinator === "+") {
          const previous = this.#index.previousElementSibling.get(candidate);
          if (previous !== undefined && left.has(previous)) retained.push(candidate);
        } else {
          const parent = this.#index.parent.get(candidate) ?? null;
          const first = parent === null ? undefined : firstByParent.get(parent);
          if (first !== undefined && first < this.#candidateOrder(candidate)) retained.push(candidate);
        }
      }
      return Object.freeze(retained);
    }
    const intervals: { readonly start: number; readonly end: number }[] = [];
    for (const node of nodes) {
      this.#guard.step();
      const order = this.#index.elementOrder.get(node);
      const end = this.#index.elementSubtreeEnd.get(node);
      if (order === undefined || end === undefined || end <= order) continue;
      const start = order + 1;
      const previous = intervals.at(-1);
      if (previous !== undefined && start <= previous.end + 1) {
        intervals[intervals.length - 1] = Object.freeze({
          start: previous.start,
          end: Math.max(previous.end, end)
        });
      } else intervals.push(Object.freeze({ start, end }));
    }
    const coveredElements = intervals.reduce(
      (total, interval) => {
        this.#guard.step();
        return total + interval.end - interval.start + 1;
      },
      0
    );
    if (coveredElements < indexed.length) {
      for (const interval of intervals) {
        this.#guard.step();
        for (let order = interval.start; order <= interval.end; order += 1) {
          this.#guard.step();
          const candidate = this.#index.elements[order];
          if (candidate !== undefined) retained.push(candidate);
        }
      }
      return indexed === this.#index.elements
        ? Object.freeze(retained) : this.#intersection(retained, indexed);
    }
    let intervalIndex = 0;
    for (const candidate of indexed) {
      this.#guard.step();
      const order = this.#index.elementOrder.get(candidate);
      if (order === undefined) continue;
      let interval = intervals[intervalIndex];
      while (interval !== undefined && interval.end < order) {
        this.#guard.step();
        intervalIndex += 1;
        interval = intervals[intervalIndex];
      }
      if (
        interval !== undefined &&
        interval.start <= order &&
        order <= interval.end
      ) {
        retained.push(candidate);
      }
    }
    return Object.freeze(retained);
  }

  #attributeCandidates(
    selector: SelectorAttribute
  ): readonly TNode[] | null {
    this.#guard.step(1 + selector.name.length);
    const resolution = this.#attributeNamespace(selector);
    if (resolution.status === "unknown") return null;
    const namespace = resolution.namespace;
    const htmlCandidates = this.environment.documentMode.syntax === "html" &&
        (namespace === "*" || namespace === null)
      ? this.#index.htmlElementsByAttributeName.get(
          lowerAscii(selector.name, this.#guard)
        ) ?? []
      : [];
    const exactCandidates = namespace === "*"
      ? this.environment.documentMode.syntax === "html"
        ? this.#index.caseSensitiveElementsByExactAttributeName.get(
            selector.name
          ) ?? []
        : this.#index.elementsByExactAttributeName.get(selector.name) ?? []
      : this.environment.documentMode.syntax === "html" && namespace === null
        ? this.#index.caseSensitiveElementsByQualifiedAttributeName.get(
            qualifiedNameKey(namespace, selector.name, this.#guard)
          ) ?? []
        : this.#index.elementsByQualifiedAttributeName.get(
            qualifiedNameKey(namespace, selector.name, this.#guard)
          ) ?? [];
    if (htmlCandidates.length === 0) return exactCandidates;
    if (exactCandidates.length === 0) return htmlCandidates;
    return this.#orderedUnion(htmlCandidates, exactCandidates);
  }

  #typeCandidates(type: SelectorType | null): readonly TNode[] | null {
    if (type === null || type.name === "*") return null;
    this.#guard.step(1 + type.name.length);
    let namespace: string | null;
    if (type.namespace === "*") {
      namespace = "*";
    } else if (type.namespace === "") {
      namespace = null;
    } else if (type.namespace === null) {
      if (this.environment.defaultNamespace.kind === "any") {
        namespace = "*";
      } else {
        namespace = this.environment.defaultNamespace.namespace;
      }
    } else {
      this.#guard.step(1 + type.namespace.length);
      const resolution = this.environment.resolveNamespacePrefix(type.namespace);
      this.#guard.assertActive();
      if (resolution.status === "unknown") return null;
      namespace = resolution.namespace;
    }
    const htmlCandidates = this.environment.documentMode.syntax === "html" &&
        (namespace === "*" || namespace === "http://www.w3.org/1999/xhtml")
      ? this.#index.htmlElementsByLocalName.get(lowerAscii(type.name, this.#guard)) ?? []
      : [];
    const exactCandidates = namespace === "*"
      ? this.environment.documentMode.syntax === "html"
        ? this.#index.caseSensitiveElementsByExactLocalName.get(type.name) ?? []
        : this.#index.elementsByExactLocalName.get(type.name) ?? []
      : namespace === "http://www.w3.org/1999/xhtml" &&
          this.environment.documentMode.syntax === "html"
        ? []
        : this.#index.elementsByQualifiedName.get(
            qualifiedNameKey(namespace, type.name, this.#guard)
          ) ?? [];
    if (htmlCandidates.length === 0) return exactCandidates;
    if (exactCandidates.length === 0) return htmlCandidates;
    return this.#orderedUnion(htmlCandidates, exactCandidates);
  }

  #complex(selector: ComplexSelector, node: TNode): DecisionResult {
    return this.#complexAt(selector, selector.compounds.length - 1, node);
  }

  #decisions(
    cache: Map<ComplexSelector, Map<number, Map<TNode, DecisionResult>>>,
    selector: ComplexSelector,
    index: number
  ): Map<TNode, DecisionResult> {
    let byIndex = cache.get(selector);
    if (byIndex === undefined) {
      byIndex = new Map();
      cache.set(selector, byIndex);
    }
    let byNode = byIndex.get(index);
    if (byNode === undefined) {
      byNode = new Map();
      byIndex.set(index, byNode);
    }
    return byNode;
  }

  #complexAt(
    selector: ComplexSelector,
    index: number,
    node: TNode,
    anchor: TNode | null = null
  ): DecisionResult {
    this.#guard.step();
    const decisions = anchor === null ? this.#decisions(this.#matches, selector, index) : null;
    const cached = decisions?.get(node);
    if (cached !== undefined) return cached;
    const compound = selector.compounds[index];
    if (compound === undefined) return known("no-match");
    const own = this.#compound(compound, node);
    let result = own;
    if (own.decision !== "no-match" && index === 0 && anchor !== null) {
      result = and(own, this.#anchorRelation(selector.leadingCombinator ?? " ", anchor, node), this.#guard);
    }
    if (own.decision !== "no-match" && index > 0) {
      const combinator = selector.combinators[index - 1];
      const related = combinator === " " && anchor === null
        ? this.#ancestorMatch(selector, index - 1, node)
        : orMapped(
            this.#leftCandidates(node, combinator),
            (candidate) => this.#complexAt(selector, index - 1, candidate, anchor),
            this.#guard
          );
      result = and(own, related, this.#guard);
    }
    decisions?.set(node, result);
    return result;
  }

  #ancestorMatch(
    selector: ComplexSelector,
    index: number,
    node: TNode
  ): DecisionResult {
    const decisions = this.#decisions(this.#ancestors, selector, index);
    const visited: { readonly node: TNode; readonly own: DecisionResult }[] = [];
    let candidate = this.#index.parent.get(node) ?? null;
    let result = known("no-match");
    while (candidate !== null) {
      this.#guard.step();
      const cached = decisions.get(candidate);
      if (cached !== undefined) {
        result = cached;
        break;
      }
      const own = this.#index.elementData.has(candidate)
        ? this.#complexAt(selector, index, candidate)
        : known("no-match");
      visited.push({ node: candidate, own });
      if (own.decision === "match") break;
      candidate = this.#index.parent.get(candidate) ?? null;
    }
    // Cache inclusive ancestry from the farthest visited ancestor back toward
    // the subject. Iteration also handles trees deeper than the JS call stack.
    for (let position = visited.length - 1; position >= 0; position -= 1) {
      this.#guard.step();
      const entry = visited[position];
      if (entry === undefined) continue;
      result = orMapped([entry.own, result], (value) => value, this.#guard);
      decisions.set(entry.node, result);
    }
    return result;
  }

  #relative(selector: ComplexSelector, anchor: TNode): DecisionResult {
    const first = selector.compounds[0];
    if (first === undefined) return known("no-match");
    const firstCandidates = this.#compoundCandidates(first);
    if (firstCandidates?.length === 0) return known("no-match");
    let candidates: Iterable<TNode> = this.#relativeCandidates(
      anchor,
      selector.leadingCombinator ?? " ",
      firstCandidates
    );
    // Candidate propagation only narrows structural possibilities. The normal
    // matcher still decides every compound and combines unknown reasons in the
    // same right-to-left order as non-relative selectors.
    for (let index = 1; index < selector.compounds.length; index += 1) {
      this.#guard.step();
      const compound = selector.compounds[index];
      if (compound === undefined) return known("no-match");
      const indexed = this.#compoundCandidates(compound);
      if (indexed?.length === 0) return known("no-match");
      const related: (readonly TNode[])[] = [];
      for (const candidate of candidates) {
        this.#guard.step();
        related.push(copyValues(this.#relativeCandidates(
          candidate,
          selector.combinators[index - 1] ?? " ",
          indexed
        ), this.#guard));
      }
      candidates = this.#orderedUnionMany(related);
    }
    return orMapped(candidates, (candidate) => this.#complexAt(
      selector, selector.compounds.length - 1, candidate, anchor
    ), this.#guard);
  }

  *#relativeCandidates(
    anchor: TNode,
    combinator: SelectorCombinator,
    indexed: readonly TNode[] | null
  ): Iterable<TNode> {
    if (indexed?.length === 0) return;
    if (combinator === "+" || combinator === "~") {
      let sibling = this.#index.nextElementSibling.get(anchor);
      while (sibling !== undefined) {
        this.#guard.step();
        yield sibling;
        if (combinator === "+") return;
        sibling = this.#index.nextElementSibling.get(sibling);
      }
      return;
    }
    if (combinator === ">") {
      const children = this.#index.children.get(anchor) ?? [];
      if (indexed !== null && indexed.length < children.length) {
        for (const candidate of indexed) {
          this.#guard.step();
          if (this.#index.parent.get(candidate) === anchor) yield candidate;
        }
        return;
      }
      for (const child of children) {
        this.#guard.step();
        if (this.#index.elementData.has(child)) yield child;
      }
      return;
    }
    const start = this.#index.elementOrder.get(anchor);
    const end = this.#index.elementSubtreeEnd.get(anchor);
    if (start === undefined || end === undefined) return;
    if (indexed !== null) {
      let low = 0;
      let high = indexed.length;
      while (low < high) {
        this.#guard.step();
        const middle = Math.floor((low + high) / 2);
        const candidate = indexed[middle];
        if (candidate !== undefined && this.#candidateOrder(candidate) <= start) {
          low = middle + 1;
        } else high = middle;
      }
      for (let index = low; index < indexed.length; index += 1) {
        this.#guard.step();
        const candidate = indexed[index];
        if (candidate === undefined || this.#candidateOrder(candidate) > end) break;
        yield candidate;
      }
      return;
    }
    for (let order = start + 1; order <= end; order += 1) {
      this.#guard.step();
      const candidate = this.#index.elements[order];
      if (candidate !== undefined) yield candidate;
    }
  }

  #compound(compound: CompoundSelector, node: TNode): DecisionResult {
    const data = this.#index.elementData.get(node);
    if (data === undefined) return known("no-match");
    let result = compound.type === null
      ? known("match")
      : this.#type(compound.type, data);
    for (const simple of compound.simples) {
      this.#guard.step();
      result = and(result, this.#simple(simple, node, data), this.#guard);
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
    this.#guard.step(1 + element.localName.length + selector.name.length);
    const equal = this.environment.documentMode.syntax === "html" &&
      element.namespace === "http://www.w3.org/1999/xhtml"
      ? equalAsciiInsensitive(element.localName, selector.name, this.#guard)
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
      case "class": {
        const values = simple.kind === "id"
          ? this.environment.idValues(node, element)
          : this.environment.classNames(node, element);
        this.#guard.assertActive();
        for (const value of values) {
          if (this.#identityEqual(value, simple.value)) return known("match");
        }
        return known("no-match");
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
    this.#guard.step(1 + left.length + right.length);
    return this.environment.documentMode.syntax === "html" &&
        this.environment.documentMode.quirks === "quirks"
      ? equalAsciiInsensitive(left, right, this.#guard)
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
    this.#guard.step();
    const sensitivity = selector.modifier === "i"
      ? "ascii-insensitive"
      : selector.modifier === "s"
        ? "sensitive"
        : this.environment.attributeValueCaseSensitivity(element, attribute);
    this.#guard.assertActive();
    this.#guard.step(1 + attribute.value.length + expected.length);
    const left = sensitivity === "ascii-insensitive"
      ? lowerAscii(attribute.value, this.#guard)
      : attribute.value;
    const right = sensitivity === "ascii-insensitive"
      ? lowerAscii(expected, this.#guard)
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
          whitespaceTokens(left, this.#guard).includes(right) ? "match" : "no-match"
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
      return orMapped(
        pseudo.argument.selectors,
        (selector) => this.#complex(selector, node),
        this.#guard
      );
    }
    if (
      name === "not" &&
      pseudo.argument.kind === "selector-list"
    ) {
      return invert(orMapped(
        pseudo.argument.selectors,
        (selector) => this.#complex(selector, node),
        this.#guard
      ));
    }
    if (
      name === "has" &&
      pseudo.argument.kind === "selector-list"
    ) {
      return orMapped(
        pseudo.argument.selectors,
        (selector) => this.#relative(selector, node),
        this.#guard
      );
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
        !this.#index.elementData.has(parent)
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
    this.#guard.step();
    const decision = this.environment.matchPseudoClass(
      node,
      pseudo,
      this.#pseudoContext()
    );
    this.#guard.assertActive();
    return decision === "unknown"
      ? unknown({
          code: "pseudo-class",
          name,
          span: pseudo.span
        })
      : known(decision);
  }

  #pseudoContext(): SelectorPseudoContext<TNode> {
    return Object.freeze({
      root: this.#index.root,
      scopes: this.#scopes
    });
  }

  #empty(node: TNode): DecisionResult {
    for (const child of this.#index.children.get(node) ?? []) {
      this.#guard.step();
      const data = this.environment.tree.data(child);
      this.#guard.assertActive();
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
    if (name === "first-child" || name === "last-child" || name === "only-child") {
      if (pseudo.argument.kind !== "none" || (this.#index.parent.get(node) ?? null) === null) return known("no-match");
      const first = !this.#index.previousElementSibling.has(node);
      const last = !this.#index.nextElementSibling.has(node);
      return known((name === "first-child" ? first : name === "last-child" ? last : first && last) ? "match" : "no-match");
    }
    if (name === "first-of-type" || name === "last-of-type" || name === "only-of-type") {
      if (pseudo.argument.kind !== "none") return known("no-match");
      const rank = this.#index.siblingRanks.get(node);
      if (rank === undefined) return known("no-match");
      const first = rank.typeIndex === 1;
      const last = rank.typeIndex === rank.typeCount;
      return known((name === "first-of-type" ? first : name === "last-of-type" ? last : first && last) ? "match" : "no-match");
    }
    if (pseudo.argument.kind !== "nth") return null;
    const mode = NTH_MODES[name];
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
    this.#guard.step();
    if (filter.length === 0) {
      const rank = this.#index.siblingRanks.get(node);
      if (rank === undefined) return { index: 0, result: known("no-match") };
      const position = sameType ? rank.typeIndex : rank.index;
      const count = sameType ? rank.typeCount : rank.count;
      return { index: fromEnd ? count - position + 1 : position, result: known("match") };
    }
    const siblings = this.#index.children.get(parent) ?? [];
    const typeKey = sameType
      ? elementTypeKey(element, this.environment.documentMode.syntax === "html", this.#guard)
      : null;
    let index = 0;
    const reasons: SelectorUnknownReason[] = [];
    for (let offset = 0; offset < siblings.length; offset += 1) {
      this.#guard.step();
      const sibling = siblings[fromEnd ? siblings.length - 1 - offset : offset];
      if (sibling === undefined) continue;
      const data = this.#index.elementData.get(sibling);
      if (data === undefined) continue;
      if (typeKey !== null && elementTypeKey(
        data, this.environment.documentMode.syntax === "html", this.#guard
      ) !== typeKey) continue;
      const included = orMapped(filter, (selector) => this.#complex(selector, sibling), this.#guard);
      if (included.decision === "unknown") {
        for (const reason of included.reasons) {
          this.#guard.step();
          reasons.push(reason);
        }
      }
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
                reasons: uniqueReasons(reasons, this.#guard)
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
      this.#guard.step(1 + attribute.localName.length + name.length + (namespace?.length ?? 0) + (attribute.namespace?.length ?? 0));
      const nameEqual = this.environment.documentMode.syntax === "html" &&
        element.namespace === "http://www.w3.org/1999/xhtml" &&
        attribute.namespace === null
        ? equalAsciiInsensitive(attribute.localName, name, this.#guard)
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

  #attributeNamespace(
    selector: SelectorAttribute
  ): SelectorNamespaceResolution {
    if (selector.namespace === null || selector.namespace === "") {
      return Object.freeze({ status: "resolved", namespace: null });
    }
    if (selector.namespace === "*") {
      return Object.freeze({ status: "resolved", namespace: "*" });
    }
    this.#guard.step(1 + selector.namespace.length);
    const resolution = this.environment.resolveNamespacePrefix(selector.namespace);
    this.#guard.assertActive();
    return resolution;
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
      this.#guard.step(1 + selectorNamespace.length);
      resolution = this.environment.resolveNamespacePrefix(selectorNamespace);
      this.#guard.assertActive();
    }
    if (resolution.status === "unknown") {
      return unknown({
        code: "namespace-prefix",
        name: selectorNamespace ?? name,
        span
      });
    }
    this.#guard.step(1 + (resolution.namespace?.length ?? 0) + (element.namespace?.length ?? 0));
    return known(
      resolution.namespace === element.namespace ? "match" : "no-match"
    );
  }

  *#leftCandidates(
    node: TNode,
    combinator: SelectorCombinator | undefined
  ): Iterable<TNode> {
    const parent = this.#index.parent.get(node) ?? null;
    if (combinator === ">") {
      if (parent !== null && this.#index.elementData.has(parent)) yield parent;
      return;
    }
    if (combinator === "+" || combinator === "~") {
      let sibling = this.#index.previousElementSibling.get(node);
      while (sibling !== undefined) {
        this.#guard.step();
        yield sibling;
        if (combinator === "+") return;
        sibling = this.#index.previousElementSibling.get(sibling);
      }
      return;
    }
    let candidate = parent;
    while (candidate !== null) {
      this.#guard.step();
      if (this.#index.elementData.has(candidate)) yield candidate;
      candidate = this.#index.parent.get(candidate) ?? null;
    }
  }

  #anchorRelation(
    combinator: SelectorCombinator,
    anchor: TNode,
    node: TNode
  ): DecisionResult {
    if (combinator === ">") {
      return known(this.#index.parent.get(node) === anchor ? "match" : "no-match");
    }
    if (combinator === "+") {
      return known(this.#index.nextElementSibling.get(anchor) === node ? "match" : "no-match");
    }
    const anchorOrder = this.#candidateOrder(anchor);
    const nodeOrder = this.#candidateOrder(node);
    if (combinator === "~") {
      return known(
        this.#index.parent.get(anchor) === this.#index.parent.get(node) && nodeOrder > anchorOrder
          ? "match" : "no-match"
      );
    }
    return known(
      nodeOrder > anchorOrder && nodeOrder <= (this.#index.elementSubtreeEnd.get(anchor) ?? anchorOrder)
        ? "match" : "no-match"
    );
  }

}

class ImmutableSelectorMatchSession<TNode extends object>
implements SelectorMatchSession<TNode> {
  readonly #matcher: SelectorMatcher<TNode>;

  constructor(
    root: TNode,
    environment: SelectorEnvironment<TNode>,
    options: SelectorMatchOptions<TNode>
  ) {
    this.#matcher = new SelectorMatcher(root, environment, options);
  }

  beginEvaluation(options: SelectorEvaluationOptions = {}): void {
    this.#matcher.beginEvaluation(options);
  }

  match(selector: SelectorList, node: TNode): SelectorMatchResult {
    try {
      this.#matcher.beginOperation();
      const result = this.#matcher.matches(selector, node);
      this.#matcher.materialize(0);
      return publicResult(result, this.#matcher.usage());
    } finally {
      this.#matcher.finishOperation();
    }
  }

  query(selector: SelectorList): SelectorQueryResult<TNode> {
    try {
      this.#matcher.beginOperation();
      const matches: TNode[] = [];
      const unknownResults: SelectorQueryUnknown<TNode>[] = [];
      for (const node of this.#matcher.queryCandidates(selector)) {
        const result = this.#matcher.matches(selector, node);
        if (result.decision === "match") matches.push(node);
        else if (result.decision === "unknown") {
          unknownResults.push(Object.freeze({ node, reasons: result.reasons }));
        }
      }
      this.#matcher.materialize(matches.length + unknownResults.length);
      return Object.freeze({
        matches: Object.freeze(matches),
        unknown: Object.freeze(unknownResults),
        usage: this.#matcher.usage()
      });
    } finally {
      this.#matcher.finishOperation();
    }
  }

  usage(): ResourceUsage {
    return this.#matcher.usage();
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
  return createSelectorMatchSession(root, environment, options).match(
    selector,
    node
  );
}

export function querySelectorList<TNode extends object>(
  selector: SelectorList,
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  options: SelectorMatchOptions<TNode> = {}
): SelectorQueryResult<TNode> {
  return createSelectorMatchSession(root, environment, options).query(selector);
}

export function createSelectorMatchSession<TNode extends object>(
  root: TNode,
  environment: SelectorEnvironment<TNode>,
  options: SelectorMatchOptions<TNode> = {}
): SelectorMatchSession<TNode> {
  return new ImmutableSelectorMatchSession(root, environment, options);
}
