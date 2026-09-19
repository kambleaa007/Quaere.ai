#!/usr/bin/env python3
"""
Quaere.ai — Upload Script for Hugging Face Hub

Uploads both the merged HF model and the GGUF file to Hugging Face Hub.
Run this in Colab after fine-tuning completes.

Usage:
    %run scripts/upload_to_hf.py
"""

import os
from huggingface_hub import HfApi, upload_folder, upload_file


REPO_ID = "kambleaa007/quaere-socratic"
MERGED_DIR = "/content/quaere-merged"
GGUF_PATH = "/content/quaere-merged_gguf/quaere-socratic-q4_k_m.gguf"


def main():
    api = HfApi(token=os.getenv("HF_TOKEN"))

    # Create the repo if it doesn't exist
    api.create_repo(
        repo_id=REPO_ID,
        repo_type="model",
        private=False,
        exist_ok=True,
    )

    # Upload 1: Full HF-format model (for Inference API)
    upload_folder(
        folder_path=MERGED_DIR,
        repo_id=REPO_ID,
        repo_type="model",
    )
    print(f"✓ HF-format model uploaded to https://huggingface.co/{REPO_ID}")

    # Upload 2: GGUF file (for llama.cpp / local inference)
    if os.path.exists(GGUF_PATH):
        upload_file(
            path_or_file=GGUF_PATH,
            repo_id=REPO_ID,
            repo_type="model",
        )
        print(f"✓ GGUF model uploaded to https://huggingface.co/{REPO_ID}")
    else:
        print(f"! GGUF not found at {GGUF_PATH} — skipping (only needed for llama.cpp)")

    # Create a README with model card and pipeline tag
    readme_content = f"""---
pipeline_tag: text-generation
license: mit
---

# Quaere.ai — Socratic Model

A fine-tuned Llama 3 model that exclusively asks deep, probing Socratic questions
instead of providing answers.

## Usage

### Hugging Face Inference API
```
POST https://api-inference.huggingface.co/models/{REPO_ID}
Authorization: Bearer <HF_API_KEY>
Content-Type: application/json

{{"inputs": "Your question here"}}
```

### Locally (llama.cpp)
```bash
./llama-cli -m quaere-socratic-q4_k_m.gguf -p "Your question here"
```

## Training
Fine-tuned via Unsloth / QLoRA on 500–2000 Socratic Q&A pairs.
See [Quaere.ai repo](https://github.com/kambleaa007/Quaere.ai) for details.
"""
    from huggingface_hub import HfApi
    api = HfApi(token=os.getenv("HF_TOKEN"))
    api.upload_file(
        path_or_fileobj=readme_content.encode(),
        repo_id=REPO_ID,
        repo_type="model",
        path_in_repo="README.md",
    )
    print("✓ Model card (README.md) uploaded")

    print(f"\n✓ All uploads complete: https://huggingface.co/{REPO_ID}")


if __name__ == "__main__":
    main()
