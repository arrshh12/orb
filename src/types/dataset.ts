/**
 * Dataset types for Orb.
 * Handles format detection, validation, and normalization across all supported formats.
 */

/** Supported dataset file formats */
export type DatasetFormat = 'csv' | 'tsv' | 'json' | 'jsonl' | 'txt' | 'md';

/** Detected schema shape for structured data */
export type JsonSchemaShape =
  | 'instruction-io'       // {instruction, input?, output}
  | 'prompt-completion'    // {prompt, completion}
  | 'chat-messages'        // {messages: [{role, content}]}
  | 'text-only'            // {text} or raw strings
  | 'unknown';             // needs user input

/** Column mapping for CSV/TSV formats */
export interface ColumnMapping {
  inputColumn: string;
  outputColumn?: string;
  systemColumn?: string;
}

/** Schema detection result */
export interface DetectedSchema {
  shape: JsonSchemaShape;
  /** For CSV/TSV: available column names */
  columns?: string[];
  /** Inferred column mapping (may need user confirmation) */
  inferredMapping?: ColumnMapping;
  /** Whether the mapping was confidently auto-detected */
  confident: boolean;
}

/** A single chat message in the normalized format */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Normalized training example — the universal internal format */
export interface NormalizedExample {
  /** For instruction-tuning style */
  instruction?: string;
  input?: string;
  output?: string;
  /** For chat/multi-turn style */
  messages?: ChatMessage[];
  /** Raw text for continued pre-training */
  text?: string;
}

/** Issues found during validation */
export interface ValidationIssues {
  emptyRows: number;
  duplicateRows: number;
  missingFields: number;
  encodingIssues: number;
  /** Rows with token length > 3 std devs from mean */
  tokenLengthOutliers: number;
}

/** Token length statistics from the dataset */
export interface TokenStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  /** 95th percentile */
  p95: number;
  /** Total tokens across all examples */
  totalTokens: number;
}

/** Complete validation result for a dataset */
export interface DatasetValidationResult {
  format: DatasetFormat;
  schema: DetectedSchema;
  totalRows: number;
  validRows: number;
  issues: ValidationIssues;
  /** Token stats — only available after tokenization with model tokenizer */
  tokenStats?: TokenStats;
  /** First 3 normalized examples for user preview */
  preview: NormalizedExample[];
  /** File size in bytes */
  fileSizeBytes: number;
}

/** Metadata about the loaded dataset for auto-config */
export interface DatasetMeta {
  path: string;
  format: DatasetFormat;
  rowCount: number;
  tokenStats: TokenStats;
  /** Path to the normalized JSONL file written to disk */
  normalizedPath: string;
}
