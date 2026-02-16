export const REQUIRED_SMOKE_RUNTIMES = ["node", "deno", "bun"];

function allRuntimesPresent(runtimes) {
  return REQUIRED_SMOKE_RUNTIMES.every((runtimeName) => runtimes[runtimeName] !== undefined);
}

function allRuntimesOk(runtimes) {
  return REQUIRED_SMOKE_RUNTIMES.every((runtimeName) => runtimes[runtimeName]?.ok === true);
}

function computeCrossRuntimeDeterminism(runtimes) {
  const hashes = {};
  for (const runtimeName of REQUIRED_SMOKE_RUNTIMES) {
    hashes[runtimeName] = typeof runtimes[runtimeName]?.determinismHash === "string"
      ? runtimes[runtimeName].determinismHash
      : null;
  }

  const presentHashes = Object.values(hashes).filter((value) => typeof value === "string");
  const allRuntimeHashesPresent = presentHashes.length === REQUIRED_SMOKE_RUNTIMES.length;
  const uniqueHashes = new Set(presentHashes);
  const ok = allRuntimeHashesPresent && uniqueHashes.size === 1;

  return {
    ok,
    allRuntimeHashesPresent,
    hashes
  };
}

export function buildSmokeReport(runtimes) {
  const runtimeEntries = runtimes || {};
  const determinism = computeCrossRuntimeDeterminism(runtimeEntries);
  const overallOk =
    allRuntimesPresent(runtimeEntries) &&
    allRuntimesOk(runtimeEntries) &&
    determinism.ok;

  return {
    runtimes: runtimeEntries,
    determinism,
    overall: {
      ok: overallOk
    }
  };
}
