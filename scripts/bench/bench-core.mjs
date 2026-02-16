import { performance } from "node:perf_hooks";

import { parse } from "../../dist/mod.js";

const MB = 1024 * 1024;

export const MEDIUM_SAMPLE = Array.from({ length: 400 }, (_, index) =>
  `.m${index}{color:rgb(${index % 255},${(index * 3) % 255},${(index * 7) % 255});margin:${index % 10}px}`
).join("");

export const LARGE_SAMPLE = Array.from({ length: 1600 }, (_, index) =>
  `@media (min-width:${(index % 120) + 1}px){.l${index}{padding:${index % 8}px;transform:translate(${index % 11}px)}}`
).join("");

function round(value) {
  return Number(value.toFixed(3));
}

export function runBenchmark(name, cssSource, iterations) {
  parse(cssSource);

  const startHeapUsed = process.memoryUsage().heapUsed;
  let peakHeapUsed = startHeapUsed;
  const started = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    parse(cssSource);
    const heapUsed = process.memoryUsage().heapUsed;
    if (heapUsed > peakHeapUsed) peakHeapUsed = heapUsed;
  }

  const elapsedMs = performance.now() - started;
  const totalBytes = cssSource.length * iterations;
  const totalMB = totalBytes / MB;
  const seconds = elapsedMs / 1000;
  const mbPerSec = seconds > 0 ? totalMB / seconds : 0;
  const peakDeltaBytes = peakHeapUsed - startHeapUsed;
  const memoryMB = peakDeltaBytes / MB;

  if (!Number.isFinite(memoryMB) || memoryMB <= 0) {
    throw new Error(
      `Invalid benchmark memory measurement for ${name}: ` +
      `memoryMB=${String(memoryMB)} startHeapUsed=${String(startHeapUsed)} peakHeapUsed=${String(peakHeapUsed)}`
    );
  }

  return {
    name,
    inputBytes: cssSource.length,
    iterations,
    elapsedMs: round(elapsedMs),
    mbPerSec: round(mbPerSec),
    memoryMB: round(memoryMB),
    memoryMethod: "peakHeapUsedDelta"
  };
}

export function runBenchmarks() {
  return [
    runBenchmark("parse-medium", MEDIUM_SAMPLE, 300),
    runBenchmark("parse-large", LARGE_SAMPLE, 60)
  ];
}
