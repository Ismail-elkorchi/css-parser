import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

function resolveVergeCorpusDir() {
  return resolve(
    process.env.VERGE_CORPUS_DIR
      ?? "/home/ismail-el-korchi/Documents/Projects/verge-browser/realworld/corpus"
  );
}

async function readNdjson(path) {
  try {
    const text = await readFile(path, "utf8");
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

async function listCssFiles(cssCacheDir) {
  const names = await readdir(cssCacheDir, { withFileTypes: true });
  return names
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => name.endsWith(".css") || name.endsWith(".decl"))
    .sort((left, right) => left.localeCompare(right));
}

function fileKindFromName(name) {
  if (name.endsWith(".decl")) {
    return "style-attr";
  }
  return "stylesheet";
}

async function main() {
  const vergeCorpusDir = resolveVergeCorpusDir();
  const cssCacheDir = resolve(vergeCorpusDir, "cache/css");
  const vergeManifestPath = resolve(vergeCorpusDir, "manifests/css.ndjson");
  const localManifestPath = resolve(process.cwd(), "realworld/manifests/css.ndjson");
  await mkdir(resolve(process.cwd(), "realworld/manifests"), { recursive: true });

  const [cssFileNames, vergeCssRecords] = await Promise.all([
    listCssFiles(cssCacheDir),
    readNdjson(vergeManifestPath)
  ]);

  const metadataBySha = new Map();
  for (const record of vergeCssRecords) {
    if (!record || typeof record !== "object") {
      continue;
    }
    if (typeof record.sha256 !== "string" || record.sha256.length === 0) {
      continue;
    }
    const existing = metadataBySha.get(record.sha256);
    if (!existing) {
      metadataBySha.set(record.sha256, {
        kind: record.kind ?? "stylesheet"
      });
    }
  }

  const outputRecords = [];
  for (const fileName of cssFileNames) {
    const filePath = resolve(cssCacheDir, fileName);
    const info = await stat(filePath);
    const sha256 = fileName.replace(/\.(css|decl)$/, "");
    const manifestMeta = metadataBySha.get(sha256);
    const kind = manifestMeta?.kind ?? fileKindFromName(fileName);
    outputRecords.push({
      sha256,
      sizeBytes: info.size,
      kind
    });
  }

  outputRecords.sort((left, right) => {
    if (left.sha256 !== right.sha256) {
      return left.sha256.localeCompare(right.sha256);
    }
    return left.kind.localeCompare(right.kind);
  });

  const lines = outputRecords.map((record) => JSON.stringify(record));
  await writeFile(localManifestPath, `${lines.join("\n")}${lines.length > 0 ? "\n" : ""}`, "utf8");
  process.stdout.write(
    `realworld css import ok: source=${vergeCorpusDir} records=${String(outputRecords.length)}\n`
  );
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`realworld css import failed: ${message}\n`);
  process.exit(1);
});
