import React, { useState, useCallback } from 'react';
import { Box, Text, Newline } from 'ink';
import { Select, TextInput } from '@inkjs/ui';
import type { AutoConfigResult, LoraConfig, TrainingParams } from '../types/config.js';
import { ConfirmPrompt } from './ui/ConfirmPrompt.js';

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

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={fits ? 'cyan' : 'yellow'}
      paddingX={2}
      paddingY={0}
      marginX={1}
      marginBottom={1}
    >
      <Text bold color="cyan">{'⚙ Training Configuration'}</Text>
      <Newline />
      <Text>{'  LoRA rank:       '}<Text color="white" bold>{lora.rank}</Text></Text>
      <Text>{'  LoRA alpha:      '}<Text color="white">{lora.alpha}</Text></Text>
      <Text>{'  Sequence length: '}<Text color="white" bold>{seqLength} tokens</Text></Text>
      <Text>
        {'  Batch size:      '}
        <Text color="white" bold>{training.batchSize}</Text>
        <Text color="gray">{` (×${training.gradientAccumulationSteps} accum = ${effBatch} eff.)`}</Text>
      </Text>
      <Text>{'  Learning rate:   '}<Text color="white" bold>{training.learningRate}</Text></Text>
      <Text>{'  Epochs:          '}<Text color="white">{training.epochs}</Text></Text>
      <Text>{'  Total steps:     '}<Text color="white" bold>{'~'}{totalSteps}</Text></Text>
      {training.gradientCheckpointing && (
        <Text>{'  Grad checkpoint: '}<Text color="green">{'✓ enabled'}</Text></Text>
      )}
      {training.use8BitOptimizer && (
        <Text>{'  8-bit optimizer: '}<Text color="green">{'✓ enabled'}</Text></Text>
      )}

      <Newline />
      <Text color="gray">{'  ─'.repeat(20)}</Text>
      <Newline />

      <Text>
        {'  Memory:  '}
        <Text color={fits ? 'green' : 'yellow'} bold>{'~'}{formatGB(vramEstimate.totalGB)}</Text>
        <Text color="gray">{' / '}{formatGB(availableMemoryGB)}{' VRAM'}</Text>
      </Text>
      <Text>
        {'  Time:    '}
        <Text color="white" bold>{formatTimeRange(timeEstimate.lowMinutes, timeEstimate.highMinutes)}</Text>
        <Text color="gray">{' (estimate)'}</Text>
      </Text>

      <Newline />
      <Text color="gray">{'  ─'.repeat(20)}</Text>

      {fits ? (
        <Text color="green" bold>{'  ✓ This should fit on your GPU.'}</Text>
      ) : (
        <Box flexDirection="column">
          <Text color="yellow" bold>{'  ⚠ This may not fit in your available VRAM.'}</Text>
          {config.fitFailureReason && (
            <Text color="yellow" dimColor>{'    '}{config.fitFailureReason}</Text>
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
      <Text color="gray" dimColor>
        Press Enter to keep the current value, or type a new one:
      </Text>
      <Box marginTop={0}>
        <Text color="cyan" bold>{current.label}: </Text>
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
        <Text bold color="cyan">{'⚙ Step 3: '}</Text>
        <Text bold>Review Configuration</Text>
      </Box>

      {/* Config card — always shown */}
      <ConfigCard config={currentConfig} />

      {/* Phase: Review — select action */}
      {phase === 'review' && (
        <Box marginX={2}>
          <Select
            options={[
              { label: '🚀 Start training', value: 'start' },
              { label: '🔧 Adjust settings', value: 'adjust' },
              { label: '← Cancel', value: 'cancel' },
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
