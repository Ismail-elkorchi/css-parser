import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  BudgetExceededError,
  compileSelectorList,
  matchesSelector,
  querySelectorAll
} from "../../dist/mod.js";

const FIXTURE_PATH = new URL("../fixtures/selectors/v1/cases.json", import.meta.url);
const FIXTURE = JSON.parse(readFileSync(FIXTURE_PATH, "utf8"));

function collectNodeRefs(nodes) {
  return nodes.map((node) => String(node.nodeRef ?? ""));
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

test("selector fixtures return expected node refs", () => {
  for (const fixtureCase of FIXTURE.cases) {
    const compiled = compileSelectorList(fixtureCase.selector);
    assert.equal(
      compiled.parseErrors.length,
      0,
      `${fixtureCase.id}: unexpected parse errors ${JSON.stringify(compiled.parseErrors)}`
    );
    assert.equal(compiled.supported, true, `${fixtureCase.id}: selector must be supported`);

    const matched = querySelectorAll(compiled, FIXTURE.tree);
    assert.deepEqual(
      collectNodeRefs(matched),
      fixtureCase.expectedNodeRefs,
      `${fixtureCase.id}: mismatched query result`
    );

    for (const expectedNodeRef of fixtureCase.expectedNodeRefs) {
      const targetNode = findNodeByRef(FIXTURE.tree, expectedNodeRef);
      assert.ok(targetNode, `${fixtureCase.id}: missing nodeRef ${expectedNodeRef}`);
      assert.equal(
        matchesSelector(compiled, targetNode, FIXTURE.tree),
        true,
        `${fixtureCase.id}: matchesSelector false for expected nodeRef ${expectedNodeRef}`
      );
    }
  }
});

test("selector query results are deterministic", () => {
  const first = FIXTURE.cases.map((fixtureCase) =>
    collectNodeRefs(querySelectorAll(fixtureCase.selector, FIXTURE.tree))
  );
  const second = FIXTURE.cases.map((fixtureCase) =>
    collectNodeRefs(querySelectorAll(fixtureCase.selector, FIXTURE.tree))
  );
  assert.deepEqual(first, second);
});

test("unsupported selectors produce diagnostics and strict-mode failure", () => {
  const compiled = compileSelectorList(":hover");
  assert.equal(compiled.supported, false);
  assert.ok(compiled.unsupportedParts.length > 0);

  const permissive = querySelectorAll(compiled, FIXTURE.tree);
  assert.deepEqual(permissive, []);

  assert.throws(
    () => querySelectorAll(":hover", FIXTURE.tree, { strict: true }),
    /strict mode/
  );
});

test("selector query budget overflow is structured", () => {
  assert.throws(
    () => querySelectorAll("*", FIXTURE.tree, { maxVisitedNodes: 3 }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.code, "BUDGET_EXCEEDED");
      assert.equal(error.payload.budget, "maxNodes");
      assert.equal(error.payload.limit, 3);
      return true;
    }
  );
});
