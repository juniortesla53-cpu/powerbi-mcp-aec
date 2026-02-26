import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'relationship_operations',
  description: 'Cria, atualiza, lista e exclui relacionamentos entre tabelas em um modelo semântico do Power BI.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'create', 'update', 'delete', 'activate', 'deactivate'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA do workspace' },
      databaseName: { type: 'string', description: 'Nome do banco de dados/modelo' },
      relationshipName: { type: 'string', description: 'Nome do relacionamento (para update/delete/activate/deactivate)' },
      relationshipDefinition: {
        type: 'object',
        description: 'Definição do relacionamento',
        properties: {
          name: { type: 'string', description: 'Nome único do relacionamento' },
          fromTable: { type: 'string', description: 'Tabela de origem (lado "muitos")' },
          fromColumn: { type: 'string', description: 'Coluna de origem' },
          toTable: { type: 'string', description: 'Tabela de destino (lado "um")' },
          toColumn: { type: 'string', description: 'Coluna de destino' },
          crossFilteringBehavior: {
            type: 'string',
            enum: ['oneDirection', 'bothDirections', 'automatic'],
            description: 'Direção do filtro cruzado. Padrão: oneDirection'
          },
          isActive: { type: 'boolean', description: 'Relacionamento ativo. Padrão: true' },
          joinOnDateBehavior: {
            type: 'string',
            enum: ['dateAndTime', 'datePartOnly'],
            description: 'Comportamento de junção em colunas de data'
          }
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
    relationshipName?: string;
    relationshipDefinition?: Record<string, unknown>;
  },
  client: PowerBiClient
): Promise<unknown> {
  if (!args.xmlaEndpoint || !args.databaseName) {
    throw new Error('xmlaEndpoint e databaseName são obrigatórios para todas as operações de relacionamento');
  }

  switch (args.operation) {
    case 'list': {
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_RELATIONSHIPS',
          restrictions: { DatabaseName: args.databaseName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.relationshipDefinition) throw new Error('relationshipDefinition é obrigatório');
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, relationship: args.relationshipDefinition.name },
          relationship: {
            isActive: true,
            crossFilteringBehavior: 'oneDirection',
            ...args.relationshipDefinition
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return {
        operation: 'create',
        relationship: args.relationshipDefinition.name,
        from: `${args.relationshipDefinition.fromTable}[${args.relationshipDefinition.fromColumn}]`,
        to: `${args.relationshipDefinition.toTable}[${args.relationshipDefinition.toColumn}]`,
        status: 'created'
      };
    }

    case 'update': {
      if (!args.relationshipName || !args.relationshipDefinition) {
        throw new Error('relationshipName e relationshipDefinition são obrigatórios');
      }
      const tmsl = {
        alter: {
          object: { database: args.databaseName, relationship: args.relationshipName },
          relationship: args.relationshipDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'update', relationship: args.relationshipName, status: 'updated' };
    }

    case 'delete': {
      if (!args.relationshipName) throw new Error('relationshipName é obrigatório');
      const tmsl = {
        delete: {
          object: { database: args.databaseName, relationship: args.relationshipName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', relationship: args.relationshipName, status: 'deleted' };
    }

    case 'activate': {
      if (!args.relationshipName) throw new Error('relationshipName é obrigatório');
      const tmsl = {
        alter: {
          object: { database: args.databaseName, relationship: args.relationshipName },
          relationship: { isActive: true }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'activate', relationship: args.relationshipName, status: 'activated' };
    }

    case 'deactivate': {
      if (!args.relationshipName) throw new Error('relationshipName é obrigatório');
      const tmsl = {
        alter: {
          object: { database: args.databaseName, relationship: args.relationshipName },
          relationship: { isActive: false }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'deactivate', relationship: args.relationshipName, status: 'deactivated' };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
