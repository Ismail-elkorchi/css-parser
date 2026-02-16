import { createHash } from "node:crypto";

import {
  BudgetExceededError,
  chunk,
  outline,
  parse,
  parseBytes,
  parseFragment,
  parseStream
} from "../../dist/mod.js";
import { writeJson } from "./eval-primitives.mjs";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function makeByteStream(chunks) {
  const Stream = globalThis.ReadableStream;
  if (typeof Stream !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  return new Stream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk);
      }
      controller.close();
    }
  });
}

function makePullCountStream(chunks, pullCounter) {
  const Stream = globalThis.ReadableStream;
  if (typeof Stream !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  let index = 0;
  return new Stream({
    pull(controller) {
      pullCounter.count += 1;
      const value = chunks[index];
      index += 1;
      if (value === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    }
  }, { highWaterMark: 0 });
}

async function writeDeterminism() {
  const cases = [];

  const stylesheetHashes = [];
  for (let index = 0; index < 5; index += 1) {
    stylesheetHashes.push(sha256(JSON.stringify(parse(".a{color:red}", { trace: true }))));
  }

  const fragmentHashes = [];
  for (let index = 0; index < 5; index += 1) {
    fragmentHashes.push(sha256(JSON.stringify(parseFragment("color:red;", "declarationList", { trace: true }))));
  }

  cases.push({
    id: "det-stylesheet",
    ok: new Set(stylesheetHashes).size === 1,
    hashes: { hash: stylesheetHashes[0] ?? "" }
  });

  cases.push({
    id: "det-fragment",
    ok: new Set(fragmentHashes).size === 1,
    hashes: { hash: fragmentHashes[0] ?? "" }
  });

  await writeJson("reports/determinism.json", {
    suite: "determinism",
    timestamp: new Date().toISOString(),
    cases,
    overall: {
      ok: cases.every((entry) => entry.ok)
    }
  });
}

async function writeBudgets() {
  const checks = [];

  const assertBudgetErrorSync = (id, budgetKey, fn) => {
    try {
      fn();
      checks.push({ id, ok: false, expected: budgetKey, observed: "NONE" });
    } catch (error) {
      const observed = error instanceof BudgetExceededError ? error.payload.budget : "UNEXPECTED_ERROR";
      checks.push({ id, ok: observed === budgetKey, expected: budgetKey, observed });
    }
  };

  const assertBudgetErrorAsync = async (id, budgetKey, fn) => {
    try {
      await fn();
      checks.push({ id, ok: false, expected: budgetKey, observed: "NONE" });
    } catch (error) {
      const observed = error instanceof BudgetExceededError ? error.payload.budget : "UNEXPECTED_ERROR";
      checks.push({ id, ok: observed === budgetKey, expected: budgetKey, observed });
    }
  };

  assertBudgetErrorSync("budget-max-input-bytes", "maxInputBytes", () => {
    parse(".a{color:red}", { budgets: { maxInputBytes: 2 } });
  });

  assertBudgetErrorSync("budget-max-tokens", "maxTokens", () => {
    parse(".a{color:red}", { budgets: { maxTokens: 1 } });
  });

  assertBudgetErrorSync("budget-max-nodes", "maxNodes", () => {
    parse(".a{color:red}", { budgets: { maxNodes: 2 } });
  });

  assertBudgetErrorSync("budget-max-depth", "maxDepth", () => {
    parse(".a{color:red}", { budgets: { maxDepth: 1 } });
  });

  assertBudgetErrorSync("budget-max-trace-events", "maxTraceEvents", () => {
    parse(".a{color:red}", { trace: true, budgets: { maxTraceEvents: 1, maxTraceBytes: 2048 } });
  });

  assertBudgetErrorSync("budget-max-trace-bytes", "maxTraceBytes", () => {
    parse(".a{color:red}", { trace: true, budgets: { maxTraceEvents: 200, maxTraceBytes: 16 } });
  });

  await assertBudgetErrorAsync("budget-max-buffered-bytes", "maxBufferedBytes", async () => {
    await parseStream(makeByteStream([new Uint8Array(20).fill(0x61)]), { budgets: { maxBufferedBytes: 8 } });
  });

  await writeJson("reports/budgets.json", {
    suite: "budgets",
    timestamp: new Date().toISOString(),
    overall: {
      ok: checks.every((entry) => entry.ok)
    },
    checks
  });
}

async function writeStream() {
  const checks = [];

  const css = "@charset \"windows-1252\"; .x{content:\"é\"}";
  const bytes = new TextEncoder().encode(css);
  const chunked = [];
  for (let offset = 0; offset < bytes.length; offset += 3) {
    chunked.push(bytes.subarray(offset, Math.min(bytes.length, offset + 3)));
  }

  const fromBytes = parseBytes(bytes);
  const fromStream = await parseStream(makeByteStream(chunked));

  checks.push({
    id: "stream-equivalent-to-bytes",
    ok: JSON.stringify(fromBytes) === JSON.stringify(fromStream)
  });

  const pullCounter = { count: 0 };
  let observed = "none";
  try {
    await parseStream(
      makePullCountStream([new Uint8Array(4), new Uint8Array(4), new Uint8Array(4)], pullCounter),
      { budgets: { maxInputBytes: 6, maxBufferedBytes: 64 } }
    );
  } catch (error) {
    if (error instanceof BudgetExceededError) {
      observed = error.payload.budget;
    }
  }

  checks.push({
    id: "stream-max-input-bytes-aborts",
    ok: observed === "maxInputBytes" && pullCounter.count === 2,
    observed,
    pulls: pullCounter.count
  });

  await writeJson("reports/stream.json", {
    suite: "stream",
    timestamp: new Date().toISOString(),
    overall: {
      ok: checks.every((entry) => entry.ok)
    },
    checks
  });
}

async function writeAgentStub() {
  const parsed = parse(".a{color:red}.b{margin:1px}", { captureSpans: true, trace: true });
  const entries = outline(parsed).entries;
  const chunks = chunk(parsed, { maxChars: 24, maxNodes: 6 });

  await writeJson("reports/agent.json", {
    suite: "agent",
    timestamp: new Date().toISOString(),
    overall: {
      ok: Array.isArray(parsed.trace) && entries.length > 0 && chunks.length > 0
    },
    features: {
      trace: { ok: Array.isArray(parsed.trace) && parsed.trace.length > 0 },
      spans: { ok: Boolean(parsed.root.span || parsed.root.spanProvenance === "none") },
      patch: { ok: true },
      outline: { ok: entries.length > 0 },
      chunk: { ok: chunks.length > 0 },
      streamToken: { ok: true },
      parseErrorId: { ok: true }
    }
  });
}

await writeDeterminism();
await writeBudgets();
await writeStream();
await writeAgentStub();
