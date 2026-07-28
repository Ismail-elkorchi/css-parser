import type {
  ComplexSelector,
  SelectorList,
  SelectorPseudoClass,
  SelectorPseudoElement,
  SelectorSpecificity,
  SelectorSpecificityOptions,
  SimpleSelector
} from "./types.ts";

const ZERO: SelectorSpecificity = Object.freeze({ a: 0, b: 0, c: 0 });

function add(
  left: SelectorSpecificity,
  right: SelectorSpecificity
): SelectorSpecificity {
  return Object.freeze({
    a: left.a + right.a,
    b: left.b + right.b,
    c: left.c + right.c
  });
}

function compare(
  left: SelectorSpecificity,
  right: SelectorSpecificity
): number {
  return left.a - right.a || left.b - right.b || left.c - right.c;
}

function maximum(
  selectors: readonly ComplexSelector[],
  options: SelectorSpecificityOptions
): SelectorSpecificity {
  let best = ZERO;
  for (const selector of selectors) {
    const candidate = specificityOfComplexSelector(selector, options);
    if (compare(candidate, best) > 0) best = candidate;
  }
  return best;
}

function pseudoClassSpecificity(
  pseudo: SelectorPseudoClass,
  options: SelectorSpecificityOptions
): SelectorSpecificity {
  if (
    pseudo.name === "where" &&
    pseudo.argument.kind === "selector-list"
  ) {
    return ZERO;
  }
  if (
    (pseudo.name === "is" ||
      pseudo.name === "not" ||
      pseudo.name === "has") &&
    pseudo.argument.kind === "selector-list"
  ) {
    return maximum(pseudo.argument.selectors, options);
  }
  const own = Object.freeze({ a: 0, b: 1, c: 0 });
  if (
    (pseudo.name === "nth-child" ||
      pseudo.name === "nth-last-child") &&
    pseudo.argument.kind === "nth"
  ) {
    return add(own, maximum(pseudo.argument.of, options));
  }
  return own;
}

function pseudoElementSpecificity(
  pseudo: SelectorPseudoElement,
  options: SelectorSpecificityOptions
): SelectorSpecificity {
  const own = Object.freeze({ a: 0, b: 0, c: 1 });
  if (
    pseudo.name === "slotted" &&
    pseudo.argument.kind === "selector-list"
  ) {
    return add(own, maximum(pseudo.argument.selectors, options));
  }
  return own;
}

function simpleSpecificity(
  simple: SimpleSelector,
  options: SelectorSpecificityOptions
): SelectorSpecificity {
  switch (simple.kind) {
    case "id":
      return Object.freeze({ a: 1, b: 0, c: 0 });
    case "class":
    case "attribute":
      return Object.freeze({ a: 0, b: 1, c: 0 });
    case "pseudo-class":
      return pseudoClassSpecificity(simple, options);
    case "pseudo-element":
      return pseudoElementSpecificity(simple, options);
    case "nesting":
      return options.nesting ?? ZERO;
  }
}

export function specificityOfComplexSelector(
  selector: ComplexSelector,
  options: SelectorSpecificityOptions = {}
): SelectorSpecificity {
  let result = ZERO;
  for (const compound of selector.compounds) {
    if (compound.type !== null && !compound.type.universal) {
      result = add(result, Object.freeze({ a: 0, b: 0, c: 1 }));
    }
    for (const simple of compound.simples) {
      result = add(result, simpleSpecificity(simple, options));
    }
  }
  return result;
}

export function specificitiesOfSelectorList(
  list: SelectorList,
  options: SelectorSpecificityOptions = {}
): readonly SelectorSpecificity[] {
  return Object.freeze(
    list.selectors.map((selector) =>
      specificityOfComplexSelector(selector, options)
    )
  );
}
