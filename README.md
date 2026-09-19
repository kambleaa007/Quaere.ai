# Quaere.ai

> **Live**: [https://quaere-ai.onrender.com](https://quaere-ai.onrender.com)

A Socratic AI that never answers — it asks. Built with Node.js + Express, a Dark-Academia UI, and configurable AI providers (Ollama or OpenAI-compatible APIs like Groq).

## Features

- **Socratic-only behavior** — a hardened system prompt forces the AI to respond exclusively with probing questions
- **Dual provider** — Ollama (local) or any OpenAI-compatible API (Groq, TogetherAI, OpenAI)
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
| `AI_PROVIDER` | no | `ollama` (default) or `openai-compatible` |
| `GROQ_API_KEY` | if OpenAI-compatible | Groq API key (`gsk-…`) — also accepts `AI_API_KEY` as fallback |
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
├── server.js              # Express backend: POST /api/chat, /health
├── package.json           # Dependencies + scripts
├── render.yaml            # Render.com service config
├── .env.example           # Environment variable template
├── .gitattributes         # Line-ending normalization
├── public/
│   ├── index.html         # UI (Tailwind, Dark Academia)
│   └── app.js             # Frontend logic + typing animation
├── imgs/                  # Background images
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

## Custom Model Roadmap

The current system-prompt approach can be superseded by a **fine-tuned model** that asks questions at the weight level. See `ANALYSIS.md` for the full QLoRA + llama.cpp plan:

1. **Fine-tune** Llama 3.2 (2 GB) via Unsloth / QLoRA on Google Colab
2. **Export** as GGUF (Q4_K_M / Q5_K_M)
3. **Serve** with `llama-server` (no Ollama API needed)
4. **Point** `server.js` at the local llama.cpp endpoint

```
Browser → Express Server → llama.cpp Server → Fine-tuned Quaere.ai (GGUF)
```

## License

See [LICENSE](LICENSE).
