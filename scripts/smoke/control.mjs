import { parseArgs } from "node:util";

import { parse, parseBytes, parseFragment, parseStream, serialize, tokenize } from "../../dist/mod.js";
import { nowIso, writeJson } from "../eval/eval-primitives.mjs";

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function makeStream(bytes) {
  const Stream = globalThis.ReadableStream;
  if (typeof Stream !== "function") {
    throw new Error("ReadableStream is unavailable in this runtime");
  }

  return new Stream({
    start(controller) {
      controller.enqueue(bytes);
      controller.close();
    }
  });
}

async function runSmoke(runtime) {
  const stylesheet = parse(".a{color:red}");
  assert(stylesheet.kind === "stylesheet", "parse() must return a stylesheet tree");

  const serialized = serialize(stylesheet);
  assert(serialized.includes("color:red"), "serialize() must preserve declaration content");

  const bytesTree = parseBytes(new TextEncoder().encode(".b{margin:1px}"));
  assert(bytesTree.kind === "stylesheet", "parseBytes() must return stylesheet tree");

  const fragment = parseFragment("color:blue;", "declarationList");
  assert(fragment.kind === "fragment", "parseFragment() must return fragment tree");

  const streamed = await parseStream(makeStream(new TextEncoder().encode(".c{padding:2px}")));
  assert(streamed.kind === "stylesheet", "parseStream() must return stylesheet tree");

  const tokens = tokenize(".d{display:block}");
  assert(tokens.length >= 4, "tokenize() must produce tokens");

  return {
    runtime,
    ok: true,
    checks: {
      parse: true,
      serialize: true,
      parseBytes: true,
      parseFragment: true,
      parseStream: true,
      tokenize: true
    }
  };
}

async function main() {
  const parsed = parseArgs({
    options: {
      runtime: {
        type: "string",
        default: "node"
      },
      report: {
        type: "string",
        default: "reports/smoke-node.json"
      }
    }
  });

  const runtime = parsed.values.runtime;
  const reportPath = parsed.values.report;

  try {
    const result = await runSmoke(runtime);
    await writeJson(reportPath, {
      suite: "smoke-runtime",
      timestamp: nowIso(),
      ...result
    });
  } catch (error) {
    await writeJson(reportPath, {
      suite: "smoke-runtime",
      timestamp: nowIso(),
      runtime,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
