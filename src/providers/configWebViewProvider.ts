import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ALL_TOOLS } from '../config/toolConfig.js';
import { PERMISSION_PROFILES } from '../config/permissionsManager.js';
import { WebViewMessage, ConfigUpdatePayload } from '../types/index.js';

// ============================================================
// Configuration WebView Provider
// Renders the configuration panel in the VS Code sidebar
// ============================================================

export class ConfigWebViewProvider implements vscode.WebviewViewProvider {
  private _view?: vscode.WebviewView;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly _getServerStatus: () => string = () => 'stopped'
  ) {}

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'media')
      ]
    };

    webviewView.webview.html = this._getHtml(webviewView.webview);

    // Handle messages from the WebView
    webviewView.webview.onDidReceiveMessage(
      (message: WebViewMessage) => this._handleMessage(message, webviewView.webview),
      undefined,
      this.context.subscriptions
    );
  }

  refresh() {
    if (this._view) {
      this._view.webview.html = this._getHtml(this._view.webview);
    }
  }

  postStatusUpdate(serverStatus: string) {
    if (this._view) {
      this._view.webview.postMessage({ type: 'statusUpdate', payload: { serverStatus } });
    }
  }

  private _handleMessage(message: WebViewMessage, webview: vscode.Webview) {
    const vsConfig = vscode.workspace.getConfiguration('powerbiMcpAec');

    switch (message.type) {
      case 'getConfig': {
        // Send current config to WebView
        const configData: Record<string, unknown> = {};
        for (const tool of ALL_TOOLS) {
          configData[tool.configKey] = vsConfig.get<boolean>(tool.configKey, tool.defaultEnabled);
        }
        configData['auth.tenantId'] = vsConfig.get('auth.tenantId', '');
        configData['auth.clientId'] = vsConfig.get('auth.clientId', 'ea0616ba-638b-4df5-95b9-636659ae5121');
        configData['auth.method'] = vsConfig.get('auth.method', 'interactive');
        configData['connection.xmlaEndpoint'] = vsConfig.get('connection.xmlaEndpoint', '');
        configData['connection.defaultSemanticModelIds'] = vsConfig.get('connection.defaultSemanticModelIds', []);
        configData['server.readOnly'] = vsConfig.get('server.readOnly', false);
        configData['server.requireConfirmation'] = vsConfig.get('server.requireConfirmation', true);
        configData['server.autoStart'] = vsConfig.get('server.autoStart', true);
        configData['profiles'] = PERMISSION_PROFILES.map(p => ({ name: p.name, description: p.description }));

        webview.postMessage({ type: 'configUpdated', payload: configData });
        webview.postMessage({ type: 'statusUpdate', payload: { serverStatus: this._getServerStatus() } });
        break;
      }

      case 'updateConfig': {
        const payload = message.payload as ConfigUpdatePayload;
        vsConfig.update(
          payload.section,
          payload.value,
          vscode.ConfigurationTarget.Global
        );
        break;
      }

      case 'startServer': {
        vscode.commands.executeCommand('powerbiMcpAec.startServer');
        break;
      }

      case 'stopServer': {
        vscode.commands.executeCommand('powerbiMcpAec.stopServer');
        break;
      }

      case 'restartServer': {
        vscode.commands.executeCommand('powerbiMcpAec.restartServer');
        break;
      }

      case 'clearToken': {
        vscode.commands.executeCommand('powerbiMcpAec.clearToken');
        break;
      }

      case 'authenticate': {
        vscode.env.openExternal(
          vscode.Uri.parse('https://login.microsoftonline.com/')
        );
        break;
      }
    }
  }

  private _getUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
    return webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', ...pathSegments)
    );
  }

  private _getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const styleUri = this._getUri(webview, 'configPanel.css');
    const scriptUri = this._getUri(webview, 'configPanel.js');

    // Serialize tool definitions for the WebView
    const toolsJson = JSON.stringify(
      ALL_TOOLS.map(t => ({
        id: t.id,
        configKey: t.configKey,
        name: t.name,
        description: t.description,
        category: t.category,
        defaultEnabled: t.defaultEnabled,
        isDestructive: t.isDestructive,
        isAdvanced: t.isAdvanced
      }))
    );

    const profilesJson = JSON.stringify(
      PERMISSION_PROFILES.map(p => ({ name: p.name, description: p.description, state: p.toolsState }))
    );

    return /* html */`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${styleUri}">
  <title>PowerBi MCP AeC</title>
</head>
<body>
  <div id="app">
    <!-- Header -->
    <div class="header">
      <div class="header-title">
        <span class="logo">⚡</span>
        <span>PowerBi MCP <strong>AeC</strong></span>
      </div>
      <div id="server-badge" class="badge badge-stopped">● Parado</div>
    </div>

    <!-- Server Controls -->
    <section class="section">
      <div class="section-header">Servidor MCP</div>
      <div class="controls-row">
        <button id="btn-start" class="btn btn-primary" title="Iniciar servidor">▶ Iniciar</button>
        <button id="btn-stop" class="btn btn-secondary" title="Parar servidor">■ Parar</button>
        <button id="btn-restart" class="btn btn-secondary" title="Reiniciar servidor">↺ Reiniciar</button>
      </div>
      <label class="checkbox-row">
        <input type="checkbox" id="autoStart" data-key="server.autoStart">
        <span>Iniciar automaticamente com o VS Code</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="readOnly" data-key="server.readOnly">
        <span class="danger-label">🔒 Modo somente leitura (bloqueia modificações)</span>
      </label>
      <label class="checkbox-row">
        <input type="checkbox" id="requireConfirmation" data-key="server.requireConfirmation">
        <span>Solicitar confirmação em operações destrutivas</span>
      </label>
    </section>

    <!-- Permission Profiles -->
    <section class="section">
      <div class="section-header">Perfis de Permissão</div>
      <div class="profiles-grid" id="profiles-grid">
        <!-- Rendered by JS -->
      </div>
    </section>

    <!-- Tools Configuration -->
    <section class="section">
      <div class="section-header">
        Ferramentas
        <span id="tools-count" class="count-badge">0/0</span>
      </div>

      <!-- Remote Tools -->
      <div class="category-header">
        <span class="category-icon">☁️</span> Consulta Remota
        <button class="toggle-all-btn" data-category="remote" data-state="1">Desabilitar Todos</button>
      </div>
      <div id="tools-remote" class="tools-list"></div>

      <!-- Modeling Tools -->
      <div class="category-header">
        <span class="category-icon">🔧</span> Modelagem
        <button class="toggle-all-btn" data-category="modeling" data-state="1">Desabilitar Todos</button>
      </div>
      <div id="tools-modeling" class="tools-list"></div>
    </section>

    <!-- Authentication -->
    <section class="section">
      <div class="section-header">Autenticação</div>
      <div class="form-group">
        <label>Método</label>
        <select id="auth-method" data-key="auth.method">
          <option value="interactive">Interativo (browser)</option>
          <option value="deviceCode">Código de dispositivo</option>
          <option value="clientCredentials">Service Principal</option>
        </select>
      </div>
      <div class="form-group">
        <label>Tenant ID <span class="hint">(deixe vazio para conta pessoal)</span></label>
        <input type="text" id="auth-tenantId" data-key="auth.tenantId" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx">
      </div>
      <div class="form-group">
        <label>Client ID</label>
        <input type="text" id="auth-clientId" data-key="auth.clientId">
      </div>
      <div class="form-group" id="secret-group" style="display:none">
        <label>Client Secret</label>
        <input type="password" id="auth-clientSecret" data-key="auth.clientSecret" placeholder="••••••••">
      </div>
      <button id="btn-clear-token" class="btn btn-secondary btn-full">🗑 Limpar Token em Cache</button>
    </section>

    <!-- Connection Settings -->
    <section class="section">
      <div class="section-header">Conexão</div>
      <div class="form-group">
        <label>Endpoint XMLA <span class="hint">(para modelagem)</span></label>
        <input type="text" id="xmla-endpoint" data-key="connection.xmlaEndpoint"
          placeholder="powerbi://api.powerbi.com/v1.0/myorg/WorkspaceName">
      </div>
      <div class="form-group">
        <label>IDs de Modelos Semânticos</label>
        <textarea id="semantic-model-ids" rows="3" placeholder="Um ID por linha"></textarea>
        <span class="hint">Cole os IDs dos modelos mais usados, um por linha</span>
      </div>
    </section>
  </div>

  <script nonce="${nonce}">
    window.TOOLS_DEFINITIONS = ${toolsJson};
    window.PROFILES_DEFINITIONS = ${profilesJson};
  </script>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
