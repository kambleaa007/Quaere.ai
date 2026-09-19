#!/usr/bin/env python3
"""
Quaere.ai — Fine-tuning Script (Unsloth / QLoRA)

Designed to run on Google Colab (T4 GPU, free tier):
  1. Install dependencies
  2. Load Llama 3.2 in 4-bit via Unsloth
  3. Apply LoRA adapters (rank 16-64)
  4. Fine-tune on the generated Socratic dataset
  5. Export as GGUF (Q4_K_M or Q5_K_M)

Usage in Colab:
    %run scripts/finetune_colab.py

Or standalone (requires CUDA GPU):
    python scripts/finetune_colab.py --dataset dataset.jsonl --output_dir ./output
"""

import argparse
import os
import subprocess
import sys


def install_colab_deps():
    """Install required packages in a Colab / fresh environment."""
    packages = [
        "unsloth@git+https://github.com/unslothai/unsloth.git",
        "transformers>=4.40.0",
        "datasets",
        "peft",
        "bitsandbytes",
        "huggingface_hub",
    ]
    for pkg in packages:
        print(f"Installing {pkg}...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", pkg])

    # Unsloth specific
    from unsloth import FastLanguageModel
    print("Unsloth installed successfully.")
    return FastLanguageModel


def load_model(base_model="unsloth/Llama-3.2-3B-Instruct-bnb-4bit", max_seq=2048):
    """Load the base model with 4-bit quantization via Unsloth."""
    from unsloth import FastLanguageModel

    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
        max_seq_length=max_seq,
        dtype=None,
        load_in_4bit=True,
        device_map="auto",
    )
    return model, tokenizer


def get_peft_model(model, **lora_kwargs):
    """Attach LoRA adapters to the model."""
    from unsloth import FastLanguageModel

    peft_config = dict(
        r=32,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=16,
        lora_dropout=0.05,
        bias="none",
        use_gradient_checkpointing=True,
        random_state=42,
        use_rslora=False,
        loftq_config=None,
    )
    peft_config.update(lora_kwargs)

    model = FastLanguageModel.get_peft_model(model, **peft_config)
    return model


def prepare_dataset(tokenizer, dataset_path, max_seq=2048):
    """Load and tokenize the JSONL dataset."""
    from datasets import load_dataset

    dataset = load_dataset("json", data_files=dataset_path, split="train")

    # Format: <s>[INST] << {instruction}\n\n{input} >> [/INST] {output} </s>
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

    # For causal LM training, we don't need input_ids — the trainer handles tokenization
    return dataset


def train(model, tokenizer, dataset, output_dir, epochs=3, lr=2e-4, batch_size=4):
    """Fine-tune the model with LoRA."""
    from trl import SFTTrainer
    from transformers import TrainingArguments

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
        max_seq_length=2048,
        args=training_args,
    )

    trainer.train()
    trainer.save_model(output_dir)
    return trainer


def export_gguf(model, tokenizer, output_dir, quantization="q4_k_m"):
    """Export the fine-tuned model as GGUF."""
    from unsloth import FastLanguageModel

    model = FastLanguageModel.merge_and_unload(model)
    model.save_pretrained_merged(f"{output_dir}/merged", tokenizer, save_method="merged_16bit_for_sft")

    # Export to GGUF via llama.cpp
    gguf_path = f"{output_dir}/quaere-socratic-{quantization}.gguf"
    model.save_pretrained_gguf(
        gguf_path,
        tokenizer,
        quantization_method=quantization,
    )
    print(f"GGUF saved to {gguf_path}")
    return gguf_path


def main():
    parser = argparse.ArgumentParser(description="Fine-tune Quaere.ai Socratic model")
    parser.add_argument("--dataset", type=str, default="dataset.jsonl", help="Path to JSONL dataset")
    parser.add_argument("--output_dir", type=str, default="./output", help="Output directory")
    parser.add_argument("--base_model", type=str, default="unsloth/Llama-3.2-3B-Instruct-bnb-4bit")
    parser.add_argument("--epochs", type=int, default=3, help="Training epochs")
    parser.add_argument("--lr", type=float, default=2e-4, help="Learning rate")
    parser.add_argument("--r", type=int, default=32, help="LoRA rank")
    parser.add_argument("--quantization", type=str, default="q4_k_m", choices=["q4_k_m", "q5_k_m", "q8_0"])
    parser.add_argument("--colab", action="store_true", help="Auto-install deps for Colab")
    args = parser.parse_args()

    os.makedirs(args.output_dir, exist_ok=True)

    if args.colab:
        install_colab_deps()

    # Lazy imports after deps are installed
    global torch
    import torch

    print("Loading model...")
    model, tokenizer = load_model(args.base_model)

    print("Adding LoRA adapters...")
    model = get_peft_model(model, r=args.r)
    model.print_disable_dropout()
    model.print_parameter_count()

    print("Preparing dataset...")
    dataset = prepare_dataset(tokenizer, args.dataset)

    print("Training...")
    train(model, tokenizer, dataset, args.output_dir, epochs=args.epochs, lr=args.lr)

    print("Exporting to GGUF...")
    export_gguf(model, tokenizer, args.output_dir, args.quantization)

    print(f"Done! GGUF model at {args.output_dir}/quaere-socratic-{args.quantization}.gguf")
    print("Upload it to Hugging Face Hub, then serve via llama.cpp.")


if __name__ == "__main__":
    main()
