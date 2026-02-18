import test from "node:test";
import assert from "node:assert/strict";

import { buildSmokeReport } from "../../scripts/eval/smoke-report-core.mjs";
import { canonicalStringify, computeDeterminismHash } from "../../scripts/smoke/runtime-hash.mjs";

test("canonicalStringify normalizes object key order", () => {
  const first = canonicalStringify({
    b: 2,
    a: 1,
    nested: {
      z: 3,
      y: 2
    }
  });

  const second = canonicalStringify({
    nested: {
      y: 2,
      z: 3
    },
    a: 1,
    b: 2
  });

  assert.equal(first, second);
});

test("computeDeterminismHash returns stable hash shape", async () => {
  const parseFn = (input) => ({
    kind: "fixture",
    input,
    root: {
      id: 1,
      type: "Node",
      span: { start: 0, end: input.length },
      spanProvenance: "input",
      children: []
    },
    errors: []
  });

  const first = await computeDeterminismHash(parseFn);
  const second = await computeDeterminismHash(parseFn);

  assert.equal(first.fixtureId, "smoke-cross-runtime-v1");
  assert.match(first.determinismHash, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(first.determinismHash, second.determinismHash);
});

test("buildSmokeReport marks cross-runtime mismatch as failed", () => {
  const equalReport = buildSmokeReport({
    node: { ok: true, determinismHash: "sha256:aa" },
    deno: { ok: true, determinismHash: "sha256:aa" },
    bun: { ok: true, determinismHash: "sha256:aa" }
  });
  assert.equal(equalReport.determinism.ok, true);
  assert.equal(equalReport.overall.ok, true);

  const mismatchReport = buildSmokeReport({
    node: { ok: true, determinismHash: "sha256:aa" },
    deno: { ok: true, determinismHash: "sha256:bb" },
    bun: { ok: true, determinismHash: "sha256:aa" }
  });
  assert.equal(mismatchReport.determinism.ok, false);
  assert.equal(mismatchReport.overall.ok, false);
});
