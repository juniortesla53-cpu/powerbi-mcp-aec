import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'measure_operations',
  description:
    'Cria, atualiza, lista, exclui e documenta medidas DAX em um modelo semântico do Power BI. Suporta validação de sintaxe DAX.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete', 'validate_dax', 'document'],
        description: 'Operação a executar'
      },
      semanticModelId: {
        type: 'string',
        description: 'ID do modelo semântico (para operações de leitura via REST API)'
      },
      xmlaEndpoint: {
        type: 'string',
        description: 'Endpoint XMLA (para operações de escrita)'
      },
      databaseName: {
        type: 'string',
        description: 'Nome do banco de dados/modelo'
      },
      tableName: {
        type: 'string',
        description: 'Tabela onde a medida está/será criada'
      },
      measureName: {
        type: 'string',
        description: 'Nome da medida'
      },
      measureDefinition: {
        type: 'object',
        description: 'Definição da medida',
        properties: {
          name: { type: 'string', description: 'Nome da medida' },
          expression: { type: 'string', description: 'Expressão DAX da medida' },
          description: { type: 'string', description: 'Descrição da medida' },
          formatString: { type: 'string', description: 'Formato de exibição (ex: #,##0.00, 0.00%)' },
          isHidden: { type: 'boolean', description: 'Ocultar medida' },
          displayFolder: { type: 'string', description: 'Pasta de exibição' }
        }
      },
      daxExpression: {
        type: 'string',
        description: 'Expressão DAX para validar (para validate_dax)'
      }
    },
    required: ['operation']
  }
};

export async function handler(
  args: {
    operation: string;
    semanticModelId?: string;
    xmlaEndpoint?: string;
    databaseName?: string;
    tableName?: string;
    measureName?: string;
    measureDefinition?: Record<string, unknown>;
    daxExpression?: string;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list': {
      if (!args.xmlaEndpoint || !args.databaseName) {
        throw new Error('xmlaEndpoint e databaseName são obrigatórios para listar medidas');
      }
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_MEASURES',
          restrictions: {
            DatabaseName: args.databaseName,
            ...(args.tableName && { TableName: args.tableName })
          }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'get': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.measureName) {
        throw new Error('xmlaEndpoint, databaseName e measureName são obrigatórios');
      }
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_MEASURES',
          restrictions: { DatabaseName: args.databaseName, MeasureName: args.measureName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.tableName || !args.measureDefinition) {
        throw new Error('xmlaEndpoint, databaseName, tableName e measureDefinition são obrigatórios');
      }
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, table: args.tableName, measure: args.measureDefinition.name },
          measure: args.measureDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return {
        operation: 'create',
        measure: args.measureDefinition.name,
        table: args.tableName,
        status: 'created'
      };
    }

    case 'update': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.tableName || !args.measureName || !args.measureDefinition) {
        throw new Error('xmlaEndpoint, databaseName, tableName, measureName e measureDefinition são obrigatórios');
      }
      const tmsl = {
        alter: {
          object: { database: args.databaseName, table: args.tableName, measure: args.measureName },
          measure: args.measureDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'update', measure: args.measureName, status: 'updated' };
    }

    case 'delete': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.tableName || !args.measureName) {
        throw new Error('xmlaEndpoint, databaseName, tableName e measureName são obrigatórios');
      }
      const tmsl = {
        delete: {
          object: { database: args.databaseName, table: args.tableName, measure: args.measureName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', measure: args.measureName, status: 'deleted' };
    }

    case 'validate_dax': {
      if (!args.daxExpression) throw new Error('daxExpression é obrigatório para validate_dax');
      // Use a simple EVALUATE to test DAX syntax
      if (!args.semanticModelId) throw new Error('semanticModelId é obrigatório para validate_dax');
      try {
        const testQuery = `EVALUATE ROW("test", ${args.daxExpression})`;
        await client.executeQuery(args.semanticModelId, testQuery);
        return { operation: 'validate_dax', valid: true, expression: args.daxExpression };
      } catch (e) {
        return {
          operation: 'validate_dax',
          valid: false,
          expression: args.daxExpression,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    }

    case 'document': {
      // Generate documentation for a measure
      if (!args.xmlaEndpoint || !args.databaseName) {
        throw new Error('xmlaEndpoint e databaseName são obrigatórios');
      }
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_MEASURES',
          restrictions: {
            DatabaseName: args.databaseName,
            ...(args.tableName && { TableName: args.tableName }),
            ...(args.measureName && { MeasureName: args.measureName })
          }
        }
      };
      const measuresData = await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return {
        operation: 'document',
        message: 'Documentação gerada — use o AI para enriquecer as descrições das medidas abaixo',
        measures: measuresData
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
