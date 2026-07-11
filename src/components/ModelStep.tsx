import React, { useState, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import { TextInput } from '@inkjs/ui';
import type { HardwareInfo } from '../types/hardware.js';
import type { ModelInfo } from '../types/model.js';
import { Spinner } from './ui/Spinner.js';
import { ErrorBox } from './ui/ErrorBox.js';
import { ConfirmPrompt } from './ui/ConfirmPrompt.js';
import { INK, glyph } from '../utils/colors.js';

import { validateModel } from '../core/model-validator.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ModelStepProps {
  hardware: HardwareInfo;
  onComplete: (model: ModelInfo, hfToken?: string) => void;
  onBack: () => void;
}

type Phase =
  | 'input'           // entering model ID
  | 'validating'      // checking model on HF
  | 'token-input'     // model is gated, need HF token
  | 'revalidating'    // validating with token
  | 'info'            // show model info card + confirm
  | 'error';          // validation error

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatParams(count: number): string {
  if (count >= 1e9) return `${(count / 1e9).toFixed(1)}B`;
  if (count >= 1e6) return `${(count / 1e6).toFixed(0)}M`;
  return `${count}`;
}

function formatGB(gb: number): string {
  return `${gb.toFixed(1)} GB`;
}

function getVramAvailable(hardware: HardwareInfo): number {
  const { gpu } = hardware;
  if (gpu.type === 'nvidia') return gpu.vramFreeMB / 1024;
  if (gpu.type === 'apple-silicon') return gpu.unifiedMemoryFreeMB / 1024;
  return 0;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ModelInfoCard({ model, hardware }: {
  model: ModelInfo;
  hardware: HardwareInfo;
}): React.ReactElement {
  const vramAvailable = getVramAvailable(hardware);
  const willFit = model.estimated4BitGB < vramAvailable * 0.85; // 85% headroom

  return (
    <Box
      flexDirection="column"
      borderStyle="single"
      borderColor={INK.secondary}
      paddingX={2}
      paddingY={0}
      marginX={1}
      marginBottom={1}
    >
      <Text bold color={INK.primary}>{'MODEL INFO'}</Text>
      <Newline />
      <Text color={INK.dim}>{'  Name:           '}<Text color="white" bold>{model.id}</Text></Text>
      <Text color={INK.dim}>{'  Architecture:   '}<Text color="white">{model.architecture}</Text></Text>
      <Text color={INK.dim}>{'  Parameters:     '}<Text color="white" bold>{formatParams(model.parameterCount)}</Text></Text>
      <Text color={INK.dim}>{'  Size (FP16):    '}<Text color="white">{formatGB(model.estimatedSizeFP16GB)}</Text></Text>
      <Text color={INK.dim}>{'  Size (4-bit):   '}<Text color="white" bold>{formatGB(model.estimated4BitGB)}</Text></Text>
      <Text color={INK.dim}>{'  Context:        '}<Text color="white">{model.maxContextLength.toLocaleString()} tokens</Text></Text>
      <Text color={INK.dim}>{'  Layers:         '}<Text color="white">{model.numLayers}</Text></Text>
      <Text color={INK.dim}>{'  Hidden size:    '}<Text color="white">{model.hiddenSize}</Text></Text>
      {model.chatTemplate && (
        <Text color={INK.dim}>{'  Chat template:  '}<Text color={INK.primary}>{`[INCLUDED] ${glyph.success} detected`}</Text></Text>
      )}
      {!model.chatTemplate && (
        <Text color={INK.dim}>{'  Chat template:  '}<Text color={INK.warning}>{`[MISSING] ${glyph.warning} not found`}</Text></Text>
      )}
      <Newline />
      <Text color={INK.secondary}>{`  ${glyph.separator.repeat(40)}`}</Text>
      <Text>
        {'  Quick fit check: '}
        {willFit ? (
          <Text color={INK.primary} bold>{`[FITS] ${glyph.success} Should fit in your `}{formatGB(vramAvailable)}{' VRAM'}</Text>
        ) : (
          <Text color={INK.error} bold>{`[OOM] ${glyph.error} Tight fit ${glyph.separator} `}{formatGB(model.estimated4BitGB)}{' needed vs '}{formatGB(vramAvailable)}{' available'}</Text>
        )}
      </Text>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Model ID input and validation wizard step.
 */
export function ModelStep({ hardware, onComplete, onBack }: ModelStepProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('input');
  const [modelId, setModelId] = useState('');
  const [hfToken, setHfToken] = useState<string | undefined>(undefined);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [error, setError] = useState('');

  // Handle model ID submission
  const handleModelSubmit = useCallback(async (id: string) => {
    const trimmed = id.trim();
    if (!trimmed) return;
    setModelId(trimmed);
    setPhase('validating');

    try {
      const result = await validateModel(trimmed);

      if (result.needsToken) {
        setPhase('token-input');
        return;
      }

      if (!result.valid || !result.model) {
        setError(result.error ?? 'Unknown validation error');
        setPhase('error');
        return;
      }

      setModel(result.model);
      setPhase('info');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, []);

  // Handle HF token submission
  const handleTokenSubmit = useCallback(async (token: string) => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setHfToken(trimmed);
    setPhase('revalidating');

    try {
      const result = await validateModel(modelId, trimmed);

      if (!result.valid || !result.model) {
        setError(result.error ?? 'Access denied. Check your token and model permissions.');
        setPhase('error');
        return;
      }

      setModel(result.model);
      setPhase('info');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase('error');
    }
  }, [modelId]);

  // Handle confirmation
  const handleConfirm = useCallback((yes: boolean) => {
    if (!yes) {
      onBack();
      return;
    }
    if (model) {
      onComplete(model, hfToken);
    }
  }, [model, hfToken, onComplete, onBack]);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={1}>
        <Text bold color={INK.text}>CHOOSE MODEL</Text>
      </Box>

      {/* Phase: Model ID input */}
      {phase === 'input' && (
        <Box flexDirection="column" marginX={2}>
          <Text color={INK.dim}>
            Enter a HuggingFace model ID:
          </Text>
          <Box marginTop={0}>
            <Text color={INK.primary} bold>{`${glyph.prompt} `}</Text>
            <TextInput
              placeholder="e.g., meta-llama/Llama-3.2-1B"
              onSubmit={handleModelSubmit}
            />
          </Box>
          <Box marginTop={1}>
            <Text color={INK.dim}>
              {'  Tip: Use a small model (1B-3B params) for faster training'}
            </Text>
          </Box>
        </Box>
      )}

      {/* Phase: Validating */}
      {(phase === 'validating' || phase === 'revalidating') && (
        <Spinner message={`Checking ${modelId} on HuggingFace...`} />
      )}

      {/* Phase: Gated model — need HF token */}
      {phase === 'token-input' && (
        <Box flexDirection="column" marginX={2}>
          <Box marginBottom={0}>
            <Text color={INK.warning} bold>{'[GATED] '}</Text>
            <Text bold color={INK.text}>This model is gated</Text>
          </Box>
          <Text color={INK.dim}>
            You need a HuggingFace access token with permission for this model.
          </Text>
          <Text color={INK.dim}>
            {'Get one at: '}<Text color={INK.primary} underline>https://huggingface.co/settings/tokens</Text>
          </Text>
          <Box marginTop={0}>
            <Text color={INK.primary} bold>{`${glyph.prompt} Token: `}</Text>
            <TextInput
              placeholder="hf_..."
              onSubmit={handleTokenSubmit}
            />
          </Box>
        </Box>
      )}

      {/* Phase: Model info card */}
      {phase === 'info' && model && (
        <Box flexDirection="column">
          <ModelInfoCard model={model} hardware={hardware} />

          {!model.isSupported && (
            <Box marginX={2} marginBottom={1}>
              <Text color={INK.warning} bold>
                {`${glyph.warning} `}Architecture "{model.architecture}" is not in the verified list.
                Training may still work, but results are not guaranteed.
              </Text>
            </Box>
          )}

          <ConfirmPrompt
            question="Use this model?"
            onConfirm={handleConfirm}
          />
        </Box>
      )}

      {/* Phase: Error */}
      {phase === 'error' && (
        <Box flexDirection="column">
          <ErrorBox
            title="Model Error"
            message={error}
            guidance={
              'Check the model ID — it should look like "organization/model-name".\n' +
              'Make sure the model exists on HuggingFace and you have access.'
            }
          />
          <Box marginX={2} marginTop={0}>
            <Text color={INK.dim}>Press Ctrl+C to exit, or restart to try again.</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
