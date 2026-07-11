import React, { useState, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import { Select, TextInput } from '@inkjs/ui';
import type { AutoConfigResult, LoraConfig, TrainingParams } from '../types/config.js';
import { ConfirmPrompt } from './ui/ConfirmPrompt.js';
import { INK, glyph } from '../utils/colors.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ConfigStepProps {
  config: AutoConfigResult;
  onConfirm: (config: AutoConfigResult) => void;
  onBack: () => void;
}

type Phase =
  | 'review'      // reviewing auto-config
  | 'action'      // choosing action (start, adjust, cancel)
  | 'adjust'      // adjusting settings
  | 'confirm';    // final confirm after adjustment

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatGB(gb: number): string {
  return `${gb.toFixed(1)} GB`;
}

function formatTimeRange(low: number, high: number): string {
  const fmtMinutes = (m: number) => {
    if (m < 60) return `${Math.round(m)} min`;
    const h = Math.floor(m / 60);
    const mins = Math.round(m % 60);
    return mins > 0 ? `${h}h ${mins}m` : `${h}h`;
  };
  return `${fmtMinutes(low)} – ${fmtMinutes(high)}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function ConfigCard({ config }: { config: AutoConfigResult }): React.ReactElement {
  const { lora, training, seqLength, totalSteps, vramEstimate, timeEstimate, availableMemoryGB, fits } = config;
  const effBatch = training.batchSize * training.gradientAccumulationSteps;
  const divider = `  ${glyph.separator.repeat(38)}`;

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
      <Text bold color={INK.primary}>{'TRAINING CONFIGURATION'}</Text>
      <Newline />
      <Text><Text color={INK.dim}>{'  LoRA rank:       '}</Text><Text color="white" bold>{lora.rank}</Text></Text>
      <Text><Text color={INK.dim}>{'  LoRA alpha:      '}</Text><Text color="white">{lora.alpha}</Text></Text>
      <Text><Text color={INK.dim}>{'  Sequence length: '}</Text><Text color="white" bold>{seqLength} tokens</Text></Text>
      <Text>
        <Text color={INK.dim}>{'  Batch size:      '}</Text>
        <Text color="white" bold>{training.batchSize}</Text>
        <Text color={INK.dim}>{` (x${training.gradientAccumulationSteps} accum = ${effBatch} eff.)`}</Text>
      </Text>
      <Text><Text color={INK.dim}>{'  Learning rate:   '}</Text><Text color="white" bold>{training.learningRate}</Text></Text>
      <Text><Text color={INK.dim}>{'  Epochs:          '}</Text><Text color="white">{training.epochs}</Text></Text>
      <Text><Text color={INK.dim}>{'  Total steps:     '}</Text><Text color="white" bold>{'~'}{totalSteps}</Text></Text>
      {training.gradientCheckpointing && (
        <Text><Text color={INK.dim}>{'  Grad checkpoint: '}</Text><Text color={INK.primary}>{'[ON]'}</Text></Text>
      )}
      {training.use8BitOptimizer && (
        <Text><Text color={INK.dim}>{'  8-bit optimizer: '}</Text><Text color={INK.primary}>{'[ON]'}</Text></Text>
      )}

      <Newline />
      <Text color={INK.secondary}>{divider}</Text>
      <Newline />

      <Text>
        <Text color={INK.dim}>{'  Memory:  '}</Text>
        <Text color={fits ? INK.primary : INK.warning} bold>{'~'}{formatGB(vramEstimate.totalGB)}</Text>
        <Text color={INK.dim}>{' / '}{formatGB(availableMemoryGB)}{' VRAM'}</Text>
      </Text>
      <Text>
        <Text color={INK.dim}>{'  Time:    '}</Text>
        <Text color="white" bold>{formatTimeRange(timeEstimate.lowMinutes, timeEstimate.highMinutes)}</Text>
        <Text color={INK.dim}>{' (estimate)'}</Text>
      </Text>

      <Newline />
      <Text color={INK.secondary}>{divider}</Text>

      {fits ? (
        <Text color={INK.primary} bold>{`  [FITS] Configuration fits available VRAM.`}</Text>
      ) : (
        <Box flexDirection="column">
          <Text color={INK.warning} bold>{`  [TIGHT] May not fit in available VRAM.`}</Text>
          {config.fitFailureReason && (
            <Text color={INK.warning}>{'    '}{config.fitFailureReason}</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

function AdjustForm({ config, onSave }: {
  config: AutoConfigResult;
  onSave: (config: AutoConfigResult) => void;
}): React.ReactElement {
  const [field, setField] = useState<'rank' | 'batch' | 'seq' | 'lr' | 'done'>('rank');
  const [lora, setLora] = useState<LoraConfig>({ ...config.lora });
  const [training, setTraining] = useState<TrainingParams>({ ...config.training });
  const [seqLength, setSeqLength] = useState(config.seqLength);

  const handleSubmit = useCallback((value: string) => {
    const num = Number(value);
    if (isNaN(num) || num <= 0) return; // ignore invalid

    switch (field) {
      case 'rank':
        setLora(prev => ({ ...prev, rank: Math.round(num), alpha: Math.round(num) * 2 }));
        setField('batch');
        break;
      case 'batch':
        setTraining(prev => ({ ...prev, batchSize: Math.round(num) }));
        setField('seq');
        break;
      case 'seq':
        setSeqLength(Math.round(num));
        setField('lr');
        break;
      case 'lr':
        setTraining(prev => ({ ...prev, learningRate: num }));
        setField('done');
        onSave({
          ...config,
          lora: { ...lora, alpha: lora.rank * 2 },
          training: { ...training, learningRate: num },
          seqLength: seqLength,
        });
        break;
    }
  }, [field, config, lora, training, seqLength, onSave]);

  if (field === 'done') return <></>;

  const prompts: Record<string, { label: string; placeholder: string }> = {
    rank:  { label: 'LoRA rank',       placeholder: String(lora.rank) },
    batch: { label: 'Batch size',      placeholder: String(training.batchSize) },
    seq:   { label: 'Sequence length', placeholder: String(seqLength) },
    lr:    { label: 'Learning rate',   placeholder: String(training.learningRate) },
  };

  const current = prompts[field];
  if (!current) return <></>;

  return (
    <Box flexDirection="column" marginX={2}>
      <Text color={INK.dim}>
        Press Enter to keep the current value, or type a new one:
      </Text>
      <Box marginTop={0}>
        <Text color={INK.primary} bold>{glyph.prompt} </Text>
        <Text color={INK.dim}>{current.label}: </Text>
        <TextInput
          placeholder={current.placeholder}
          onSubmit={handleSubmit}
        />
      </Box>
    </Box>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

/**
 * Auto-config display and confirmation wizard step.
 */
export function ConfigStep({ config, onConfirm, onBack }: ConfigStepProps): React.ReactElement {
  const [phase, setPhase] = useState<Phase>('review');
  const [currentConfig, setCurrentConfig] = useState(config);

  const handleActionSelect = useCallback((value: string) => {
    switch (value) {
      case 'start':
        onConfirm(currentConfig);
        break;
      case 'adjust':
        setPhase('adjust');
        break;
      case 'cancel':
        onBack();
        break;
    }
  }, [currentConfig, onConfirm, onBack]);

  const handleAdjustSave = useCallback((updated: AutoConfigResult) => {
    setCurrentConfig(updated);
    setPhase('confirm');
  }, []);

  const handleFinalConfirm = useCallback((yes: boolean) => {
    if (yes) {
      onConfirm(currentConfig);
    } else {
      setPhase('review');
    }
  }, [currentConfig, onConfirm]);

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box marginX={1} marginBottom={1}>
        <Text bold color={INK.text}>REVIEW CONFIGURATION</Text>
      </Box>

      {/* Config card — always shown */}
      <ConfigCard config={currentConfig} />

      {/* Phase: Review — select action */}
      {phase === 'review' && (
        <Box marginX={2}>
          <Select
            options={[
              { label: `${glyph.bullet} START TRAINING`, value: 'start' },
              { label: `${glyph.bullet} ADJUST SETTINGS`, value: 'adjust' },
              { label: `${glyph.bullet} CANCEL`, value: 'cancel' },
            ]}
            onChange={handleActionSelect}
          />
        </Box>
      )}

      {/* Phase: Adjust settings */}
      {phase === 'adjust' && (
        <AdjustForm config={currentConfig} onSave={handleAdjustSave} />
      )}

      {/* Phase: Confirm after adjustment */}
      {phase === 'confirm' && (
        <ConfirmPrompt
          question="Start training with these settings?"
          onConfirm={handleFinalConfirm}
        />
      )}
    </Box>
  );
}
