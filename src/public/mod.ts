export {
  CssStreamError,
  parseBlockContents,
  parseCommaSeparatedComponentValues,
  parseComponentValue,
  parseComponentValues,
  parseDeclaration,
  parseRule,
  parseStylesheet,
  parseStylesheetBytes,
  parseStylesheetContents,
  parseStylesheetStream,
  tokenize,
  tokenizeBytes,
  tokenizeStream
} from "./parse.ts";
export {
  CssTreeStructureError,
  findNodeById,
  findNodesByKind,
  walkCss
} from "./traversal.ts";
export {
  applyPatch,
  computePatch,
  PatchPlanningError
} from "./edits.ts";

export {
  serializeCssSyntax as serialize,
  serializeCssComponentValues
} from "../internal/syntax/serialize.ts";
export {
  CssSerializationError
} from "../internal/syntax/serialize.ts";
export {
  SyntaxAbortError,
  SyntaxResourceError
} from "../internal/syntax/resources.ts";

export { CssDeclarationBlock } from "../internal/cssom/declarations.ts";
export { resolveCssProperty } from "../internal/properties/registry.ts";
export {
  createPropertyValidationSession,
  validateCssPropertyValue
} from "../internal/properties/matcher.ts";

export {
  parseSelectorList,
  parseSelectorListFromComponentValues
} from "../internal/selectors/parser.ts";
export {
  specificitiesOfSelectorList,
  specificityOfComplexSelector
} from "../internal/selectors/specificity.ts";
export {
  createSelectorMatchSession,
  matchSelectorList,
  querySelectorList,
  SelectorTreeError
} from "../internal/selectors/matcher.ts";

export type * from "./types.ts";
