import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'connection_operations',
  description: 'Gerencia conexões com Power BI Desktop, workspace Fabric ou arquivo PBIP. Liste workspaces, obtenha informações de conexão e verifique a conectividade.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list_workspaces', 'list_datasets', 'get_dataset_info', 'test_connection'],
        description: 'Operação a executar'
      },
      workspaceId: {
        type: 'string',
        description: 'ID do workspace (para list_datasets e operações de workspace específico)'
      },
      datasetId: {
        type: 'string',
        description: 'ID do dataset/modelo semântico (para get_dataset_info)'
      }
    },
    required: ['operation']
  }
};

export async function handler(
  args: { operation: string; workspaceId?: string; datasetId?: string },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list_workspaces': {
      const workspaces = await client.listWorkspaces();
      return {
        operation: 'list_workspaces',
        count: workspaces.length,
        workspaces: workspaces.map((w: Record<string, unknown>) => ({
          id: w.id,
          name: w.name,
          type: w.type,
          isReadOnly: w.isReadOnly
        }))
      };
    }

    case 'list_datasets': {
      const datasets = await client.listDatasets(args.workspaceId);
      return {
        operation: 'list_datasets',
        workspaceId: args.workspaceId || 'my_workspace',
        count: datasets.length,
        datasets: datasets.map((d: Record<string, unknown>) => ({
          id: d.id,
          name: d.name,
          configuredBy: d.configuredBy,
          isRefreshable: d.isRefreshable,
          webUrl: d.webUrl
        }))
      };
    }

    case 'get_dataset_info': {
      if (!args.datasetId) throw new Error('datasetId é obrigatório para get_dataset_info');
      const dataset = await client.getDataset(args.datasetId);
      return { operation: 'get_dataset_info', dataset };
    }

    case 'test_connection': {
      // Try to list datasets as a connection test
      await client.listDatasets();
      return {
        operation: 'test_connection',
        status: 'connected',
        message: 'Conexão com Power BI REST API estabelecida com sucesso'
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
