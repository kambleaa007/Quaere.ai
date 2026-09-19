# Quaere.ai

> **Live**: [https://quaere-ai.onrender.com](https://quaere-ai.onrender.com)

A Socratic AI that never answers — it asks. Built with Node.js + Express, a Dark-Academia UI, and configurable AI providers (Ollama or OpenAI-compatible APIs like Groq).

## Features

- **Socratic-only behavior** — a hardened system prompt forces the AI to respond exclusively with probing questions
- **Triple provider** — Ollama (local), any OpenAI-compatible API (Groq/TogetherAI/OpenAI), or Hugging Face Inference API with a custom fine-tuned model
- **Dark Academia / Obsidian UI** — deep charcoal background, amber glow, frosted-glass panels with a background image
- **Smooth typing animation** — character-by-character reveal with smooth scroll
- **Render.com ready** — `render.yaml` for one-click deploy

## Quick Start

```bash
# 1. Install
npm install

# 2. Configure (copy example)
cp .env.example .env
# Edit .env → set AI_PROVIDER and your API key

# 3. Run
npm start
# or for development:  npm run dev
```

Open `http://localhost:3000`.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `AI_PROVIDER` | no | `ollama` (default), `openai-compatible`, or `huggingface` |
| `GROQ_API_KEY` | if openai-compatible | Groq API key (`gsk-…`) — also accepts `AI_API_KEY` as fallback |
| `OPENAI_BASE_URL` | no | API base URL (default: Groq) |
| `OPENAI_MODEL` | no | Model name (default: `llama-3.3-70b-versatile`) |
| `OLLAMA_MODEL` | no | Ollama model (default: `llama3`) |
| `HF_API_KEY` | if huggingface | Hugging Face token |
| `HF_MODEL_ID` | if huggingface | Model repo ID (e.g., `yourname/quaere-socratic`) |
| `HF_ENDPOINT` | no | Custom HF Inference API URL |
| `PORT` | no | Server port (default: `3000`) |
| `OPENAI_BASE_URL` | no | API base URL (default: Groq) |
| `OPENAI_MODEL` | no | Model name (default: `llama-3.3-70b-versatile`) |
| `OLLAMA_MODEL` | no | Ollama model (default: `llama3`) |
| `PORT` | no | Server port (default: `3000`) |

## Providers

### Ollama (local)
```bash
AI_PROVIDER=ollama
OLLAMA_MODEL=llama3
```
Requires Ollama running at `http://localhost:11434`.

### Groq (cloud)
```bash
AI_PROVIDER=openai-compatible
OPENAI_BASE_URL=https://api.groq.com/openai/v1
OPENAI_MODEL=llama-3.3-70b-versatile
GROQ_API_KEY=gsk-your-key
```

### Hugging Face (custom fine-tuned model)
```bash
AI_PROVIDER=huggingface
HF_API_KEY=hf-your-key
HF_MODEL_ID=yourname/quaere-socratic
```
> Once you've fine-tuned and uploaded your model (see *Fine-Tuning Pipeline* below).

## Deployment — Render.com

> **[Quaere.ai is live on Render](https://quaere-ai.onrender.com)** — add your `GROQ_API_KEY` secret and push to deploy.

1. Add a secret named `GROQ_API_KEY` in the Render Dashboard
2. Push to trigger auto-deploy via `render.yaml`:

```bash
git add .
git commit -m "Deploy"
git push
```

## Project Structure

```
Quaere.ai/
├── server.js               # Express backend: POST /api/chat, /health
├── package.json            # Dependencies + scripts
├── render.yaml             # Render.com service config
├── .env.example            # Environment variable template
├── .gitattributes          # Line-ending normalization
├── public/
│   ├── index.html          # UI (Tailwind, Dark Academia)
│   └── app.js              # Frontend logic + typing animation
├── imgs/                   # Background images
├── scripts/
│   ├── generate_dataset.py      # Socratic Q&A dataset generator
│   └── finetune_colab.py        # Unsloth QLoRA fine-tuning script
└── LICENSE
```

## API

```
POST /api/chat
Content-Type: application/json

{
  "messages": [
    { "role": "user", "content": "What is the meaning of life?" }
  ]
}

→ { "reply": "What do you think gives meaning to your own life?" }
```

## Fine-Tuning Pipeline

The current system-prompt approach can be upgraded to a **fine-tuned model** that asks questions at the weight level.

### Step 1 — Generate Dataset
```bash
pip install openai
export OPENAI_API_KEY=sk-...
python scripts/generate_dataset.py --count 500 --output dataset.jsonl
```
Generates 500–2000 JSONL pairs (`{instruction, input, output}`) where every output is a Socratic question.

### Step 2 — Fine-Tune on Colab
1. Open [Google Colab](https://colab.research.google.com/) (free T4 GPU)
2. Upload `dataset.jsonl` and `scripts/finetune_colab.py`
3. Run:
```python
%run scripts/finetune_colab.py --dataset dataset.jsonl --output_dir ./output --colab --epochs 3
```
4. Download `quaere-socratic-q4_k_m.gguf` from `/content/output`

### Step 3 — Upload to Hugging Face
1. Create a repo at [huggingface.co/new](https://huggingface.co/new): `yourname/quaere-socratic`
2. Upload the `.gguf` file
3. Enable **Inference API** → select **Text Generation** task

### Step 4 — Deploy
Set `AI_PROVIDER=huggingface` in your Render env vars and update `render.yaml`:
```bash
git add .
git commit -m "Switch to custom Socratic model"
git push
```

```
Dataset → Colab (fine-tune) → HF Hub (host) → llama.cpp / HF Inference → Quaere.ai
```

## License

See [LICENSE](LICENSE).
