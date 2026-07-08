# Hardware Test Matrix Checklist

Test each scenario on real hardware. Mark ✓ when verified.

## NVIDIA GPU — Low VRAM (8 GB)

| Test | Status | Notes |
|------|--------|-------|
| Hardware detected correctly | ☐ | |
| 1B model: fit check passes | ☐ | |
| 7B model: fit check warns "tight" | ☐ | |
| 13B model: fit check refuses | ☐ | |
| Training completes on 1B model | ☐ | |
| GGUF export produces valid file | ☐ | |
| Ollama import works | ☐ | |

## NVIDIA GPU — Mid VRAM (12-16 GB)

| Test | Status | Notes |
|------|--------|-------|
| Hardware detected correctly | ☐ | |
| 7B model: trains successfully | ☐ | |
| Checkpoint/resume works | ☐ | |
| GGUF + Ollama pipeline works | ☐ | |
| Fine-tuned model shows training effect | ☐ | |

## NVIDIA GPU — High VRAM (24 GB)

| Test | Status | Notes |
|------|--------|-------|
| Hardware detected correctly | ☐ | |
| 13B model: trains successfully | ☐ | |
| Larger batch sizes work | ☐ | |

## Apple Silicon (M-series)

| Test | Status | Notes |
|------|--------|-------|
| Hardware detected correctly (chip name, memory) | ☐ | |
| Backend selected as MLX | ☐ | |
| 1B model on 8GB Mac: tight but works | ☐ | |
| 7B model on 16GB+ Mac | ☐ | |
| MLX backend produces adapters | ☐ | |
| GGUF export from MLX works | ☐ | |

## CPU-Only Machine

| Test | Status | Notes |
|------|--------|-------|
| Hardware detected as "no GPU" | ☐ | |
| Backend selected as "cpu-only" | ☐ | |
| Graceful refusal shown (not a crash) | ☐ | |
| Refusal message suggests alternatives | ☐ | |

## Failure Modes

| Test | Expected Behavior | Status |
|------|-------------------|--------|
| No internet during dep install | Clear error + suggestion | ☐ |
| No internet during model download | Clear error + suggestion | ☐ |
| Gated model without token | Prompt for token | ☐ |
| Invalid model ID | Clear "not found" message | ☐ |
| Unsupported architecture | Clear "not supported" message | ☐ |
| Empty dataset | Clear "no valid rows" message | ☐ |
| Training killed mid-run | Checkpoint saved, resumable | ☐ |
| Disk fills during training | Clear error, checkpoint saved | ☐ |

## End-to-End Scenarios

| Scenario | Status | Notes |
|----------|--------|-------|
| CSV → 1B model → GGUF → Ollama | ☐ | |
| JSONL chat → 7B model → GGUF → Ollama | ☐ | |
| Plain text → 1B model → GGUF → Ollama | ☐ | |
| Non-technical user completes wizard unaided | ☐ | |
