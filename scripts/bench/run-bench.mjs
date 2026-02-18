import { performance } from "node:perf_hooks";

import { parse } from "../../dist/mod.js";
import { writeJson } from "../eval/eval-primitives.mjs";

const MEDIUM_SAMPLE = Array.from({ length: 400 }, (_, index) =>
  `.m${index}{color:rgb(${index % 255},${(index * 3) % 255},${(index * 7) % 255});margin:${index % 10}px}`
).join("");

const LARGE_SAMPLE = Array.from({ length: 1600 }, (_, index) =>
  `@media (min-width:${(index % 120) + 1}px){.l${index}{padding:${index % 8}px;transform:translate(${index % 11}px)}}`
).join("");

function runBenchmark(name, cssSource, iterations) {
  parse(cssSource);

  const startMem = process.memoryUsage().heapUsed;
  const started = performance.now();

  for (let index = 0; index < iterations; index += 1) {
    parse(cssSource);
  }

  const elapsedMs = performance.now() - started;
  const endMem = process.memoryUsage().heapUsed;

  const totalBytes = cssSource.length * iterations;
  const totalMB = totalBytes / (1024 * 1024);
  const seconds = elapsedMs / 1000;
  const mbPerSec = seconds > 0 ? totalMB / seconds : 0;
  const memoryMB = Math.max(0, endMem - startMem) / (1024 * 1024);

  return {
    name,
    inputBytes: cssSource.length,
    iterations,
    elapsedMs: Number(elapsedMs.toFixed(3)),
    mbPerSec: Number(mbPerSec.toFixed(3)),
    memoryMB: Number(memoryMB.toFixed(3))
  };
}

const benchmarks = [
  runBenchmark("parse-medium", MEDIUM_SAMPLE, 300),
  runBenchmark("parse-large", LARGE_SAMPLE, 60)
];

await writeJson("reports/bench.json", {
  suite: "bench",
  timestamp: new Date().toISOString(),
  benchmarks
});

console.log(`Bench complete: ${benchmarks.map((entry) => `${entry.name}=${entry.mbPerSec}MB/s`).join(", ")}`);
