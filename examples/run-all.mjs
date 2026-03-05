/**
 * What it does: executes all public examples in one deterministic smoke pass.
 * Expected output: prints "examples:run ok" after all assertions succeed.
 * Constraints: each example must remain side-effect free across shared execution.
 * Run: npm run build && node examples/run-all.mjs
 */
import { runParseSuccessPath } from "./parse-success-path.mjs";
import { runParseStreamBudget } from "./parse-stream-budget.mjs";
import { runSelectorQuery } from "./selector-query.mjs";

runParseSuccessPath();
await runParseStreamBudget();
runSelectorQuery();

console.log("examples:run ok");
