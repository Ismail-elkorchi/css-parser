import { execFileSync } from "node:child_process";
import { readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const outputDirectory = "dist";

await rm(outputDirectory, { recursive: true, force: true });
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "-p", "tsconfig.build.json"],
  { stdio: "inherit" }
);

for (const declaration of await collectDeclarations(outputDirectory)) {
  const source = await readFile(declaration, "utf8");
  const rewritten = source.replace(
    /(["'])(\.\.?\/[^"']+)\.ts\1/gu,
    "$1$2.js$1"
  );
  if (rewritten !== source) {
    await writeFile(declaration, rewritten, "utf8");
  }
}

async function collectDeclarations(directory) {
  const declarations = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      declarations.push(...await collectDeclarations(entryPath));
    } else if (entry.isFile() && entry.name.endsWith(".d.ts")) {
      declarations.push(entryPath);
    }
  }
  return declarations;
}
