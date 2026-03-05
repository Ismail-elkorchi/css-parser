import { readFile } from "node:fs/promises";

import { nowIso, writeJson } from "./eval-primitives.mjs";

const CONTRIBUTING_PATH = "CONTRIBUTING.md";
const README_PATH = "README.md";

function makeCheck(id, ok, details = {}) {
  return { id, ok, ...details };
}

async function main() {
  const [contributingDoc, readmeDoc] = await Promise.all([
    readFile(CONTRIBUTING_PATH, "utf8"),
    readFile(README_PATH, "utf8")
  ]);

  const checks = [
    makeCheck("contributing-has-naming-policy", /##\s*Naming policy/i.test(contributingDoc)),
    makeCheck("contributing-has-local-verification", /##\s*Local verification/i.test(contributingDoc)),
    makeCheck("readme-docs-map-present", /##\s*(?:Docs Map|Documentation)/i.test(readmeDoc))
  ];

  const failures = checks.filter((check) => !check.ok);
  const report = {
    suite: "doc-policy",
    timestamp: nowIso(),
    ok: failures.length === 0,
    checks,
    failures
  };

  await writeJson("reports/doc-policy.json", report);

  if (report.ok) {
    return;
  }

  console.error("Doc policy check failed:");
  for (const failure of failures) {
    console.error(`- ${failure.id}`);
  }
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
