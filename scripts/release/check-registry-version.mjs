import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";

import { buildExpectedJsrVersion, compareJsrVersionMetadata } from "./registry-integrity.mjs";
import {
  resolveNpmVersionState,
  resolveVersionTagCommit,
  waitForRegistryState
} from "./registry-state.mjs";

function parseOptions(arguments_) {
  const options = { registry: undefined, requirePresent: false, waitSeconds: 0 };
  for (const argument of arguments_) {
    if (argument === "--require-present") {
      options.requirePresent = true;
    } else if (argument.startsWith("--registry=")) {
      options.registry = argument.slice("--registry=".length);
    } else if (argument.startsWith("--wait-seconds=")) {
      const value = argument.slice("--wait-seconds=".length);
      if (!/^(?:0|[1-9][0-9]*)$/u.test(value)) {
        throw new Error("--wait-seconds must be a non-negative integer");
      }
      options.waitSeconds = Number(value);
    } else {
      throw new Error(`unknown option ${argument}`);
    }
  }
  if (options.registry !== "npm" && options.registry !== "jsr") {
    throw new Error("--registry must be npm or jsr");
  }
  if (!Number.isSafeInteger(options.waitSeconds) || options.waitSeconds > 600) {
    throw new Error("--wait-seconds must not exceed 600");
  }
  if (options.waitSeconds > 0 && !options.requirePresent) {
    throw new Error("--wait-seconds requires --require-present");
  }
  return Object.freeze(options);
}

const options = parseOptions(process.argv.slice(2));
const [packageManifest, jsrManifest, packageReport] = await Promise.all([
  readFile("package.json", "utf8").then(JSON.parse),
  readFile("jsr.json", "utf8").then(JSON.parse),
  readFile("reports/package.json", "utf8").then(JSON.parse)
]);
const name = packageManifest.name;
const version = packageManifest.version;
if (
  typeof name !== "string" ||
  typeof version !== "string" ||
  jsrManifest.name !== name ||
  jsrManifest.version !== version ||
  packageReport.ok !== true ||
  packageReport.package?.name !== name ||
  packageReport.package?.version !== version
) {
  throw new Error("registry version check requires matching qualified manifests");
}

const url = options.registry === "npm"
  ? `https://registry.npmjs.org/${encodeURIComponent(name)}/${version}`
  : `https://jsr.io/${name}/${version}_meta.json`;
const [algorithm, digest] = typeof packageReport.tarball?.integrity === "string"
  ? packageReport.tarball.integrity.split("-", 2)
  : [];
if (algorithm !== "sha512" || digest === undefined) {
  throw new Error("qualified npm artifact is missing SHA-512 integrity");
}
const repository = String(packageManifest.repository?.url ?? "")
  .replace(/^git\+/u, "")
  .replace(/\.git$/u, "");
const npmExpected = {
  name,
  version,
  integrity: packageReport.tarball.integrity,
  sha512: Buffer.from(digest, "base64").toString("hex"),
  repository
};
const jsrExpected = options.registry === "jsr"
  ? await buildExpectedJsrVersion(process.cwd(), jsrManifest)
  : undefined;

async function readState() {
  const response = await globalThis.fetch(url, {
    cache: "no-store",
    headers: { Accept: "application/json", "Cache-Control": "no-cache" }
  });
  if (response.status === 404) return Object.freeze({ state: "absent", failures: Object.freeze([]) });
  if (!response.ok) throw new Error(`${options.registry} registry returned HTTP ${response.status}`);
  const metadata = await response.json();
  if (options.registry === "npm") {
    return resolveNpmVersionState(metadata, {
      ...npmExpected,
      commit: resolveVersionTagCommit(version)
    });
  }
  const comparison = compareJsrVersionMetadata(metadata, jsrExpected);
  return Object.freeze({
    state: comparison.ok ? "identical" : "mismatch",
    failures: comparison.failures
  });
}

const comparison = await waitForRegistryState(readState, {
  waitMilliseconds: options.waitSeconds * 1_000
});
process.stdout.write(`${JSON.stringify({ registry: options.registry, name, version, ...comparison })}\n`);
if (
  comparison.state === "mismatch" ||
  comparison.state === "pending" ||
  (comparison.state === "absent" && options.requirePresent)
) {
  process.exitCode = 1;
}
