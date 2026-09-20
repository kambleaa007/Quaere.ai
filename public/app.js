let conversationHistory = [];

const chatLog = document.getElementById('chat-log');
const inputBox = document.getElementById('input-box');
const sendBtn = document.getElementById('send-btn');

const TYPING_SPEED = 35;
const THINKING_DELAY = 600;

const messageCache = new Map();

function createMessageWrapper(role) {
  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-3xl mx-auto';

  const contentDiv = document.createElement('div');
  contentDiv.className = role === 'user'
    ? 'bg-gray-900 rounded-lg px-4 py-3 text-sm'
    : 'text-sm font-light leading-relaxed text-gray-200';
  contentDiv.setAttribute('role', role);

  const buttonContainer = document.createElement('div');
  buttonContainer.className = 'flex gap-2 mt-2';
  buttonContainer.style.display = 'none';

  const sanskritBtn = document.createElement('button');
  sanskritBtn.className = 'translate-btn bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-[#121212] font-semibold text-xs px-2 py-1 rounded shadow transition-all duration-200 transform hover:scale-105';
  sanskritBtn.textContent = 'ॐ संस्कृत';
  sanskritBtn.title = 'Click to translate to Sanskrit';
  sanskritBtn.setAttribute('data-lang', 'sanskrit');
  sanskritBtn.setAttribute('data-translated', 'false');

  const hindiBtn = document.createElement('button');
  hindiBtn.className = 'translate-btn bg-gradient-to-r from-purple-400 to-purple-500 hover:from-purple-300 hover:to-purple-400 text-[#121212] font-semibold text-xs px-2 py-1 rounded shadow transition-all duration-200 transform hover:scale-105';
  hindiBtn.textContent = 'हिंदी';
  hindiBtn.title = 'Click to translate to Hindi';
  hindiBtn.setAttribute('data-lang', 'hindi');
  hindiBtn.setAttribute('data-translated', 'false');

  buttonContainer.appendChild(sanskritBtn);
  buttonContainer.appendChild(hindiBtn);

  wrapper.appendChild(contentDiv);
  wrapper.appendChild(buttonContainer);

  return { wrapper, contentDiv, buttonContainer, sanskritBtn, hindiBtn };
}

function appendMessage(role, content) {
  const { wrapper, contentDiv, buttonContainer, sanskritBtn, hindiBtn } = createMessageWrapper(role);
  contentDiv.textContent = content;
  chatLog.appendChild(wrapper);
  scrollToBottom();

  if (role === 'assistant') {
    buttonContainer.style.display = 'flex';
  }

  return { wrapper, contentDiv, buttonContainer, sanskritBtn, hindiBtn };
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

async function toggleTranslation(element, btn, originalContent, lang) {
  const isTranslated = btn.getAttribute('data-translated') === 'true';

  if (isTranslated) {
    element.textContent = originalContent;
    element.classList.remove('sanskrit-text');
    element.style.color = '';
    element.style.fontSize = '';
    btn.textContent = btn.getAttribute('data-lang') === 'sanskrit' ? 'ॐ संस्कृत' : 'हिंदी';
    btn.setAttribute('data-translated', 'false');
    btn.disabled = false;
    return;
  }

  const cacheKey = `${originalContent}__${lang}`;
  let translated = messageCache.get(cacheKey);

  if (!translated) {
    btn.textContent = '...';
    btn.disabled = true;

    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: originalContent, targetLang: lang }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || errData.error || 'Translation failed');
      }

      const data = await response.json();
      translated = data.translatedText;
      messageCache.set(cacheKey, translated);

      element.textContent = translated;
      element.classList.add('sanskrit-text');
      element.style.color = '#e8e6e1';
      element.style.fontSize = '1.1em';
      btn.textContent = '↺ EN';
      btn.setAttribute('data-translated', 'true');
    } catch (err) {
      btn.textContent = lang === 'sanskrit' ? 'ॐ संस्कृत' : 'हिंदी';
      btn.disabled = false;
      element.innerHTML = `<span class="text-red-400 text-xs">Error: ${err.message}</span><br/>${originalContent}`;
      setTimeout(() => {
        element.textContent = originalContent;
      }, 2000);
    } finally {
      btn.disabled = false;
    }
  } else {
    element.textContent = translated;
    element.classList.add('sanskrit-text');
    element.style.color = '#e8e6e1';
    element.style.fontSize = '1.1em';
    btn.textContent = '↺ EN';
    btn.setAttribute('data-translated', 'true');
  }
}

function showTypingIndicator() {
  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-3xl mx-auto';
  const inner = document.createElement('div');
  inner.className = 'text-sm font-light leading-relaxed text-gray-300 italic';
  inner.innerHTML = '<span class="glow-amber">Quaere</span><span class="text-gray-500">. . .</span>';
  wrapper.appendChild(inner);
  chatLog.appendChild(wrapper);
  scrollToBottom();
  return wrapper;
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
    const { contentDiv, sanskritBtn, hindiBtn } = appendMessage('assistant', '');
    sanskritBtn.style.display = 'none';
    hindiBtn.style.display = 'none';
    await animateTextInto(contentDiv, data.reply);
    sanskritBtn.style.display = 'block';
    hindiBtn.style.display = 'block';

    sanskritBtn.addEventListener('click', () => toggleTranslation(contentDiv, sanskritBtn, data.reply, 'sanskrit'));
    hindiBtn.addEventListener('click', () => toggleTranslation(contentDiv, hindiBtn, data.reply, 'hindi'));

    scrollToBottom();

    conversationHistory.push({ role: 'assistant', content: data.reply });
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
