import assert from "node:assert/strict";
import test from "node:test";

import {
  BudgetExceededError,
  parse,
  parseBytes,
  parseDeclarationList,
  parseFragment,
  parseRuleList,
  serialize,
  tokenize
} from "../../dist/mod.js";

test("deterministic parse output for identical stylesheet input", () => {
  const first = parse(".a{color:red}");
  const second = parse(".a{color:red}");
  assert.deepEqual(first, second);
});

test("parse bytes baseline", () => {
  const bytes = new TextEncoder().encode(".b{margin:1px}");
  const tree = parseBytes(bytes);
  assert.equal(tree.kind, "stylesheet");
  assert.equal(tree.root.type, "StyleSheet");
});

test("parseFragment uses explicit context", () => {
  const fragment = parseFragment("color:red;", "declarationList");
  assert.equal(fragment.kind, "fragment");
  assert.equal(fragment.context, "declarationList");
});

test("parseRuleList and parseDeclarationList convenience helpers", () => {
  const ruleList = parseRuleList(".x{color:red}");
  const declarationList = parseDeclarationList("color:red;");
  assert.equal(ruleList.context, "rule");
  assert.equal(declarationList.context, "declarationList");
});

test("serialize reflects parsed stylesheet", () => {
  const tree = parse(".x { color: red; }");
  assert.equal(serialize(tree), ".x{color:red}");
});

test("serialize normalizes custom property declaration spacing", () => {
  const tree = parse(":root{--v0:0px}.v0{padding:var(--v0)}");
  assert.equal(serialize(tree), ":root{--v0: 0px}.v0{padding:var(--v0)}");
});

test("tokenize yields deterministic token sequence", () => {
  const first = tokenize(".x{color:red}");
  const second = tokenize(".x{color:red}");
  assert.deepEqual(first, second);
  assert.ok(first.length >= 4);
});

test("budget exceed is structured", () => {
  assert.throws(
    () => parse(".x{color:red}", { budgets: { maxInputBytes: 3 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.code, "BUDGET_EXCEEDED");
      assert.equal(error.payload.budget, "maxInputBytes");
      return true;
    }
  );
});

test("parse enforces maxTokens budget", () => {
  assert.throws(
    () => parse(".x{color:red}", { budgets: { maxTokens: 2 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.code, "BUDGET_EXCEEDED");
      assert.equal(error.payload.budget, "maxTokens");
      return true;
    }
  );
});

test("parse enforces maxNodes budget", () => {
  assert.throws(
    () => parse(".a{color:red}.b{margin:1px}", { budgets: { maxNodes: 3 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.code, "BUDGET_EXCEEDED");
      assert.equal(error.payload.budget, "maxNodes");
      return true;
    }
  );
});

test("parse enforces maxDepth budget", () => {
  assert.throws(
    () => parse("@media (min-width:1px){@supports (display:grid){.a{color:red}}}", { budgets: { maxDepth: 2 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.code, "BUDGET_EXCEEDED");
      assert.equal(error.payload.budget, "maxDepth");
      return true;
    }
  );
});
