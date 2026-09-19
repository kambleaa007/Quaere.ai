#!/usr/bin/env python3
"""
Quaere.ai — Fine-tuning Script (Unsloth / QLoRA)

Designed to run on Google Colab (T4 GPU, free tier):
  1. Install dependencies
  2. Load Llama 3.2 in 4-bit via Unsloth
  3. Apply LoRA adapters (rank 16-64)
  4. Fine-tune on the generated Socratic dataset
  5. Export as GGUF (Q4_K_M or Q5_K_M)

Colab usage:
    !pip install unsloth
    %run scripts/finetune_colab.py --dataset dataset.jsonl --output_dir ./output --colab

Standalone (requires CUDA GPU):
    python scripts/finetune_colab.py --dataset dataset.jsonl --output_dir ./output
"""

import argparse
import os
import subprocess
import sys


VALID_MODELS = [
    "unsloth/Llama-3.2-3B-Instruct-bnb-4bit",
    "unsloth/Llama-3.2-3B-Instruct",
    "unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit",
    "unsloth/Meta-Llama-3.1-8B-Instruct",
    "unsloth/Qwen2.5-7B-Instruct-bnb-4bit",
    "unsloth/Qwen2.5-7B-Instruct",
]


def install_colab_deps():
    """Install required packages in a Colab / fresh environment."""
    print("Installing Unsloth (this patch enables 2x faster free finetuning)...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "unsloth@git+https://github.com/unslothai/unsloth.git"])
    subprocess.check_call([sys.executable, "-m", "pip", "install", "-q", "transformers>=4.40.0", "datasets", "peft", "bitsandbytes", "huggingface_hub", "trl"])

    from unsloth import FastLanguageModel
    print("Unsloth installed successfully.")


def load_model(base_model="unsloth/Llama-3.2-3B-Instruct-bnb-4bit", max_seq=2048):
    """Load the base model with 4-bit quantization via Unsloth.

    IMPORTANT: Use an Unsloth HF model repo (e.g. unsloth/Llama-3.2-3B-Instruct-bnb-4bit),
    NOT a GGUF repo (bartowski/*). GGUF files cannot be loaded for fine-tuning — only
    exported to.
    """
    if "gguf" in base_model.lower():
        raise ValueError(
            f"Cannot load GGUF model '{base_model}' for fine-tuning. "
            f"Use an Unsloth quantized HF repo instead, e.g.: {VALID_MODELS[0]}"
        )

    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=max_seq,
        dtype=None,
        load_in_4bit=True,
        device_map="auto",
    )
    return model, tokenizer


def get_peft_model(model, r=32, **lora_kwargs):
    """Attach LoRA adapters to the model."""
    from unsloth import FastLanguageModel

    model = FastLanguageModel.get_peft_model(
        model,
        r=r,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing=True,
        random_state=42,
        **lora_kwargs,
    )
    return model


def prepare_dataset(tokenizer, dataset_path, max_seq=2048):
    """Load and format the JSONL dataset."""
    from datasets import load_dataset

    dataset = load_dataset("json", data_files=dataset_path, split="train")

    def format_examples(examples):
        texts = []
        for instruction, inp, output in zip(examples["instruction"], examples["input"], examples["output"]):
            text = (
                f"<s>[INST] <<{instruction}\n\n{inp}>> [/INST] {output}</s>"
            )
            texts.append(text)
        return {"text": texts}

    dataset = dataset.map(
        format_examples,
        remove_columns=dataset.column_names,
    )
    return dataset


def train(model, tokenizer, dataset, output_dir, epochs=3, lr=2e-4, batch_size=4, max_seq=2048):
    """Fine-tune the model with LoRA."""
    from trl import SFTTrainer
    from transformers import TrainingArguments
    import torch

    training_args = TrainingArguments(
        per_device_train_batch_size=batch_size,
        gradient_accumulation_steps=4,
        num_train_epochs=epochs,
        learning_rate=lr,
        fp16=not torch.cuda.is_bf16_supported(),
        bf16=torch.cuda.is_bf16_supported(),
        logging_steps=10,
        save_steps=100,
        output_dir=output_dir,
        report_to="none",
    )

    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=dataset,
        dataset_text_field="text",
        max_seq_length=max_seq,
        args=training_args,
    )

    trainer.train()
    return trainer


def export_gguf(model, tokenizer, output_dir, quantization="q4_k_m"):
    """Export the fine-tuned model as GGUF.

    Must be called on the PEFT model (before merge_and_unload) so Unsloth's
    save_pretrained_gguf extension is available.
    """
    merged_dir = f"{output_dir}/merged"
    model.save_pretrained_merged(merged_dir, tokenizer, save_method="merged_16bit_for_sft")

    gguf_path = f"{output_dir}/quaere-socratic-{quantization}.gguf"
    model.save_pretrained_gguf(
        gguf_path,
        tokenizer,
        quantization_method=quantization,
    )
    print(f"✓ GGUF saved to {gguf_path}")
    print(f"✓ Merged 16-bit saved to {merged_dir}")
    return gguf_path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Quaere.ai Socratic model")
    parser.add_argument("--dataset", type=str, default="dataset.jsonl", help="Path to JSONL dataset")
    parser.add_argument("--output_dir", type=str, default="./output", help="Output directory")
    parser.add_argument("--base_model", type=str, default="unsloth/Llama-3.2-3B-Instruct-bnb-4bit",
                        help=f"HF model repo (must be Unsloth-compatible, NOT a GGUF repo). Options: {', '.join(VALID_MODELS)}")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--r", type=int, default=32, help="LoRA rank")
    parser.add_argument("--max_seq", type=int, default=2048, help="Max sequence length")
    parser.add_argument("--batch_size", type=int, default=4, help="Batch size")
    parser.add_argument("--quantization", type=str, default="q4_k_m", choices=["q4_k_m", "q5_k_m", "q8_0"])
    parser.add_argument("--colab", action="store_true", help="Auto-install deps for Colab")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    if args.colab:
        install_colab_deps()

    print(f"\n╔════════════════════════════════════════╗")
    print(f"║  Quaere.ai — Socratic Model Fine-Tune  ║")
    print(f"║  Base: {args.base_model}")
    print(f"║  Dataset: {args.dataset}")
    print(f"║  Epochs: {args.epochs} | LoRA r: {args.r} | LR: {args.lr} ║")
    print(f"╚════════════════════════════════════════╝\n")

    print("Loading model...")
    model, tokenizer = load_model(args.base_model, max_seq=args.max_seq)

    print("Adding LoRA adapters...")
    model = get_peft_model(model, r=args.r)
    model.print_disable_dropout()
    model.print_parameter_count()

    print("Preparing dataset...")
    dataset = prepare_dataset(tokenizer, args.dataset, max_seq=args.max_seq)
    print(f"  Dataset size: {len(dataset)} examples")

    print("\nTraining...")
    train(model, tokenizer, dataset, args.output_dir,
          epochs=args.epochs, lr=args.lr, batch_size=args.batch_size, max_seq=args.max_seq)

    print("\nExporting to GGUF...")
    gguf_path = export_gguf(model, tokenizer, args.output_dir, args.quantization)

    print(f"\n✓ Done! GGUF model: {gguf_path}")
    print("Next steps:")
    print("  1. Upload the .gguf file to huggingface.co/yourname/quaere-socratic")
    print("  2. Enable Inference API on the repo")
    print("  3. Set AI_PROVIDER=huggingface in your Render env vars")


if __name__ == "__main__":
    main()
