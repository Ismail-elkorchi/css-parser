import assert from "node:assert/strict";
import test from "node:test";

import {
  CssStreamError,
  parseStylesheetBytes,
  parseStylesheetStream,
  serialize,
  SyntaxAbortError,
  SyntaxResourceError,
  tokenizeStream
} from "../dist/mod.js";

function streamFrom(chunks) {
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    }
  });
}

function pullStream(chunks, counter) {
  let index = 0;
  return new ReadableStream({
    pull(controller) {
      counter.value += 1;
      const chunk = chunks[index];
      index += 1;
      if (chunk === undefined) controller.close();
      else controller.enqueue(chunk);
    }
  }, { highWaterMark: 0 });
}

test("stream parsing matches byte parsing across arbitrary chunks", async () => {
  const bytes = new TextEncoder().encode(".x{color:red}.y{margin:1px}");
  const streamed = await parseStylesheetStream(streamFrom([
    bytes.subarray(0, 1),
    bytes.subarray(1, 9),
    bytes.subarray(9)
  ]));
  const eager = parseStylesheetBytes(bytes);
  assert.equal(streamed.ok, true);
  assert.equal(eager.ok, true);
  assert.deepEqual(streamed.encoding, eager.encoding);
  assert.deepEqual(streamed.errors, eager.errors);
  if (streamed.ok && eager.ok) {
    assert.deepEqual(streamed.value, eager.value);
    assert.equal(serialize(streamed.value), serialize(eager.value));
  }
  assert.equal(streamed.usage.inputBytes, bytes.byteLength);
});

test("stream decoding decides early when transport evidence is final", async () => {
  const encoder = new TextEncoder();
  const result = await parseStylesheetStream(
    streamFrom([encoder.encode(".a{"), encoder.encode("color:red}")]),
    {
      transportEncodingLabel: "utf-8",
      limits: { maxBufferedBytes: 8 }
    }
  );
  assert.equal(result.encoding.source, "transport");
  assert.ok(result.usage.maxBufferedBytes <= 8);
});

test("stream limits stop pulling immediately and cancel the reader", async () => {
  const counter = { value: 0 };
  const stream = pullStream([
    new Uint8Array(4).fill(0x61),
    new Uint8Array(4).fill(0x62),
    new Uint8Array(4).fill(0x63)
  ], counter);
  await assert.rejects(
    parseStylesheetStream(stream, {
      limits: { maxInputBytes: 6, maxBufferedBytes: 64 }
    }),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxInputBytes"
  );
  assert.equal(counter.value, 2);
});

test("stream tokenization returns one complete typed result", async () => {
  const encoder = new TextEncoder();
  const result = await tokenizeStream(streamFrom([
    encoder.encode(".p{"),
    encoder.encode("display:block}")
  ]));
  assert.ok(result.tokens.length >= 4);
  assert.deepEqual(result.errors, []);
  assert.equal(result.usage.inputBytes, 17);
});

test("stream boundaries report invalid chunks, read failures, and cancellation", async () => {
  await assert.rejects(
    parseStylesheetStream(streamFrom(["not bytes"])),
    (error) =>
      error instanceof CssStreamError &&
      error.reason === "invalid-chunk"
  );

  const failed = new ReadableStream({
    pull() {
      throw new Error("network failed");
    }
  });
  await assert.rejects(
    parseStylesheetStream(failed),
    (error) =>
      error instanceof CssStreamError &&
      error.reason === "read-failed"
  );

  const controller = new AbortController();
  controller.abort("cancelled");
  await assert.rejects(
    parseStylesheetStream(streamFrom([new Uint8Array()] ), {
      signal: controller.signal
    }),
    (error) =>
      error instanceof SyntaxAbortError &&
      error.reason === "cancelled"
  );
});
