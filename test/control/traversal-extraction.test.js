import assert from "node:assert/strict";
import test from "node:test";

import {
  findAllByType,
  findById,
  parse,
  walk,
  walkByType
} from "../../dist/mod.js";

test("walk and walkByType are deterministic", () => {
  const tree = parse(".a{color:red}.b:hover{margin:1px}");

  const firstWalk = [];
  walk(tree, (node, depth) => {
    firstWalk.push(`${String(depth)}:${node.type}`);
  });

  const secondWalk = [];
  walk(tree, (node, depth) => {
    secondWalk.push(`${String(depth)}:${node.type}`);
  });

  assert.deepEqual(firstWalk, secondWalk);

  const firstRules = [];
  walkByType(tree, "Rule", (node, depth) => {
    firstRules.push(`${String(depth)}:${String(node.id)}`);
  });

  const secondRules = [];
  walkByType(tree, "Rule", (node, depth) => {
    secondRules.push(`${String(depth)}:${String(node.id)}`);
  });

  assert.deepEqual(firstRules, secondRules);
  assert.ok(firstRules.length >= 2);
});

test("find helpers return expected nodes", () => {
  const tree = parse(".x{color:red}.y{margin:1px}");

  const rules = [...findAllByType(tree, "Rule")];
  assert.equal(rules.length, 2);

  const firstRule = rules[0];
  assert.ok(firstRule);

  const byId = findById(tree, firstRule.id);
  assert.equal(byId?.id, firstRule.id);
});
