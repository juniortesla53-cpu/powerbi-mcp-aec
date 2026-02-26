import * as vscode from 'vscode';
import axios from 'axios';
import { ChatMessage, ChatProviderType, ChatWebViewMessage } from '../types/index.js';

export class ChatWebViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;
  private _cancellationTokenSource?: vscode.CancellationTokenSource;
  private _abortController?: AbortController;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: ChatWebViewMessage) => {
      this._handleMessage(message, webviewView.webview);
    });
  }

  private async _handleMessage(message: ChatWebViewMessage, webview: vscode.Webview): Promise<void> {
    switch (message.type) {
      case 'chat:getConfig': {
        const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
        const geminiKey = await this.context.secrets.get('powerbiMcpAec.geminiApiKey');
        const groqKey = await this.context.secrets.get('powerbiMcpAec.groqApiKey');
        webview.postMessage({
          type: 'chat:configLoaded',
          copilotAvailable: models.length > 0,
          geminiKeySet: !!geminiKey,
          groqKeySet: !!groqKey
        });
        break;
      }

      case 'chat:send': {
        const provider = message.provider ?? 'copilot';
        const history: ChatMessage[] = message.history ?? [];
        const userText = message.text ?? '';
        const fullHistory: ChatMessage[] = [...history, { role: 'user', content: userText }];

        try {
          if (provider === 'copilot') {
            await this._sendViaCopilot(fullHistory, webview);
          } else if (provider === 'gemini') {
            await this._sendViaGemini(fullHistory, webview);
          } else if (provider === 'groq') {
            await this._sendViaGroq(fullHistory, webview);
          }
        } catch (err: unknown) {
          const errorMsg = err instanceof Error ? err.message : String(err);
          if (errorMsg.includes('Cancelled') || errorMsg.includes('AbortError') || errorMsg.includes('canceled')) {
            webview.postMessage({ type: 'chat:done', done: true });
          } else {
            webview.postMessage({ type: 'chat:error', error: errorMsg });
          }
        }
        break;
      }

      case 'chat:cancel': {
        this._cancellationTokenSource?.cancel();
        this._abortController?.abort();
        break;
      }

      case 'chat:setApiKey': {
        if (message.provider && message.key) {
          const secretKey = `powerbiMcpAec.${message.provider}ApiKey`;
          await this.context.secrets.store(secretKey, message.key);
          webview.postMessage({ type: 'chat:apiKeySet', provider: message.provider, success: true });
        }
        break;
      }

      case 'chat:deleteApiKey': {
        if (message.provider) {
          const secretKey = `powerbiMcpAec.${message.provider}ApiKey`;
          await this.context.secrets.delete(secretKey);
          webview.postMessage({ type: 'chat:apiKeySet', provider: message.provider, success: true });
        }
        break;
      }
    }
  }

  private _buildSystemPrompt(): string {
    const vsConfig = vscode.workspace.getConfiguration('powerbiMcpAec');
    const modelIds = vsConfig.get<string[]>('connection.defaultSemanticModelIds', []);
    const xmlaEndpoint = vsConfig.get<string>('connection.xmlaEndpoint', '');

    return `You are a Power BI expert assistant integrated into the PowerBi MCP AeC VS Code extension.
Current workspace context:
- Semantic Model IDs: ${modelIds.length > 0 ? modelIds.join(', ') : 'none configured'}
- XMLA Endpoint: ${xmlaEndpoint || 'not configured'}
Provide concise, actionable answers about DAX, Power BI modeling, and data analysis.
When writing DAX, always format it with proper indentation.
Answer in the same language the user uses.`;
  }

  private async _sendViaCopilot(history: ChatMessage[], webview: vscode.Webview): Promise<void> {
    this._cancellationTokenSource = new vscode.CancellationTokenSource();
    const token = this._cancellationTokenSource.token;

    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    if (!models.length) {
      throw new Error('GitHub Copilot não encontrado. Instale a extensão GitHub Copilot no VSCode.');
    }
    const model = models[0];
    const systemPrompt = this._buildSystemPrompt();

    const messages: vscode.LanguageModelChatMessage[] = [
      vscode.LanguageModelChatMessage.User(
        `[CONTEXT]\n${systemPrompt}\n\n[INSTRUCTION]\nYou are a Power BI assistant. Answer the user below.`
      ),
      vscode.LanguageModelChatMessage.Assistant('Understood. I am your Power BI expert assistant.'),
      ...history.map(msg =>
        msg.role === 'user'
          ? vscode.LanguageModelChatMessage.User(msg.content)
          : vscode.LanguageModelChatMessage.Assistant(msg.content)
      )
    ];

    const response = await model.sendRequest(messages, {}, token);

    for await (const chunk of response.stream) {
      if (chunk instanceof vscode.LanguageModelTextPart) {
        webview.postMessage({ type: 'chat:chunk', text: chunk.value, done: false });
      }
    }
    webview.postMessage({ type: 'chat:done', done: true });
  }

  private async _sendViaGemini(history: ChatMessage[], webview: vscode.Webview): Promise<void> {
    const apiKey = await this.context.secrets.get('powerbiMcpAec.geminiApiKey');
    if (!apiKey) {
      throw new Error('Chave da API Gemini não configurada. Configure-a no painel de Chat IA ou via comando "PowerBi MCP AeC: Configurar Chave API Gemini".');
    }

    this._abortController = new AbortController();
    const systemPrompt = this._buildSystemPrompt();

    const contents = history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }));

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse&key=${apiKey}`;

    const response = await axios.post(
      url,
      {
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        generationConfig: { maxOutputTokens: 2048 }
      },
      {
        responseType: 'stream',
        headers: { 'Content-Type': 'application/json' },
        signal: this._abortController.signal
      }
    );

    let buffer = '';
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const json = JSON.parse(line.slice(6));
            const text = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) {
              webview.postMessage({ type: 'chat:chunk', text, done: false });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }
    webview.postMessage({ type: 'chat:done', done: true });
  }

  private async _sendViaGroq(history: ChatMessage[], webview: vscode.Webview): Promise<void> {
    const apiKey = await this.context.secrets.get('powerbiMcpAec.groqApiKey');
    if (!apiKey) {
      throw new Error('Chave da API Groq não configurada. Configure-a no painel de Chat IA ou via comando "PowerBi MCP AeC: Configurar Chave API Groq".');
    }

    this._abortController = new AbortController();
    const systemPrompt = this._buildSystemPrompt();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...history.map(msg => ({ role: msg.role, content: msg.content }))
    ];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama-3.3-70b-versatile',
        messages,
        stream: true,
        max_tokens: 2048
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        responseType: 'stream',
        signal: this._abortController.signal
      }
    );

    let buffer = '';
    for await (const chunk of response.data) {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6).trim();
          if (payload === '[DONE]') continue;
          try {
            const json = JSON.parse(payload);
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              webview.postMessage({ type: 'chat:chunk', text: delta, done: false });
            }
          } catch {
            // skip malformed lines
          }
        }
      }
    }
    webview.postMessage({ type: 'chat:done', done: true });
  }

  private _getHtml(webview: vscode.Webview): string {
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chatPanel.css')
    );
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'chatPanel.js')
    );
    const nonce = this._getNonce();
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>Chat IA</title>
</head>
<body>
<div id="chat-app">

  <div class="chat-header">
    <span class="chat-title">&#x1F4AC; Chat IA</span>
    <select id="provider-select" class="provider-select" title="Selecionar provedor de IA">
      <option value="copilot">Copilot</option>
      <option value="gemini">Gemini</option>
      <option value="groq">Groq (Llama)</option>
    </select>
    <button id="btn-clear" class="btn-icon" title="Limpar hist&#xF3;rico">&#x1F5D1;</button>
  </div>

  <div class="chat-messages" id="chat-messages">
    <div class="empty-state" id="empty-state">
      <div class="empty-icon">&#x1F4CA;</div>
      <p>Pergunte sobre DAX, modelos sem&#xE2;nticos ou Power BI.</p>
      <p class="hint">O contexto do workspace &#xE9; injetado automaticamente.</p>
    </div>
  </div>

  <div class="chat-input-area">
    <div class="input-row">
      <textarea id="chat-input"
                placeholder="Pergunte algo... (Enter envia, Shift+Enter nova linha)"
                rows="1"></textarea>
      <button id="btn-send" class="btn-send" title="Enviar">&#x27A4;</button>
    </div>
    <div class="provider-status" id="provider-status"></div>
  </div>

  <details class="api-key-section">
    <summary class="section-header">&#x1F511; Chaves de API</summary>
    <div class="api-key-content">
      <div class="form-group">
        <label>Gemini API Key
          <span class="key-status" id="gemini-key-status"></span>
        </label>
        <div class="key-row">
          <input type="password" id="gemini-api-key" placeholder="AIza..." autocomplete="off">
          <button id="btn-save-gemini" class="btn-secondary">Salvar</button>
          <button id="btn-delete-gemini" class="btn-icon" title="Remover chave">&#x2715;</button>
        </div>
        <a class="hint-link" href="https://aistudio.google.com/app/apikey" target="_blank">Obter chave gratuita &rarr;</a>
      </div>
      <div class="form-group">
        <label>Groq API Key
          <span class="key-status" id="groq-key-status"></span>
        </label>
        <div class="key-row">
          <input type="password" id="groq-api-key" placeholder="gsk_..." autocomplete="off">
          <button id="btn-save-groq" class="btn-secondary">Salvar</button>
          <button id="btn-delete-groq" class="btn-icon" title="Remover chave">&#x2715;</button>
        </div>
        <a class="hint-link" href="https://console.groq.com/keys" target="_blank">Obter chave gratuita &rarr;</a>
      </div>
      <p class="hint">Copilot n&#xE3;o requer chave &mdash; usa o GitHub Copilot instalado no VSCode.</p>
    </div>
  </details>

</div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}
