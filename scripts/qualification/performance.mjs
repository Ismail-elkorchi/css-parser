import { mkdir, writeFile } from "node:fs/promises";

import { parseStylesheet } from "../../dist/mod.js";

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
const ok =
  scenarios.every((scenario) => scenario.maxErrors === 0) &&
  growth.every((entry) => entry.normalizedGrowth <= maxNormalizedGrowth);
const report = {
  schemaVersion: 1,
  suite: "css-parser-performance",
  generatedAt: new Date().toISOString(),
  ok,
  maxNormalizedGrowth,
  scenarios,
  growth
};

await mkdir(new URL("../../reports/", import.meta.url), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

if (!ok) throw new Error(`performance qualification failed: ${JSON.stringify(report)}`);
process.stdout.write("performance qualification passed\n");
