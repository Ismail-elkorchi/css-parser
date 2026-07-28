/**
 * CSS parsing, serialization, CSSOM declaration, property, and selector APIs.
 *
 * @example Parse and serialize a stylesheet.
 * ```ts
 * import { parseStylesheet, serialize } from "./mod.ts";
 *
 * const result = parseStylesheet(".card { color: red; }");
 * if (!result.ok) throw new Error("Invalid stylesheet");
 * console.log(serialize(result.value));
 * ```
 *
 * @module
 */

export * from "../src/mod.ts";
