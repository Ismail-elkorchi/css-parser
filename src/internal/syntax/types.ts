export interface SourcePosition {
  readonly offset: number;
  readonly line: number;
  readonly column: number;
}

export interface SourceSpan {
  readonly start: SourcePosition;
  readonly end: SourcePosition;
}

export interface InputCodePoint {
  readonly value: number;
  readonly span: SourceSpan;
}

export type ResourceLimitName =
  | "maxInputBytes"
  | "maxBufferedBytes"
  | "maxTokens"
  | "maxNodes"
  | "maxDepth"
  | "maxSteps";

export interface ResourceLimits {
  readonly maxInputBytes?: number;
  readonly maxBufferedBytes?: number;
  readonly maxTokens?: number;
  readonly maxNodes?: number;
  readonly maxDepth?: number;
  readonly maxSteps?: number;
}

export type TokenizerResourceLimits = Pick<
  ResourceLimits,
  "maxInputBytes" | "maxTokens" | "maxSteps"
>;

export type ParserResourceLimits = Pick<
  ResourceLimits,
  "maxInputBytes" | "maxTokens" | "maxNodes" | "maxDepth" | "maxSteps"
>;

export type StreamTokenizerResourceLimits =
  & TokenizerResourceLimits
  & Pick<ResourceLimits, "maxBufferedBytes">;

export type StreamParserResourceLimits =
  & ParserResourceLimits
  & Pick<ResourceLimits, "maxBufferedBytes">;

export type SelectorResourceLimits = Pick<
  ResourceLimits,
  "maxNodes" | "maxDepth" | "maxSteps"
>;

export interface ResourceUsage {
  readonly inputBytes: number;
  readonly maxBufferedBytes: number;
  readonly tokens: number;
  readonly nodes: number;
  readonly maxDepth: number;
  readonly steps: number;
}

export interface EncodingOptions {
  readonly transportEncodingLabel?: string;
  readonly environmentEncodingLabel?: string;
  readonly defaultEncodingLabel?: string;
  readonly maxCharsetBytes?: number;
}

export interface EncodingDecision {
  readonly encoding: string;
  readonly source: "bom" | "transport" | "charset" | "environment" | "default";
  readonly bomBytes: number;
}
