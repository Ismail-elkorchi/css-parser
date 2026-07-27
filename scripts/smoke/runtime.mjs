import {
  parse,
  parseBytes,
  parseDeclarationList,
  parseStream,
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
const parsed = parse(source, { captureSpans: true });
const fromBytes = parseBytes(new TextEncoder().encode(source));
const fromStream = await parseStream(streamFrom(new TextEncoder().encode(source)));
const declarations = parseDeclarationList("display: grid; gap: 1rem;");
const tokens = tokenize(source);

const snapshot = {
  stylesheet: serialize(parsed),
  bytes: serialize(fromBytes),
  stream: serialize(fromStream),
  declarations: serialize(declarations),
  tokenKinds: tokens.map((token) => token.kind),
  errorIds: parsed.errors.map((error) => error.parseErrorId)
};

if (
  parsed.kind !== "stylesheet" ||
  parsed.root.type !== "StyleSheet" ||
  tokens.length === 0 ||
  snapshot.stylesheet !== snapshot.bytes ||
  snapshot.stylesheet !== snapshot.stream
) {
  throw new Error("runtime smoke failed");
}

process.stdout.write(`${JSON.stringify({ ok: true, runtime: runtimeName(), snapshot })}\n`);
