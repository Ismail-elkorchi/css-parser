import assert from "node:assert/strict";
import test from "node:test";

import {
  BudgetExceededError,
  chunk,
  outline,
  parse,
  parseBytes,
  parseStream,
  tokenizeStream
} from "../../dist/mod.js";

function createByteStream(byteChunks) {
  const streamFactory = globalThis.ReadableStream;
  if (typeof streamFactory !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  return new streamFactory({
    start(controller) {
      for (const value of byteChunks) {
        controller.enqueue(value);
      }
      controller.close();
    }
  });
}

function createPullCountStream(byteChunks, pullCounter) {
  const streamFactory = globalThis.ReadableStream;
  if (typeof streamFactory !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  let offset = 0;
  return new streamFactory({
    pull(controller) {
      pullCounter.count += 1;
      const value = byteChunks[offset];
      offset += 1;
      if (value === undefined) {
        controller.close();
        return;
      }
      controller.enqueue(value);
    }
  }, { highWaterMark: 0 });
}

test("parseStream decodes deterministic output", async () => {
  const stream = createByteStream([new TextEncoder().encode(".a{"), new TextEncoder().encode("color:red}" )]);
  const parsed = await parseStream(stream);
  assert.equal(parsed.kind, "stylesheet");
  assert.equal(parsed.root.type, "StyleSheet");
});

test("parseStream enforces maxBufferedBytes budget", async () => {
  const stream = createByteStream([new Uint8Array([0x2e, 0x61, 0x7b, 0x7d])]);
  await assert.rejects(
    parseStream(stream, { budgets: { maxBufferedBytes: 2 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.budget, "maxBufferedBytes");
      return true;
    }
  );
});

test("parseStream matches parseBytes for chunked transport", async () => {
  const bytes = new TextEncoder().encode(".x{color:red}.y{margin:1px}");
  const chunks = [bytes.subarray(0, 5), bytes.subarray(5, 13), bytes.subarray(13)];

  const fromBytes = parseBytes(bytes);
  const fromStream = await parseStream(createByteStream(chunks));

  assert.deepEqual(fromStream, fromBytes);
});

test("parseStream aborts before extra pulls when maxInputBytes is exceeded", async () => {
  const pullCounter = { count: 0 };
  const stream = createPullCountStream(
    [new Uint8Array(4).fill(0x61), new Uint8Array(4).fill(0x62), new Uint8Array(4).fill(0x63)],
    pullCounter
  );

  await assert.rejects(
    parseStream(stream, { budgets: { maxInputBytes: 6, maxBufferedBytes: 64 } }),
    (error) => {
      assert.ok(error instanceof BudgetExceededError);
      assert.equal(error.payload.budget, "maxInputBytes");
      return true;
    }
  );

  assert.equal(pullCounter.count, 2);
});

test("tokenizeStream yields deterministic token sequence", async () => {
  const encoder = new TextEncoder();
  const chunks = [encoder.encode(".p{"), encoder.encode("display:block"), encoder.encode("}")];

  const collect = async () => {
    const tokens = [];
    for await (const token of tokenizeStream(createByteStream(chunks))) {
      tokens.push(token.rawKind);
    }
    return tokens;
  };

  const first = await collect();
  const second = await collect();
  assert.deepEqual(first, second);
  assert.ok(first.length >= 4);
});

test("outline and chunk stay deterministic", () => {
  const parsed = parse(".a{color:red}.b{margin:1px}");
  const firstOutline = outline(parsed);
  const secondOutline = outline(parsed);
  assert.deepEqual(firstOutline, secondOutline);

  const firstChunks = chunk(parsed, { maxChars: 16, maxNodes: 8 });
  const secondChunks = chunk(parsed, { maxChars: 16, maxNodes: 8 });
  assert.deepEqual(firstChunks, secondChunks);
});

test("chunk enforces maxBytes when configured", () => {
  const tree = parse(".a{color:red}.b{margin:1px}.c{padding:2px}");
  const chunks = chunk(tree, { maxChars: 4096, maxNodes: 64, maxBytes: 32 });
  const encoder = new TextEncoder();

  assert.ok(chunks.length >= 1);
  for (const item of chunks) {
    assert.ok(encoder.encode(item.content).length <= 32);
  }
});
