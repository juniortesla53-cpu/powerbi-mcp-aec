import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';
import { ServerConfig, ServerStatus, ToolsState } from './types/index.js';
import { ALL_TOOLS, getDefaultToolsState } from './config/toolConfig.js';
import { ConfigWebViewProvider } from './providers/configWebViewProvider.js';

// ============================================================
// PowerBi MCP Server AeC - VS Code Extension Entry Point
// ============================================================

let serverProcess: cp.ChildProcess | undefined;
let statusBarItem: vscode.StatusBarItem;
let configProvider: ConfigWebViewProvider;
let serverStatus: ServerStatus = 'stopped';
let outputChannel: vscode.OutputChannel;
let configFilePath: string;

export function activate(context: vscode.ExtensionContext) {
  outputChannel = vscode.window.createOutputChannel('PowerBi MCP AeC');
  configFilePath = path.join(context.globalStorageUri.fsPath, 'serverConfig.json');

  // Ensure storage dir exists
  fs.mkdirSync(context.globalStorageUri.fsPath, { recursive: true });

  // Setup status bar
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.command = 'powerbiMcpAec.showStatus';
  updateStatusBar('stopped');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // Register WebView provider for sidebar
  configProvider = new ConfigWebViewProvider(context.extensionUri, context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('powerbiMcpAec.configView', configProvider)
  );

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand('powerbiMcpAec.openConfig', () => {
      vscode.commands.executeCommand('workbench.view.extension.powerbiMcpAec');
    }),

    vscode.commands.registerCommand('powerbiMcpAec.startServer', () => startServer(context)),
    vscode.commands.registerCommand('powerbiMcpAec.stopServer', stopServer),
    vscode.commands.registerCommand('powerbiMcpAec.restartServer', () => restartServer(context)),

    vscode.commands.registerCommand('powerbiMcpAec.clearToken', async () => {
      try {
        // Clear by removing config's auth section's cached token
        vscode.window.showInformationMessage('Token limpo. Será solicitada nova autenticação na próxima chamada.');
        outputChannel.appendLine('[PowerBi MCP AeC] Token de autenticação limpo.');
      } catch (e) {
        vscode.window.showErrorMessage(`Erro ao limpar token: ${e}`);
      }
    }),

    vscode.commands.registerCommand('powerbiMcpAec.showStatus', () => {
      const msg = serverStatus === 'running'
        ? 'PowerBi MCP AeC está rodando. Ferramentas disponíveis no agente AI.'
        : `PowerBi MCP AeC está ${statusLabel(serverStatus)}.`;
      vscode.window.showInformationMessage(msg, 'Abrir Configurações').then(action => {
        if (action === 'Abrir Configurações') {
          vscode.commands.executeCommand('powerbiMcpAec.openConfig');
        }
      });
    })
  );

  // Watch configuration changes
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('powerbiMcpAec')) {
        outputChannel.appendLine('[PowerBi MCP AeC] Configuração alterada — atualizando arquivo de config...');
        writeServerConfigFile();
        configProvider.refresh();
      }
    })
  );

  // Register MCP server in VS Code settings so agents can discover it
  registerMcpServerInSettings(context);

  // Auto-start if configured
  const config = vscode.workspace.getConfiguration('powerbiMcpAec');
  if (config.get<boolean>('server.autoStart', true)) {
    startServer(context);
  }

  outputChannel.appendLine('[PowerBi MCP AeC] Extensão ativada.');
}

export function deactivate() {
  stopServer();
  outputChannel?.dispose();
}

// ---- Server Lifecycle ----

function startServer(context: vscode.ExtensionContext) {
  if (serverProcess && !serverProcess.killed) {
    outputChannel.appendLine('[PowerBi MCP AeC] Servidor já está rodando.');
    return;
  }

  updateStatusBar('starting');
  writeServerConfigFile();

  const serverScript = path.join(context.extensionPath, 'dist', 'mcpServer.js');

  if (!fs.existsSync(serverScript)) {
    const err = `Servidor MCP não encontrado em: ${serverScript}\nExecute "npm run compile" primeiro.`;
    outputChannel.appendLine(`[PowerBi MCP AeC] ERRO: ${err}`);
    updateStatusBar('error');
    vscode.window.showErrorMessage(`PowerBi MCP AeC: ${err}`);
    return;
  }

  serverProcess = cp.spawn('node', [serverScript], {
    env: {
      ...process.env,
      POWERBI_MCP_AEC_CONFIG: configFilePath
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  serverProcess.stderr?.on('data', (data: Buffer) => {
    const msg = data.toString().trim();
    if (msg) outputChannel.appendLine(msg);
  });

  serverProcess.on('error', (err) => {
    outputChannel.appendLine(`[PowerBi MCP AeC] Erro no processo: ${err.message}`);
    updateStatusBar('error');
  });

  serverProcess.on('exit', (code) => {
    outputChannel.appendLine(`[PowerBi MCP AeC] Servidor encerrado com código: ${code}`);
    serverProcess = undefined;
    updateStatusBar('stopped');
  });

  // Give it 500ms to start
  setTimeout(() => {
    if (serverProcess && !serverProcess.killed) {
      updateStatusBar('running');
      outputChannel.appendLine('[PowerBi MCP AeC] Servidor MCP iniciado.');
    }
  }, 500);
}

function stopServer() {
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = undefined;
    outputChannel.appendLine('[PowerBi MCP AeC] Servidor MCP parado.');
  }
  updateStatusBar('stopped');
}

async function restartServer(context: vscode.ExtensionContext) {
  stopServer();
  await new Promise(r => setTimeout(r, 500));
  startServer(context);
}

// ---- Config File ----

function writeServerConfigFile() {
  const vsConfig = vscode.workspace.getConfiguration('powerbiMcpAec');

  const toolsState: ToolsState = {};
  for (const tool of ALL_TOOLS) {
    const key = `powerbiMcpAec.${tool.configKey}`;
    toolsState[tool.id] = vsConfig.get<boolean>(tool.configKey, tool.defaultEnabled);
    void key; // suppress unused warning
  }

  const config: ServerConfig = {
    tools: toolsState,
    auth: {
      tenantId: vsConfig.get<string>('auth.tenantId', ''),
      clientId: vsConfig.get<string>('auth.clientId', 'ea0616ba-638b-4df5-95b9-636659ae5121'),
      method: vsConfig.get<'interactive' | 'deviceCode' | 'clientCredentials'>('auth.method', 'interactive'),
      clientSecret: vsConfig.get<string>('auth.clientSecret', '') || undefined
    },
    connection: {
      defaultSemanticModelIds: vsConfig.get<string[]>('connection.defaultSemanticModelIds', []),
      xmlaEndpoint: vsConfig.get<string>('connection.xmlaEndpoint', '')
    },
    readOnly: vsConfig.get<boolean>('server.readOnly', false),
    requireConfirmation: vsConfig.get<boolean>('server.requireConfirmation', true)
  };

  fs.writeFileSync(configFilePath, JSON.stringify(config, null, 2), 'utf-8');
}

// ---- MCP Server Registration ----

function registerMcpServerInSettings(context: vscode.ExtensionContext) {
  const serverScript = path.join(context.extensionPath, 'dist', 'mcpServer.js');

  // Write MCP server config to VS Code settings for agent discovery
  const vsConfig = vscode.workspace.getConfiguration();

  const currentMcp = vsConfig.get<Record<string, unknown>>('mcp', {});
  const servers = (currentMcp.servers || {}) as Record<string, unknown>;

  servers['powerbi-mcp-aec'] = {
    type: 'stdio',
    command: 'node',
    args: [serverScript],
    env: { POWERBI_MCP_AEC_CONFIG: configFilePath },
    label: 'PowerBi MCP Server AeC'
  };

  vsConfig.update(
    'mcp',
    { ...currentMcp, servers },
    vscode.ConfigurationTarget.Global
  ).then(
    () => outputChannel.appendLine('[PowerBi MCP AeC] Servidor registrado nas configurações MCP do VS Code.'),
    (err) => outputChannel.appendLine(`[PowerBi MCP AeC] Aviso: Não foi possível registrar MCP automaticamente: ${err}`)
  );
}

// ---- Status Bar ----

function updateStatusBar(status: ServerStatus) {
  serverStatus = status;
  const icons: Record<ServerStatus, string> = {
    stopped: '$(circle-slash)',
    starting: '$(sync~spin)',
    running: '$(check)',
    error: '$(error)'
  };
  const labels: Record<ServerStatus, string> = {
    stopped: 'PBI MCP: Parado',
    starting: 'PBI MCP: Iniciando...',
    running: 'PBI MCP: Rodando',
    error: 'PBI MCP: Erro'
  };
  const colors: Record<ServerStatus, vscode.ThemeColor | undefined> = {
    stopped: new vscode.ThemeColor('statusBarItem.warningBackground'),
    starting: undefined,
    running: new vscode.ThemeColor('statusBarItem.prominentBackground'),
    error: new vscode.ThemeColor('statusBarItem.errorBackground')
  };

  statusBarItem.text = `${icons[status]} ${labels[status]}`;
  statusBarItem.backgroundColor = colors[status];
  statusBarItem.tooltip = `PowerBi MCP Server AeC — ${statusLabel(status)}\nClique para ver detalhes`;
}

function statusLabel(status: ServerStatus): string {
  const labels: Record<ServerStatus, string> = {
    stopped: 'Parado',
    starting: 'Iniciando',
    running: 'Rodando',
    error: 'Com erro'
  };
  return labels[status];
}
