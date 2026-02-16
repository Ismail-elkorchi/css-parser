import {
  BudgetExceededError,
  PatchPlanningError,
  applyPatchPlan,
  chunk,
  compileSelectorList,
  computePatch,
  findAllByType,
  findById,
  getParseErrorSpecRef,
  matchesSelector,
  outline,
  parse,
  querySelectorAll,
  serialize,
  tokenizeStream,
  walk,
  walkByType
} from "../../dist/mod.js";
import { writeJson } from "./eval-primitives.mjs";

function toFailure(error) {
  return error instanceof Error ? error.message : String(error);
}

function createByteStream(chunks) {
  const Stream = globalThis.ReadableStream;
  if (typeof Stream !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  return new Stream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

function findFirstNodeByType(root, type) {
  let match = null;

  const walkNode = (node) => {
    if (match !== null) {
      return;
    }
    if (node.type === type) {
      match = node;
      return;
    }

    const children = Array.isArray(node.children) ? node.children : [];
    for (const child of children) {
      if (child && typeof child === "object" && typeof child.type === "string") {
        walkNode(child);
      }
    }
  };

  walkNode(root);
  return match;
}

function evaluateTraceFeature() {
  const source = ".a{color:red}.b{margin:1px}";
  const first = parse(source, {
    trace: true,
    budgets: {
      maxInputBytes: 4096,
      maxTraceEvents: 128,
      maxTraceBytes: 32768
    }
  });
  const second = parse(source, {
    trace: true,
    budgets: {
      maxInputBytes: 4096,
      maxTraceEvents: 128,
      maxTraceBytes: 32768
    }
  });

  const firstTrace = Array.isArray(first.trace) ? first.trace : [];
  const secondTrace = Array.isArray(second.trace) ? second.trace : [];
  const kinds = [...new Set(firstTrace.map((entry) => entry.kind))];

  let budgetError = null;
  try {
    parse(source, {
      trace: true,
      budgets: {
        maxTraceEvents: 1,
        maxTraceBytes: 64
      }
    });
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      budgetError = error.payload;
    }
  }

  const ok =
    firstTrace.length > 0 &&
    kinds.includes("decode") &&
    kinds.includes("token") &&
    kinds.includes("parse") &&
    JSON.stringify(firstTrace) === JSON.stringify(secondTrace) &&
    budgetError !== null;

  return {
    ok,
    details: {
      traceLength: firstTrace.length,
      kinds,
      deterministic: JSON.stringify(firstTrace) === JSON.stringify(secondTrace),
      budgetError
    }
  };
}

function evaluateSpansFeature() {
  const source = ".x{color:red}.y{margin:1px}";
  const parsed = parse(source, { captureSpans: true });
  const firstRule = findFirstNodeByType(parsed.root, "Rule");
  const inBounds =
    firstRule &&
    firstRule.span &&
    firstRule.span.start >= 0 &&
    firstRule.span.end >= firstRule.span.start &&
    firstRule.span.end <= source.length;

  const ok = Boolean(firstRule && inBounds && firstRule.spanProvenance === "input");

  return {
    ok,
    details: {
      firstRuleId: firstRule?.id ?? null,
      firstRuleSpan: firstRule?.span ?? null,
      firstRuleSpanProvenance: firstRule?.spanProvenance ?? null,
      inBounds: Boolean(inBounds)
    }
  };
}

function evaluatePatchFeature() {
  const source = ".a{color:red}.b{margin:1px}";
  const parsed = parse(source, { captureSpans: true });
  const firstRule = findFirstNodeByType(parsed.root, "Rule");
  const secondRule = (() => {
    const rules = [];
    for (const node of findAllByType(parsed, "Rule")) {
      rules.push(node);
    }
    return rules[1] ?? null;
  })();

  if (!firstRule || !secondRule) {
    return {
      ok: false,
      details: {
        reason: "Unable to find target rules"
      }
    };
  }

  const edits = [
    { kind: "replaceNode", target: firstRule.id, css: ".a{color:blue}" },
    { kind: "insertCssAfter", target: secondRule.id, css: ".c{padding:2px}" }
  ];

  const firstPlan = computePatch(source, edits);
  const secondPlan = computePatch(source, edits);
  const patched = applyPatchPlan(source, firstPlan);
  const reparsed = serialize(parse(patched));
  const expected = serialize(parse(".a{color:blue}.b{margin:1px}.c{padding:2px}"));

  let structuredErrorOk = false;
  try {
    computePatch(source, [{ kind: "replaceNode", target: 999999, css: ".z{}" }]);
  } catch (error) {
    if (error instanceof PatchPlanningError) {
      structuredErrorOk = error.payload.code === "NODE_NOT_FOUND";
    }
  }

  const ok =
    JSON.stringify(firstPlan.steps) === JSON.stringify(secondPlan.steps) &&
    reparsed === expected &&
    structuredErrorOk;

  return {
    ok,
    details: {
      deterministicPlan: JSON.stringify(firstPlan.steps) === JSON.stringify(secondPlan.steps),
      patched,
      reparsed,
      expected,
      structuredErrorOk
    }
  };
}

function evaluateOutlineFeature() {
  const source = "@media (min-width:1px){.a{color:red}} .b:hover{margin:1px}";
  const first = parse(source);
  const second = parse(source);

  const firstOutline = outline(first);
  const secondOutline = outline(second);

  const walkA = [];
  walk(first, (node, depth) => {
    walkA.push(`${depth}:${node.type}`);
  });

  const walkB = [];
  walk(second, (node, depth) => {
    walkB.push(`${depth}:${node.type}`);
  });

  const byTypeA = [];
  walkByType(first, "Rule", (node, depth) => {
    byTypeA.push(`${depth}:${node.id}`);
  });

  const byTypeB = [];
  walkByType(second, "Rule", (node, depth) => {
    byTypeB.push(`${depth}:${node.id}`);
  });

  const firstRule = byTypeA.length > 0 ? findById(first, Number(byTypeA[0].split(":")[1])) : null;

  const ok =
    JSON.stringify(firstOutline) === JSON.stringify(secondOutline) &&
    JSON.stringify(walkA) === JSON.stringify(walkB) &&
    JSON.stringify(byTypeA) === JSON.stringify(byTypeB) &&
    firstOutline.entries.length > 0 &&
    firstRule !== null;

  return {
    ok,
    details: {
      entryCount: firstOutline.entries.length,
      deterministicOutline: JSON.stringify(firstOutline) === JSON.stringify(secondOutline),
      deterministicWalk: JSON.stringify(walkA) === JSON.stringify(walkB),
      deterministicTypeWalk: JSON.stringify(byTypeA) === JSON.stringify(byTypeB)
    }
  };
}

function evaluateChunkFeature() {
  const source = ".a{color:red}.b{margin:1px}.c{padding:2px}.d{display:block}";
  const tree = parse(source);
  const first = chunk(tree, { maxChars: 16, maxNodes: 12, maxBytes: 48 });
  const second = chunk(tree, { maxChars: 16, maxNodes: 12, maxBytes: 48 });

  const encoder = new TextEncoder();
  const maxBytesOk = first.every((entry) => encoder.encode(entry.content).length <= 48);

  const ok = JSON.stringify(first) === JSON.stringify(second) && maxBytesOk && first.length > 0;

  return {
    ok,
    details: {
      chunkCount: first.length,
      deterministic: JSON.stringify(first) === JSON.stringify(second),
      maxBytesOk
    }
  };
}

async function evaluateStreamTokenFeature() {
  const encoder = new TextEncoder();
  const chunks = [encoder.encode(".a{"), encoder.encode("color:red"), encoder.encode("}")];

  const collect = async () => {
    const out = [];
    for await (const token of tokenizeStream(createByteStream(chunks), {
      budgets: {
        maxInputBytes: 1024,
        maxTokens: 256,
        maxBufferedBytes: 128
      }
    })) {
      out.push(token.rawKind);
    }
    return out;
  };

  const first = await collect();
  const second = await collect();

  const ok = JSON.stringify(first) === JSON.stringify(second) && first.length > 0;

  return {
    ok,
    details: {
      tokenCount: first.length,
      deterministic: JSON.stringify(first) === JSON.stringify(second)
    }
  };
}

function evaluateParseErrorFeature() {
  const malformed = parse("@media ( { color: red; }");
  const ids = malformed.errors.map((entry) => entry.parseErrorId);
  const refsStable = ids.every((id) => getParseErrorSpecRef(id) === "https://drafts.csswg.org/css-syntax/#error-handling");

  return {
    ok: ids.length > 0 && refsStable,
    details: {
      count: ids.length,
      refsStable,
      ids: ids.slice(0, 8)
    }
  };
}

function evaluateSelectorFeature() {
  const tree = {
    kind: "document",
    children: [
      {
        kind: "element",
        tagName: "main",
        nodeRef: "main",
        attributes: [
          {
            name: "id",
            value: "content"
          }
        ],
        children: [
          {
            kind: "element",
            tagName: "section",
            nodeRef: "section-a",
            attributes: [],
            children: [
              {
                kind: "element",
                tagName: "div",
                nodeRef: "card-a",
                attributes: [
                  {
                    name: "class",
                    value: "card featured"
                  },
                  {
                    name: "data-role",
                    value: "item"
                  }
                ],
                children: []
              }
            ]
          },
          {
            kind: "element",
            tagName: "section",
            nodeRef: "section-b",
            attributes: [],
            children: [
              {
                kind: "element",
                tagName: "div",
                nodeRef: "card-b",
                attributes: [
                  {
                    name: "class",
                    value: "card"
                  },
                  {
                    name: "data-role",
                    value: "item"
                  }
                ],
                children: []
              }
            ]
          }
        ]
      }
    ]
  };

  const findByNodeRef = (root, nodeRef) => {
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current || typeof current !== "object") {
        continue;
      }
      if (current.nodeRef === nodeRef) {
        return current;
      }
      if (Array.isArray(current.children)) {
        for (let index = current.children.length - 1; index >= 0; index -= 1) {
          stack.push(current.children[index]);
        }
      }
    }
    return null;
  };

  const selectorText = "section > .card[data-role=\"item\"]";
  const compiledA = compileSelectorList(selectorText);
  const compiledB = compileSelectorList(selectorText);

  const resolveRefs = (selector) => querySelectorAll(selector, tree).map((node) => String(node.nodeRef ?? ""));
  const firstRefs = resolveRefs(compiledA);
  const secondRefs = resolveRefs(compiledA);
  const deterministicCompile = JSON.stringify(compiledA) === JSON.stringify(compiledB);
  const deterministicQuery = JSON.stringify(firstRefs) === JSON.stringify(secondRefs);

  const cardA = findByNodeRef(tree, "card-a");
  const cardB = findByNodeRef(tree, "card-b");
  const cardAOk = cardA ? matchesSelector(compiledA, cardA, tree) : false;
  const cardBOk = cardB ? matchesSelector(compiledA, cardB, tree) : false;

  const unsupportedCompiled = compileSelectorList(":hover");
  let strictThrow = false;
  try {
    querySelectorAll(":hover", tree, { strict: true });
  } catch {
    strictThrow = true;
  }

  const ok =
    compiledA.supported &&
    firstRefs.length === 2 &&
    firstRefs[0] === "card-a" &&
    firstRefs[1] === "card-b" &&
    deterministicCompile &&
    deterministicQuery &&
    cardAOk &&
    cardBOk &&
    unsupportedCompiled.unsupportedParts.length > 0 &&
    strictThrow;

  return {
    ok,
    details: {
      supported: compiledA.supported,
      deterministicCompile,
      deterministicQuery,
      resultRefs: firstRefs,
      strictThrow,
      unsupportedParts: unsupportedCompiled.unsupportedParts.length
    }
  };
}

async function main() {
  const features = {};
  const failures = [];

  try {
    features.trace = evaluateTraceFeature();
  } catch (error) {
    features.trace = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "trace", error: toFailure(error) });
  }

  try {
    features.spans = evaluateSpansFeature();
  } catch (error) {
    features.spans = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "spans", error: toFailure(error) });
  }

  try {
    features.patch = evaluatePatchFeature();
  } catch (error) {
    features.patch = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "patch", error: toFailure(error) });
  }

  try {
    features.outline = evaluateOutlineFeature();
  } catch (error) {
    features.outline = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "outline", error: toFailure(error) });
  }

  try {
    features.chunk = evaluateChunkFeature();
  } catch (error) {
    features.chunk = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "chunk", error: toFailure(error) });
  }

  try {
    features.streamToken = await evaluateStreamTokenFeature();
  } catch (error) {
    features.streamToken = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "streamToken", error: toFailure(error) });
  }

  try {
    features.parseErrorId = evaluateParseErrorFeature();
  } catch (error) {
    features.parseErrorId = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "parseErrorId", error: toFailure(error) });
  }

  try {
    features.selectors = evaluateSelectorFeature();
  } catch (error) {
    features.selectors = { ok: false, details: { error: toFailure(error) } };
    failures.push({ feature: "selectors", error: toFailure(error) });
  }

  const overallOk =
    features.trace?.ok === true &&
    features.spans?.ok === true &&
    features.patch?.ok === true &&
    features.outline?.ok === true &&
    features.chunk?.ok === true &&
    features.streamToken?.ok === true &&
    features.parseErrorId?.ok === true &&
    features.selectors?.ok === true;

  await writeJson("reports/agent.json", {
    suite: "agent",
    timestamp: new Date().toISOString(),
    overall: {
      ok: overallOk
    },
    features,
    failures
  });

  if (!overallOk) {
    console.error("Agent report failed. See reports/agent.json");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
