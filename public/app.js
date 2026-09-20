let conversationHistory = [];

const chatLog = document.getElementById('chat-log');
const inputBox = document.getElementById('input-box');
const sendBtn = document.getElementById('send-btn');

const TYPING_SPEED = 35;
const THINKING_DELAY = 600;

const messageCache = new Map();

function createMessageElement(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-3xl mx-auto relative group';

  const inner = document.createElement('div');
  inner.className = role === 'user'
    ? 'bg-gray-900 rounded-lg px-4 py-3 text-sm'
    : 'text-sm font-light leading-relaxed text-gray-200';

  inner.setAttribute('role', role);
  inner.textContent = content;

  const sanskritBtn = document.createElement('button');
  sanskritBtn.className = 'translate-sanskrit-btn absolute top-0 right-0 ml-2 opacity-0 hover:opacity-100 bg-gray-800 hover:bg-gray-700 text-xs text-gray-300 px-1.5 py-0.5 rounded transition-all duration-200';
  sanskritBtn.textContent = '↺';
  sanskritBtn.title = 'Toggle Sanskrit';
  sanskritBtn.setAttribute('data-translated', 'false');
  sanskritBtn.style.display = 'none';

  wrapper.appendChild(inner);
  wrapper.appendChild(sanskritBtn);

  return { wrapper, inner, sanskritBtn };
}

function appendMessage(role, content) {
  const { wrapper, inner, sanskritBtn } = createMessageElement(role, content);
  chatLog.appendChild(wrapper);
  scrollToBottom();

  if (role === 'assistant') {
    sanskritBtn.style.display = 'block';
    sanskritBtn.addEventListener('click', () => toggleSanskrit(inner, sanskritBtn, content));
  }

  return { inner, sanskritBtn };
}

function animateTextInto(element, text) {
  return new Promise((resolve) => {
    element.textContent = '';
    let index = 0;
    const cursor = document.createElement('span');
    cursor.className = 'typing-cursor';
    cursor.textContent = '▊';
    element.appendChild(cursor);

    const interval = setInterval(() => {
      if (index < text.length) {
        cursor.before(text.charAt(index));
        index++;
      } else {
        clearInterval(interval);
        cursor.remove();
        resolve();
      }
    }, TYPING_SPEED);
  });
}

function showTypingIndicator() {
  const { wrapper, inner } = createMessageElement('assistant', '');
  inner.className = 'text-sm font-light leading-relaxed text-gray-300 italic';
  inner.innerHTML = '<span class="glow-amber">Quaere</span><span class="text-gray-500">. . .</span>';
  chatLog.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
}

async function toggleSanskrit(innerEl, btn, originalContent) {
  const isTranslated = btn.getAttribute('data-translated') === 'true';

  if (isTranslated) {
innerEl.textContent = originalContent;
  innerEl.classList.remove('sanskrit-text');
  btn.textContent = '↺';
  btn.setAttribute('data-translated', 'false');
    return;
  }

  const cacheKey = originalContent;
  let translated = messageCache.get(cacheKey);

  if (!translated) {
    btn.textContent = '...';
    btn.disabled = true;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalContent }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || errData.error || 'Translation failed');
      }

      const data = await response.json();
      translated = data.translatedText;
      messageCache.set(cacheKey, translated);

      innerEl.textContent = translated;
      btn.textContent = 'EN';
      btn.setAttribute('data-translated', 'true');
    } catch (err) {
      btn.textContent = '↺';
      btn.disabled = false;
      innerEl.classList.remove('sanskrit-text');
      innerEl.innerHTML = `<span class="text-red-400 text-xs">Translation error: ${err.message}</span><br/>${originalContent}`;
      setTimeout(() => {
        innerEl.textContent = originalContent;
      }, 2000);
    } finally {
      btn.disabled = false;
    }
  } else {
    innerEl.textContent = translated;
    innerEl.classList.add('sanskrit-text');
    btn.textContent = 'EN';
    btn.setAttribute('data-translated', 'true');
  }
}

function removeTypingIndicator(indicatorEl) {
  if (indicatorEl && indicatorEl.parentNode) {
    indicatorEl.parentNode.removeChild(indicatorEl);
  }
}

function scrollToBottom() {
  chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' });
}

async function sendMessage() {
  const text = inputBox.value.trim();
  if (!text) return;

  setSendState(true);
  appendMessage('user', text);
  inputBox.value = '';
  inputBox.focus();

  conversationHistory.push({ role: 'user', content: text });

  const indicator = showTypingIndicator();

  try {
    await new Promise((r) => setTimeout(r, THINKING_DELAY));

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });

    removeTypingIndicator(indicator);

    if (!response.ok) {
      const errData = await response.json();
      appendMessage('assistant', `Error: ${errData.error || 'Something went wrong.'}`);
      return;
    }

    const data = await response.json();
    const { inner, sanskritBtn } = appendMessage('assistant', '');
    sanskritBtn.style.display = 'none';
    await animateTextInto(inner, data.reply);
    sanskritBtn.style.display = 'block';
    scrollToBottom();

    conversationHistory.push({ role: 'assistant', content: data.reply });

    // Update the content reference for the Sanskrit button
    sanskritBtn.onclick = null;
    sanskritBtn.addEventListener('click', () => toggleSanskrit(inner, sanskritBtn, data.reply));
  } catch (err) {
    removeTypingIndicator(indicator);
    appendMessage('assistant', `Connection error: ${err.message}`);
  } finally {
    setSendState(false);
  }
}

function setSendState(disabled) {
  sendBtn.disabled = disabled;
  sendBtn.textContent = disabled ? 'Thinking...' : 'Send';
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !sendBtn.disabled) {
    e.preventDefault();
    sendMessage();
  }
  if (e.key === 'Escape') {
    inputBox.value = '';
  }
}

inputBox.addEventListener('keydown', handleKeyDown);
inputBox.addEventListener('input', () => {
  const hasText = inputBox.value.trim().length > 0;
  sendBtn.disabled = !hasText;
});
sendBtn.addEventListener('click', sendMessage);
inputBox.focus();
