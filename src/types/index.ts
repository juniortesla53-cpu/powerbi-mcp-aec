// ============================================================
// Types and Interfaces for PowerBi MCP Server AeC
// ============================================================

export type ToolCategory = 'remote' | 'modeling';
export type AuthMethod = 'interactive' | 'deviceCode' | 'clientCredentials';
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error';

// ---- Tool Configuration ----

export interface ToolInfo {
  id: string;
  configKey: string;            // VS Code settings key suffix
  name: string;
  description: string;
  category: ToolCategory;
  defaultEnabled: boolean;
  isDestructive: boolean;       // Can modify / delete model objects
  isAdvanced: boolean;          // Hidden by default in simple mode
}

export interface ToolsState {
  [toolId: string]: boolean;    // toolId -> enabled
}

// ---- Auth Configuration ----

export interface AuthConfig {
  tenantId: string;
  clientId: string;
  method: AuthMethod;
  clientSecret?: string;
}

// ---- Connection Configuration ----

export interface ConnectionConfig {
  defaultSemanticModelIds: string[];
  xmlaEndpoint: string;
}

// ---- Server Configuration (written to config file for MCP server process) ----

export interface ServerConfig {
  tools: ToolsState;
  auth: AuthConfig;
  connection: ConnectionConfig;
  readOnly: boolean;
  requireConfirmation: boolean;
}

// ---- Power BI REST API Types ----

export interface SemanticModel {
  id: string;
  name: string;
  description?: string;
  configuredBy?: string;
  isRefreshable?: boolean;
}

export interface SemanticModelSchema {
  tables: TableSchema[];
  relationships: RelationshipSchema[];
  measures: MeasureSchema[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  measures: MeasureSchema[];
  isHidden?: boolean;
  description?: string;
}

export interface ColumnSchema {
  name: string;
  dataType: string;
  isHidden?: boolean;
  description?: string;
  formatString?: string;
}

export interface MeasureSchema {
  name: string;
  expression: string;
  tableName?: string;
  description?: string;
  formatString?: string;
  isHidden?: boolean;
}

export interface RelationshipSchema {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
  crossFilteringBehavior?: string;
  isActive?: boolean;
}

// ---- DAX Query Types ----

export interface DaxQueryResult {
  results: Array<{
    tables: Array<{
      rows: Record<string, unknown>[];
    }>;
  }>;
}

// ---- Modeling TMSL Types ----

export interface TmslRequest {
  type: 'createOrReplace' | 'create' | 'alter' | 'delete' | 'refresh' | 'sequence';
  object?: TmslObject;
  definition?: Record<string, unknown>;
}

export interface TmslObject {
  database?: string;
  table?: string;
  column?: string;
  measure?: string;
  relationship?: string;
  partition?: string;
  role?: string;
  perspective?: string;
  calculationGroup?: string;
}

// ---- MCP Tool Result ----

export interface McpToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  warnings?: string[];
}

// ---- WebView Messages ----

export interface WebViewMessage {
  type: 'getConfig' | 'updateConfig' | 'startServer' | 'stopServer' | 'restartServer'
      | 'authenticate' | 'clearToken' | 'configUpdated' | 'statusUpdate' | 'error';
  payload?: unknown;
}

export interface ConfigUpdatePayload {
  section: string;
  value: unknown;
}

export interface StatusUpdatePayload {
  serverStatus: ServerStatus;
  isAuthenticated: boolean;
  enabledToolsCount: number;
  totalToolsCount: number;
  error?: string;
}

// ---- Chat Types ----

export type ChatProviderType = 'copilot' | 'gemini' | 'groq';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatWebViewMessage {
  type:
    | 'chat:send'
    | 'chat:cancel'
    | 'chat:getConfig'
    | 'chat:setApiKey'
    | 'chat:deleteApiKey'
    | 'chat:chunk'
    | 'chat:done'
    | 'chat:error'
    | 'chat:configLoaded'
    | 'chat:apiKeySet';
  provider?: ChatProviderType;
  text?: string;
  history?: ChatMessage[];
  key?: string;
  done?: boolean;
  error?: string;
  copilotAvailable?: boolean;
  geminiKeySet?: boolean;
  groqKeySet?: boolean;
  success?: boolean;
}
