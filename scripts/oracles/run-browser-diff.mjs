import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { chromium, firefox, webkit } from "playwright";

import { parse, serialize } from "../../dist/mod.js";
import { readJson, safeDiv, writeJson } from "../eval/eval-primitives.mjs";

const REQUIRED_TAGS_DEFAULT = [
  "selectors",
  "at-rules",
  "media-queries",
  "custom-properties",
  "functions/calc",
  "nesting",
  "unicode-range",
  "escape-sequences"
];

if (process.platform === "linux" && process.env["PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS"] === undefined) {
  process.env["PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS"] = "1";
}

function canonicalizeCss(input) {
  try {
    return serialize(parse(input));
  } catch {
    return "/*__parse_error__*/";
  }
}

function normalizeOracleCss(cssText) {
  return cssText.replace(
    /U\+([0-9A-Fa-f?]+)(?:-([0-9A-Fa-f?]+))?/g,
    (_full, start, end) => {
      const upperStart = String(start).toUpperCase();
      if (end === undefined) {
        return `U+${upperStart}`;
      }
      const upperEnd = String(end).toUpperCase();
      return `U+${upperStart}-${upperEnd}`;
    }
  );
}

function buildCuratedCases() {
  const cases = [];

  for (let index = 0; index < 90; index += 1) {
    cases.push({
      id: `sel-${String(index + 1).padStart(4, "0")}`,
      tags: ["selectors"],
      input: `.s${index}:is(.a,.b)>a[href^="https"]{color:rgb(${index % 255},${(index * 3) % 255},${(index * 7) % 255})}`
    });
  }

  for (let index = 0; index < 90; index += 1) {
    cases.push({
      id: `at-${String(index + 1).padStart(4, "0")}`,
      tags: ["at-rules"],
      input: `@supports (display:grid){.a${index}{display:grid;gap:${index % 7}px}}`
    });
  }

  for (let index = 0; index < 90; index += 1) {
    cases.push({
      id: `mq-${String(index + 1).padStart(4, "0")}`,
      tags: ["media-queries"],
      input: `@media (min-width:${index + 1}px){.m${index}{margin:${index % 5}px}}`
    });
  }

  for (let index = 0; index < 90; index += 1) {
    cases.push({
      id: `var-${String(index + 1).padStart(4, "0")}`,
      tags: ["custom-properties"],
      input: `:root{--v${index}:${index % 11}px}.v${index}{padding:var(--v${index})}`
    });
  }

  for (let index = 0; index < 90; index += 1) {
    const calcPx = (index % 20) + 1;
    cases.push({
      id: `calc-${String(index + 1).padStart(4, "0")}`,
      tags: ["functions/calc"],
      input: `.f${index}{width:calc(100% - ${calcPx}px);transform:translate(${(index % 10) + 1}px)}`
    });
  }

  for (let index = 0; index < 40; index += 1) {
    const red = 50 + (index % 120);
    const green = 60 + ((index * 3) % 120);
    const blue = 70 + ((index * 5) % 120);
    cases.push({
      id: `nest-${String(index + 1).padStart(4, "0")}`,
      tags: ["nesting"],
      input: `.n${index}{&:hover{color:rgb(${red},${green},${blue})}}`
    });
  }

  for (let index = 0; index < 40; index += 1) {
    const start = (0x20 + (index * 4)).toString(16).toUpperCase();
    const end = (0x20 + (index * 4) + 3).toString(16).toUpperCase();
    cases.push({
      id: `uni-${String(index + 1).padStart(4, "0")}`,
      tags: ["unicode-range"],
      input: `@font-face{font-family:f${index};src:url(f${index}.woff2);unicode-range:U+${start}-${end}}`
    });
  }

  for (let index = 0; index < 40; index += 1) {
    const hex = (0x41 + (index % 26)).toString(16).toUpperCase();
    cases.push({
      id: `esc-${String(index + 1).padStart(4, "0")}`,
      tags: ["escape-sequences"],
      input: `.e${index}{content:"\\${hex}"}`
    });
  }

  return cases;
}

function assertUniqueCaseIds(cases) {
  const seen = new Set();
  for (const testCase of cases) {
    if (seen.has(testCase.id)) {
      throw new Error(`Duplicate browser corpus case id: ${testCase.id}`);
    }
    seen.add(testCase.id);
  }
}

async function loadThresholdPolicy() {
  const config = await readJson("evaluation.config.json");
  const browser = config.thresholds?.browserDiff || {};
  const requiredTags = Array.isArray(browser.requiredTags) && browser.requiredTags.length > 0
    ? browser.requiredTags.filter((tag) => typeof tag === "string" && tag.length > 0)
    : REQUIRED_TAGS_DEFAULT;

  return {
    minAgreement: Number(browser.minAgreement ?? 0.995),
    minEnginesPresent: Number(browser.minEnginesPresent ?? 1),
    minCases: Number(browser.minCases ?? 1),
    minTagCoverage: Number(browser.minTagCoverage ?? 0),
    requiredTags,
    agreementAggregation: config.scoring?.browserAgreementAggregation === "average" ? "average" : "min"
  };
}

function buildTagCounts(requiredTags, curatedCases) {
  const counts = Object.fromEntries(requiredTags.map((tag) => [tag, 0]));
  for (const testCase of curatedCases) {
    for (const tag of testCase.tags) {
      counts[tag] = Number(counts[tag] ?? 0) + 1;
    }
  }
  return counts;
}

async function writeDisagreementRecord(caseId, engineName, inputCss, localCanonical, browserRaw, browserCanonical) {
  const safeCase = caseId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeEngine = engineName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join("reports", "triage", "browser-diff", safeEngine, `${safeCase}.md`);
  await mkdir(path.dirname(filePath), { recursive: true });

  const lines = [
    "# Browser differential disagreement",
    "",
    `Engine: ${engineName}`,
    `Case: ${caseId}`,
    "",
    "## Input",
    "```css",
    inputCss,
    "```",
    "",
    "## Local canonical",
    "```css",
    localCanonical,
    "```",
    "",
    "## Browser cssText",
    "```css",
    browserRaw,
    "```",
    "",
    "## Browser canonical",
    "```css",
    browserCanonical,
    "```"
  ];

  await writeFile(filePath, `${lines.join("\n")}\n`, "utf8");
  return filePath.replaceAll(path.sep, "/");
}

async function normalizeInBrowser(page, cssInput) {
  return page.evaluate((input) => {
    const style = globalThis.document.createElement("style");
    style.textContent = input;
    globalThis.document.head.append(style);

    let cssText = "";
    try {
      const sheet = style.sheet;
      const parts = [];
      if (sheet) {
        for (const rule of sheet.cssRules) {
          parts.push(rule.cssText);
        }
      }
      cssText = parts.join("");
    } finally {
      style.remove();
    }

    return cssText;
  }, cssInput);
}

async function runEngine(engineName, launcher, testCases) {
  const disagreements = [];
  let compared = 0;
  let agreed = 0;

  let browser;
  try {
    browser = await launcher.launch({ headless: true });
  } catch (error) {
    return {
      stats: {
        compared: 0,
        agreed: 0,
        disagreed: 0,
        error: error instanceof Error ? error.message : String(error)
      },
      disagreements
    };
  }

  const context = await browser.newContext();
  const page = await context.newPage();
  const userAgent = await page.evaluate(() => globalThis.navigator.userAgent);
  const version = browser.version();

  for (const testCase of testCases) {
    const { id: caseId, input: inputCss, localCanonical } = testCase;

    let browserRaw;
    try {
      browserRaw = await normalizeInBrowser(page, inputCss);
    } catch (error) {
      browserRaw = `/*__browser_error__:${error instanceof Error ? error.message : String(error)}*/`;
    }

    const browserCanonical = normalizeOracleCss(canonicalizeCss(browserRaw));

    compared += 1;
    if (localCanonical === browserCanonical) {
      agreed += 1;
      continue;
    }

    const triageRecord = await writeDisagreementRecord(
      caseId,
      engineName,
      inputCss,
      localCanonical,
      browserRaw,
      browserCanonical
    );

    disagreements.push({
      id: caseId,
      engine: engineName,
      triageRecord
    });
  }

  await context.close();
  await browser.close();

  return {
    stats: {
      compared,
      agreed,
      disagreed: compared - agreed,
      version,
      userAgent
    },
    disagreements
  };
}

const thresholdPolicy = await loadThresholdPolicy();
const curatedCases = buildCuratedCases();
assertUniqueCaseIds(curatedCases);

const cases = curatedCases.map((testCase) => ({
  ...testCase,
  localCanonical: normalizeOracleCss(canonicalizeCss(testCase.input))
}));

const tagCounts = buildTagCounts(thresholdPolicy.requiredTags, curatedCases);

const engines = {
  chromium: { compared: 0, agreed: 0, disagreed: 0 },
  firefox: { compared: 0, agreed: 0, disagreed: 0 },
  webkit: { compared: 0, agreed: 0, disagreed: 0 }
};

const disagreements = [];
for (const [engineName, launcher] of [
  ["chromium", chromium],
  ["firefox", firefox],
  ["webkit", webkit]
]) {
  const runResult = await runEngine(engineName, launcher, cases);
  engines[engineName] = runResult.stats;
  disagreements.push(...runResult.disagreements);
}

const compared = Object.values(engines).reduce((sum, engine) => sum + Number(engine.compared || 0), 0);
const agreed = Object.values(engines).reduce((sum, engine) => sum + Number(engine.agreed || 0), 0);

const presentEngines = Object.entries(engines)
  .filter(([, engine]) => Number(engine.compared || 0) > 0)
  .map(([engineName]) => engineName);

const perEngineAgreementRatios = Object.entries(engines)
  .filter(([, engine]) => Number(engine.compared || 0) > 0)
  .map(([, engine]) => safeDiv(Number(engine.agreed || 0), Number(engine.compared || 0)));

const agreement = thresholdPolicy.agreementAggregation === "average"
  ? (perEngineAgreementRatios.length > 0
    ? perEngineAgreementRatios.reduce((sum, ratio) => sum + ratio, 0) / perEngineAgreementRatios.length
    : 0)
  : (perEngineAgreementRatios.length > 0 ? Math.min(...perEngineAgreementRatios) : 0);

const coveredRequiredTags = thresholdPolicy.requiredTags.filter((tag) => Number(tagCounts[tag] || 0) > 0);
const minCasesReached = curatedCases.length >= thresholdPolicy.minCases;
const minEnginesReached = presentEngines.length >= thresholdPolicy.minEnginesPresent;
const minAgreementReached = agreement >= thresholdPolicy.minAgreement;
const minTagCoverageReached = coveredRequiredTags.length >= thresholdPolicy.minTagCoverage;
const requiredTagsPresent = coveredRequiredTags.length === thresholdPolicy.requiredTags.length;

const report = {
  suite: "browser-diff",
  timestamp: new Date().toISOString(),
  corpus: {
    name: "css-curated-v1",
    curatedCases: curatedCases.length,
    randomCases: 0,
    totalCases: curatedCases.length
  },
  engines,
  disagreements,
  tagCoverage: {
    requiredTags: thresholdPolicy.requiredTags,
    counts: tagCounts,
    covered: coveredRequiredTags
  },
  overall: {
    ok:
      minCasesReached &&
      minEnginesReached &&
      minAgreementReached &&
      minTagCoverageReached &&
      requiredTagsPresent,
    compared,
    agreed,
    agreement,
    presentEngines,
    thresholds: {
      minAgreement: thresholdPolicy.minAgreement,
      minEnginesPresent: thresholdPolicy.minEnginesPresent,
      minCases: thresholdPolicy.minCases,
      minTagCoverage: thresholdPolicy.minTagCoverage,
      requiredTags: thresholdPolicy.requiredTags,
      agreementAggregation: thresholdPolicy.agreementAggregation
    },
    checks: {
      minCasesReached,
      minEnginesReached,
      minAgreementReached,
      minTagCoverageReached,
      requiredTagsPresent
    }
  }
};

await writeJson("reports/browser-diff.json", report);

if (!report.overall.ok) {
  console.error("Browser differential check failed. See reports/browser-diff.json");
  process.exit(1);
}

console.log(
  `Browser diff ok agreement=${agreement.toFixed(6)} engines=${presentEngines.join(",")} cases=${curatedCases.length}`
);
