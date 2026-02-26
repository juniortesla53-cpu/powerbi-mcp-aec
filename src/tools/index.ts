import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from './powerbiClient.js';
import { ToolsState } from '../types/index.js';

// Remote tools
import * as getSemanticModelSchema from './remote/getSemanticModelSchema.js';
import * as generateQuery from './remote/generateQuery.js';
import * as executeQuery from './remote/executeQuery.js';

// Local Power BI Desktop tools
import * as localPbiOperations from './local/localPbiOperations.js';

// Modeling tools
import * as connectionOperations from './modeling/connectionOperations.js';
import * as databaseOperations from './modeling/databaseOperations.js';
import * as tableOperations from './modeling/tableOperations.js';
import * as columnOperations from './modeling/columnOperations.js';
import * as measureOperations from './modeling/measureOperations.js';
import * as relationshipOperations from './modeling/relationshipOperations.js';
import * as daxQueryOperations from './modeling/daxQueryOperations.js';
import * as bulkOperations from './modeling/bulkOperations.js';
import * as securityRoleOperations from './modeling/securityRoleOperations.js';
import * as partitionOperations from './modeling/partitionOperations.js';
import * as calculationGroupOperations from './modeling/calculationGroupOperations.js';
import * as traceOperations from './modeling/traceOperations.js';
import * as cultureOperations from './modeling/cultureOperations.js';

// ============================================================
// Central registry mapping tool ID -> { definition, handler }
// ============================================================

type ToolHandler = (args: Record<string, unknown>, client: PowerBiClient) => Promise<unknown>;

interface ToolEntry {
  definition: Tool;
  handler: ToolHandler;
}

const TOOL_REGISTRY: Record<string, ToolEntry> = {
  local_pbi_operations: {
    definition: localPbiOperations.definition,
    handler: localPbiOperations.handler as ToolHandler
  },
  get_semantic_model_schema: {
    definition: getSemanticModelSchema.definition,
    handler: getSemanticModelSchema.handler as ToolHandler
  },
  generate_query: {
    definition: generateQuery.definition,
    handler: generateQuery.handler as ToolHandler
  },
  execute_query: {
    definition: executeQuery.definition,
    handler: executeQuery.handler as ToolHandler
  },
  connection_operations: {
    definition: connectionOperations.definition,
    handler: connectionOperations.handler as ToolHandler
  },
  database_operations: {
    definition: databaseOperations.definition,
    handler: databaseOperations.handler as ToolHandler
  },
  table_operations: {
    definition: tableOperations.definition,
    handler: tableOperations.handler as ToolHandler
  },
  column_operations: {
    definition: columnOperations.definition,
    handler: columnOperations.handler as ToolHandler
  },
  measure_operations: {
    definition: measureOperations.definition,
    handler: measureOperations.handler as ToolHandler
  },
  relationship_operations: {
    definition: relationshipOperations.definition,
    handler: relationshipOperations.handler as ToolHandler
  },
  dax_query_operations: {
    definition: daxQueryOperations.definition,
    handler: daxQueryOperations.handler as ToolHandler
  },
  bulk_operations: {
    definition: bulkOperations.definition,
    handler: bulkOperations.handler as ToolHandler
  },
  security_role_operations: {
    definition: securityRoleOperations.definition,
    handler: securityRoleOperations.handler as ToolHandler
  },
  partition_operations: {
    definition: partitionOperations.definition,
    handler: partitionOperations.handler as ToolHandler
  },
  calculation_group_operations: {
    definition: calculationGroupOperations.definition,
    handler: calculationGroupOperations.handler as ToolHandler
  },
  trace_operations: {
    definition: traceOperations.definition,
    handler: traceOperations.handler as ToolHandler
  },
  culture_operations: {
    definition: cultureOperations.definition,
    handler: cultureOperations.handler as ToolHandler
  }
};

// Get only the enabled tool definitions
export function getEnabledToolDefinitions(toolsState: ToolsState): Tool[] {
  return Object.entries(TOOL_REGISTRY)
    .filter(([id]) => toolsState[id] === true)
    .map(([, entry]) => entry.definition);
}

// Get all tool definitions (regardless of state)
export function getAllToolDefinitions(): Tool[] {
  return Object.values(TOOL_REGISTRY).map(e => e.definition);
}

// Dispatch a tool call
export async function dispatchToolCall(
  toolName: string,
  args: Record<string, unknown>,
  client: PowerBiClient,
  toolsState: ToolsState
): Promise<unknown> {
  const entry = TOOL_REGISTRY[toolName];
  if (!entry) {
    throw new Error(`Ferramenta desconhecida: ${toolName}`);
  }
  if (!toolsState[toolName]) {
    throw new Error(
      `Ferramenta '${toolName}' está desabilitada. Habilite-a nas configurações do PowerBi MCP AeC.`
    );
  }
  return entry.handler(args, client);
}

export { TOOL_REGISTRY };
