/**
 * CSS parsing, serialization, selector queries, tree editing, and render-signal extraction.
 *
 * @example Parse and serialize a stylesheet.
 * ```ts
 * import { parse, serialize } from "./mod.ts";
 *
 * const stylesheet = parse(".card { color: red; }");
 * console.log(serialize(stylesheet));
 * ```
 *
 * @module
 */

export * from "../src/mod.ts";
