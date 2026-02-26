import { ToolInfo, ToolsState, ServerConfig, AuthConfig, ConnectionConfig } from '../types/index.js';

// ============================================================
// Central registry of all available tools
// ============================================================

export const ALL_TOOLS: ToolInfo[] = [
  // ---- Local Power BI Desktop Tools ----
  {
    id: 'local_pbi_operations',
    configKey: 'tools.local.localPbiOperations',
    name: 'Power BI Desktop Local',
    description: 'Detecta e interage com o Power BI Desktop aberto localmente: esquema, tabelas e DAX sem autenticação',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },

  // ---- Remote MCP Tools ----
  {
    id: 'get_semantic_model_schema',
    configKey: 'tools.remote.getSemanticModelSchema',
    name: 'Obter Esquema do Modelo Semântico',
    description: 'Recupera metadados completos do modelo semântico: tabelas, colunas, medidas e relacionamentos',
    category: 'remote',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },
  {
    id: 'generate_query',
    configKey: 'tools.remote.generateQuery',
    name: 'Gerar Consulta DAX',
    description: 'Gera consultas DAX otimizadas a partir de linguagem natural usando o motor Copilot do Power BI',
    category: 'remote',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },
  {
    id: 'execute_query',
    configKey: 'tools.remote.executeQuery',
    name: 'Executar Consulta DAX',
    description: 'Executa uma consulta DAX contra o modelo semântico e retorna os resultados',
    category: 'remote',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },

  // ---- Modeling MCP Tools ----
  {
    id: 'connection_operations',
    configKey: 'tools.modeling.connectionOperations',
    name: 'Operações de Conexão',
    description: 'Conectar/desconectar do Power BI Desktop, workspace Fabric ou arquivo PBIP',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },
  {
    id: 'database_operations',
    configKey: 'tools.modeling.databaseOperations',
    name: 'Operações de Banco de Dados',
    description: 'Listar, criar, deletar e gerenciar bancos de dados/modelos semânticos',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'transaction_operations',
    configKey: 'tools.modeling.transactionOperations',
    name: 'Controle de Transações',
    description: 'Iniciar, confirmar e reverter transações no modelo semântico',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },
  {
    id: 'table_operations',
    configKey: 'tools.modeling.tableOperations',
    name: 'Operações em Tabelas',
    description: 'Criar, atualizar, listar e deletar tabelas no modelo semântico',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'column_operations',
    configKey: 'tools.modeling.columnOperations',
    name: 'Operações em Colunas',
    description: 'Criar, atualizar, listar e deletar colunas e suas propriedades',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'measure_operations',
    configKey: 'tools.modeling.measureOperations',
    name: 'Operações em Medidas',
    description: 'Criar, atualizar, listar e deletar medidas DAX; refatorar e documentar',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'relationship_operations',
    configKey: 'tools.modeling.relationshipOperations',
    name: 'Operações em Relacionamentos',
    description: 'Criar, atualizar, listar e deletar relacionamentos entre tabelas',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'dax_query_operations',
    configKey: 'tools.modeling.daxQueryOperations',
    name: 'Operações DAX',
    description: 'Validar sintaxe DAX, executar queries, analisar performance e otimizar medidas',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: false,
    isAdvanced: false
  },
  {
    id: 'bulk_operations',
    configKey: 'tools.modeling.bulkOperations',
    name: 'Operações em Massa',
    description: 'Renomear, refatorar, traduzir ou documentar centenas de objetos simultaneamente',
    category: 'modeling',
    defaultEnabled: true,
    isDestructive: true,
    isAdvanced: false
  },
  {
    id: 'partition_operations',
    configKey: 'tools.modeling.partitionOperations',
    name: 'Operações em Partições',
    description: 'Gerenciar partições de tabelas para otimização de refresh incremental',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: true,
    isAdvanced: true
  },
  {
    id: 'calculation_group_operations',
    configKey: 'tools.modeling.calculationGroupOperations',
    name: 'Grupos de Cálculo',
    description: 'Criar e gerenciar grupos de cálculo e itens de cálculo',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: true,
    isAdvanced: true
  },
  {
    id: 'security_role_operations',
    configKey: 'tools.modeling.securityRoleOperations',
    name: 'Funções de Segurança (RLS)',
    description: 'Gerenciar funções de segurança e filtros RLS (Row-Level Security)',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: true,
    isAdvanced: true
  },
  {
    id: 'perspective_operations',
    configKey: 'tools.modeling.perspectiveOperations',
    name: 'Perspectivas',
    description: 'Criar e gerenciar perspectivas para simplificar visualização do modelo',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: false,
    isAdvanced: true
  },
  {
    id: 'trace_operations',
    configKey: 'tools.modeling.traceOperations',
    name: 'Rastreamento e Monitoramento',
    description: 'Capturar e analisar eventos do Analysis Services para diagnóstico',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: false,
    isAdvanced: true
  },
  {
    id: 'culture_operations',
    configKey: 'tools.modeling.cultureOperations',
    name: 'Cultura e Localização',
    description: 'Gerenciar traduções e localizações de objetos do modelo',
    category: 'modeling',
    defaultEnabled: false,
    isDestructive: false,
    isAdvanced: true
  }
];

// Map toolId -> ToolInfo for quick lookup
export const TOOL_MAP: Map<string, ToolInfo> = new Map(
  ALL_TOOLS.map(t => [t.id, t])
);

// Build default ToolsState from definitions
export function getDefaultToolsState(): ToolsState {
  const state: ToolsState = {};
  for (const tool of ALL_TOOLS) {
    state[tool.id] = tool.defaultEnabled;
  }
  return state;
}

// Build a ServerConfig from VS Code configuration values
export function buildServerConfig(
  toolsState: ToolsState,
  auth: AuthConfig,
  connection: ConnectionConfig,
  readOnly: boolean,
  requireConfirmation: boolean
): ServerConfig {
  return { tools: toolsState, auth, connection, readOnly, requireConfirmation };
}

// Returns only the enabled tool IDs
export function getEnabledToolIds(toolsState: ToolsState): string[] {
  return Object.entries(toolsState)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);
}
