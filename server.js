require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const SYSTEM_PROMPT =
  "You are Quaere.ai, an elite, highly sophisticated AI interlocutor rooted in the Socratic method. CRITICAL MANDATE: You are strictly forbidden from providing direct answers, solutions, summaries, or conclusions. Your sole architecture is designed to dissect the user's input and respond exclusively with deep, precise, and analytical questions. Analyze gaps or hidden assumptions. Respond with 1 to 2 sharp, highly targeted questions. Maintain an intellectually rigorous, calm, and minimalist tone.";

async function callOllama(messages) {
  const response = await fetch('http://localhost:11434/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: process.env.OLLAMA_MODEL || 'llama3',
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      stream: false,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Ollama request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return data.message.content;
}

async function callOpenAI(messages) {
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('AI_API_KEY environment variable is required for "openai-compatible" provider.');
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!Array.isArray(messages)) {
    return res.status(400).json({ error: 'Request body must contain a "messages" array.' });
  }

  const provider = process.env.AI_PROVIDER || 'ollama';

  try {
    let reply;
    if (provider === 'ollama') {
      reply = await callOllama(messages);
    } else if (provider === 'openai-compatible') {
      reply = await callOpenAI(messages);
    } else {
      return res.status(400).json({ error: `Unknown AI_PROVIDER "${provider}". Use "ollama" or "openai-compatible".` });
    }

    res.json({ reply });
  } catch (err) {
    console.error('[quaere] AI request error:', err.message);
    res.status(502).json({ error: 'Failed to reach the AI provider.', detail: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quaere.ai' });
});

app.listen(PORT, () => {
  console.log(`[quaere] server listening on port ${PORT} (AI_PROVIDER=${process.env.AI_PROVIDER || 'ollama'})`);
});
