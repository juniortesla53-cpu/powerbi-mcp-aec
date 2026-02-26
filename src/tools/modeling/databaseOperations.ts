import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'database_operations',
  description: 'Lista, cria, exclui e gerencia bancos de dados/modelos semânticos no workspace do Power BI/Fabric.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'get', 'create', 'delete', 'refresh', 'get_refresh_history', 'deploy'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA do workspace' },
      workspaceId: { type: 'string', description: 'ID do workspace Power BI' },
      semanticModelId: { type: 'string', description: 'ID do modelo semântico (para get, delete, refresh)' },
      databaseName: { type: 'string', description: 'Nome do banco de dados (para operações XMLA)' },
      databaseDefinition: {
        type: 'object',
        description: 'Definição TMSL do banco de dados (para create)',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          compatibilityLevel: { type: 'number', description: 'Nível de compatibilidade (ex: 1605)' }
        }
      }
    },
    required: ['operation']
  }
};

export async function handler(
  args: {
    operation: string;
    xmlaEndpoint?: string;
    workspaceId?: string;
    semanticModelId?: string;
    databaseName?: string;
    databaseDefinition?: Record<string, unknown>;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list': {
      const datasets = await client.listDatasets(args.workspaceId);
      return {
        operation: 'list',
        count: datasets.length,
        databases: datasets.map((d: Record<string, unknown>) => ({
          id: d.id,
          name: d.name,
          isRefreshable: d.isRefreshable,
          configuredBy: d.configuredBy,
          webUrl: d.webUrl
        }))
      };
    }

    case 'get': {
      if (!args.semanticModelId) throw new Error('semanticModelId é obrigatório para get');
      const dataset = await client.getDataset(args.semanticModelId);
      return { operation: 'get', database: dataset };
    }

    case 'create': {
      if (!args.xmlaEndpoint || !args.databaseDefinition) {
        throw new Error('xmlaEndpoint e databaseDefinition são obrigatórios para create');
      }
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseDefinition.name },
          database: {
            compatibilityLevel: 1605,
            ...args.databaseDefinition
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'create', database: args.databaseDefinition.name, status: 'created' };
    }

    case 'refresh': {
      if (!args.semanticModelId) throw new Error('semanticModelId é obrigatório para refresh');
      await client.refreshDataset(args.semanticModelId, args.workspaceId);
      return {
        operation: 'refresh',
        semanticModelId: args.semanticModelId,
        status: 'refresh_started',
        message: 'Refresh iniciado. Use get_refresh_history para acompanhar o status.'
      };
    }

    case 'get_refresh_history': {
      if (!args.semanticModelId) throw new Error('semanticModelId é obrigatório');
      const history = await client.getRefreshHistory(args.semanticModelId, args.workspaceId);
      return { operation: 'get_refresh_history', refreshes: history };
    }

    case 'delete': {
      if (!args.xmlaEndpoint || !args.databaseName) {
        throw new Error('xmlaEndpoint e databaseName são obrigatórios para delete');
      }
      const tmsl = { delete: { object: { database: args.databaseName } } };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', database: args.databaseName, status: 'deleted' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
