let conversationHistory = [];

const chatLog = document.getElementById('chat-log');
const inputBox = document.getElementById('input-box');
const sendBtn = document.getElementById('send-btn');

const TYPING_SPEED = 35;
const THINKING_DELAY = 800;

function createMessageElement(role, content) {
  const wrapper = document.createElement('div');
  wrapper.className = 'max-w-3xl mx-auto relative group';

  const inner = document.createElement('div');
  inner.className = role === 'user'
    ? 'bg-gray-900 rounded-lg px-4 py-3 text-sm'
    : 'text-sm font-light leading-relaxed text-gray-200';

  inner.setAttribute('role', role);
  inner.textContent = content;

  wrapper.appendChild(inner);

  return { wrapper, inner };
}

function appendMessage(role, content) {
  const { wrapper, inner } = createMessageElement(role, content);
  chatLog.appendChild(wrapper);
  scrollToBottom();

  return { wrapper, inner };
}

function showTypingIndicator() {
  const { wrapper, inner } = createMessageElement('assistant', '');
  inner.className = 'text-sm font-light leading-relaxed text-gray-300 italic';
  inner.innerHTML = '<span class="glow-amber">Nataraj</span><span class="text-gray-500">. . .</span>';
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

    const response = await fetch('/api/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text }),
    });

    removeTypingIndicator(indicator);

    if (!response.ok) {
      const errData = await response.json();
      appendMessage('assistant', `Error: ${errData.error || 'Something went wrong.'}`);
      return;
    }

    const data = await response.json();
    const { wrapper, inner } = appendMessage('assistant', '');

    const video = document.createElement('video');
    video.className = 'generated-video';
    video.controls = true;
    video.src = data.videoUrl;
    inner.appendChild(video);
    scrollToBottom();
  } catch (err) {
    removeTypingIndicator(indicator);
    appendMessage('assistant', `Connection error: ${err.message}`);
  } finally {
    setSendState(false);
  }
}

function setSendState(disabled) {
  sendBtn.disabled = disabled;
  sendBtn.textContent = disabled ? 'Generating...' : 'Generate';
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