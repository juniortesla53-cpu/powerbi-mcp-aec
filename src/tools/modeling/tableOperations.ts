import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'table_operations',
  description: 'Cria, atualiza, lista e exclui tabelas em um modelo semântico do Power BI via TMSL/XMLA.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete', 'hide', 'unhide'],
        description: 'Operação a executar na tabela'
      },
      xmlaEndpoint: {
        type: 'string',
        description: 'Endpoint XMLA do workspace (ex: powerbi://api.powerbi.com/v1.0/myorg/WorkspaceName)'
      },
      databaseName: {
        type: 'string',
        description: 'Nome do banco de dados/modelo semântico'
      },
      tableName: {
        type: 'string',
        description: 'Nome da tabela (obrigatório para get, update, delete, hide, unhide)'
      },
      tableDefinition: {
        type: 'object',
        description: 'Definição TMSL da tabela (para create e update)',
        properties: {
          name: { type: 'string', description: 'Nome da tabela' },
          description: { type: 'string', description: 'Descrição da tabela' },
          isHidden: { type: 'boolean', description: 'Ocultar tabela' },
          dataCategory: { type: 'string', description: 'Categoria de dados (ex: Time)' },
          sourceExpression: { type: 'string', description: 'Expressão M/Power Query para tabela calculada' }
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
    databaseName?: string;
    tableName?: string;
    tableDefinition?: Record<string, unknown>;
  },
  client: PowerBiClient
): Promise<unknown> {
  const requiresXmla = ['create', 'update', 'delete', 'hide', 'unhide'];

  if (requiresXmla.includes(args.operation)) {
    if (!args.xmlaEndpoint) throw new Error('xmlaEndpoint é obrigatório para operações de modificação');
    if (!args.databaseName) throw new Error('databaseName é obrigatório para operações de modificação');
  }

  switch (args.operation) {
    case 'list': {
      if (!args.xmlaEndpoint || !args.databaseName) {
        throw new Error('xmlaEndpoint e databaseName são obrigatórios para listar tabelas');
      }
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_TABLES',
          restrictions: { DatabaseName: args.databaseName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'get': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.tableName) {
        throw new Error('xmlaEndpoint, databaseName e tableName são obrigatórios');
      }
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_TABLES',
          restrictions: { DatabaseName: args.databaseName, TableName: args.tableName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName },
          database: {
            name: args.databaseName,
            model: {
              tables: [args.tableDefinition]
            }
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint!, tmsl);
      return { operation: 'create', table: args.tableDefinition?.name, status: 'created' };
    }

    case 'update': {
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName },
          table: args.tableDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint!, tmsl);
      return { operation: 'update', table: args.tableName, status: 'updated' };
    }

    case 'delete': {
      const tmsl = {
        delete: {
          object: { database: args.databaseName, table: args.tableName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint!, tmsl);
      return { operation: 'delete', table: args.tableName, status: 'deleted' };
    }

    case 'hide': {
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName },
          table: { name: args.tableName, isHidden: true }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint!, tmsl);
      return { operation: 'hide', table: args.tableName, status: 'hidden' };
    }

    case 'unhide': {
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName },
          table: { name: args.tableName, isHidden: false }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint!, tmsl);
      return { operation: 'unhide', table: args.tableName, status: 'visible' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
