"""
IPC module for Loom training engine.

All communication with the Node.js parent process goes through JSON Lines on
stdout.  Every public function in this module writes exactly one JSON object
followed by a newline, then flushes.

stderr is redirected to a log file so the user never sees raw Python tracebacks.
"""

from __future__ import annotations

import atexit
import json
import logging
import os
import sys
import time
import warnings
from typing import Any

# ---------------------------------------------------------------------------
# Module‑level state
# ---------------------------------------------------------------------------

_start_time: float = time.monotonic()
_original_stdout: Any = None  # preserved reference to real stdout
_log_file_handle: Any = None

# ---------------------------------------------------------------------------
# Core emit
# ---------------------------------------------------------------------------


def emit(msg_type: str, **data: Any) -> None:
    """Write a single JSON‑Lines message to stdout and flush immediately.

    Every IPC message carries a ``type`` field.  Extra keyword arguments are
    merged into the payload dict.

    This is the **only** sanctioned way to produce stdout output in the
    engine.  Never use bare ``print()``.
    """
    payload: dict[str, Any] = {"type": msg_type, **data}
    out = _original_stdout if _original_stdout is not None else sys.stdout
    try:
        out.write(json.dumps(payload, default=str) + "\n")
        out.flush()
    except (BrokenPipeError, OSError):
        # Parent process disappeared – nothing we can do.
        pass


# ---------------------------------------------------------------------------
# Convenience emitters
# ---------------------------------------------------------------------------


def emit_stage(stage: str, message: str) -> None:
    """Emit a stage‑transition event.

    Parameters
    ----------
    stage:
        Machine‑readable stage identifier, e.g. ``"loading_model"``.
    message:
        Human‑readable description, e.g. ``"Loading model…"``.
    """
    emit("stage", stage=stage, message=message)


def emit_progress(
    step: int,
    total_steps: int,
    loss: float,
    lr: float,
    tokens_per_sec: float,
    eta_seconds: float,
) -> None:
    """Emit a training‑progress event."""
    emit(
        "progress",
        step=step,
        totalSteps=total_steps,
        loss=round(loss, 4),
        lr=round(lr, 8),
        tokensPerSec=round(tokens_per_sec, 1),
        etaSeconds=round(eta_seconds, 1),
    )


def emit_checkpoint(path: str, step: int) -> None:
    """Emit a checkpoint‑saved event."""
    emit("checkpoint", path=path, step=step)


def emit_log(level: str, message: str) -> None:
    """Emit a log event (``info`` | ``warning`` | ``debug``)."""
    assert level in ("info", "warning", "debug"), f"Invalid log level: {level}"
    emit("log", level=level, message=message)


def emit_error(
    message: str,
    detail: str | None = None,
    recoverable: bool = False,
) -> None:
    """Emit an error event with optional technical detail."""
    kwargs: dict[str, Any] = {
        "message": message,
        "recoverable": recoverable,
    }
    if detail is not None:
        kwargs["detail"] = detail
    emit("error", **kwargs)


def emit_done(adapter_path: str, elapsed_seconds: float) -> None:
    """Emit the final *done* event indicating success."""
    emit(
        "done",
        adapterPath=adapter_path,
        elapsedSeconds=round(elapsed_seconds, 1),
    )


def emit_export_progress(stage: str, message: str) -> None:
    """Emit export (GGUF conversion / quantization) progress."""
    emit("export_progress", stage=stage, message=message)


# ---------------------------------------------------------------------------
# Elapsed time helper
# ---------------------------------------------------------------------------


def elapsed() -> float:
    """Seconds since the engine started (monotonic)."""
    return time.monotonic() - _start_time


# ---------------------------------------------------------------------------
# Logging / stderr redirect
# ---------------------------------------------------------------------------


class _IPCLogHandler(logging.Handler):
    """Logging handler that forwards records to IPC *and* to the log file."""

    _LEVEL_MAP = {
        logging.DEBUG: "debug",
        logging.INFO: "info",
        logging.WARNING: "warning",
        logging.ERROR: "warning",
        logging.CRITICAL: "warning",
    }

    def emit(self, record: logging.LogRecord) -> None:  # type: ignore[override]
        try:
            level = self._LEVEL_MAP.get(record.levelno, "info")
            emit_log(level, self.format(record))
        except Exception:
            pass  # swallow – we can't emit errors about emitting errors


def setup_logging(log_file_path: str) -> None:
    """Redirect stderr and Python logging to *log_file_path*.

    After calling this function:

    * ``sys.stderr`` writes to the log file (catches C‑level writes).
    * The root Python logger writes to the same file **and** forwards
      ``WARNING`` + above as IPC log events.
    * ``warnings.warn`` output is captured by the logging system.
    * ``sys.stdout`` is replaced with a wrapper that only allows
      :func:`emit` to write, preventing accidental ``print()`` calls.

    The original ``sys.stdout`` is stored internally so :func:`emit` can
    continue to write JSON Lines to the real file descriptor.
    """
    global _original_stdout, _log_file_handle

    # 1. Preserve the real stdout before we swap it.
    _original_stdout = sys.stdout

    # 2. Open the log file (append mode, line‑buffered).
    os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
    _log_file_handle = open(log_file_path, "a", encoding="utf-8", buffering=1)  # noqa: SIM115
    atexit.register(lambda: _log_file_handle.close())

    # 3. Redirect stderr → log file.
    sys.stderr = _log_file_handle  # type: ignore[assignment]

    # 4. Configure Python logging.
    root = logging.getLogger()
    root.setLevel(logging.DEBUG)

    # File handler – everything.
    file_handler = logging.StreamHandler(_log_file_handle)
    file_handler.setLevel(logging.DEBUG)
    file_handler.setFormatter(
        logging.Formatter(
            "%(asctime)s [%(levelname)s] %(name)s: %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
    )
    root.addHandler(file_handler)

    # IPC handler – warnings and above only.
    ipc_handler = _IPCLogHandler()
    ipc_handler.setLevel(logging.WARNING)
    ipc_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
    root.addHandler(ipc_handler)

    # 5. Route Python warnings through the logging system.
    logging.captureWarnings(True)
    warnings.simplefilter("always")

    # 6. Replace stdout with a guard so accidental print() goes to the log
    #    file instead of corrupting the IPC stream.
    sys.stdout = _log_file_handle  # type: ignore[assignment]
