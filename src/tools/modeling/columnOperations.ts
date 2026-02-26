import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'column_operations',
  description: 'Cria, atualiza, lista e exclui colunas em tabelas do modelo semântico do Power BI via TMSL/XMLA.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete', 'hide', 'unhide', 'update_format'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA do workspace' },
      databaseName: { type: 'string', description: 'Nome do banco de dados/modelo' },
      tableName: { type: 'string', description: 'Nome da tabela' },
      columnName: { type: 'string', description: 'Nome da coluna' },
      columnDefinition: {
        type: 'object',
        description: 'Definição da coluna',
        properties: {
          name: { type: 'string', description: 'Nome da coluna' },
          dataType: {
            type: 'string',
            enum: ['string', 'int64', 'double', 'dateTime', 'decimal', 'boolean', 'binary', 'unknown'],
            description: 'Tipo de dados da coluna'
          },
          sourceColumn: { type: 'string', description: 'Coluna de origem na fonte de dados' },
          expression: { type: 'string', description: 'Expressão DAX (para colunas calculadas)' },
          isHidden: { type: 'boolean', description: 'Ocultar coluna' },
          description: { type: 'string', description: 'Descrição da coluna' },
          formatString: { type: 'string', description: 'Formato de exibição' },
          displayFolder: { type: 'string', description: 'Pasta de exibição' },
          dataCategory: { type: 'string', description: 'Categoria de dados (ex: Address, City, Country)' },
          summarizeBy: {
            type: 'string',
            enum: ['default', 'none', 'sum', 'min', 'max', 'average', 'count', 'distinctCount'],
            description: 'Comportamento de sumarização padrão'
          }
        }
      },
      formatString: { type: 'string', description: 'Novo formato de exibição (para update_format)' }
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
    columnName?: string;
    columnDefinition?: Record<string, unknown>;
    formatString?: string;
  },
  client: PowerBiClient
): Promise<unknown> {
  if (!args.xmlaEndpoint || !args.databaseName) {
    throw new Error('xmlaEndpoint e databaseName são obrigatórios para operações em colunas');
  }
  if (!args.tableName && !['list'].includes(args.operation)) {
    throw new Error('tableName é obrigatório para esta operação');
  }

  switch (args.operation) {
    case 'list': {
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_COLUMNS',
          restrictions: {
            DatabaseName: args.databaseName,
            ...(args.tableName && { TableName: args.tableName })
          }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'get': {
      if (!args.columnName) throw new Error('columnName é obrigatório para get');
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_COLUMNS',
          restrictions: {
            DatabaseName: args.databaseName,
            TableName: args.tableName,
            ExplicitName: args.columnName
          }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.columnDefinition) throw new Error('columnDefinition é obrigatório para create');
      const tmsl = {
        createOrReplace: {
          object: {
            database: args.databaseName,
            table: args.tableName,
            column: args.columnDefinition.name
          },
          column: args.columnDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'create', column: args.columnDefinition.name, table: args.tableName, status: 'created' };
    }

    case 'update': {
      if (!args.columnName || !args.columnDefinition) {
        throw new Error('columnName e columnDefinition são obrigatórios para update');
      }
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName, column: args.columnName },
          column: args.columnDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'update', column: args.columnName, table: args.tableName, status: 'updated' };
    }

    case 'delete': {
      if (!args.columnName) throw new Error('columnName é obrigatório para delete');
      const tmsl = {
        delete: {
          object: { database: args.databaseName, table: args.tableName, column: args.columnName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', column: args.columnName, table: args.tableName, status: 'deleted' };
    }

    case 'hide': {
      if (!args.columnName) throw new Error('columnName é obrigatório para hide');
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName, column: args.columnName },
          column: { isHidden: true }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'hide', column: args.columnName, status: 'hidden' };
    }

    case 'unhide': {
      if (!args.columnName) throw new Error('columnName é obrigatório para unhide');
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName, column: args.columnName },
          column: { isHidden: false }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'unhide', column: args.columnName, status: 'visible' };
    }

    case 'update_format': {
      if (!args.columnName || !args.formatString) {
        throw new Error('columnName e formatString são obrigatórios para update_format');
      }
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName, column: args.columnName },
          column: { formatString: args.formatString }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'update_format', column: args.columnName, formatString: args.formatString, status: 'updated' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
