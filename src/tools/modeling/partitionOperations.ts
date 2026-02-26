import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'partition_operations',
  description: 'Gerencia partições de tabelas para refresh incremental e otimização de performance no modelo semântico.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'create', 'update', 'delete', 'refresh'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA' },
      databaseName: { type: 'string', description: 'Nome do banco de dados' },
      tableName: { type: 'string', description: 'Nome da tabela' },
      partitionName: { type: 'string', description: 'Nome da partição' },
      partitionDefinition: {
        type: 'object',
        description: 'Definição da partição',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          mode: { type: 'string', enum: ['import', 'directQuery', 'directLake'] },
          source: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['m', 'query', 'calculated'] },
              expression: { type: 'string' }
            }
          }
        }
      }
    },
    required: ['operation', 'xmlaEndpoint', 'databaseName', 'tableName']
  }
};

export async function handler(
  args: {
    operation: string;
    xmlaEndpoint: string;
    databaseName: string;
    tableName: string;
    partitionName?: string;
    partitionDefinition?: Record<string, unknown>;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list': {
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_PARTITIONS',
          restrictions: { DatabaseName: args.databaseName, TableName: args.tableName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.partitionDefinition) throw new Error('partitionDefinition é obrigatório');
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, table: args.tableName, partition: args.partitionDefinition.name },
          partition: args.partitionDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'create', partition: args.partitionDefinition.name, table: args.tableName, status: 'created' };
    }

    case 'delete': {
      if (!args.partitionName) throw new Error('partitionName é obrigatório');
      const tmsl = {
        delete: {
          object: { database: args.databaseName, table: args.tableName, partition: args.partitionName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', partition: args.partitionName, status: 'deleted' };
    }

    case 'refresh': {
      const tmsl = {
        refresh: {
          type: 'full',
          objects: [{
            database: args.databaseName,
            table: args.tableName,
            ...(args.partitionName && { partition: args.partitionName })
          }]
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'refresh', table: args.tableName, partition: args.partitionName, status: 'refresh_started' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
