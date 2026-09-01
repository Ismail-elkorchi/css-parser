import { mkdir, writeFile } from "node:fs/promises";

import {
  createPropertyValidationSession,
  createSelectorMatchSession,
  parseDeclaration,
  parseSelectorList,
  parseSelectorListFromComponentValues,
  parseStylesheet,
  serializeCssComponentValues
} from "../../dist/mod.js";

const reportPath = new URL("../../reports/performance.json", import.meta.url);

function buildStylesheet(ruleCount) {
  return Array.from(
    { length: ruleCount },
    (_, index) =>
      `.item-${index}{color:rgb(${index % 255} ${(index * 3) % 255} ${(index * 7) % 255});` +
      `margin:${index % 12}px;transform:translateX(${index % 20}px)}`
  ).join("");
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[middle] ?? 0);
}

function percentile(values, percentileValue) {
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * percentileValue) - 1)
  );
  return sorted[index] ?? 0;
}

function measure(name, source, iterations) {
  for (let index = 0; index < 4; index += 1) parseStylesheet(source);

  const durations = [];
  let maxErrors = 0;
  for (let index = 0; index < iterations; index += 1) {
    const start = process.hrtime.bigint();
    const result = parseStylesheet(source);
    durations.push(Number(process.hrtime.bigint() - start));
    maxErrors = Math.max(maxErrors, result.errors.length);
  }

  const medianNs = median(durations);
  return {
    name,
    bytes: new TextEncoder().encode(source).byteLength,
    iterations,
    medianNs,
    nsPerByte: Number((medianNs / source.length).toFixed(3)),
    maxErrors
  };
}

function measureSelectorCompilation(source, iterations) {
  const stylesheet = parseStylesheet(source);
  if (!stylesheet.ok) throw new Error("selector compilation fixture did not parse");
  const preludes = stylesheet.value.rules.flatMap((rule) =>
    rule.kind === "qualified-rule" ? [rule.prelude] : []
  );
  const serialized = preludes.map((prelude) => serializeCssComponentValues(prelude).trim());
  const directDurations = [];
  const reparsedDurations = [];
  for (let iteration = 0; iteration < iterations + 4; iteration += 1) {
    let start = process.hrtime.bigint();
    for (const prelude of preludes) {
      if (!parseSelectorListFromComponentValues(prelude).ok) {
        throw new Error("retained selector prelude did not parse");
      }
    }
    const direct = Number(process.hrtime.bigint() - start);
    start = process.hrtime.bigint();
    for (const selector of serialized) {
      if (!parseSelectorList(selector).ok) throw new Error("serialized selector did not parse");
    }
    const reparsed = Number(process.hrtime.bigint() - start);
    if (iteration >= 4) {
      directDurations.push(direct);
      reparsedDurations.push(reparsed);
    }
  }
  const directMedianNs = median(directDurations);
  const reparseMedianNs = median(reparsedDurations);
  return {
    selectors: preludes.length,
    iterations,
    directMedianNs,
    reparseMedianNs,
    directToReparseRatio: directMedianNs / reparseMedianNs,
  };
}

const scenarios = [
  measure("small", buildStylesheet(40), 30),
  measure("medium", buildStylesheet(160), 20),
  measure("large", buildStylesheet(640), 12)
];
const growth = scenarios.slice(1).map((current, index) => {
  const previous = scenarios[index];
  if (previous === undefined) throw new Error("performance scenario ordering is invalid");
  const inputRatio = current.bytes / previous.bytes;
  const timeRatio = current.medianNs / previous.medianNs;
  return {
    from: previous.name,
    to: current.name,
    inputRatio,
    timeRatio,
    normalizedGrowth: timeRatio / inputRatio
  };
});

const maxNormalizedGrowth = 1.75;
// The p95 case returns and verifies all 100,000 elements through a seven-branch
// selector list. This ceiling guards the complete-output workload while the
// sparse-union regression separately proves that small joins are sublinear in
// document size.
const maxSelectorQueryP95Ns = 750_000_000;
const maxPropertyValidationP95Ns = 250_000;
const HTML = "http://www.w3.org/1999/xhtml";
const FOREIGN = "http://www.w3.org/2000/svg";
const selectorChildren = Array.from({ length: 100_000 }, (_, index) => ({
  kind: "element",
  id: `element-${String(index)}`,
  namespace: index % 97 === 0 ? FOREIGN : HTML,
  localName: ["div", "span", "a", "p", "li", "td", "th"][index % 7],
  attributes: [
    { namespace: null, localName: "class", value: `item group-${String(index % 31)}` },
    ...(index % 113 === 0
      ? [{ namespace: null, localName: "data-marker", value: "yes" }]
      : [])
  ],
  children: []
}));
const selectorRoot = { kind: "other", children: selectorChildren };
const selectorEnvironment = {
  tree: {
    data(node) {
      return node.kind === "element"
        ? {
            kind: "element",
            namespace: node.namespace,
            localName: node.localName,
            attributes: node.attributes
          }
        : { kind: "other" };
    },
    children(node) {
      return node.children;
    }
  },
  documentMode: { syntax: "html", quirks: "no-quirks" },
  defaultNamespace: { kind: "any" },
  idValues(node) {
    return [node.id];
  },
  classNames(_node, data) {
    return data.attributes
      .filter((attribute) => attribute.localName === "class")
      .flatMap((attribute) => attribute.value.split(" "));
  },
  resolveNamespacePrefix() {
    return { status: "unknown" };
  },
  attributeValueCaseSensitivity() {
    return "sensitive";
  },
  matchPseudoClass() {
    return "no-match";
  }
};
const selectorSources = [
  "div", "span", "a", "p", "li", "td", "th",
  "div, span, a, p, li, td, th",
  ":is(div, span, a, p, li, td, th)",
  ".group-1[data-marker]",
  "#element-99999, #element-2, #element-50000"
];
const selectorPrograms = selectorSources.map((source) => {
  const parsed = parseSelectorList(source);
  if (!parsed.ok) throw new Error(`selector benchmark parse failed: ${source}`);
  return parsed.value;
});
const selectorSessionStart = process.hrtime.bigint();
const selectorSession = createSelectorMatchSession(
  selectorRoot,
  selectorEnvironment,
  { limits: { maxNodes: 100_001, maxSteps: 100_000_000 } }
);
const selectorIndexNs = Number(process.hrtime.bigint() - selectorSessionStart);
for (let index = 0; index < 3; index += 1) {
  for (const selector of selectorPrograms) selectorSession.query(selector);
}
const selectorDurations = [];
for (let iteration = 0; iteration < 8; iteration += 1) {
  for (const selector of selectorPrograms) {
    const start = process.hrtime.bigint();
    selectorSession.query(selector);
    selectorDurations.push(Number(process.hrtime.bigint() - start));
  }
}
const declaration = parseDeclaration("width: calc(50% - 1rem)");
if (!declaration.ok) throw new Error("property benchmark declaration failed");
const validationSession = createPropertyValidationSession({ maxEntries: 16 });
validationSession.validateDeclaration(declaration.value);
const validationDurations = [];
for (let index = 0; index < 10_000; index += 1) {
  const start = process.hrtime.bigint();
  validationSession.validate("width", declaration.value.value);
  validationDurations.push(Number(process.hrtime.bigint() - start));
}
const selectorMatching = {
  elements: selectorChildren.length,
  selectors: selectorSources,
  indexNs: selectorIndexNs,
  queryP50Ns: percentile(selectorDurations, 0.5),
  queryP95Ns: percentile(selectorDurations, 0.95),
  usage: selectorSession.usage()
};
const propertyValidation = {
  iterations: validationDurations.length,
  p50Ns: percentile(validationDurations, 0.5),
  p95Ns: percentile(validationDurations, 0.95),
  statistics: validationSession.statistics()
};
const selectorCompilation = measureSelectorCompilation(buildStylesheet(640), 12);
const ok =
  scenarios.every((scenario) => scenario.maxErrors === 0) &&
  growth.every((entry) => entry.normalizedGrowth <= maxNormalizedGrowth) &&
  selectorMatching.queryP95Ns < maxSelectorQueryP95Ns &&
  propertyValidation.p95Ns < maxPropertyValidationP95Ns &&
  selectorCompilation.directToReparseRatio <= 0.8;
const report = {
  schemaVersion: 1,
  suite: "css-parser-performance",
  generatedAt: new Date().toISOString(),
  ok,
  maxNormalizedGrowth,
  maxSelectorQueryP95Ns,
  maxPropertyValidationP95Ns,
  scenarios,
  growth,
  selectorMatching,
  propertyValidation,
  selectorCompilation
};

await mkdir(new URL("../../reports/", import.meta.url), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (!ok) throw new Error(`performance qualification failed: ${JSON.stringify(report)}`);
process.stdout.write("performance qualification passed\n");
