import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const ROOT = new URL("../../", import.meta.url);

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

export async function verifyLegacyRuntime(read = readFile) {
  const manifest = JSON.parse(
    await readFile(new URL("../fixtures/legacy/csstree.json", import.meta.url), "utf8")
  );
  const failures = [];

  for (const entry of manifest.files) {
    const bytes = await read(new URL(entry.path, ROOT));
    const actualHash = sha256(bytes);
    if (bytes.byteLength !== entry.bytes || actualHash !== entry.sha256) {
      failures.push({
        path: entry.path,
        expectedBytes: entry.bytes,
        actualBytes: bytes.byteLength,
        expectedSha256: entry.sha256,
        actualSha256: actualHash
      });
    }
  }

  return failures;
}
