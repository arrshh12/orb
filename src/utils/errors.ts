/**
 * Plain-language error handling for Orb.
 * Translates technical errors into user-friendly messages with guidance.
 */

/**
 * A user-facing error with a plain-language message and suggested fix.
 * These are shown to the user; raw stack traces are never displayed.
 */
export class PlainLanguageError extends Error {
  /** What happened, in plain language */
  public readonly userMessage: string;
  /** What the user can do about it */
  public readonly guidance: string;
  /** The original technical error, if any */
  public readonly technicalDetail?: string;
  /** Whether the error is recoverable (user can retry or continue) */
  public readonly recoverable: boolean;

  constructor(opts: {
    userMessage: string;
    guidance: string;
    technicalDetail?: string;
    recoverable?: boolean;
    cause?: Error;
  }) {
    super(opts.userMessage);
    this.name = 'PlainLanguageError';
    this.userMessage = opts.userMessage;
    this.guidance = opts.guidance;
    this.technicalDetail = opts.technicalDetail;
    this.recoverable = opts.recoverable ?? false;
    if (opts.cause) {
      this.cause = opts.cause;
    }
  }
}

/** Common error patterns and their plain-language translations */
const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  userMessage: string;
  guidance: string;
}> = [
  {
    pattern: /ENOENT|no such file|file not found/i,
    userMessage: 'File not found.',
    guidance: 'Please check the file path and try again.',
  },
  {
    pattern: /EACCES|permission denied/i,
    userMessage: 'Permission denied.',
    guidance: 'Orb doesn\'t have permission to access this file or directory. Try running from a different location.',
  },
  {
    pattern: /ENOSPC|no space left|disk full/i,
    userMessage: 'Your disk is full.',
    guidance: 'Free up some disk space and try again. Training models requires several GB of free space.',
  },
  {
    pattern: /ECONNREFUSED|ENOTFOUND|ENETUNREACH|fetch failed/i,
    userMessage: 'Network connection failed.',
    guidance: 'Please check your internet connection and try again.',
  },
  {
    pattern: /ETIMEDOUT|timeout/i,
    userMessage: 'The request timed out.',
    guidance: 'This might be a slow connection or a temporary server issue. Try again in a few minutes.',
  },
  {
    pattern: /out of memory|OOM|CUDA out of memory|torch\.cuda\.OutOfMemoryError/i,
    userMessage: 'Your GPU ran out of memory during training.',
    guidance: 'Try reducing the batch size or sequence length in the training configuration, or use a smaller model.',
  },
  {
    pattern: /nvidia-smi.*not found|nvml/i,
    userMessage: 'NVIDIA GPU drivers not detected.',
    guidance: 'Make sure you have the latest NVIDIA drivers installed. Visit nvidia.com/drivers for downloads.',
  },
  {
    pattern: /401|unauthorized|authentication/i,
    userMessage: 'Authentication failed.',
    guidance: 'Please check your Hugging Face token. You can get one at huggingface.co/settings/tokens',
  },
  {
    pattern: /403|forbidden|gated/i,
    userMessage: 'Access to this model is restricted.',
    guidance: 'This model requires you to accept its license on Hugging Face and provide an access token.',
  },
  {
    pattern: /404|not found/i,
    userMessage: 'The requested resource was not found.',
    guidance: 'Please check the model ID — it should look like "organization/model-name" (e.g., "meta-llama/Llama-3.2-1B").',
  },
  {
    pattern: /rate limit|429|too many requests/i,
    userMessage: 'Too many requests — the server asked us to slow down.',
    guidance: 'Wait a minute and try again.',
  },
];

/**
 * Convert a raw error into a PlainLanguageError.
 * If the error is already a PlainLanguageError, return it as-is.
 */
export function toPlainLanguageError(error: unknown): PlainLanguageError {
  if (error instanceof PlainLanguageError) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  // Try to match against known patterns
  for (const { pattern, userMessage, guidance } of ERROR_PATTERNS) {
    if (pattern.test(message)) {
      return new PlainLanguageError({
        userMessage,
        guidance,
        technicalDetail: message,
        cause: error instanceof Error ? error : undefined,
      });
    }
  }

  // Fallback: generic error
  return new PlainLanguageError({
    userMessage: 'Something unexpected went wrong.',
    guidance: 'Try running Orb again. If this keeps happening, run with --debug for more details.',
    technicalDetail: message,
    cause: error instanceof Error ? error : undefined,
  });
}

/**
 * Wrap an async function so any thrown error is converted to a PlainLanguageError.
 */
export async function withPlainErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toPlainLanguageError(error);
  }
}
