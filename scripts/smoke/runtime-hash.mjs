const DETERMINISM_FIXTURE_ID = "smoke-cross-runtime-v1";
const DETERMINISM_FIXTURE_INPUT = "@media (min-width: 10px) { .a{color:red} } .b{margin:1px} .c{padding:2px}";

export function detectRuntimeName() {
  const denoRuntime = globalThis.Deno;
  if (typeof denoRuntime === "object" && denoRuntime && typeof denoRuntime.version === "object") {
    return "deno";
  }
  const bunRuntime = globalThis.Bun;
  if (typeof bunRuntime === "object" && bunRuntime && typeof bunRuntime.version === "string") {
    return "bun";
  }
  return "node";
}

export function detectRuntimeVersion() {
  const runtime = detectRuntimeName();
  if (runtime === "deno") {
    return `deno ${String(globalThis.Deno.version.deno)}`;
  }
  if (runtime === "bun") {
    return `bun ${String(globalThis.Bun.version)}`;
  }
  if (typeof process === "object" && process && typeof process.version === "string") {
    return process.version;
  }
  return "unknown";
}

function canonicalize(value) {
  if (value === null) {
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((entry) => canonicalize(entry));
  }
  if (typeof value === "object") {
    const output = {};
    for (const key of Object.keys(value).sort()) {
      const entry = value[key];
      if (entry === undefined) {
        continue;
      }
      output[key] = canonicalize(entry);
    }
    return output;
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export async function sha256Hex(input) {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi || typeof cryptoApi.subtle?.digest !== "function") {
    throw new Error("WebCrypto subtle.digest is unavailable in this runtime");
  }

  const bytes = new TextEncoder().encode(input);
  const digestBuffer = await cryptoApi.subtle.digest("SHA-256", bytes);
  const digestBytes = new Uint8Array(digestBuffer);
  return Array.from(digestBytes)
    .map((byteValue) => byteValue.toString(16).padStart(2, "0"))
    .join("");
}

export async function computeDeterminismHash(parseFn) {
  const parsedTree = parseFn(DETERMINISM_FIXTURE_INPUT, { captureSpans: true, trace: false });
  const canonicalJson = canonicalStringify({
    fixtureId: DETERMINISM_FIXTURE_ID,
    fixtureInput: DETERMINISM_FIXTURE_INPUT,
    tree: parsedTree
  });
  const hash = await sha256Hex(canonicalJson);
  return {
    fixtureId: DETERMINISM_FIXTURE_ID,
    determinismHash: `sha256:${hash}`
  };
}
