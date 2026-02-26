import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'culture_operations',
  description: 'Gerencia culturas, localizações e traduções de objetos no modelo semântico do Power BI.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list_cultures', 'add_culture', 'remove_culture', 'add_translation', 'bulk_translate'],
        description: 'Operação de cultura/localização'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA' },
      databaseName: { type: 'string', description: 'Nome do banco de dados' },
      cultureName: { type: 'string', description: 'Nome da cultura (ex: pt-BR, en-US, es-ES)' },
      translations: {
        type: 'array',
        description: 'Traduções para bulk_translate',
        items: {
          type: 'object',
          properties: {
            objectType: { type: 'string', enum: ['table', 'column', 'measure', 'hierarchy'] },
            tableName: { type: 'string' },
            objectName: { type: 'string' },
            caption: { type: 'string', description: 'Tradução da legenda/nome' },
            description: { type: 'string', description: 'Tradução da descrição' },
            displayFolder: { type: 'string', description: 'Tradução da pasta de exibição' }
          },
          required: ['objectType', 'objectName', 'caption']
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
    cultureName?: string;
    translations?: Array<{
      objectType: string;
      tableName?: string;
      objectName: string;
      caption: string;
      description?: string;
      displayFolder?: string;
    }>;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list_cultures': {
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_CULTURES',
          restrictions: { DatabaseName: args.databaseName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'add_culture': {
      if (!args.cultureName) throw new Error('cultureName é obrigatório');
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, culture: args.cultureName },
          culture: { name: args.cultureName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'add_culture', culture: args.cultureName, status: 'added' };
    }

    case 'remove_culture': {
      if (!args.cultureName) throw new Error('cultureName é obrigatório');
      const tmsl = { delete: { object: { database: args.databaseName, culture: args.cultureName } } };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'remove_culture', culture: args.cultureName, status: 'removed' };
    }

    case 'bulk_translate': {
      if (!args.cultureName || !args.translations?.length) {
        throw new Error('cultureName e translations são obrigatórios para bulk_translate');
      }
      return {
        operation: 'bulk_translate',
        culture: args.cultureName,
        count: args.translations.length,
        message: 'Traduções processadas. Use TMSL para aplicar as traduções no modelo via alter operations.',
        translations: args.translations
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
