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

const K25_ENDPOINT = process.env.K25_API_URL || 'https://api.moonshot.ai/v1/chat/completions';

async function callK25(messages) {
  const apiKey = process.env.K25_API_KEY || process.env.MOONSHOT_API_KEY;
  const model = process.env.K25_MODEL || 'k2.5';

  if (!apiKey) {
    throw new Error('K25_API_KEY (or MOONSHOT_API_KEY) environment variable is required for "k25" provider.');
  }

  console.log('[quaere] Using K2.5 at:', K25_ENDPOINT);
  console.log('[quaere] Model:', model);

  const response = await fetch(K25_ENDPOINT, {
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

  console.log('[quaere] K2.5 response status:', response.status);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`K2.5 request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  console.log('[quaere] K2.5 response received successfully');
  return data.choices[0].message.content;
}

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
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  console.log('[quaere] Provider: openai-compatible');
  console.log('[quaere] Base URL:', baseURL);
  console.log('[quaere] Model:', model);
  console.log('[quaere] API Key present:', !!apiKey);

  if (!apiKey) {
    throw new Error('OPENAI_API_KEY, GROQ_API_KEY, AI_API_KEY, or OPENROUTER_API_KEY environment variable is required for "openai-compatible" provider.');
  }

  const body = {
    model,
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    max_tokens: 512,
    temperature: 0.7,
  };

  console.log('[quaere] Request body:', JSON.stringify(body).slice(0, 200));

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  console.log('[quaere] Response status:', response.status);

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

async function callPollinations(messages) {
  const apiKey = process.env.POLLINATIONS_API_KEY;
  const model = process.env.POLLINATIONS_MODEL || 'openai-small';
  const endpoint = process.env.POLLINATIONS_ENDPOINT || 'https://text.pollinations.ai/openai/chat/completions';

  console.log('[quaere] Using Pollinations text at:', endpoint);
  console.log('[quaere] Model:', model);

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
      max_tokens: 512,
      temperature: 0.7,
    }),
  });

  console.log('[quaere] Pollinations response status:', response.status);

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Pollinations request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  console.log('[quaere] Pollinations response received successfully');
  return data.choices[0].message.content;
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

const provider = process.env.AI_PROVIDER || 'openai-compatible';

  try {
    let reply;
    if (provider === 'openai-compatible' || provider === 'openrouter') {
      reply = await callOpenAI(messages);
    } else if (provider === 'k25') {
      reply = await callK25(messages);
    } else if (provider === 'kimi') {
      reply = await callKimi(messages);
    } else if (provider === 'ollama') {
      reply = await callOllama(messages);
    } else if (provider === 'huggingface') {
      reply = await callHuggingFace(messages);
    } else if (provider === 'llamacpp') {
      reply = await callLlamaCpp(messages);
    } else if (provider === 'pollinations') {
      reply = await callPollinations(messages);
    } else {
      return res.status(400).json({ error: `Unknown AI_PROVIDER "${provider}". Use "openai-compatible", "k25", "kimi", "openrouter", "ollama", "huggingface", "llamacpp", or "pollinations".` });
    }

    res.json({ reply });
  } catch (err) {
    console.error('[quaere] AI request error:', err.message);
    console.error('[quaere] AI provider:', provider);
    console.error('[quaere] Error cause:', err.cause);
    res.status(502).json({ error: 'Failed to reach the AI provider.', detail: err.message });
  }
});

app.post('/api/translate', async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'Request body must contain a "text" string.' });
  }

  const provider = process.env.AI_PROVIDER;

  try {
    let translatedText;
    if (provider === 'openai-compatible' || provider === 'openrouter') {
      translatedText = await translateOpenAI(text);
    } else {
      return res.status(400).json({ error: 'Translation not configured for current provider.' });
    }

    res.json({ translatedText });
  } catch (err) {
    console.error('[quaere] Translation error:', err.message);
    res.status(502).json({ error: 'Failed to translate.', detail: err.message });
  }
});

async function translateOpenAI(text) {
  const apiKey = process.env.OPENAI_API_KEY || process.env.GROQ_API_KEY || process.env.AI_API_KEY || process.env.OPENROUTER_API_KEY;
  const baseURL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (!apiKey) {
    throw new Error('API key required for translation.');
  }

  const response = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: 'You are a professional translator. Translate the given text to Sanskrit (in Devanagari script). Only return the translated text, nothing else.'
        },
        {
          role: 'user',
          content: text
        }
      ],
      max_tokens: 512,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Translation request failed (${response.status}): ${detail}`);
  }

  const data = await response.json();
  return data.choices[0].message.content.trim();
}

const POLLINATIONS_ENDPOINT = 'https://gen.pollinations.ai/image';

app.post('/api/generate-image', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt || typeof prompt !== 'string') {
    return res.status(400).json({ error: 'Request body must contain a "prompt" string.' });
  }

  try {
    const imageUrl = `${POLLINATIONS_ENDPOINT}/${encodeURIComponent(prompt.trim())}?model=flux`;
    
    console.log('[quaere IMAGE] Generation requested for prompt:', prompt.slice(0, 50) + '...');
    console.log('[quaere IMAGE] Full Pollinations URL:', imageUrl);
    
    const imageResponse = await fetch(imageUrl);
    
    console.log('[quaere IMAGE] Response status:', imageResponse.status);
    console.log('[quaere IMAGE] Response headers:', Object.fromEntries(imageResponse.headers.entries()));
    
    if (!imageResponse.ok) {
      const errorBody = await imageResponse.text();
      console.error('[quaere IMAGE] Error response body:', errorBody);
      throw new Error(`Pollinations request failed (${imageResponse.status}): ${errorBody}`);
    }

    const contentType = imageResponse.headers.get('content-type') || 'image/png';
    const imageBuffer = await imageResponse.arrayBuffer();
    
    const base64Image = Buffer.from(imageBuffer).toString('base64');
    const dataUrl = `data:${contentType};base64,${base64Image}`;
    
    console.log('[quaere IMAGE] Image generated successfully, size:', imageBuffer.byteLength, 'bytes, content-type:', contentType);
    
    res.json({ imageUrl: dataUrl });
  } catch (err) {
    console.error('[quaere] Image generation error:', err.message);
    res.status(502).json({ error: 'Failed to generate image.', detail: err.message });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'quaere.ai' });
});

app.listen(PORT, () => {
  console.log(`[quaere] Server starting in environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`[quaere] AI_PROVIDER: ${process.env.AI_PROVIDER || 'not set'}`);
  console.log(`[quaere] OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? 'PRESENT (length: ' + process.env.OPENROUTER_API_KEY.length + ')' : 'NOT SET'}`);
  console.log(`[quaere] OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? 'PRESENT (length: ' + process.env.OPENAI_API_KEY.length + ')' : 'NOT SET'}`);
  console.log(`[quaere] GROQ_API_KEY: ${process.env.GROQ_API_KEY ? 'PRESENT (length: ' + process.env.GROQ_API_KEY.length + ')' : 'NOT SET'}`);
  console.log(`[quaere] POLLINATIONS_API_KEY: ${process.env.POLLINATIONS_API_KEY ? 'PRESENT (length: ' + process.env.POLLINATIONS_API_KEY.length + ')' : 'NOT SET'}`);
  console.log(`[quaere] OPENAI_BASE_URL: ${process.env.OPENAI_BASE_URL || 'not set'}`);
  console.log(`[quaere] OPENAI_MODEL: ${process.env.OPENAI_MODEL || 'not set'}`);
  console.log(`[quaere] server listening on port ${PORT} (AI_PROVIDER=${process.env.AI_PROVIDER || 'ollama'})`);
});
