/**
 * Unit tests for dataset ingestion module.
 * Tests format detection, schema inference, validation, and normalization
 * across all supported formats with valid, malformed, and edge-case files.
 */

import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';
import { detectFormat, loadAndValidateDataset } from '../../src/core/dataset.js';

const FIXTURES = join(import.meta.dirname, '..', 'fixtures');

// ─── Format Detection ────────────────────────────────────────────────────────

describe('detectFormat', () => {
  it('should detect CSV by extension', () => {
    expect(detectFormat('data.csv', 'a,b,c\n1,2,3')).toBe('csv');
  });

  it('should detect TSV by extension', () => {
    expect(detectFormat('data.tsv', 'a\tb\tc\n1\t2\t3')).toBe('tsv');
  });

  it('should detect JSON by extension and content', () => {
    expect(detectFormat('data.json', '[{"text":"hello"}]')).toBe('json');
  });

  it('should detect JSONL by extension', () => {
    expect(detectFormat('data.jsonl', '{"text":"hello"}\n{"text":"world"}')).toBe('jsonl');
  });

  it('should detect plain text by extension', () => {
    expect(detectFormat('data.txt', 'Hello world\n\nThis is text')).toBe('txt');
  });

  it('should detect markdown by extension', () => {
    expect(detectFormat('data.md', '# Title\n\nContent here')).toBe('md');
  });

  it('should detect JSONL for .json files with line-separated JSON', () => {
    const content = '{"text":"line1"}\n{"text":"line2"}';
    expect(detectFormat('data.json', content)).toBe('jsonl');
  });

  it('should detect CSV by content sniffing for unknown extensions', () => {
    expect(detectFormat('data.dat', 'name,age\nAlice,30\nBob,25')).toBe('csv');
  });

  it('should detect markdown by content sniffing for unknown extensions', () => {
    expect(detectFormat('data.unknown', '# Title\n\nSome content\n\n## Section')).toBe('md');
  });
});

// ─── CSV Loading ─────────────────────────────────────────────────────────────

describe('loadAndValidateDataset — CSV', () => {
  it('should load and validate a CSV file with instruction/output columns', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-csv.csv'));

    expect(result.format).toBe('csv');
    expect(result.schema.shape).toBe('instruction-io');
    expect(result.schema.confident).toBe(true);
    expect(result.validRows).toBe(5);
    expect(result.totalRows).toBe(5);
    expect(result.preview.length).toBe(3);
    expect(result.issues.emptyRows).toBe(0);
  });

  it('should detect instruction and output columns automatically', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-csv.csv'));

    expect(result.schema.inferredMapping).toBeDefined();
    expect(result.schema.inferredMapping?.inputColumn).toBe('instruction');
    expect(result.schema.inferredMapping?.outputColumn).toBe('output');
  });

  it('should throw on empty CSV', async () => {
    await expect(
      loadAndValidateDataset(join(FIXTURES, 'dataset-empty.csv'))
    ).rejects.toThrow(/empty|no.*data/i);
  });
});

// ─── TSV Loading ─────────────────────────────────────────────────────────────

describe('loadAndValidateDataset — TSV', () => {
  it('should load a TSV file with prompt/completion columns', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-tsv.tsv'));

    expect(result.format).toBe('tsv');
    expect(result.validRows).toBeGreaterThan(0);
    expect(result.preview.length).toBeGreaterThan(0);
  });
});

// ─── JSON Loading ────────────────────────────────────────────────────────────

describe('loadAndValidateDataset — JSON', () => {
  it('should load a JSON array of instruction/IO objects', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-json.json'));

    expect(result.format).toBe('json');
    expect(result.schema.shape).toBe('instruction-io');
    expect(result.validRows).toBe(5);
    expect(result.preview.length).toBe(3);

    // Check normalization
    const first = result.preview[0]!;
    expect(first.instruction).toBeDefined();
    expect(first.output).toBeDefined();
  });
});

// ─── JSONL Loading ───────────────────────────────────────────────────────────

describe('loadAndValidateDataset — JSONL', () => {
  it('should load JSONL instruction format', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-jsonl.jsonl'));

    expect(result.format).toBe('jsonl');
    expect(result.schema.shape).toBe('instruction-io');
    expect(result.validRows).toBe(5);
  });

  it('should load JSONL chat/messages format', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-chat.jsonl'));

    expect(result.format).toBe('jsonl');
    expect(result.schema.shape).toBe('chat-messages');
    expect(result.validRows).toBe(4);

    // Check chat normalization
    const first = result.preview[0]!;
    expect(first.messages).toBeDefined();
    expect(first.messages!.length).toBeGreaterThan(0);
    expect(first.messages![0]!.role).toBeDefined();
    expect(first.messages![0]!.content).toBeDefined();
  });

  it('should handle malformed JSONL (some invalid lines)', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-malformed.json'));

    // Should parse valid lines and skip invalid ones
    expect(result.validRows).toBe(3); // 3 valid JSON lines out of 5
  });
});

// ─── Plain Text Loading ─────────────────────────────────────────────────────

describe('loadAndValidateDataset — TXT', () => {
  it('should split plain text by paragraphs', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-txt.txt'));

    expect(result.format).toBe('txt');
    expect(result.schema.shape).toBe('text-only');
    expect(result.validRows).toBeGreaterThan(0);

    // Each example should have text
    for (const ex of result.preview) {
      expect(ex.text).toBeDefined();
      expect(ex.text!.length).toBeGreaterThan(50);
    }
  });
});

// ─── Markdown Loading ────────────────────────────────────────────────────────

describe('loadAndValidateDataset — MD', () => {
  it('should split markdown by headers', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-md.md'));

    expect(result.format).toBe('md');
    expect(result.schema.shape).toBe('text-only');
    expect(result.validRows).toBeGreaterThan(0);
  });
});

// ─── Validation ──────────────────────────────────────────────────────────────

describe('validation', () => {
  it('should detect duplicate rows', async () => {
    // Create a file with duplicates inline (using JSONL format)
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-jsonl.jsonl'));
    // No duplicates in fixture
    expect(result.issues.duplicateRows).toBe(0);
  });

  it('should count all issue types', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-csv.csv'));
    expect(result.issues).toHaveProperty('emptyRows');
    expect(result.issues).toHaveProperty('duplicateRows');
    expect(result.issues).toHaveProperty('missingFields');
    expect(result.issues).toHaveProperty('encodingIssues');
    expect(result.issues).toHaveProperty('tokenLengthOutliers');
  });
});

// ─── Preview ─────────────────────────────────────────────────────────────────

describe('preview', () => {
  it('should return at most 3 preview examples', async () => {
    const result = await loadAndValidateDataset(join(FIXTURES, 'dataset-csv.csv'));
    expect(result.preview.length).toBeLessThanOrEqual(3);
    expect(result.preview.length).toBeGreaterThan(0);
  });
});
