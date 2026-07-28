import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const expectedJsrInclude = Object.freeze([
  "LICENSE",
  "README.md",
  "jsr/mod.ts",
  "src/**/*.ts"
]);
const npmProvenancePredicate = "https://slsa.dev/provenance/v1";

function equalStringSets(actual, expected) {
  return JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort());
}

async function collectFiles(root, directory, predicate = () => true) {
  const entries = await readdir(path.join(root, directory), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const relativePath = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(root, relativePath, predicate));
    } else if (entry.isFile() && predicate(relativePath)) {
      files.push(relativePath);
    }
  }
  return files;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export async function buildExpectedJsrVersion(root, jsrManifest) {
  const includes = jsrManifest.publish?.include ?? [];
  if (!equalStringSets(includes, expectedJsrInclude)) {
    throw new Error("JSR registry verification requires the qualified include policy");
  }

  const files = [...new Set([
    "jsr.json",
    "LICENSE",
    "README.md",
    "jsr/mod.ts",
    ...await collectFiles(root, "src", (file) => file.endsWith(".ts"))
  ])].sort();
  const manifest = {};
  for (const file of files) {
    const bytes = await readFile(path.join(root, file));
    manifest[`/${file}`] = {
      size: bytes.byteLength,
      checksum: `sha256-${sha256(bytes)}`
    };
  }
  return Object.freeze({ exports: jsrManifest.exports, manifest: Object.freeze(manifest) });
}

export function compareJsrVersionMetadata(metadata, expected) {
  const failures = [];
  if (JSON.stringify(metadata?.exports) !== JSON.stringify(expected.exports)) failures.push("exports");
  const actualManifest = metadata?.manifest;
  if (actualManifest === null || typeof actualManifest !== "object") {
    return Object.freeze({ ok: false, failures: Object.freeze([...failures, "manifest"]) });
  }

  const expectedPaths = Object.keys(expected.manifest).sort();
  const actualPaths = Object.keys(actualManifest).sort();
  if (!equalStringSets(actualPaths, expectedPaths)) failures.push("manifest-paths");
  for (const file of expectedPaths) {
    const expectedFile = expected.manifest[file];
    const actualFile = actualManifest[file];
    if (
      actualFile?.size !== expectedFile?.size ||
      actualFile?.checksum !== expectedFile?.checksum
    ) {
      failures.push(`manifest-file:${file}`);
    }
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

export function compareNpmVersionMetadata(metadata, expected) {
  const failures = [];
  if (metadata?.name !== expected.name) failures.push("name");
  if (metadata?.version !== expected.version) failures.push("version");
  if (metadata?.dist?.integrity !== expected.integrity) failures.push("integrity");
  if (metadata?.dist?.attestations?.provenance?.predicateType !== npmProvenancePredicate) {
    failures.push("provenance");
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}

export function compareNpmProvenanceStatement(statement, expected) {
  const failures = [];
  const expectedSubject = `pkg:npm/${expected.name.replace(/^@/u, "%40")}@${expected.version}`;
  const subject = statement?.subject?.find((entry) => entry?.name === expectedSubject);
  if (subject?.digest?.sha512 !== expected.sha512) failures.push("subject");

  const buildDefinition = statement?.predicate?.buildDefinition;
  const workflow = buildDefinition?.externalParameters?.workflow;
  if (workflow?.repository !== expected.repository) failures.push("workflow-repository");
  if (workflow?.path !== ".github/workflows/publish.yml") failures.push("workflow-path");
  if (buildDefinition?.internalParameters?.github?.event_name !== "release") failures.push("event");
  const dependencies = buildDefinition?.resolvedDependencies;
  if (!Array.isArray(dependencies) || !dependencies.some((dependency) =>
    dependency?.digest?.gitCommit === expected.commit &&
    typeof dependency?.uri === "string" &&
    dependency.uri.startsWith(`git+${expected.repository}@`)
  )) {
    failures.push("source-commit");
  }
  if (statement?.predicate?.runDetails?.builder?.id !== "https://github.com/actions/runner/github-hosted") {
    failures.push("builder");
  }
  return Object.freeze({ ok: failures.length === 0, failures: Object.freeze(failures) });
}
