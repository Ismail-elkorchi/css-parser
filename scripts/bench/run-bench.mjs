import { runBenchmarks } from "./bench-core.mjs";
import { writeJson } from "../eval/eval-primitives.mjs";
const benchmarks = runBenchmarks();

await writeJson("reports/bench.json", {
  suite: "bench",
  timestamp: new Date().toISOString(),
  benchmarks
});

console.log(`Bench complete: ${benchmarks.map((entry) => `${entry.name}=${entry.mbPerSec}MB/s`).join(", ")}`);
