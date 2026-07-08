# Loom Fine-Tuning Run Record

This document records the results of a successful test run of the Loom fine-tuning engine.

## Environment Details
- **Model:** `TinyLlama/TinyLlama-1.1B-Chat-v1.0`
- **Backend:** `cuda` (NVIDIA RTX 5050 / PyTorch 2.1.0+cu121 via `.airllm-tui` virtual environment)
- **Quantisation:** NF4 (4-bit via `bitsandbytes`)

## Configuration
```json
{
  "seq_length": 512,
  "lora": {
    "rank": 8,
    "alpha": 16,
    "dropout": 0.05,
    "target_modules": "all-linear"
  },
  "training": {
    "batch_size": 1,
    "gradient_accumulation_steps": 1,
    "learning_rate": 0.0002,
    "epochs": 3,
    "warmup_ratio": 0.1,
    "save_steps_ratio": 0.2,
    "gradient_checkpointing": false,
    "use_8bit_optimizer": false
  }
}
```

## Dataset
- **Format:** JSON Lines (`.jsonl`) conversational format.
- **Size:** 15 examples (split into 14 train / 1 validation).
- **Template Applied:** Built-in chat template processing applied automatically.

## Training Execution Metrics
- **Trainable Parameters:** 6,307,840 (1.01% of total 621,914,112 base parameters)
- **Total Steps:** 42 steps (3 epochs over 14 examples with batch size 1)
- **Warmup Steps:** 4 steps
- **Checkpoints:** Saved every 8 steps.

### Loss Trajectory (Sampled)
- Step 1/42 | Loss: 2.6950
- Step 5/42 | Loss: 2.7836
- Step 10/42 | Loss: 2.6051
- Step 15/42 | Loss: 1.8005
- Step 22/42 | Loss: 0.5113
- Step 27/42 | Loss: 0.7065
- Step 32/42 | Loss: 0.5493
- Step 37/42 | Loss: 0.4303

*Observation:* The model successfully converged on the small toy dataset, bringing the loss from ~2.7 down to ~0.43 by the end of training.

## Outputs
Following the completion of the 42 steps, the Python engine successfully exported and merged the LoRA weights into the base model.
- **Merged Model File:** `model.safetensors` (approx. 2.2GB - FP16 merged base model)
- **Included Artifacts:** `config.json`, `generation_config.json`, `tokenizer.json`, `tokenizer_config.json`, and `chat_template.jinja`.

## Analysis & Conclusion
1. **Engine Stability:** The IPC bridging successfully received JSON Line stdout messages and routed them correctly into `onStage`, `onProgress`, `onCheckpoint`, and `onDone` callbacks without throwing parse errors.
2. **CUDA / `bitsandbytes` Compatibility:** The 4-bit quantisation loading functioned flawlessly on a Windows environment utilizing the pre-existing system `pip` installations.
3. **Merging:** The system effectively triggered the `merge.py` process to load the FP16 base model, apply the LoRA, and save a unified safetensors file ready for further use or GGUF conversion (e.g. for Ollama).
