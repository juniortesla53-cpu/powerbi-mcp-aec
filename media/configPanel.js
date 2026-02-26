// ============================================================
// PowerBi MCP Server AeC - Configuration Panel Script
// Runs inside the VS Code WebView
// ============================================================

/* global acquireVsCodeApi, TOOLS_DEFINITIONS, PROFILES_DEFINITIONS */

const vscode = acquireVsCodeApi();

// ---- State ----
let currentConfig = {};

// ---- Init ----
document.addEventListener('DOMContentLoaded', () => {
  renderProfiles();
  renderTools();
  bindControls();
  requestConfig();
});

// Request config from extension
function requestConfig() {
  vscode.postMessage({ type: 'getConfig' });
}

// ---- Listen for messages from extension ----
window.addEventListener('message', (event) => {
  const message = event.data;
  switch (message.type) {
    case 'configUpdated':
      currentConfig = message.payload || {};
      applyConfigToUI(currentConfig);
      break;
    case 'statusUpdate':
      updateServerBadge(message.payload.serverStatus);
      break;
  }
});

// ---- Render Profiles ----
function renderProfiles() {
  const container = document.getElementById('profiles-grid');
  if (!container) return;

  PROFILES_DEFINITIONS.forEach(profile => {
    const btn = document.createElement('button');
    btn.className = 'profile-btn';
    btn.innerHTML = `
      <span class="profile-name">${escapeHtml(profile.name)}</span>
      <span class="profile-desc">${escapeHtml(profile.description)}</span>
    `;
    btn.addEventListener('click', () => applyProfile(profile));
    container.appendChild(btn);
  });
}

// Apply a profile: update all tool toggles and save config
function applyProfile(profile) {
  const state = profile.state;
  TOOLS_DEFINITIONS.forEach(tool => {
    const checkbox = document.querySelector(`input[data-tool-id="${tool.id}"]`);
    if (checkbox) {
      const enabled = state[tool.id] !== false;
      checkbox.checked = enabled;
      const item = checkbox.closest('.tool-item');
      if (item) item.classList.toggle('disabled', !enabled);
    }
    // Save to extension config
    vscode.postMessage({
      type: 'updateConfig',
      payload: { section: tool.configKey, value: state[tool.id] !== false }
    });
  });
  updateToolsCount();
}

// ---- Render Tools ----
function renderTools() {
  const remoteContainer = document.getElementById('tools-remote');
  const modelingContainer = document.getElementById('tools-modeling');
  if (!remoteContainer || !modelingContainer) return;

  TOOLS_DEFINITIONS.forEach(tool => {
    const container = tool.category === 'remote' ? remoteContainer : modelingContainer;
    const item = document.createElement('div');
    item.className = 'tool-item';
    item.dataset.toolId = tool.id;

    const badges = [
      tool.isDestructive ? '<span class="badge-destructive">ESCRITA</span>' : '',
      tool.isAdvanced ? '<span class="badge-advanced">AVANÇADO</span>' : ''
    ].filter(Boolean).join('');

    item.innerHTML = `
      <label class="tool-switch">
        <input type="checkbox" data-tool-id="${tool.id}" data-key="${tool.configKey}" ${tool.defaultEnabled ? 'checked' : ''}>
        <span class="switch-slider"></span>
      </label>
      <div class="tool-info">
        <div class="tool-name">${escapeHtml(tool.name)} ${badges}</div>
        <div class="tool-desc">${escapeHtml(tool.description)}</div>
      </div>
    `;

    // Toggle handler
    const checkbox = item.querySelector('input[type="checkbox"]');
    checkbox.addEventListener('change', (e) => {
      const enabled = e.target.checked;
      item.classList.toggle('disabled', !enabled);
      vscode.postMessage({
        type: 'updateConfig',
        payload: { section: tool.configKey, value: enabled }
      });
      updateToolsCount();
    });

    container.appendChild(item);
  });

  updateToolsCount();
}

// ---- Bind Controls ----
function bindControls() {
  // Server controls
  document.getElementById('btn-start')?.addEventListener('click', () =>
    vscode.postMessage({ type: 'startServer' })
  );
  document.getElementById('btn-stop')?.addEventListener('click', () =>
    vscode.postMessage({ type: 'stopServer' })
  );
  document.getElementById('btn-restart')?.addEventListener('click', () =>
    vscode.postMessage({ type: 'restartServer' })
  );
  document.getElementById('btn-clear-token')?.addEventListener('click', () =>
    vscode.postMessage({ type: 'clearToken' })
  );

  // Auth method change → show/hide secret field
  document.getElementById('auth-method')?.addEventListener('change', (e) => {
    const secretGroup = document.getElementById('secret-group');
    if (secretGroup) {
      secretGroup.style.display = e.target.value === 'clientCredentials' ? 'flex' : 'none';
    }
    saveInputValue(e.target);
  });

  // Generic input/select/checkbox save on change
  document.querySelectorAll('[data-key]').forEach(el => {
    const eventName = el.tagName === 'SELECT' || el.tagName === 'INPUT' ? 'change' : 'change';
    el.addEventListener(eventName, () => saveInputValue(el));
    if (el.tagName === 'INPUT' && el.type === 'text') {
      el.addEventListener('blur', () => saveInputValue(el));
    }
  });

  // Semantic model IDs textarea (convert to array)
  const semanticModelIdsEl = document.getElementById('semantic-model-ids');
  if (semanticModelIdsEl) {
    semanticModelIdsEl.addEventListener('blur', () => {
      const ids = semanticModelIdsEl.value
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
      vscode.postMessage({
        type: 'updateConfig',
        payload: { section: 'connection.defaultSemanticModelIds', value: ids }
      });
    });
  }

  // Toggle all buttons
  document.querySelectorAll('.toggle-all-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const category = btn.dataset.category;
      const targetState = btn.dataset.state === '1'; // 1 = currently all on → disable all
      const newState = !targetState; // what to set

      TOOLS_DEFINITIONS
        .filter(t => t.category === category)
        .forEach(tool => {
          const checkbox = document.querySelector(`input[data-tool-id="${tool.id}"]`);
          if (checkbox) {
            checkbox.checked = newState;
            checkbox.closest('.tool-item')?.classList.toggle('disabled', !newState);
            vscode.postMessage({
              type: 'updateConfig',
              payload: { section: tool.configKey, value: newState }
            });
          }
        });

      btn.dataset.state = newState ? '1' : '0';
      btn.textContent = newState ? 'Desabilitar Todos' : 'Habilitar Todos';
      updateToolsCount();
    });
  });
}

function saveInputValue(el) {
  const key = el.dataset.key;
  if (!key) return;
  let value;
  if (el.type === 'checkbox') {
    value = el.checked;
  } else {
    value = el.value;
  }
  vscode.postMessage({
    type: 'updateConfig',
    payload: { section: key, value }
  });
}

// ---- Apply Config to UI ----
function applyConfigToUI(config) {
  // Tools
  TOOLS_DEFINITIONS.forEach(tool => {
    const enabled = config[tool.configKey] !== undefined ? config[tool.configKey] : tool.defaultEnabled;
    const checkbox = document.querySelector(`input[data-tool-id="${tool.id}"]`);
    if (checkbox) {
      checkbox.checked = enabled;
      checkbox.closest('.tool-item')?.classList.toggle('disabled', !enabled);
    }
  });

  // Server options
  setCheckbox('autoStart', config['server.autoStart']);
  setCheckbox('readOnly', config['server.readOnly']);
  setCheckbox('requireConfirmation', config['server.requireConfirmation']);

  // Auth
  setInputValue('auth-method', config['auth.method']);
  setInputValue('auth-tenantId', config['auth.tenantId']);
  setInputValue('auth-clientId', config['auth.clientId']);

  // Show/hide secret field
  const secretGroup = document.getElementById('secret-group');
  if (secretGroup) {
    secretGroup.style.display = config['auth.method'] === 'clientCredentials' ? 'flex' : 'none';
  }

  // Connection
  setInputValue('xmla-endpoint', config['connection.xmlaEndpoint']);
  const semanticModelIdsEl = document.getElementById('semantic-model-ids');
  if (semanticModelIdsEl) {
    const ids = config['connection.defaultSemanticModelIds'];
    semanticModelIdsEl.value = Array.isArray(ids) ? ids.join('\n') : '';
  }

  updateToolsCount();
}

function setCheckbox(id, value) {
  const el = document.getElementById(id);
  if (el) el.checked = Boolean(value);
}

function setInputValue(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = String(value);
}

// ---- Update Tools Count ----
function updateToolsCount() {
  const allCheckboxes = document.querySelectorAll('[data-tool-id]');
  const checkedCheckboxes = document.querySelectorAll('[data-tool-id]:checked');
  const countEl = document.getElementById('tools-count');
  if (countEl) {
    countEl.textContent = `${checkedCheckboxes.length}/${allCheckboxes.length}`;
  }
}

// ---- Update Server Badge ----
function updateServerBadge(status) {
  const badge = document.getElementById('server-badge');
  if (!badge) return;

  const labels = {
    stopped: '● Parado',
    starting: '◌ Iniciando...',
    running: '● Rodando',
    error: '⚠ Erro'
  };
  const classes = {
    stopped: 'badge-stopped',
    starting: 'badge-starting',
    running: 'badge-running',
    error: 'badge-error'
  };

  badge.textContent = labels[status] || labels.stopped;
  badge.className = `badge ${classes[status] || 'badge-stopped'}`;
}

// ---- Helpers ----
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
