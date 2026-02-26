import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'bulk_operations',
  description:
    'Executa operações em massa no modelo semântico: renomear, documentar, refatorar ou ocultar centenas de objetos simultaneamente.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['bulk_rename', 'bulk_hide', 'bulk_unhide', 'bulk_document', 'bulk_format_strings', 'apply_naming_convention'],
        description: 'Operação em massa a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA do workspace' },
      databaseName: { type: 'string', description: 'Nome do banco de dados/modelo' },
      objectType: {
        type: 'string',
        enum: ['tables', 'columns', 'measures'],
        description: 'Tipo de objeto alvo da operação em massa'
      },
      renames: {
        type: 'array',
        description: 'Lista de renomeações para bulk_rename',
        items: {
          type: 'object',
          properties: {
            tableName: { type: 'string' },
            objectName: { type: 'string', description: 'Nome atual do objeto' },
            newName: { type: 'string', description: 'Novo nome do objeto' }
          },
          required: ['objectName', 'newName']
        }
      },
      objectPaths: {
        type: 'array',
        description: 'Lista de caminhos de objetos para bulk_hide/unhide (formato: "Tabela.Objeto" ou "Tabela")',
        items: { type: 'string' }
      },
      documentations: {
        type: 'array',
        description: 'Lista de documentações para bulk_document',
        items: {
          type: 'object',
          properties: {
            tableName: { type: 'string' },
            objectName: { type: 'string' },
            description: { type: 'string', description: 'Descrição a adicionar/atualizar' }
          },
          required: ['objectName', 'description']
        }
      },
      namingConvention: {
        type: 'string',
        enum: ['PascalCase', 'camelCase', 'snake_case', 'Title Case', 'UPPER_CASE'],
        description: 'Convenção de nomenclatura para apply_naming_convention'
      },
      formatStrings: {
        type: 'array',
        description: 'Lista de format strings para bulk_format_strings',
        items: {
          type: 'object',
          properties: {
            tableName: { type: 'string' },
            measureName: { type: 'string' },
            formatString: { type: 'string', description: 'Ex: #,##0.00 ou 0.00%' }
          },
          required: ['measureName', 'formatString']
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
    objectType?: string;
    renames?: Array<{ tableName?: string; objectName: string; newName: string }>;
    objectPaths?: string[];
    documentations?: Array<{ tableName?: string; objectName: string; description: string }>;
    namingConvention?: string;
    formatStrings?: Array<{ tableName?: string; measureName: string; formatString: string }>;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'bulk_rename': {
      if (!args.renames?.length) throw new Error('renames é obrigatório para bulk_rename');

      const commands = args.renames.map(r => {
        const obj: Record<string, unknown> = { database: args.databaseName };
        if (r.tableName) {
          if (args.objectType === 'measures') {
            obj.table = r.tableName;
            obj.measure = r.objectName;
          } else if (args.objectType === 'columns') {
            obj.table = r.tableName;
            obj.column = r.objectName;
          } else {
            obj.table = r.objectName;
          }
        }
        return {
          alter: {
            object: obj,
            [args.objectType === 'tables' ? 'table' : args.objectType === 'measures' ? 'measure' : 'column']: { name: r.newName }
          }
        };
      });

      // Execute TMSL sequence
      const tmsl = { sequence: { operations: commands } };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);

      return {
        operation: 'bulk_rename',
        count: args.renames.length,
        renamed: args.renames.map(r => ({ from: r.objectName, to: r.newName })),
        status: 'completed'
      };
    }

    case 'bulk_hide': {
      if (!args.objectPaths?.length) throw new Error('objectPaths é obrigatório para bulk_hide');

      const results = await Promise.allSettled(
        args.objectPaths.map(path => {
          const parts = path.split('.');
          const tableName = parts[0];
          const objName = parts[1];
          const tmsl = objName
            ? { alter: { object: { database: args.databaseName, table: tableName, column: objName }, column: { isHidden: true } } }
            : { alter: { object: { database: args.databaseName, table: tableName }, table: { isHidden: true } } };
          return client.executeTmsl(args.xmlaEndpoint, tmsl);
        })
      );

      const succeeded = results.filter(r => r.status === 'fulfilled').length;
      return { operation: 'bulk_hide', total: args.objectPaths.length, succeeded, failed: results.length - succeeded };
    }

    case 'bulk_document': {
      if (!args.documentations?.length) throw new Error('documentations é obrigatório para bulk_document');

      const commands = args.documentations.map(d => ({
        alter: {
          object: {
            database: args.databaseName,
            ...(d.tableName && { table: d.tableName }),
            ...(args.objectType === 'measures' && { measure: d.objectName }),
            ...(args.objectType === 'columns' && { column: d.objectName }),
            ...(args.objectType === 'tables' && !d.tableName && { table: d.objectName })
          },
          [args.objectType === 'measures' ? 'measure' : args.objectType === 'columns' ? 'column' : 'table']: {
            description: d.description
          }
        }
      }));

      await client.executeTmsl(args.xmlaEndpoint, { sequence: { operations: commands } });
      return {
        operation: 'bulk_document',
        count: args.documentations.length,
        status: 'completed',
        message: `${args.documentations.length} descrições atualizadas com sucesso`
      };
    }

    case 'bulk_format_strings': {
      if (!args.formatStrings?.length) throw new Error('formatStrings é obrigatório');

      const commands = args.formatStrings.map(f => ({
        alter: {
          object: { database: args.databaseName, table: f.tableName, measure: f.measureName },
          measure: { formatString: f.formatString }
        }
      }));

      await client.executeTmsl(args.xmlaEndpoint, { sequence: { operations: commands } });
      return { operation: 'bulk_format_strings', count: args.formatStrings.length, status: 'completed' };
    }

    case 'apply_naming_convention': {
      if (!args.namingConvention) throw new Error('namingConvention é obrigatório');
      return {
        operation: 'apply_naming_convention',
        convention: args.namingConvention,
        message: 'Para aplicar convenção de nomenclatura, use bulk_rename com os novos nomes gerados pelo AI baseados na convenção especificada.',
        nextStep: 'Solicite ao AI: "Gere as renomeações para os objetos do modelo seguindo a convenção ' + args.namingConvention + '"'
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
