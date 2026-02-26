import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'calculation_group_operations',
  description: 'Gerencia grupos de cálculo e itens de cálculo no modelo semântico do Power BI.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'create', 'update', 'delete', 'add_item', 'update_item', 'delete_item'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA' },
      databaseName: { type: 'string', description: 'Nome do banco de dados' },
      groupName: { type: 'string', description: 'Nome do grupo de cálculo (tabela de cálculo)' },
      itemName: { type: 'string', description: 'Nome do item de cálculo' },
      definition: {
        type: 'object',
        description: 'Definição do grupo ou item de cálculo',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          expression: { type: 'string', description: 'Expressão DAX do item de cálculo' },
          ordinal: { type: 'number', description: 'Ordem do item no grupo' },
          formatStringDefinition: { type: 'string', description: 'DAX de format string dinâmica' }
        }
      }
    },
    required: ['operation', 'xmlaEndpoint', 'databaseName']
  }
};

export async function handler(
  args: {
    operation: string;
    xmlaEndpoint: string;
    databaseName: string;
    groupName?: string;
    itemName?: string;
    definition?: Record<string, unknown>;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list': {
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_CALCULATION_GROUPS',
          restrictions: { DatabaseName: args.databaseName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.definition) throw new Error('definition é obrigatório para criar grupo de cálculo');
      // Calculation groups are implemented as tables with a special flag
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, table: args.definition.name },
          table: {
            name: args.definition.name,
            description: args.definition.description,
            calculationGroup: { precedence: 0 },
            columns: [{ name: 'Name', dataType: 'string', sourceColumn: 'Name' }],
            partitions: [{
              name: 'Partition',
              source: { type: 'calculated', expression: '{ "" }' }
            }]
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'create', group: args.definition.name, status: 'created' };
    }

    case 'add_item': {
      if (!args.groupName || !args.definition) throw new Error('groupName e definition são obrigatórios');
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, table: args.groupName, calculationItem: args.definition.name },
          calculationItem: {
            name: args.definition.name,
            expression: args.definition.expression,
            ordinal: args.definition.ordinal ?? 0,
            description: args.definition.description
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'add_item', group: args.groupName, item: args.definition.name, status: 'created' };
    }

    case 'delete': {
      if (!args.groupName) throw new Error('groupName é obrigatório');
      const tmsl = { delete: { object: { database: args.databaseName, table: args.groupName } } };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', group: args.groupName, status: 'deleted' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
