import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { fileExists, nowIso, readJson, writeJson } from "./eval-primitives.mjs";

const FIXTURE_PATH = "test/fixtures/selectors/v1/cases.json";
const DOC_PATH = "docs/selectors.md";
const TEST_PATH = "test/control/selectors.test.js";
const REPORT_PATH = "reports/selectors.json";

function collectNodeRefs(nodes) {
  return nodes.map((node) => String(node?.nodeRef ?? ""));
}

function findNodeByRef(root, nodeRef) {
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
}

async function loadPublicModule() {
  try {
    const modulePath = pathToFileURL(resolve("dist/mod.js")).href;
    const publicModule = await import(modulePath);
    return { ok: true, module: publicModule };
  } catch (error) {
    return {
      ok: false,
      module: null,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function main() {
  const checks = {};
  const failures = [];

  const docsExists = await fileExists(DOC_PATH);
  checks.docs = { ok: docsExists, path: DOC_PATH };
  if (!docsExists) {
    failures.push({ check: "docs", detail: `missing ${DOC_PATH}` });
  }

  const testExists = await fileExists(TEST_PATH);
  checks.tests = { ok: testExists, path: TEST_PATH };
  if (!testExists) {
    failures.push({ check: "tests", detail: `missing ${TEST_PATH}` });
  }

  const fixturesExists = await fileExists(FIXTURE_PATH);
  let fixture = null;
  if (fixturesExists) {
    fixture = await readJson(FIXTURE_PATH);
  }
  const fixtureCount = Array.isArray(fixture?.cases) ? fixture.cases.length : 0;
  const fixtureShapeOk = fixturesExists && fixture !== null && Array.isArray(fixture?.cases) && fixture?.tree;
  const fixtureCountOk = fixtureCount >= 12;
  checks.fixtures = {
    ok: fixtureShapeOk && fixtureCountOk,
    path: FIXTURE_PATH,
    fixtureCount
  };
  if (!checks.fixtures.ok) {
    failures.push({
      check: "fixtures",
      detail: `invalid fixture shape or count (${String(fixtureCount)} cases)`
    });
  }

  const moduleLoad = await loadPublicModule();
  const publicModule = moduleLoad.module;
  const requiredExports = ["compileSelectorList", "matchesSelector", "querySelectorAll", "BudgetExceededError"];
  const missingExports = moduleLoad.ok
    ? requiredExports.filter((exportName) => typeof publicModule[exportName] !== "function")
    : requiredExports;
  checks.exports = {
    ok: moduleLoad.ok && missingExports.length === 0,
    missingExports,
    error: moduleLoad.ok ? null : moduleLoad.error
  };
  if (!checks.exports.ok) {
    failures.push({
      check: "exports",
      detail: moduleLoad.ok
        ? `missing exports: ${missingExports.join(", ")}`
        : `cannot import dist/mod.js: ${moduleLoad.error}`
    });
  }

  if (checks.fixtures.ok && checks.exports.ok) {
    const caseFailures = [];
    for (const fixtureCase of fixture.cases) {
      const compiled = publicModule.compileSelectorList(fixtureCase.selector);
      const first = collectNodeRefs(publicModule.querySelectorAll(compiled, fixture.tree));
      const second = collectNodeRefs(publicModule.querySelectorAll(compiled, fixture.tree));
      const expected = fixtureCase.expectedNodeRefs;

      if (compiled.parseErrors.length > 0) {
        caseFailures.push({
          id: fixtureCase.id,
          reason: "parse-errors",
          parseErrors: compiled.parseErrors.map((entry) => entry.message)
        });
        continue;
      }

      if (!compiled.supported) {
        caseFailures.push({
          id: fixtureCase.id,
          reason: "unsupported-selector",
          unsupportedParts: compiled.unsupportedParts
        });
        continue;
      }

      if (JSON.stringify(first) !== JSON.stringify(expected)) {
        caseFailures.push({
          id: fixtureCase.id,
          reason: "query-mismatch",
          expected,
          actual: first
        });
        continue;
      }

      if (JSON.stringify(first) !== JSON.stringify(second)) {
        caseFailures.push({
          id: fixtureCase.id,
          reason: "non-deterministic-query",
          first,
          second
        });
        continue;
      }

      for (const expectedNodeRef of expected) {
        const node = findNodeByRef(fixture.tree, expectedNodeRef);
        if (!node) {
          caseFailures.push({
            id: fixtureCase.id,
            reason: "missing-node-ref",
            expectedNodeRef
          });
          break;
        }

        if (!publicModule.matchesSelector(compiled, node, fixture.tree)) {
          caseFailures.push({
            id: fixtureCase.id,
            reason: "matchesSelector-false",
            expectedNodeRef
          });
          break;
        }
      }
    }

    checks.cases = {
      ok: caseFailures.length === 0,
      total: fixture.cases.length,
      failed: caseFailures.length,
      failures: caseFailures.slice(0, 10)
    };
    if (!checks.cases.ok) {
      failures.push({
        check: "cases",
        detail: `${String(caseFailures.length)} case(s) failed`
      });
    }

    let strictModeOk = false;
    let strictModeDetail = {};
    try {
      publicModule.querySelectorAll(":hover", fixture.tree, { strict: true });
      strictModeDetail = { reason: "strict mode did not throw" };
    } catch (error) {
      const compiledUnsupported = publicModule.compileSelectorList(":hover");
      const permissiveCount = publicModule.querySelectorAll(compiledUnsupported, fixture.tree).length;
      strictModeOk = compiledUnsupported.unsupportedParts.length > 0 && permissiveCount === 0;
      strictModeDetail = {
        unsupportedParts: compiledUnsupported.unsupportedParts.length,
        permissiveCount,
        strictError: error instanceof Error ? error.message : String(error)
      };
    }
    checks.strictMode = { ok: strictModeOk, ...strictModeDetail };
    if (!checks.strictMode.ok) {
      failures.push({ check: "strictMode", detail: JSON.stringify(strictModeDetail) });
    }

    let budgetOk = false;
    let budgetDetail = {};
    try {
      publicModule.querySelectorAll("*", fixture.tree, { maxVisitedNodes: 3 });
      budgetDetail = { reason: "budget did not throw" };
    } catch (error) {
      if (error instanceof publicModule.BudgetExceededError) {
        budgetOk = error.payload.code === "BUDGET_EXCEEDED" && error.payload.budget === "maxNodes";
        budgetDetail = { payload: error.payload };
      } else {
        budgetDetail = { reason: error instanceof Error ? error.message : String(error) };
      }
    }
    checks.budget = { ok: budgetOk, ...budgetDetail };
    if (!checks.budget.ok) {
      failures.push({ check: "budget", detail: JSON.stringify(budgetDetail) });
    }
  } else {
    checks.cases = { ok: false, skipped: true };
    checks.strictMode = { ok: false, skipped: true };
    checks.budget = { ok: false, skipped: true };
  }

  const overallOk = Object.values(checks).every((check) => check?.ok === true);

  await writeJson(REPORT_PATH, {
    suite: "selectors",
    timestamp: nowIso(),
    checks,
    overall: {
      ok: overallOk
    },
    failures
  });

  if (!overallOk) {
    console.error("Selector report failed. See reports/selectors.json");
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
