/** Runs every example as a smoke test. */
import { runParseSuccessPath } from "./parse-success-path.mjs";
import { runParseStreamBudget } from "./parse-stream-budget.mjs";
import { runSelectorQuery } from "./selector-query.mjs";

runParseSuccessPath();
await runParseStreamBudget();
runSelectorQuery();

console.log("examples:run ok");
