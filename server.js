require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/imgs', express.static(path.join(__dirname, 'imgs')));

const SYSTEM_PROMPT =
  "You are Quaere.ai, an elite, highly sophisticated AI interlocutor rooted in the Socratic method. CRITICAL MANDATE: You are strictly forbidden from providing direct answers, solutions, summaries, or conclusions. Your sole architecture is designed to dissect the user's input and respond exclusively with deep, precise, and analytical questions. Analyze gaps or hidden assumptions. Respond with 1 to 2 sharp, highly targeted questions. Maintain an intellectually rigorous, calm, and minimalist tone.";

const KIMI_FREE_ENDPOINT = process.env.KIMI_API_URL || 'https://api.moonshot.ai/v1/chat/completions';

async function callOllama(messages) {
  const baseURL = process.env.OLLAMA_URL || 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL || 'llama3';

  console.log(`[quaere] Using Ollama at ${baseURL} (model: ${model})`);

  const response = await fetch(`${baseURL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
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
  const apiKey = process.env.GROQ_API_KEY || process.env.AI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('GROQ_API_KEY (or AI_API_KEY) environment variable is required for "openai-compatible" provider.');
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

async function callKimi(messages) {
  const apiKey = process.env.KIMI_API_KEY;
  const model = process.env.KIMI_API_URL ? 'kimi' : (process.env.KIMI_MODEL || 'moonshot-v1-8k');

  if (!apiKey) {
    throw new Error('KIMI_API_KEY environment variable is required for "kimi" provider.');
  }

  console.log('[quaere] Using Moonshot Kimi with endpoint:', KIMI_FREE_ENDPOINT);
  console.log('[quaere] Model:', model);

  const response = await fetch(KIMI_FREE_ENDPOINT, {
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

  console.log('[quaere] Kimi response status:', response.status);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Kimi request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  console.log('[quaere] Kimi response received successfully');
  return data.choices[0].message.content;
}

function formatLlama3Prompt(systemPrompt, messages) {
  const allMessages = [{ role: 'system', content: systemPrompt }, ...messages];
  let prompt = '<|begin_of_text|>';

  for (const msg of allMessages) {
    prompt += `<|start_header_id|>${msg.role}<|end_header_id|>\n\n${msg.content}<|eot_id|>`;
  }

  prompt += '<|start_header_id|>assistant<|end_header_id|>\n\n';
  return prompt;
}

async function callHuggingFace(messages) {
  const apiKey = process.env.HF_API_KEY;
  const modelId = process.env.HF_MODEL_ID;
  const endpoint = process.env.HF_ENDPOINT || `https://api-inference.huggingface.co/models/${modelId}`;

  if (!apiKey) {
    throw new Error('HF_API_KEY environment variable is required for "huggingface" provider.');
  }

  if (!modelId) {
    throw new Error('HF_MODEL_ID environment variable is required for "huggingface" provider.');
  }

  const prompt = formatLlama3Prompt(SYSTEM_PROMPT, messages);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: { max_new_tokens: 512, temperature: 0.7, return_full_text: false },
      options: { wait_for_model: true, use_cache: true },
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Hugging Face request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();

  let reply;
  if (typeof data === 'string') {
    reply = data;
  } else if (Array.isArray(data) && data[0]?.generated_text !== undefined) {
    reply = data[0].generated_text;
  } else if (data.generated_text !== undefined) {
    reply = data.generated_text;
  } else if (data.error) {
    throw new Error(data.error);
  } else {
    throw new Error('Unexpected response from Hugging Face API');
  }

  // HF returns the full text (prompt + generation). Strip the prompt.
  if (reply.startsWith(prompt)) {
    reply = reply.slice(prompt.length);
  }

  return reply.trim();
}

async function callLlamaCpp(messages) {
  const baseURL = process.env.LLAMA_CPP_URL || 'http://localhost:8080';
  const model = process.env.LLAMA_CPP_MODEL || 'QuantFactory/Llama-3.2-3B-Instruct-GGUF';

  const response = await fetch(`${baseURL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`llama.cpp request failed (${response.status}): ${detail}`);
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
    } else if (provider === 'huggingface') {
      reply = await callHuggingFace(messages);
    } else if (provider === 'llamacpp') {
      reply = await callLlamaCpp(messages);
    } else if (provider === 'kimi') {
      reply = await callKimi(messages);
    } else {
      return res.status(400).json({ error: `Unknown AI_PROVIDER "${provider}". Use "ollama", "openai-compatible", "huggingface", "llamacpp", or "kimi".` });
    }

    res.json({ reply });
  } catch (err) {
    console.error('[quaere] AI request error:', err.message);
    console.error('[quaere] AI provider:', provider);
    console.error('[quaere] Error cause:', err.cause);
    res.status(502).json({ error: 'Failed to reach the AI provider.', detail: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quaere.ai' });
});

app.listen(PORT, () => {
  console.log(`[quaere] server listening on port ${PORT} (AI_PROVIDER=${process.env.AI_PROVIDER || 'ollama'})`);
});
