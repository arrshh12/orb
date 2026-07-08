/**
 * IPC (Inter-Process Communication) message types for Loom.
 * Defines the JSON Lines protocol between the Node.js CLI and the Python training engine.
 */

import { z } from 'zod';

// ─── Zod Schemas (for runtime validation of messages from Python) ────────────

export const StageMessageSchema = z.object({
  type: z.literal('stage'),
  stage: z.string(),
  message: z.string(),
});

export const ProgressMessageSchema = z.object({
  type: z.literal('progress'),
  step: z.number(),
  totalSteps: z.number(),
  loss: z.number(),
  lr: z.number().optional(),
  tokensPerSec: z.number(),
  etaSeconds: z.number(),
});

export const CheckpointMessageSchema = z.object({
  type: z.literal('checkpoint'),
  path: z.string(),
  step: z.number(),
});

export const LogMessageSchema = z.object({
  type: z.literal('log'),
  level: z.enum(['info', 'warning', 'debug']),
  message: z.string(),
});

export const ErrorMessageSchema = z.object({
  type: z.literal('error'),
  message: z.string(),
  detail: z.string().optional(),
  recoverable: z.boolean(),
});

export const DoneMessageSchema = z.object({
  type: z.literal('done'),
  adapterPath: z.string().optional(),
  mergedModelPath: z.string().optional(),
  ggufPath: z.string().optional(),
  elapsedSeconds: z.number(),
});

export const ExportProgressMessageSchema = z.object({
  type: z.literal('export_progress'),
  stage: z.enum(['converting', 'quantizing', 'importing', 'complete']),
  message: z.string(),
});

/** Union schema — tries each message type */
export const IPCMessageSchema = z.discriminatedUnion('type', [
  StageMessageSchema,
  ProgressMessageSchema,
  CheckpointMessageSchema,
  LogMessageSchema,
  ErrorMessageSchema,
  DoneMessageSchema,
  ExportProgressMessageSchema,
]);

// ─── TypeScript Types (inferred from Zod schemas) ────────────────────────────

export type StageMessage = z.infer<typeof StageMessageSchema>;
export type ProgressMessage = z.infer<typeof ProgressMessageSchema>;
export type CheckpointMessage = z.infer<typeof CheckpointMessageSchema>;
export type LogMessage = z.infer<typeof LogMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type DoneMessage = z.infer<typeof DoneMessageSchema>;
export type ExportProgressMessage = z.infer<typeof ExportProgressMessageSchema>;
export type IPCMessage = z.infer<typeof IPCMessageSchema>;

// ─── Callback interface for IPC consumers ────────────────────────────────────

/** Handlers for each IPC message type */
export interface IPCCallbacks {
  onStage: (msg: StageMessage) => void;
  onProgress: (msg: ProgressMessage) => void;
  onCheckpoint: (msg: CheckpointMessage) => void;
  onLog: (msg: LogMessage) => void;
  onError: (msg: ErrorMessage) => void;
  onDone: (msg: DoneMessage) => void;
  onExportProgress: (msg: ExportProgressMessage) => void;
  /** Called when the Python process exits */
  onExit: (code: number | null, signal: string | null) => void;
  /** Called when a line from Python can't be parsed as valid JSON */
  onUnparseable: (line: string) => void;
}
