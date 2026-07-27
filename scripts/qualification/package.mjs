import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

const workspace = await mkdtemp(join(tmpdir(), "css-parser-package-"));
const reportPath = resolve("reports/package.json");
const artifactDirectory = process.env["CSS_PARSER_PACKAGE_ARTIFACT_DIRECTORY"] === undefined
  ? undefined
  : resolve(process.env["CSS_PARSER_PACKAGE_ARTIFACT_DIRECTORY"]);

async function writeReport(report) {
  await mkdir(resolve("reports"), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

try {
  const [packageManifest, packageLock, jsrManifest] = await Promise.all([
    readFile("package.json", "utf8").then(JSON.parse),
    readFile("package-lock.json", "utf8").then(JSON.parse),
    readFile("jsr.json", "utf8").then(JSON.parse)
  ]);

  if (
    packageManifest.name !== jsrManifest.name ||
    packageManifest.version !== jsrManifest.version ||
    packageManifest.version !== packageLock.version ||
    packageManifest.version !== packageLock.packages?.[""]?.version
  ) {
    throw new Error("package, lockfile, and JSR manifests must identify the same package version");
  }

  const runtimeDependencies = Object.keys(packageManifest.dependencies ?? {}).sort();
  const lockedRuntimeDependencies = Object.keys(packageLock.packages?.[""]?.dependencies ?? {}).sort();
  if (runtimeDependencies.length > 0 || lockedRuntimeDependencies.length > 0) {
    throw new Error("published package must not contain runtime dependencies");
  }

  const packOutput = execFileSync(
    "npm",
    ["pack", "--json", "--pack-destination", workspace],
    { encoding: "utf8" }
  );
  const [manifest] = JSON.parse(packOutput);
  if (!manifest || typeof manifest.filename !== "string" || !Array.isArray(manifest.files)) {
    throw new Error("npm pack did not return a usable package manifest");
  }

  const paths = new Set(manifest.files.map((entry) => entry.path));
  for (const required of [
    "package.json",
    "README.md",
    "LICENSE",
    "THIRD_PARTY_NOTICES.md",
    "dist/mod.js",
    "dist/mod.d.ts",
    "dist/internal/vendor/csstree/LICENSE",
    "dist/internal/vendor/csstree/csstree.esm.d.ts",
    "dist/internal/vendor/csstree/csstree.esm.js"
  ]) {
    if (!paths.has(required)) throw new Error(`packed package is missing ${required}`);
  }
  for (const path of paths) {
    if (path.startsWith("src/") || path.startsWith("test/") || path.startsWith("scripts/")) {
      throw new Error(`packed package contains development file ${path}`);
    }
  }

  const tarball = join(workspace, manifest.filename);
  const consumer = join(workspace, "consumer");
  await mkdir(consumer);
  await writeFile(join(consumer, "package.json"), '{"private":true,"type":"module"}\n', "utf8");
  execFileSync(
    "npm",
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    { cwd: consumer, stdio: "inherit" }
  );

  await writeFile(
    join(consumer, "runtime.mjs"),
    [
      'import { parse, serialize, tokenize } from "@ismail-elkorchi/css-parser";',
      'const stylesheet = parse(".card { color: red; }");',
      'if (stylesheet.errors.length !== 0 || serialize(stylesheet) !== ".card{color:red}") throw new Error("runtime package smoke failed");',
      'if (tokenize(".card{}").length === 0) throw new Error("tokenizer package smoke failed");',
      ""
    ].join("\n"),
    "utf8"
  );
  execFileSync(process.execPath, [join(consumer, "runtime.mjs")], { stdio: "inherit" });

  await writeFile(
    join(consumer, "contract.ts"),
    [
      'import { parse, type ParseOptions, type StyleSheetTree } from "@ismail-elkorchi/css-parser";',
      "const options: ParseOptions = { budgets: { maxInputBytes: 1024 } };",
      'const stylesheet: StyleSheetTree = parse(".card{}", options);',
      "void stylesheet;",
      ""
    ].join("\n"),
    "utf8"
  );
  await writeFile(
    join(consumer, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        strict: true,
        skipLibCheck: false,
        target: "ES2023",
        types: []
      },
      include: ["contract.ts"]
    }),
    "utf8"
  );
  execFileSync(
    process.execPath,
    [resolve("node_modules/typescript/bin/tsc"), "-p", join(consumer, "tsconfig.json")],
    { stdio: "inherit" }
  );

  const installedManifest = JSON.parse(
    await readFile(join(consumer, "node_modules/@ismail-elkorchi/css-parser/package.json"), "utf8")
  );
  if (
    installedManifest.name !== packageManifest.name ||
    installedManifest.version !== packageManifest.version ||
    Object.keys(installedManifest.dependencies ?? {}).length > 0
  ) {
    throw new Error("installed package identity or runtime dependency set is invalid");
  }

  const tarballBytes = await readFile(tarball);
  const sha256 = createHash("sha256").update(tarballBytes).digest("hex");
  if (typeof manifest.integrity !== "string" || !manifest.integrity.startsWith("sha512-")) {
    throw new Error("npm pack did not report SHA-512 integrity");
  }
  if (artifactDirectory !== undefined) {
    const relativeArtifactDirectory = relative(process.cwd(), artifactDirectory);
    if (
      relativeArtifactDirectory === "" ||
      (!relativeArtifactDirectory.startsWith(`..${sep}`) && relativeArtifactDirectory !== "..")
    ) {
      throw new Error("publication artifacts must be preserved outside the checkout");
    }
    await mkdir(artifactDirectory, { recursive: true });
    await copyFile(tarball, join(artifactDirectory, manifest.filename));
  }

  await writeReport({
    schemaVersion: 1,
    suite: "css-parser-package",
    generatedAt: new Date().toISOString(),
    ok: true,
    package: { name: packageManifest.name, version: packageManifest.version },
    tarball: {
      name: manifest.filename,
      bytes: tarballBytes.byteLength,
      sha256,
      integrity: manifest.integrity,
      files: manifest.files.length
    },
    runtimeDependencies,
    lockedRuntimeDependencies,
    installed: { runtimeConsumer: "pass", strictTypeScriptConsumer: "pass" }
  });
  process.stdout.write(`package qualification passed: ${installedManifest.name}@${installedManifest.version}\n`);
} catch (error) {
  await writeReport({
    schemaVersion: 1,
    suite: "css-parser-package",
    generatedAt: new Date().toISOString(),
    ok: false,
    failures: [error instanceof Error ? `${error.name}: ${error.message}` : String(error)]
  });
  throw error;
} finally {
  await rm(workspace, { recursive: true, force: true });
}
