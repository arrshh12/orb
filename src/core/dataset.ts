/**
 * Dataset ingestion module for Loom.
 * Detects format, infers schema, validates, normalizes, and exports datasets.
 * Supports: CSV, TSV, JSON, JSONL, TXT, MD
 */

import { readFile, writeFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { parse as csvParse } from 'csv-parse/sync';

import type {
  DatasetFormat,
  JsonSchemaShape,
  DetectedSchema,
  ColumnMapping,
  NormalizedExample,
  ValidationIssues,
  DatasetValidationResult,
  DatasetMeta,
  ChatMessage,
} from '../types/dataset.js';
import { getFileSize, ensureDir, getTempDir, resolvePath } from '../utils/fs.js';
import { PlainLanguageError } from '../utils/errors.js';

// ─── Format Detection ────────────────────────────────────────────────────────

/** Known column names for input/output detection in CSV/TSV */
const INPUT_COLUMNS = ['instruction', 'prompt', 'input', 'question', 'text', 'source', 'query'];
const OUTPUT_COLUMNS = ['output', 'response', 'completion', 'answer', 'target', 'reply', 'assistant'];
const SYSTEM_COLUMNS = ['system', 'system_prompt', 'context', 'system_message'];

/**
 * Detect the format of a dataset file from its extension and content sniffing.
 */
export function detectFormat(filePath: string, content: string): DatasetFormat {
  const ext = extname(filePath).toLowerCase();

  // Extension-based detection
  switch (ext) {
    case '.csv': return 'csv';
    case '.tsv': return 'tsv';
    case '.jsonl': return 'jsonl';
    case '.json': {
      // Could be JSON array or JSONL — sniff
      const trimmed = content.trim();
      if (trimmed.startsWith('[')) return 'json';
      // Try parsing first line as JSON
      try {
        JSON.parse(trimmed.split('\n')[0]!);
        return 'jsonl';
      } catch {
        return 'json';
      }
    }
    case '.txt': return 'txt';
    case '.md':
    case '.markdown':
      return 'md';
    default:
      break;
  }

  // Content sniffing for unknown extensions
  const firstLine = content.trim().split('\n')[0]?.trim() ?? '';
  
  // Try JSON
  try {
    const parsed = JSON.parse(firstLine);
    if (typeof parsed === 'object') return 'jsonl';
  } catch { /* not JSON */ }

  // Try JSON array
  if (content.trim().startsWith('[')) {
    try {
      JSON.parse(content);
      return 'json';
    } catch { /* not JSON array */ }
  }

  // Check for tabs (TSV)
  if (firstLine.includes('\t')) return 'tsv';

  // Check for commas with quoted fields (CSV)
  if (firstLine.includes(',') && (firstLine.includes('"') || firstLine.split(',').length >= 2)) {
    return 'csv';
  }

  // Check for markdown headers
  if (content.includes('\n# ') || content.startsWith('# ')) return 'md';

  // Default to plain text
  return 'txt';
}

// ─── Schema Detection ────────────────────────────────────────────────────────

/**
 * Detect the schema shape from a JSON/JSONL object.
 */
function detectJsonShape(sample: Record<string, unknown>): JsonSchemaShape {
  const keys = Object.keys(sample).map((k) => k.toLowerCase());

  // Chat messages format
  if (keys.includes('messages') && Array.isArray(sample.messages || sample.Messages)) {
    return 'chat-messages';
  }

  // Instruction/IO format
  if (
    (keys.includes('instruction') || keys.includes('prompt')) &&
    (keys.includes('output') || keys.includes('response') || keys.includes('completion'))
  ) {
    return 'instruction-io';
  }

  // Prompt/completion format
  if (keys.includes('prompt') && keys.includes('completion')) {
    return 'prompt-completion';
  }

  // Text-only format
  if (keys.includes('text') && keys.length <= 2) {
    return 'text-only';
  }

  return 'unknown';
}

/**
 * Detect schema from CSV/TSV columns.
 */
function detectCsvSchema(columns: string[]): DetectedSchema {
  const lower = columns.map((c) => c.toLowerCase().trim());

  const inputCol = columns.find((_c, i) => INPUT_COLUMNS.includes(lower[i]!));
  const outputCol = columns.find((_c, i) => OUTPUT_COLUMNS.includes(lower[i]!));
  const systemCol = columns.find((_c, i) => SYSTEM_COLUMNS.includes(lower[i]!));

  if (inputCol && outputCol) {
    return {
      shape: 'instruction-io',
      columns,
      inferredMapping: { inputColumn: inputCol, outputColumn: outputCol, systemColumn: systemCol },
      confident: true,
    };
  }

  if (inputCol) {
    return {
      shape: 'text-only',
      columns,
      inferredMapping: { inputColumn: inputCol },
      confident: false, // We found input but no output — user should confirm
    };
  }

  // Can't auto-detect — user will need to pick columns
  return {
    shape: 'unknown',
    columns,
    confident: false,
  };
}

// ─── Parsing ─────────────────────────────────────────────────────────────────

/**
 * Parse a CSV or TSV file into rows.
 */
function parseCsv(content: string, delimiter: string): Array<Record<string, string>> {
  try {
    return csvParse(content, {
      columns: true,
      delimiter,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Array<Record<string, string>>;
  } catch (e) {
    throw new PlainLanguageError({
      userMessage: 'Failed to parse CSV/TSV file.',
      guidance: 'Make sure the file is a valid CSV or TSV with headers in the first row.',
      technicalDetail: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Parse JSON array content.
 */
function parseJsonArray(content: string): unknown[] {
  try {
    const parsed = JSON.parse(content);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected a JSON array');
    }
    return parsed;
  } catch (e) {
    throw new PlainLanguageError({
      userMessage: 'Failed to parse JSON file.',
      guidance: 'The file should contain a JSON array of objects (e.g., [{"text": "..."}, ...]).',
      technicalDetail: e instanceof Error ? e.message : String(e),
    });
  }
}

/**
 * Parse JSONL content (one JSON object per line).
 */
function parseJsonl(content: string): unknown[] {
  const lines = content.trim().split('\n');
  const results: unknown[] = [];
  let parseErrors = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
      parseErrors++;
    }
  }

  if (results.length === 0 && parseErrors > 0) {
    throw new PlainLanguageError({
      userMessage: 'Failed to parse JSONL file.',
      guidance: 'Each line should be a valid JSON object (e.g., {"text": "..."}).',
    });
  }

  return results;
}

/**
 * Split plain text into training examples by paragraphs.
 */
function splitPlainText(content: string): NormalizedExample[] {
  const chunks = content
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 50); // Skip very short chunks

  return chunks.map((chunk) => ({ text: chunk }));
}

/**
 * Split markdown into training examples by headers.
 */
function splitMarkdown(content: string): NormalizedExample[] {
  const sections: string[] = [];
  let currentSection = '';

  for (const line of content.split('\n')) {
    if (/^#{1,3}\s/.test(line) && currentSection.trim().length > 50) {
      sections.push(currentSection.trim());
      currentSection = line + '\n';
    } else {
      currentSection += line + '\n';
    }
  }

  if (currentSection.trim().length > 50) {
    sections.push(currentSection.trim());
  }

  return sections.map((section) => ({ text: section }));
}

// ─── Normalization ───────────────────────────────────────────────────────────

/**
 * Normalize a single JSON/CSV row into a NormalizedExample.
 */
function normalizeRow(
  row: Record<string, unknown>,
  shape: JsonSchemaShape,
  mapping?: ColumnMapping,
): NormalizedExample | null {
  switch (shape) {
    case 'instruction-io': {
      const instruction = String(
        row.instruction ?? row.Instruction ?? row.prompt ?? row.Prompt ??
        (mapping?.inputColumn ? row[mapping.inputColumn] : '') ?? ''
      ).trim();
      const input = String(row.input ?? row.Input ?? '').trim();
      const output = String(
        row.output ?? row.Output ?? row.response ?? row.Response ??
        row.completion ?? row.Completion ??
        (mapping?.outputColumn ? row[mapping.outputColumn] : '') ?? ''
      ).trim();

      if (!instruction && !output) return null;
      return { instruction, input: input || undefined, output };
    }

    case 'prompt-completion': {
      const instruction = String(row.prompt ?? row.Prompt ?? '').trim();
      const output = String(row.completion ?? row.Completion ?? '').trim();
      if (!instruction && !output) return null;
      return { instruction, output };
    }

    case 'chat-messages': {
      const rawMessages = (row.messages ?? row.Messages) as unknown[];
      if (!Array.isArray(rawMessages) || rawMessages.length === 0) return null;

      const messages: ChatMessage[] = rawMessages
        .filter((m): m is Record<string, string> => typeof m === 'object' && m !== null)
        .map((m) => ({
          role: (m.role ?? 'user') as ChatMessage['role'],
          content: String(m.content ?? ''),
        }))
        .filter((m) => m.content.length > 0);

      if (messages.length === 0) return null;
      return { messages };
    }

    case 'text-only': {
      const text = String(
        row.text ?? row.Text ?? row.content ?? row.Content ??
        (mapping?.inputColumn ? row[mapping.inputColumn] : '') ?? ''
      ).trim();
      if (!text) return null;
      return { text };
    }

    default:
      return null;
  }
}

// ─── Validation ──────────────────────────────────────────────────────────────

/**
 * Validate and build statistics about a set of normalized examples.
 */
function validateExamples(examples: Array<NormalizedExample | null>): {
  validExamples: NormalizedExample[];
  issues: ValidationIssues;
} {
  let emptyRows = 0;
  let duplicateRows = 0;
  const validExamples: NormalizedExample[] = [];
  const seen = new Set<string>();

  for (const ex of examples) {
    if (ex === null) {
      emptyRows++;
      continue;
    }

    // Create a fingerprint for duplicate detection
    const fingerprint = JSON.stringify(ex);
    if (seen.has(fingerprint)) {
      duplicateRows++;
      continue;
    }
    seen.add(fingerprint);
    validExamples.push(ex);
  }

  return {
    validExamples,
    issues: {
      emptyRows,
      duplicateRows,
      missingFields: 0,  // Already handled in normalization (returns null)
      encodingIssues: 0,  // TODO: detect encoding issues
      tokenLengthOutliers: 0, // Computed after tokenization
    },
  };
}

// ─── Main API ────────────────────────────────────────────────────────────────

/**
 * Load and validate a dataset file.
 * Returns a validation result with previews and statistics.
 */
export async function loadAndValidateDataset(
  filePath: string,
  columnMapping?: ColumnMapping,
): Promise<DatasetValidationResult> {
  const resolvedPath = resolvePath(filePath);
  const fileSizeBytes = await getFileSize(resolvedPath);

  // Size check — warn for very large files
  if (fileSizeBytes > 500 * 1024 * 1024) {
    throw new PlainLanguageError({
      userMessage: `This file is very large (${Math.round(fileSizeBytes / (1024 * 1024))} MB).`,
      guidance: 'Consider using a smaller subset of your data. Files over 500 MB may cause issues.',
    });
  }

  const content = await readFile(resolvedPath, 'utf-8');
  const format = detectFormat(resolvedPath, content);

  let rawExamples: Array<NormalizedExample | null>;
  let schema: DetectedSchema;

  switch (format) {
    case 'csv': {
      const rows = parseCsv(content, ',');
      if (rows.length === 0) {
        throw new PlainLanguageError({
          userMessage: 'The CSV file is empty or has no data rows.',
          guidance: 'Make sure the file has a header row followed by data rows.',
        });
      }
      schema = detectCsvSchema(Object.keys(rows[0]!));
      if (columnMapping) {
        schema.inferredMapping = columnMapping;
        schema.confident = true;
      }
      rawExamples = rows.map((row) => normalizeRow(row, schema.shape, schema.inferredMapping));
      break;
    }

    case 'tsv': {
      const rows = parseCsv(content, '\t');
      if (rows.length === 0) {
        throw new PlainLanguageError({
          userMessage: 'The TSV file is empty or has no data rows.',
          guidance: 'Make sure the file has a header row followed by data rows.',
        });
      }
      schema = detectCsvSchema(Object.keys(rows[0]!));
      if (columnMapping) {
        schema.inferredMapping = columnMapping;
        schema.confident = true;
      }
      rawExamples = rows.map((row) => normalizeRow(row, schema.shape, schema.inferredMapping));
      break;
    }

    case 'json': {
      const items = parseJsonArray(content);
      if (items.length === 0) {
        throw new PlainLanguageError({
          userMessage: 'The JSON file contains an empty array.',
          guidance: 'The file should contain an array of training examples.',
        });
      }
      const sample = items[0] as Record<string, unknown>;
      const shape = detectJsonShape(sample);
      schema = { shape, confident: shape !== 'unknown' };
      rawExamples = items.map((item) => normalizeRow(item as Record<string, unknown>, shape));
      break;
    }

    case 'jsonl': {
      const items = parseJsonl(content);
      if (items.length === 0) {
        throw new PlainLanguageError({
          userMessage: 'The JSONL file contains no valid JSON lines.',
          guidance: 'Each line should be a valid JSON object.',
        });
      }
      const sample = items[0] as Record<string, unknown>;
      const shape = detectJsonShape(sample);
      schema = { shape, confident: shape !== 'unknown' };
      rawExamples = items.map((item) => normalizeRow(item as Record<string, unknown>, shape));
      break;
    }

    case 'txt': {
      const examples = splitPlainText(content);
      schema = { shape: 'text-only', confident: true };
      rawExamples = examples;
      break;
    }

    case 'md': {
      const examples = splitMarkdown(content);
      schema = { shape: 'text-only', confident: true };
      rawExamples = examples;
      break;
    }
  }

  const { validExamples, issues } = validateExamples(rawExamples);

  if (validExamples.length === 0) {
    throw new PlainLanguageError({
      userMessage: 'No valid training examples found in the dataset.',
      guidance: 'Please check the file format and make sure it contains valid data.',
    });
  }

  return {
    format,
    schema,
    totalRows: rawExamples.length,
    validRows: validExamples.length,
    issues,
    preview: validExamples.slice(0, 3),
    fileSizeBytes,
  };
}

/**
 * Export normalized dataset to a JSONL file for the Python engine.
 */
export async function exportNormalizedDataset(
  filePath: string,
  columnMapping?: ColumnMapping,
): Promise<DatasetMeta> {
  const resolvedPath = resolvePath(filePath);
  const content = await readFile(resolvedPath, 'utf-8');
  const format = detectFormat(resolvedPath, content);

  // Re-parse and normalize (same logic as loadAndValidateDataset)
  let rawExamples: Array<NormalizedExample | null>;

  switch (format) {
    case 'csv': {
      const rows = parseCsv(content, ',');
      const schema = detectCsvSchema(Object.keys(rows[0] ?? {}));
      if (columnMapping) {
        schema.inferredMapping = columnMapping;
      }
      rawExamples = rows.map((r) => normalizeRow(r, schema.shape, schema.inferredMapping));
      break;
    }
    case 'tsv': {
      const rows = parseCsv(content, '\t');
      const schema = detectCsvSchema(Object.keys(rows[0] ?? {}));
      if (columnMapping) {
        schema.inferredMapping = columnMapping;
      }
      rawExamples = rows.map((r) => normalizeRow(r, schema.shape, schema.inferredMapping));
      break;
    }
    case 'json': {
      const items = parseJsonArray(content);
      const shape = detectJsonShape((items[0] ?? {}) as Record<string, unknown>);
      rawExamples = items.map((i) => normalizeRow(i as Record<string, unknown>, shape));
      break;
    }
    case 'jsonl': {
      const items = parseJsonl(content);
      const shape = detectJsonShape((items[0] ?? {}) as Record<string, unknown>);
      rawExamples = items.map((i) => normalizeRow(i as Record<string, unknown>, shape));
      break;
    }
    case 'txt':
      rawExamples = splitPlainText(content);
      break;
    case 'md':
      rawExamples = splitMarkdown(content);
      break;
  }

  const validExamples = rawExamples.filter((e): e is NormalizedExample => e !== null);

  // Write normalized JSONL
  const tempDir = getTempDir();
  await ensureDir(tempDir);
  const normalizedPath = `${tempDir}/dataset_normalized.jsonl`;
  const jsonlContent = validExamples.map((ex) => JSON.stringify(ex)).join('\n');
  await writeFile(normalizedPath, jsonlContent, 'utf-8');

  return {
    path: resolvedPath,
    format,
    rowCount: validExamples.length,
    tokenStats: {
      // Token stats will be computed by the Python engine with the model's tokenizer
      min: 0, max: 0, mean: 0, median: 0, p95: 0, totalTokens: 0,
    },
    normalizedPath,
  };
}
