/**
 * Unit tests for the IPC (JSON Lines) protocol.
 * Tests message parsing, Zod validation, and handling of malformed input.
 */

import { describe, it, expect } from 'vitest';
import {
  IPCMessageSchema,
  StageMessageSchema,
  ProgressMessageSchema,
  CheckpointMessageSchema,
  ErrorMessageSchema,
  DoneMessageSchema,
  ExportProgressMessageSchema,
  LogMessageSchema,
} from '../../src/types/ipc.js';

// ─── Valid Message Parsing ───────────────────────────────────────────────────

describe('IPC message schema — valid messages', () => {
  it('should parse a stage message', () => {
    const msg = { type: 'stage', stage: 'loading_model', message: 'Loading model...' };
    const result = StageMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.stage).toBe('loading_model');
  });

  it('should parse a progress message', () => {
    const msg = {
      type: 'progress',
      step: 100,
      totalSteps: 450,
      loss: 1.42,
      lr: 0.0002,
      tokensPerSec: 412,
      etaSeconds: 600,
    };
    const result = ProgressMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.step).toBe(100);
    expect(result.data!.loss).toBe(1.42);
  });

  it('should parse a progress message without optional lr', () => {
    const msg = {
      type: 'progress',
      step: 50,
      totalSteps: 200,
      loss: 2.0,
      tokensPerSec: 300,
      etaSeconds: 900,
    };
    const result = ProgressMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.lr).toBeUndefined();
  });

  it('should parse a checkpoint message', () => {
    const msg = { type: 'checkpoint', path: '/tmp/checkpoint-100', step: 100 };
    const result = CheckpointMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
  });

  it('should parse an error message', () => {
    const msg = {
      type: 'error',
      message: 'GPU ran out of memory',
      detail: 'torch.cuda.OutOfMemoryError',
      recoverable: false,
    };
    const result = ErrorMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.recoverable).toBe(false);
  });

  it('should parse a done message', () => {
    const msg = {
      type: 'done',
      adapterPath: '/tmp/adapter',
      elapsedSeconds: 1800,
    };
    const result = DoneMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.elapsedSeconds).toBe(1800);
  });

  it('should parse a done message with all optional fields', () => {
    const msg = {
      type: 'done',
      adapterPath: '/tmp/adapter',
      mergedModelPath: '/tmp/merged',
      ggufPath: '/tmp/model.gguf',
      elapsedSeconds: 3600,
    };
    const result = DoneMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.ggufPath).toBe('/tmp/model.gguf');
  });

  it('should parse an export_progress message', () => {
    const msg = {
      type: 'export_progress',
      stage: 'quantizing',
      message: 'Quantizing to Q4_K_M...',
    };
    const result = ExportProgressMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.stage).toBe('quantizing');
  });

  it('should parse a log message', () => {
    const msg = { type: 'log', level: 'info', message: 'Using bfloat16 compute dtype' };
    const result = LogMessageSchema.safeParse(msg);
    expect(result.success).toBe(true);
    expect(result.data!.level).toBe('info');
  });
});

// ─── Discriminated Union ─────────────────────────────────────────────────────

describe('IPC discriminated union schema', () => {
  it('should route to correct type based on "type" field', () => {
    const stageMsg = { type: 'stage', stage: 'training', message: 'Training...' };
    const progressMsg = { type: 'progress', step: 1, totalSteps: 100, loss: 3.0, tokensPerSec: 200, etaSeconds: 500 };
    const errorMsg = { type: 'error', message: 'Oops', recoverable: true };

    expect(IPCMessageSchema.safeParse(stageMsg).success).toBe(true);
    expect(IPCMessageSchema.safeParse(progressMsg).success).toBe(true);
    expect(IPCMessageSchema.safeParse(errorMsg).success).toBe(true);
  });

  it('should reject unknown message types', () => {
    const msg = { type: 'unknown_type', data: 'something' };
    const result = IPCMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });
});

// ─── Invalid / Malformed Messages ────────────────────────────────────────────

describe('IPC message schema — invalid messages', () => {
  it('should reject progress with missing required fields', () => {
    const msg = { type: 'progress', step: 10 }; // missing totalSteps, loss, etc.
    const result = ProgressMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('should reject error with missing message field', () => {
    const msg = { type: 'error', recoverable: true };
    const result = ErrorMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('should reject export_progress with invalid stage', () => {
    const msg = { type: 'export_progress', stage: 'invalid_stage', message: 'test' };
    const result = ExportProgressMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('should reject log with invalid level', () => {
    const msg = { type: 'log', level: 'critical', message: 'test' };
    const result = LogMessageSchema.safeParse(msg);
    expect(result.success).toBe(false);
  });

  it('should reject empty objects', () => {
    const result = IPCMessageSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('should reject null', () => {
    const result = IPCMessageSchema.safeParse(null);
    expect(result.success).toBe(false);
  });

  it('should reject strings', () => {
    const result = IPCMessageSchema.safeParse('just a string');
    expect(result.success).toBe(false);
  });
});

// ─── JSON Lines Parsing Simulation ───────────────────────────────────────────

describe('JSON Lines parsing simulation', () => {
  it('should parse multiple JSON lines correctly', () => {
    const lines = [
      '{"type":"stage","stage":"loading","message":"Loading..."}',
      '{"type":"progress","step":1,"totalSteps":100,"loss":3.2,"tokensPerSec":150,"etaSeconds":660}',
      '{"type":"progress","step":2,"totalSteps":100,"loss":3.1,"tokensPerSec":200,"etaSeconds":490}',
      '{"type":"checkpoint","path":"/tmp/cp","step":2}',
      '{"type":"done","adapterPath":"/tmp/adapter","elapsedSeconds":120}',
    ];

    const parsed = lines.map((line) => {
      const raw = JSON.parse(line);
      return IPCMessageSchema.safeParse(raw);
    });

    expect(parsed.every((r) => r.success)).toBe(true);
    expect(parsed[0]!.data!.type).toBe('stage');
    expect(parsed[4]!.data!.type).toBe('done');
  });

  it('should handle non-JSON lines gracefully', () => {
    const lines = [
      '{"type":"stage","stage":"loading","message":"Loading..."}',
      'WARNING: some Python warning text',
      'Traceback (most recent call last):',
      '{"type":"progress","step":1,"totalSteps":100,"loss":3.2,"tokensPerSec":150,"etaSeconds":660}',
    ];

    const results = lines.map((line) => {
      try {
        const raw = JSON.parse(line);
        return IPCMessageSchema.safeParse(raw);
      } catch {
        return { success: false, nonJson: true };
      }
    });

    expect(results[0]!.success).toBe(true);
    expect(results[1]!.success).toBe(false);
    expect(results[2]!.success).toBe(false);
    expect(results[3]!.success).toBe(true);
  });
});
