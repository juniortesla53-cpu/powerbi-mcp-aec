// Chat IA Panel — PowerBi MCP AeC
// Runs inside the VSCode WebView sandbox

(function () {
  'use strict';

  const vscode = acquireVsCodeApi();

  // ---- State ----
  let isStreaming = false;
  let currentProvider = 'copilot';
  let streamBuffer = '';
  let activeMessageEl = null;

  // ---- DOM refs ----
  const messagesEl = document.getElementById('chat-messages');
  const emptyStateEl = document.getElementById('empty-state');
  const chatInput = document.getElementById('chat-input');
  const btnSend = document.getElementById('btn-send');
  const btnClear = document.getElementById('btn-clear');
  const providerSelect = document.getElementById('provider-select');
  const providerStatus = document.getElementById('provider-status');

  // ---- Init ----
  document.addEventListener('DOMContentLoaded', () => {
    // Restore persisted history
    const saved = vscode.getState();
    if (saved && saved.messages && saved.messages.length > 0) {
      for (const msg of saved.messages) {
        appendMessage(msg.role, msg.html, false);
      }
      hideEmptyState();
    }

    // Restore last selected provider
    if (saved && saved.provider) {
      currentProvider = saved.provider;
      providerSelect.value = currentProvider;
    }

    bindEvents();
    vscode.postMessage({ type: 'chat:getConfig' });
  });

  function bindEvents() {
    btnSend.addEventListener('click', sendMessage);
    btnClear.addEventListener('click', clearHistory);
    providerSelect.addEventListener('change', () => {
      currentProvider = providerSelect.value;
      persistState();
      updateProviderStatus();
    });

    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    chatInput.addEventListener('input', autoResizeInput);

    // API Key buttons
    document.getElementById('btn-save-gemini').addEventListener('click', () => {
      const key = document.getElementById('gemini-api-key').value.trim();
      if (key) vscode.postMessage({ type: 'chat:setApiKey', provider: 'gemini', key });
    });

    document.getElementById('btn-save-groq').addEventListener('click', () => {
      const key = document.getElementById('groq-api-key').value.trim();
      if (key) vscode.postMessage({ type: 'chat:setApiKey', provider: 'groq', key });
    });

    document.getElementById('btn-delete-gemini').addEventListener('click', () => {
      vscode.postMessage({ type: 'chat:deleteApiKey', provider: 'gemini' });
    });

    document.getElementById('btn-delete-groq').addEventListener('click', () => {
      vscode.postMessage({ type: 'chat:deleteApiKey', provider: 'groq' });
    });

    // Cancel on btn-send click while streaming
    btnSend.addEventListener('click', () => {
      if (isStreaming) {
        vscode.postMessage({ type: 'chat:cancel' });
      }
    }, { capture: true });
  }

  // ---- Inbound messages from extension host ----
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'chat:chunk':
        onChunk(msg.text);
        break;
      case 'chat:done':
        onDone();
        break;
      case 'chat:error':
        onError(msg.error);
        break;
      case 'chat:configLoaded':
        onConfigLoaded(msg);
        break;
      case 'chat:apiKeySet':
        onApiKeySet(msg);
        break;
    }
  });

  // ---- Send message ----
  function sendMessage() {
    if (isStreaming) return;

    const text = chatInput.value.trim();
    if (!text) return;

    chatInput.value = '';
    autoResizeInput();
    hideEmptyState();

    // Add user bubble
    appendMessage('user', renderMarkdown(escapeHtml(text)), true);

    // Start streaming placeholder
    startStreamingMessage();

    isStreaming = true;
    streamBuffer = '';
    updateSendButton();

    const history = getHistory();

    vscode.postMessage({
      type: 'chat:send',
      provider: currentProvider,
      text: text,
      history: history
    });
  }

  // ---- Streaming handlers ----
  function onChunk(text) {
    if (!activeMessageEl) return;
    streamBuffer += text;
    activeMessageEl.innerHTML = renderMarkdown(streamBuffer);
    scrollToBottom();
  }

  function onDone() {
    if (activeMessageEl) {
      activeMessageEl.innerHTML = renderMarkdown(streamBuffer);
      activeMessageEl = null;
    }
    isStreaming = false;
    updateSendButton();
    persistState();
    scrollToBottom();
  }

  function onError(errorMsg) {
    // Remove typing indicator if present
    if (activeMessageEl) {
      const bubble = activeMessageEl.closest('.message');
      if (bubble) bubble.remove();
      activeMessageEl = null;
    }
    appendMessage('error', escapeHtml(errorMsg), true);
    isStreaming = false;
    updateSendButton();
    scrollToBottom();
  }

  function onConfigLoaded(msg) {
    updateKeyStatus('gemini', msg.geminiKeySet);
    updateKeyStatus('groq', msg.groqKeySet);
    updateProviderStatus(msg);
  }

  function onApiKeySet(msg) {
    if (msg.success) {
      const keyInput = document.getElementById(`${msg.provider}-api-key`);
      if (keyInput) keyInput.value = '';
      updateKeyStatus(msg.provider, true);
      // Refresh config
      vscode.postMessage({ type: 'chat:getConfig' });
    }
  }

  // ---- DOM helpers ----
  function appendMessage(role, html, save) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    div.innerHTML = html;
    messagesEl.appendChild(div);
    if (save) persistState();
    scrollToBottom();
    return div;
  }

  function startStreamingMessage() {
    const div = document.createElement('div');
    div.className = 'message assistant';
    div.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
    messagesEl.appendChild(div);
    activeMessageEl = div;
    scrollToBottom();
  }

  function clearHistory() {
    // Remove all messages
    const messages = messagesEl.querySelectorAll('.message');
    messages.forEach(m => m.remove());
    showEmptyState();
    vscode.setState({ messages: [], provider: currentProvider });
  }

  function hideEmptyState() {
    if (emptyStateEl) emptyStateEl.style.display = 'none';
  }

  function showEmptyState() {
    if (emptyStateEl) emptyStateEl.style.display = '';
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function autoResizeInput() {
    chatInput.style.height = 'auto';
    chatInput.style.height = Math.min(chatInput.scrollHeight, 130) + 'px';
  }

  function updateSendButton() {
    if (isStreaming) {
      btnSend.innerHTML = '&#x25A0;'; // stop square
      btnSend.title = 'Parar geração';
      btnSend.disabled = false;
    } else {
      btnSend.innerHTML = '&#x27A4;'; // arrow
      btnSend.title = 'Enviar';
      btnSend.disabled = false;
    }
  }

  function updateKeyStatus(provider, isSet) {
    const el = document.getElementById(`${provider}-key-status`);
    if (!el) return;
    if (isSet) {
      el.textContent = '✓ configurada';
      el.className = 'key-status set';
    } else {
      el.textContent = 'não configurada';
      el.className = 'key-status unset';
    }
  }

  function updateProviderStatus(config) {
    if (!providerStatus) return;
    const p = providerSelect.value;
    if (p === 'copilot') {
      if (config && !config.copilotAvailable) {
        providerStatus.textContent = '⚠ Instale a extensão GitHub Copilot';
      } else {
        providerStatus.textContent = '';
      }
    } else if (p === 'gemini') {
      if (config && !config.geminiKeySet) {
        providerStatus.textContent = '⚠ Configure a chave Gemini abaixo';
      } else {
        providerStatus.textContent = '';
      }
    } else if (p === 'groq') {
      if (config && !config.groqKeySet) {
        providerStatus.textContent = '⚠ Configure a chave Groq abaixo';
      } else {
        providerStatus.textContent = '';
      }
    }
  }

  // ---- History persistence ----
  function getHistory() {
    const messages = messagesEl.querySelectorAll('.message.user, .message.assistant');
    const history = [];
    for (const el of messages) {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      // Get raw text content for history (strip HTML)
      const content = el.innerText || el.textContent || '';
      history.push({ role, content: content.trim() });
    }
    return history;
  }

  function persistState() {
    const messages = messagesEl.querySelectorAll('.message.user, .message.assistant');
    const saved = [];
    for (const el of messages) {
      const role = el.classList.contains('user') ? 'user' : 'assistant';
      saved.push({ role, html: el.innerHTML });
    }
    vscode.setState({ messages: saved, provider: currentProvider });
  }

  // ---- Markdown renderer (no external deps) ----
  function renderMarkdown(text) {
    // First split by code blocks to avoid escaping inside them
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        // Code block
        const match = part.match(/```(\w*)\n?([\s\S]*?)```/);
        if (match) {
          const code = match[2];
          return `<pre><code>${escapeHtml(code)}</code></pre>`;
        }
        return escapeHtml(part);
      }
      // Regular text
      return escapeHtml(part)
        .replace(/`([^`\n]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
        .replace(/\n/g, '<br>');
    }).join('');
  }

  function escapeHtml(text) {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

}());
