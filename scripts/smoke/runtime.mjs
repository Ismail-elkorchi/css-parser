import {
  parseBlockContents,
  parseStylesheet,
  parseStylesheetBytes,
  parseStylesheetStream,
  serialize,
  tokenize
} from "../../dist/mod.js";

function runtimeName() {
  if ("Deno" in globalThis) return "deno";
  if ("Bun" in globalThis) return "bun";
  return "node";
}

function streamFrom(bytes) {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

const source = "@media (min-width: 40rem) { .card { color: red; margin: 1px; } }";
const parsed = parseStylesheet(source);
const fromBytes = parseStylesheetBytes(new TextEncoder().encode(source));
const fromStream = await parseStylesheetStream(streamFrom(new TextEncoder().encode(source)));
const declarations = parseBlockContents("display: grid; gap: 1rem;");
const tokens = tokenize(source);

if (!parsed.ok || !fromBytes.ok || !fromStream.ok || !declarations.ok) {
  throw new Error("runtime smoke parse failed");
}
const snapshot = {
  stylesheet: serialize(parsed.value),
  bytes: serialize(fromBytes.value),
  stream: serialize(fromStream.value),
  declarations: declarations.value.map((item) => serialize(item)).join(""),
  tokenKinds: tokens.tokens.map((token) => token.kind),
  errorCodes: parsed.errors.map((error) => error.code)
};

if (
  parsed.value.kind !== "stylesheet" ||
  tokens.tokens.length === 0 ||
  snapshot.stylesheet !== snapshot.bytes ||
  snapshot.stylesheet !== snapshot.stream
) {
  throw new Error("runtime smoke failed");
}

process.stdout.write(`${JSON.stringify({ ok: true, runtime: runtimeName(), snapshot })}\n`);
