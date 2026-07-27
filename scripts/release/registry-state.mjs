import { Buffer } from "node:buffer";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

import {
  compareNpmProvenanceStatement,
  compareNpmVersionMetadata
} from "./registry-integrity.mjs";

const provenancePredicate = "https://slsa.dev/provenance/v1";

function immutableResult(state, failures = []) {
  return Object.freeze({ state, failures: Object.freeze(failures) });
}

export function resolveVersionTagCommit(version, execute = execFileSync) {
  if (!/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/u.test(version)) {
    throw new Error(`registry version check: invalid published version ${version}`);
  }
  return execute("git", ["rev-parse", "--verify", `v${version}^{commit}`], { encoding: "utf8" }).trim();
}

export async function resolveNpmVersionState(metadata, expected, fetchImpl = globalThis.fetch) {
  const metadataComparison = compareNpmVersionMetadata(metadata, expected);
  const permanentFailures = metadataComparison.failures.filter((failure) => failure !== "provenance");
  if (permanentFailures.length > 0) return immutableResult("mismatch", permanentFailures);

  const attestationsUrl = metadata?.dist?.attestations?.url;
  if (typeof attestationsUrl !== "string") return immutableResult("pending", ["provenance-unavailable"]);
  const response = await fetchImpl(attestationsUrl, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" }
  });
  if (response.status === 404) return immutableResult("pending", ["provenance-unavailable"]);
  if (!response.ok) throw new Error(`npm attestations returned HTTP ${response.status}`);

  const attestations = await response.json();
  const provenance = attestations?.attestations?.find(
    (attestation) => attestation?.predicateType === provenancePredicate
  );
  const encodedPayload = provenance?.bundle?.dsseEnvelope?.payload;
  if (typeof encodedPayload !== "string") return immutableResult("pending", ["provenance-unavailable"]);

  const statement = JSON.parse(Buffer.from(encodedPayload, "base64").toString("utf8"));
  const provenanceComparison = compareNpmProvenanceStatement(statement, expected);
  const failures = [
    ...metadataComparison.failures,
    ...provenanceComparison.failures.map((failure) => `provenance:${failure}`)
  ];
  return immutableResult(failures.length === 0 ? "identical" : "mismatch", failures);
}

export async function waitForRegistryState(readState, options) {
  const {
    waitMilliseconds,
    initialDelayMilliseconds = 5_000,
    maxDelayMilliseconds = 30_000,
    now = Date.now,
    sleep = delay
  } = options;
  const deadline = now() + waitMilliseconds;
  let result = await readState();
  let nextDelay = initialDelayMilliseconds;

  while ((result.state === "absent" || result.state === "pending") && now() < deadline) {
    const remaining = deadline - now();
    await sleep(Math.min(nextDelay, remaining));
    result = await readState();
    nextDelay = Math.min(nextDelay * 2, maxDelayMilliseconds);
  }
  return result;
}
