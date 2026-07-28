import { mkdir, writeFile } from "node:fs/promises";

import { chromium, firefox, webkit } from "playwright";

import { parse, serialize } from "../../dist/mod.js";

const cases = [
  { id: "rule", css: ".card { color: red; margin: 1px 2px; }" },
  { id: "selector-list", css: "main > .card, aside.note { display: block; }" },
  { id: "attribute-selector", css: "a[href^=\"https\"] { text-decoration: none; }" },
  { id: "selector-logical", css: "article:is(.card, #lead):not([hidden]) { color: red; }" },
  { id: "selector-relational", css: "section:has(> article.card) { contain: content; }" },
  { id: "selector-nth-of", css: "li:nth-child(2n + 1 of .item) { color: blue; }" },
  { id: "selector-escaped", css: ".\\66 oo\\+bar { color: blue; }" },
  { id: "media", css: "@media (min-width: 40rem) { .grid { display: grid; } }" },
  { id: "media-range", css: "@media (40rem <= width < 80rem) { .grid { display: grid; } }" },
  { id: "supports", css: "@supports (display: grid) { .grid { display: grid; } }" },
  { id: "supports-selector", css: "@supports selector(:has(> img)) { article { display: block; } }" },
  { id: "custom-property", css: ":root { --space: 1rem; } .box { margin: var(--space); }" },
  { id: "custom-property-blocks", css: ":root { --tokens: [a, b] { c: d }; }" },
  { id: "calc", css: ".box { width: calc(100% - 1rem); }" },
  { id: "modern-color", css: ".box { color: color(display-p3 1 0 0 / .8); }" },
  { id: "gradient", css: ".box { background-image: linear-gradient(45deg, red, blue); }" },
  { id: "font-face", css: "@font-face { font-family: test; src: url(test.woff2); }" },
  { id: "font-feature-values", css: "@font-feature-values test { @styleset { nice: 1; } }" },
  { id: "keyframes", css: "@keyframes fade { from { opacity: 0; } to { opacity: 1; } }" },
  { id: "layer", css: "@layer base { body { color: black; } }" },
  { id: "layer-list", css: "@layer reset, base, components;" },
  { id: "container", css: "@container card (inline-size > 20rem) { .title { font-size: 2rem; } }" },
  { id: "scope", css: "@scope (.card) to (.content) { h2 { color: red; } }" },
  { id: "starting-style", css: "@starting-style { dialog[open] { opacity: 0; } }" },
  { id: "property", css: "@property --size { syntax: \"<length>\"; inherits: false; initial-value: 0px; }" },
  { id: "nested-rule", css: ".card { color: red; & > .title { color: blue; } }" },
  { id: "nested-declarations", css: ".card { color: red; @media (width > 20rem) { color: blue; } background: white; }" },
  { id: "unicode-range", css: "@font-face { font-family: test; src: url(test.woff2); unicode-range: U+0025-00FF; }" },
  { id: "escaped-string", css: ".box::before { content: \"a\\a b\"; }" },
  { id: "escaped-identifier", css: ".\\66 oo { color: blue; }" },
  { id: "important", css: ".hidden { display: none !important; }" },
  { id: "unknown-property", css: ".box { future-property: future(1 2 3); color: red; }" },
  { id: "malformed-recovery", css: ".a { color: red; broken; display: block; }" },
  { id: "unclosed-function", css: ".a { --value: calc(1px + var(--x); }" }
];

function canonicalize(css) {
  return serialize(parse(css));
}

async function cssomSnapshot(page, css) {
  return page.evaluate((source) => {
    const normalizeCondition = (value) => {
      let result = "";
      let quote = null;
      let escaped = false;
      let pendingSpace = false;

      for (const character of value) {
        if (quote !== null) {
          result += character;
          if (escaped) {
            escaped = false;
          } else if (character === "\\") {
            escaped = true;
          } else if (character === quote) {
            quote = null;
          }
          continue;
        }

        if (character === "\"" || character === "'") {
          if (
            pendingSpace &&
            result.length > 0 &&
            !result.endsWith("(") &&
            !result.endsWith(":") &&
            !result.endsWith(">") &&
            !result.endsWith("+") &&
            !result.endsWith("~")
          ) {
            result += " ";
          }
          pendingSpace = false;
          quote = character;
          result += character;
          continue;
        }

        if (/\s/u.test(character)) {
          pendingSpace = true;
          continue;
        }

        if (
          character === ")" ||
          character === ":" ||
          character === "," ||
          character === ">" ||
          character === "+" ||
          character === "~"
        ) {
          result = result.trimEnd();
          result += character;
          pendingSpace = false;
          continue;
        }

        if (
          pendingSpace &&
          result.length > 0 &&
          !result.endsWith("(") &&
          !result.endsWith(":") &&
          !result.endsWith(">") &&
          !result.endsWith("+") &&
          !result.endsWith("~")
        ) {
          result += " ";
        }
        pendingSpace = false;
        result += character;
      }

      return result.trim();
    };

    const snapshotStyle = (style) =>
      Array.from(style, (property) => ({
        property,
        value: style.getPropertyValue(property),
        priority: style.getPropertyPriority(property)
      }));

    const snapshotRule = (rule) => {
      const snapshot = {
        kind: Object.getPrototypeOf(rule)?.constructor?.name ?? "CSSRule"
      };

      for (const property of ["selectorText", "keyText", "name", "href", "namespaceURI", "prefix"]) {
        if (typeof rule[property] === "string") {
          snapshot[property] = rule[property];
        }
      }
      for (const property of ["conditionText", "supportsText", "layerName"]) {
        if (typeof rule[property] === "string") {
          snapshot[property] = normalizeCondition(rule[property]);
        }
      }
      if (typeof rule.media?.mediaText === "string") {
        snapshot.media = normalizeCondition(rule.media.mediaText);
      }
      if (rule.style !== undefined && typeof rule.style.getPropertyValue === "function") {
        snapshot.style = snapshotStyle(rule.style);
      }
      if (rule.cssRules !== undefined) {
        snapshot.rules = Array.from(rule.cssRules, snapshotRule);
      }

      return snapshot;
    };

    const style = document.createElement("style");
    style.textContent = source;
    document.head.append(style);
    try {
      return Array.from(style.sheet?.cssRules ?? [], snapshotRule);
    } finally {
      style.remove();
    }
  }, css);
}

async function runEngine(name, launcher) {
  const browser = await launcher.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const failures = [];
    for (const entry of cases) {
      const serialized = canonicalize(entry.css);
      const [sourceCssom, serializedCssom] = await Promise.all([
        cssomSnapshot(page, entry.css),
        cssomSnapshot(page, serialized)
      ]);
      if (JSON.stringify(serializedCssom) !== JSON.stringify(sourceCssom)) {
        failures.push({ id: entry.id, serialized, sourceCssom, serializedCssom });
      }
    }
    return { name, version: browser.version(), failures };
  } finally {
    await browser.close();
  }
}

const engines = [];
for (const [name, launcher] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit]
]) {
  engines.push(await runEngine(name, launcher));
}

const report = {
  schemaVersion: 1,
  suite: "css-parser-browser-oracle",
  generatedAt: new Date().toISOString(),
  ok: engines.every((engine) => engine.failures.length === 0),
  cases: cases.map((entry) => entry.id),
  engines
};

await mkdir(new URL("../../reports/", import.meta.url), { recursive: true });
await writeFile(
  new URL("../../reports/browser-oracle.json", import.meta.url),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8"
);

if (!report.ok) throw new Error(`browser oracle failed: ${JSON.stringify(engines)}`);
process.stdout.write(`browser oracle passed: ${String(cases.length)} cases across ${String(engines.length)} engines\n`);
