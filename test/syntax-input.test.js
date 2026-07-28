import assert from "node:assert/strict";
import test from "node:test";

import {
  CssEncodingSniffer,
  decodeCssBytes,
  sniffCssEncoding
} from "../dist/internal/syntax/encoding.js";
import {
  InputCursor,
  preprocessCssInput
} from "../dist/internal/syntax/input.js";
import {
  ResourceGuard,
  SyntaxAbortError,
  SyntaxResourceError
} from "../dist/internal/syntax/resources.js";

test("input preprocessing normalizes CSS code points", () => {
  assert.equal(
    preprocessCssInput("a\r\nb\rc\fd\u0000e\ud800f\udc00g😀"),
    "a\nb\nc\nd\ufffde\ufffdf\ufffdg😀"
  );
});

test("input cursor preserves raw UTF-16 spans while tracking processed positions", () => {
  const cursor = new InputCursor("a\r\n😀b");
  const values = [];
  for (;;) {
    const point = cursor.consume();
    if (point === null) break;
    values.push(point);
  }

  assert.deepEqual(values.map((entry) => entry.value), [0x61, 0x0a, 0x1f600, 0x62]);
  assert.deepEqual(values.map((entry) => [entry.span.start.offset, entry.span.end.offset]), [
    [0, 1],
    [1, 3],
    [3, 5],
    [5, 6]
  ]);
  assert.deepEqual(values.map((entry) => [entry.span.start.line, entry.span.start.column]), [
    [1, 1],
    [1, 2],
    [2, 1],
    [2, 2]
  ]);
});

test("input cursor supports bounded lookahead, marks, and reconsumption", () => {
  const cursor = new InputCursor("a\r\nb");
  assert.equal(cursor.peek(), 0x61);
  assert.equal(cursor.peek(1), 0x0a);
  const start = cursor.mark();
  assert.equal(cursor.consume()?.value, 0x61);
  cursor.reconsume();
  assert.equal(cursor.consume()?.value, 0x61);
  cursor.restore(start);
  assert.equal(cursor.consume()?.span.start.offset, 0);
});

test("resource guard enforces deterministic work and reports observed usage", () => {
  const guard = new ResourceGuard({
    maxInputBytes: 8,
    maxBufferedBytes: 4,
    maxTokens: 2,
    maxNodes: 2,
    maxDepth: 2,
    maxSteps: 3
  });
  guard.setInputBytes(8);
  guard.observeBufferedBytes(4);
  guard.emitToken(2);
  guard.createNode(1);
  guard.createNode(2);
  guard.step(3);
  assert.deepEqual(guard.snapshot(), {
    inputBytes: 8,
    maxBufferedBytes: 4,
    tokens: 2,
    nodes: 2,
    maxDepth: 2,
    steps: 3
  });

  assert.throws(
    () => guard.step(),
    (error) => {
      assert.ok(error instanceof SyntaxResourceError);
      assert.equal(error.limitName, "maxSteps");
      assert.equal(error.limit, 3);
      assert.equal(error.actual, 4);
      return true;
    }
  );
});

test("resource guards continue a prior operation without resetting budgets", () => {
  const first = new ResourceGuard({ maxSteps: 2 });
  first.step();
  const second = new ResourceGuard(
    { maxSteps: 2 },
    undefined,
    first.snapshot()
  );
  second.step();
  assert.equal(second.snapshot().steps, 2);
  assert.throws(
    () => second.step(),
    (error) =>
      error instanceof SyntaxResourceError &&
      error.limitName === "maxSteps" &&
      error.actual === 3
  );
});

test("resource guard uses typed cancellation", () => {
  const controller = new AbortController();
  const guard = new ResourceGuard({}, controller.signal);
  controller.abort("cancelled");
  assert.throws(
    () => guard.step(),
    (error) => error instanceof SyntaxAbortError && error.reason === "cancelled"
  );
});

test("CSS encoding sniffing follows BOM, transport, exact charset, environment, default", () => {
  const encoder = new TextEncoder();
  assert.deepEqual(
    sniffCssEncoding(Uint8Array.from([0xef, 0xbb, 0xbf, 0x61]), {
      transportEncodingLabel: "windows-1252"
    }),
    { encoding: "utf-8", source: "bom", bomBytes: 3 }
  );
  assert.deepEqual(
    sniffCssEncoding(encoder.encode("@charset \"windows-1252\";a{}"), {
      transportEncodingLabel: "utf-8"
    }),
    { encoding: "utf-8", source: "transport", bomBytes: 0 }
  );
  assert.deepEqual(
    sniffCssEncoding(encoder.encode("@charset \"windows-1252\";a{}")),
    { encoding: "windows-1252", source: "charset", bomBytes: 0 }
  );
  assert.deepEqual(
    sniffCssEncoding(encoder.encode("a{}"), { environmentEncodingLabel: "shift_jis" }),
    { encoding: "shift_jis", source: "environment", bomBytes: 0 }
  );
  assert.deepEqual(
    sniffCssEncoding(encoder.encode("a{}")),
    { encoding: "utf-8", source: "default", bomBytes: 0 }
  );
});

test("CSS charset recognition rejects non-exact pseudo declarations", () => {
  const encoder = new TextEncoder();
  for (const source of [
    " @charset \"windows-1252\";",
    "@CHARSET \"windows-1252\";",
    "@charset  \"windows-1252\";",
    "@charset 'windows-1252';",
    "@charset \"windows-1252\" ;"
  ]) {
    assert.equal(sniffCssEncoding(encoder.encode(source)).source, "default", source);
  }
});

test("stream encoding sniffer decides as soon as evidence is final", () => {
  const transport = new CssEncodingSniffer({ transportEncodingLabel: "windows-1252" });
  assert.equal(transport.write(Uint8Array.from([0x61]))?.source, "transport");

  const bom = new CssEncodingSniffer();
  assert.equal(bom.write(Uint8Array.from([0xef])), null);
  assert.equal(bom.write(Uint8Array.from([0xbb])), null);
  assert.deepEqual(bom.write(Uint8Array.from([0xbf])), {
    encoding: "utf-8",
    source: "bom",
    bomBytes: 3
  });

  const charset = new CssEncodingSniffer();
  assert.equal(charset.write(new TextEncoder().encode("@charset \"windows-1252")), null);
  assert.equal(charset.write(new TextEncoder().encode("\";body{}"))?.encoding, "windows-1252");
});

test("byte decoding exposes the exact encoding decision", () => {
  const bytes = Uint8Array.from([
    ...new TextEncoder().encode("@charset \"windows-1252\";"),
    0x2e,
    0xe9,
    0x7b,
    0x7d
  ]);
  const decoded = decodeCssBytes(bytes);
  assert.equal(decoded.decision.encoding, "windows-1252");
  assert.ok(decoded.text.includes("é"));
});
