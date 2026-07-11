import React, { useState, useCallback } from 'react';
import { Box, Text } from 'ink';
import { TextInput, Select } from '@inkjs/ui';
import type { DatasetMeta, DatasetValidationResult, NormalizedExample, ColumnMapping } from '../types/dataset.js';
import { Spinner } from './ui/Spinner.js';
import { ErrorBox } from './ui/ErrorBox.js';
import { ConfirmPrompt } from './ui/ConfirmPrompt.js';
import { loadAndValidateDataset, exportNormalizedDataset, findLocalDatasets } from '../core/dataset.js';
import { PlainLanguageError } from '../utils/errors.js';
import { INK, glyph } from '../utils/colors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DatasetStepProps {
  onComplete: (meta: DatasetMeta) => void;
  onBack: () => void;
}

type Phase =
  | 'select'         // pick from local files
  | 'input'          // entering file path manually
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
      <Text color={INK.secondary}>{`${glyph.separator.repeat(2)} Example ${index + 1} ${glyph.separator.repeat(2)}`}</Text>
      {example.instruction && (
        <Text>
          <Text color={INK.primary} bold>{'  instruction: '}</Text>
          <Text color={INK.text}>{truncate(example.instruction, maxLen)}</Text>
        </Text>
      )}
      {example.input && (
        <Text>
          <Text color={INK.primary} bold>{'  input:       '}</Text>
          <Text color={INK.text}>{truncate(example.input, maxLen)}</Text>
        </Text>
      )}
      {example.output && (
        <Text>
          <Text color={INK.primary} bold>{'  output:      '}</Text>
          <Text color={INK.text}>{truncate(example.output, maxLen)}</Text>
        </Text>
      )}
      {example.text && (
        <Text>
          <Text color={INK.primary} bold>{'  text:        '}</Text>
          <Text color={INK.text}>{truncate(example.text, maxLen)}</Text>
        </Text>
      )}
      {example.messages && example.messages.length > 0 && (
        <>
          {example.messages.slice(0, 3).map((m, i) => (
            <Text key={i}>
              <Text color={INK.primary} bold>
                {'  '}{m.role.padEnd(10)}
              </Text>
              <Text color={INK.text}>{truncate(m.content, maxLen)}</Text>
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
      <Text bold color={INK.primary}>  DATASET SUMMARY</Text>
      <Text color={INK.secondary}>{`  ${glyph.separator.repeat(40)}`}</Text>
      <Text color={INK.dim}>{'  Format:     '}<Text color="white" bold>{`[${result.format.toUpperCase()}]`}</Text></Text>
      <Text color={INK.dim}>{'  Schema:     '}<Text color="white">{formatSchemaShape(result.schema.shape)}</Text></Text>
      <Text color={INK.dim}>{'  File size:  '}<Text color="white">{formatBytes(result.fileSizeBytes)}</Text></Text>
      <Text color={INK.dim}>{'  Total rows: '}<Text color="white" bold>{totalRows}</Text></Text>
      <Text color={INK.dim}>
        {'  Valid rows: '}
        <Text color={validRows === totalRows ? INK.primary : INK.warning} bold>
          {validRows}
        </Text>
        {validRows < totalRows && (
          <Text color={INK.warning}>{` (${totalRows - validRows} skipped)`}</Text>
        )}
      </Text>
      {issueCount > 0 && (
        <Box flexDirection="column" marginTop={0}>
          <Text color={INK.warning} bold>{'  Issues found:'}</Text>
          {issues.emptyRows > 0 && <Text color={INK.warning}>{`    ${glyph.bullet} `}{issues.emptyRows} empty rows</Text>}
          {issues.duplicateRows > 0 && <Text color={INK.warning}>{`    ${glyph.bullet} `}{issues.duplicateRows} duplicate rows</Text>}
          {issues.missingFields > 0 && <Text color={INK.warning}>{`    ${glyph.bullet} `}{issues.missingFields} rows with missing fields</Text>}
          {issues.encodingIssues > 0 && <Text color={INK.warning}>{`    ${glyph.bullet} `}{issues.encodingIssues} encoding issues</Text>}
          {issues.tokenLengthOutliers > 0 && <Text color={INK.warning}>{`    ${glyph.bullet} `}{issues.tokenLengthOutliers} token length outliers</Text>}
        </Box>
      )}
      {issueCount === 0 && (
        <Text color={INK.primary}>{`  ${glyph.success} [CLEAN] No issues found`}</Text>
      )}
      <Text color={INK.secondary}>{`  ${glyph.separator.repeat(40)}`}</Text>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Dataset selection and preview wizard step.
 */
export function DatasetStep({ onComplete, onBack }: DatasetStepProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('select');
  const [localFiles, setLocalFiles] = useState<string[]>([]);
  const [filePath, setFilePath] = useState('');
  const [error, setError] = useState<Error | string | null>(null);
  const [validation, setValidation] = useState<DatasetValidationResult | null>(null);
  const [selectedMapping, setSelectedMapping] = useState<ColumnMapping | undefined>(undefined);

  React.useEffect(() => {
    findLocalDatasets().then((files) => {
      setLocalFiles(files);
      if (files.length === 0) setPhase('input');
    });
  }, []);

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
        <Text bold color={INK.text}>SELECT DATASET</Text>
      </Box>

      {/* Phase: File selection */}
      {phase === 'select' && (
        <Box flexDirection="column" marginX={2}>
          <Text color={INK.dim}>
            Found these datasets in the current directory:
          </Text>
          <Box marginTop={0}>
            <Select
              options={[
                ...localFiles.map(f => {
                  const ext = f.split('.').pop()?.toUpperCase() || 'FILE';
                  return { label: `[${ext}] ${f}`, value: f };
                }),
                { label: `${glyph.prompt} ENTER PATH MANUALLY`, value: '__manual__' }
              ]}
              onChange={(value) => {
                if (value === '__manual__') {
                  setPhase('input');
                } else {
                  handlePathSubmit(value);
                }
              }}
            />
          </Box>
        </Box>
      )}

      {/* Phase: File path input */}
      {phase === 'input' && (
        <Box flexDirection="column" marginX={2}>
          <Text color={INK.dim}>
            Enter the path to your training data (CSV, JSON, JSONL, or TXT):
          </Text>
          <Box marginTop={0}>
            <Text color={INK.primary} bold>{`${glyph.prompt} `}</Text>
            <TextInput
              placeholder="./data/my-dataset.jsonl"
              onSubmit={handlePathSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text color={INK.dim}>
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
          <Text color={INK.warning} bold>
            {`${glyph.warning} `} Could not auto-detect the column mapping.
          </Text>
          <Text color={INK.dim}>
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
              <Text bold color={INK.primary}>  PREVIEW</Text>
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
            <Text color={INK.dim}>Press Ctrl+C to exit, or restart to try again.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
