import assert from "node:assert/strict";
import test from "node:test";

import { BudgetExceededError, parse } from "../../dist/mod.js";

test("trace emits structured events across tokenization and parse phases", () => {
  const traced = parse("@media (min-width:1px){.a{color:red}}", {
    trace: true,
    budgets: {
      maxTraceEvents: 128,
      maxTraceBytes: 32768
    }
  });

  assert.ok(Array.isArray(traced.trace));
  assert.ok((traced.trace?.length ?? 0) > 0);

  const seenKinds = new Set();
  let previousSeq = 0;

  for (const event of traced.trace ?? []) {
    assert.ok(typeof event.seq === "number");
    assert.ok(event.seq > previousSeq);
    previousSeq = event.seq;
    seenKinds.add(event.kind);

    if (event.kind === "decode") {
      assert.ok(typeof event.source === "string");
      assert.ok(typeof event.encoding === "string");
      assert.ok(typeof event.sniffSource === "string");
    } else if (event.kind === "token") {
      assert.ok(typeof event.count === "number");
      assert.ok(event.count >= 0);
    } else if (event.kind === "parse") {
      assert.ok(typeof event.nodeCount === "number");
      assert.ok(typeof event.errorCount === "number");
    } else if (event.kind === "budget") {
      assert.ok(typeof event.budget === "string");
      assert.ok(typeof event.actual === "number");
    } else if (event.kind === "parseError") {
      assert.ok(typeof event.parseErrorId === "string");
    } else if (event.kind === "stream") {
      assert.ok(typeof event.bytesRead === "number");
    } else {
      assert.fail(`unexpected trace event kind: ${String(event.kind)}`);
    }
  }

  assert.ok(seenKinds.has("decode"));
  assert.ok(seenKinds.has("token"));
  assert.ok(seenKinds.has("parse"));
});

test("trace includes parseError events for malformed input", () => {
  const traced = parse("@media ( { color: red; }", {
    trace: true,
    budgets: {
      maxTraceEvents: 128,
      maxTraceBytes: 32768
    }
  });

  const parseErrorEvents = (traced.trace ?? []).filter((entry) => entry.kind === "parseError");
  assert.ok(parseErrorEvents.length >= 1);
  for (const event of parseErrorEvents) {
    assert.ok(typeof event.parseErrorId === "string");
  }
});

test("trace is bounded by maxTraceEvents", () => {
  assert.throws(
    () => parse(".x{color:red}", { trace: true, budgets: { maxTraceEvents: 1, maxTraceBytes: 4096 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.budget, "maxTraceEvents");
      return true;
    }
  );
});
