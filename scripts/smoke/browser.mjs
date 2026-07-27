import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";

import { chromium } from "playwright";

const root = resolve(".");

const server = createServer(async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
  if (requestUrl.pathname === "/") {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end("<!doctype html><meta charset=\"utf-8\"><title>css-parser smoke</title>");
    return;
  }

  const requestedPath = resolve(root, `.${requestUrl.pathname}`);
  if (!requestedPath.startsWith(`${root}${sep}`)) {
    response.writeHead(403);
    response.end();
    return;
  }

  try {
    const content = await readFile(requestedPath);
    response.writeHead(200, { "content-type": "text/javascript; charset=utf-8" });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end();
  }
});

await new Promise((resolvePromise) => server.listen(0, "127.0.0.1", resolvePromise));

try {
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("browser smoke server did not expose a TCP address");
  }

  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${String(address.port)}/`);
    const result = await page.evaluate(async () => {
      const parser = await import("/dist/mod.js");
      const source = ".card { color: red; }";
      const bytes = new TextEncoder().encode(source);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        }
      });

      const parsed = parser.parse(source);
      const fromBytes = parser.parseBytes(bytes);
      const fromStream = await parser.parseStream(stream);
      const expected = parser.serialize(parsed);

      return {
        ok:
          parsed.kind === "stylesheet" &&
          parser.serialize(fromBytes) === expected &&
          parser.serialize(fromStream) === expected &&
          parser.tokenize(source).length > 0,
        serialized: expected
      };
    });

    if (!result.ok || result.serialized !== ".card{color:red}") {
      throw new Error(`browser smoke failed: ${JSON.stringify(result)}`);
    }
  } finally {
    await browser.close();
  }
} finally {
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => error === undefined ? resolvePromise() : rejectPromise(error));
  });
}

process.stdout.write("browser smoke passed\n");
