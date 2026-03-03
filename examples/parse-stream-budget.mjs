/**
 * Demonstrates streaming parse with explicit budget constraints.
 * Run: npm run build && node examples/parse-stream-budget.mjs
 */
import { parseStream, serialize } from "../dist/mod.js";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export async function runParseStreamBudget() {
  const stream = new globalThis.ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(".a{"));
      controller.enqueue(new TextEncoder().encode("display:block"));
      controller.enqueue(new TextEncoder().encode("}"));
      controller.close();
    }
  });

  const tree = await parseStream(stream, {
    budgets: {
      maxInputBytes: 1024,
      maxBufferedBytes: 128,
      maxTokens: 128,
      maxNodes: 128
    }
  });

  const serialized = serialize(tree);
  assert(serialized.includes(".a"), "stream parse should include selector");
  return serialized;
}

if (import.meta.main) {
  await runParseStreamBudget();
  console.log("parse-stream-budget ok");
}
