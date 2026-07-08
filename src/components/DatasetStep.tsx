import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import type { DatasetMeta, DatasetValidationResult, NormalizedExample, ColumnMapping } from '../types/dataset.js';
import { Spinner } from './ui/Spinner.js';
import { ErrorBox } from './ui/ErrorBox.js';
import { ConfirmPrompt } from './ui/ConfirmPrompt.js';
import { loadAndValidateDataset, exportNormalizedDataset } from '../core/dataset.js';
import { PlainLanguageError } from '../utils/errors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DatasetStepProps {
  onComplete: (meta: DatasetMeta) => void;
  onBack: () => void;
}

type Phase =
  | 'input'          // entering file path
  | 'validating'     // loading and validating
  | 'mapping'        // ambiguous schema — user picks column mapping
  | 'preview'        // show preview + confirm
  | 'normalizing'    // writing normalized file
  | 'error';         // validation error

// ─── Helpers ─────────────────────────────────────────────────────────────────

function truncate(str: string, len: number): string {
  if (str.length <= len) return str;
  return str.slice(0, len - 3) + '...';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSchemaShape(shape: string): string {
  switch (shape) {
    case 'instruction-io':    return 'Instruction / Input / Output';
    case 'prompt-completion': return 'Prompt / Completion';
    case 'chat-messages':     return 'Chat Messages (multi-turn)';
    case 'text-only':         return 'Text Only (continued pre-training)';
    default:                  return 'Unknown';
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function PreviewExample({ example, index }: {
  example: NormalizedExample;
  index: number;
}): React.ReactElement {
  const maxLen = 76;
  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      <Text color="gray" dimColor>{'── Example '}{index + 1}{' ──'}</Text>
      {example.instruction && (
        <Text>
          <Text color="cyan" bold>{'  instruction: '}</Text>
          <Text>{truncate(example.instruction, maxLen)}</Text>
        </Text>
      )}
      {example.input && (
        <Text>
          <Text color="cyan" bold>{'  input:       '}</Text>
          <Text>{truncate(example.input, maxLen)}</Text>
        </Text>
      )}
      {example.output && (
        <Text>
          <Text color="cyan" bold>{'  output:      '}</Text>
          <Text>{truncate(example.output, maxLen)}</Text>
        </Text>
      )}
      {example.text && (
        <Text>
          <Text color="cyan" bold>{'  text:        '}</Text>
          <Text>{truncate(example.text, maxLen)}</Text>
        </Text>
      )}
      {example.messages && example.messages.length > 0 && (
        <>
          {example.messages.slice(0, 3).map((m, i) => (
            <Text key={i}>
              <Text color={m.role === 'user' ? 'green' : m.role === 'assistant' ? 'blue' : 'yellow'} bold>
                {'  '}{m.role.padEnd(10)}
              </Text>
              <Text>{truncate(m.content, maxLen)}</Text>
            </Text>
          ))}
        </>
      )}
    </Box>
  );
}

function ValidationSummary({ result }: { result: DatasetValidationResult }): React.ReactElement {
  const { issues, totalRows, validRows } = result;
  const issueCount = issues.emptyRows + issues.duplicateRows + issues.missingFields +
    issues.encodingIssues + issues.tokenLengthOutliers;

  return (
    <Box flexDirection="column" marginX={2} marginBottom={1}>
      <Text bold color="cyan">  Dataset Summary</Text>
      <Text color="gray">  {'─'.repeat(40)}</Text>
      <Text>{'  Format:     '}<Text color="white" bold>{result.format.toUpperCase()}</Text></Text>
      <Text>{'  Schema:     '}<Text color="white">{formatSchemaShape(result.schema.shape)}</Text></Text>
      <Text>{'  File size:  '}<Text color="white">{formatBytes(result.fileSizeBytes)}</Text></Text>
      <Text>{'  Total rows: '}<Text color="white" bold>{totalRows}</Text></Text>
      <Text>
        {'  Valid rows: '}
        <Text color={validRows === totalRows ? 'green' : 'yellow'} bold>
          {validRows}
        </Text>
        {validRows < totalRows && (
          <Text color="yellow">{` (${totalRows - validRows} skipped)`}</Text>
        )}
      </Text>
      {issueCount > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text color="yellow" bold>{'  Issues found:'}</Text>
          {issues.emptyRows > 0 && <Text color="yellow">{'    • '}{issues.emptyRows} empty rows</Text>}
          {issues.duplicateRows > 0 && <Text color="yellow">{'    • '}{issues.duplicateRows} duplicate rows</Text>}
          {issues.missingFields > 0 && <Text color="yellow">{'    • '}{issues.missingFields} rows with missing fields</Text>}
          {issues.encodingIssues > 0 && <Text color="yellow">{'    • '}{issues.encodingIssues} encoding issues</Text>}
          {issues.tokenLengthOutliers > 0 && <Text color="yellow">{'    • '}{issues.tokenLengthOutliers} token length outliers</Text>}
        </Box>
      )}
      {issueCount === 0 && (
        <Text color="green">{'  ✓ No issues found'}</Text>
      )}
      <Text color="gray">  {'─'.repeat(40)}</Text>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Dataset selection and preview wizard step.
 */
export function DatasetStep({ onComplete, onBack }: DatasetStepProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('input');
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState<Error | string | null>(null);
  const [validation, setValidation] = useState<DatasetValidationResult | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<ColumnMapping | undefined>(undefined);

  const handlePathSubmit = useCallback(async (path: string) => {
    // Trim whitespace and remove surrounding quotes (added by terminal drag-and-drop)
    const trimmed = path.trim().replace(/^["']|["']$/g, '');
    if (!trimmed) return;
    setFilePath(trimmed);
    setPhase('validating');

    try {
      const result = await loadAndValidateDataset(trimmed);
      setValidation(result);

      if (result.schema.shape === 'unknown' && !result.schema.confident) {
        setPhase('mapping');
      } else {
        setPhase('preview');
      }
    } catch (err) {
      setError(err instanceof Error ? err : String(err));
      setPhase('error');
    }
  }, []);

  // Handle column mapping selection for ambiguous schemas
  const handleMappingSelect = useCallback((value: string) => {
    if (!validation?.schema.columns) return;

    // The select value encodes which column is the input column
    const mapping: ColumnMapping = {
      inputColumn: value,
    };
    setSelectedMapping(mapping);
    setPhase('preview');
  }, [validation]);

  // Handle confirmation
  const handleConfirm = useCallback(async (yes: boolean) => {
    if (!yes) {
      onBack();
      return;
    }

    setPhase('normalizing');
    try {
      const meta = await exportNormalizedDataset(filePath, selectedMapping);
      onComplete(meta);
    } catch (err) {
      setError(err instanceof Error ? err : String(err));
      setPhase('error');
    }
  }, [filePath, selectedMapping, onComplete, onBack]);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={1}>
        <Text bold color="cyan">{'📁 Step 1: '}</Text>
        <Text bold>Select Your Dataset</Text>
      </Box>

      {/* Phase: File path input */}
      {phase === 'input' && (
        <Box flexDirection="column" marginX={2}>
          <Text color="gray" dimColor>
            Enter the path to your training data (CSV, JSON, JSONL, or TXT):
          </Text>
          <Box marginTop={0}>
            <Text color="cyan" bold>{'> '}</Text>
            <TextInput
              placeholder="./data/my-dataset.jsonl"
              onSubmit={handlePathSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text color="gray" dimColor>
              {'  Tip: Drag and drop a file onto the terminal to paste its path'}
            </Text>
          </Box>
        </Box>
      )}

      {/* Phase: Validating */}
      {phase === 'validating' && (
        <Spinner message={`Validating ${filePath}...`} />
      )}

      {/* Phase: Ambiguous schema — column mapping */}
      {phase === 'mapping' && validation?.schema.columns && (
        <Box flexDirection="column" marginX={2}>
          <Text color="yellow" bold>
            {'⚠ '} Could not auto-detect the column mapping.
          </Text>
          <Text color="gray" dimColor>
            Which column contains the input/prompt text?
          </Text>
          <Box marginTop={0}>
            <Select
              options={validation.schema.columns.map(col => ({
                label: col,
                value: col,
              }))}
              onChange={handleMappingSelect}
            />
          </Box>
        </Box>
      )}

      {/* Phase: Preview */}
      {phase === 'preview' && validation && (
        <Box flexDirection="column">
          <ValidationSummary result={validation} />

          {validation.preview.length > 0 && (
            <Box flexDirection="column" marginX={2} marginBottom={1}>
              <Text bold color="cyan">  Preview</Text>
              {validation.preview.slice(0, 3).map((ex, i) => (
                <PreviewExample key={i} example={ex} index={i} />
              ))}
            </Box>
          )}

          <ConfirmPrompt
            question="Use this dataset?"
            onConfirm={handleConfirm}
          />
        </Box>
      )}

      {/* Phase: Normalizing */}
      {phase === 'normalizing' && (
        <Spinner message="Normalizing dataset..." />
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <Box flexDirection="column">
          <ErrorBox
            title="Dataset Error"
            message={error instanceof Error ? error.message : String(error)}
            guidance={error instanceof PlainLanguageError ? error.guidance : "Check that the file exists and is in a supported format (CSV, JSON, JSONL, TXT)."}
          />
          <Box marginX={2} marginTop={0}>
            <Text color="gray" dimColor>Press Ctrl+C to exit, or restart to try again.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
