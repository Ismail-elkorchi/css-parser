export interface CssPropertyData {
  readonly name: string;
  readonly href: string;
  readonly styleDeclaration: readonly string[];
  readonly syntax?: string;
  readonly legacyAliasOf?: string;
  readonly longhands?: readonly string[];
  readonly resetLonghands?: readonly string[];
  readonly initial?: string;
  readonly appliesTo?: string;
  readonly inherited?: string;
  readonly percentages?: string;
  readonly computedValue?: string;
  readonly animationType?: string;
  readonly canonicalOrder?: string;
}

export interface CssDescriptorData {
  readonly name: string;
  readonly href: string;
  readonly syntax?: string;
  readonly initial?: string;
}

export interface CssAtRuleData {
  readonly name: string;
  readonly href: string;
  readonly syntax?: string;
  readonly descriptors: readonly CssDescriptorData[];
}

export interface CssGrammarData {
  readonly name: string;
  readonly href: string;
  readonly syntax?: string;
  readonly for?: readonly string[];
}

export interface CssWebrefData {
  readonly properties: readonly CssPropertyData[];
  readonly atrules: readonly CssAtRuleData[];
  readonly functions: readonly CssGrammarData[];
  readonly selectors: readonly CssGrammarData[];
  readonly types: readonly CssGrammarData[];
}
