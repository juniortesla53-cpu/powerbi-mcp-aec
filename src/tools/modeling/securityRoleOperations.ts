import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'security_role_operations',
  description:
    'Gerencia funções de segurança (RLS - Row Level Security) no modelo semântico: criar, atualizar, listar e testar funções de segurança.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['list', 'get', 'create', 'update', 'delete', 'add_member', 'remove_member', 'test_rls'],
        description: 'Operação a executar'
      },
      xmlaEndpoint: { type: 'string', description: 'Endpoint XMLA' },
      databaseName: { type: 'string', description: 'Nome do banco de dados' },
      roleName: { type: 'string', description: 'Nome da função de segurança' },
      roleDefinition: {
        type: 'object',
        description: 'Definição da função de segurança',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          modelPermission: {
            type: 'string',
            enum: ['read', 'readRefresh', 'refreshOnly', 'none'],
            description: 'Permissão do modelo para esta função'
          },
          tablePermissions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                tableName: { type: 'string' },
                filterExpression: { type: 'string', description: 'Expressão DAX de filtro RLS' }
              }
            }
          }
        }
      },
      memberEmail: { type: 'string', description: 'E-mail do membro a adicionar/remover' },
      testUserEmail: { type: 'string', description: 'E-mail do usuário para testar RLS' },
      semanticModelId: { type: 'string', description: 'ID do modelo semântico (para test_rls)' }
    },
    required: ['operation']
  }
};

export async function handler(
  args: {
    operation: string;
    xmlaEndpoint?: string;
    databaseName?: string;
    roleName?: string;
    roleDefinition?: Record<string, unknown>;
    memberEmail?: string;
    testUserEmail?: string;
    semanticModelId?: string;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'list': {
      if (!args.xmlaEndpoint || !args.databaseName) throw new Error('xmlaEndpoint e databaseName são obrigatórios');
      const tmsl = {
        discover: {
          requestType: 'TMSCHEMA_ROLES',
          restrictions: { DatabaseName: args.databaseName }
        }
      };
      return client.executeTmsl(args.xmlaEndpoint, tmsl);
    }

    case 'create': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.roleDefinition) {
        throw new Error('xmlaEndpoint, databaseName e roleDefinition são obrigatórios');
      }
      const tmsl = {
        createOrReplace: {
          object: { database: args.databaseName, role: args.roleDefinition.name },
          role: {
            modelPermission: 'read',
            ...args.roleDefinition
          }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'create', role: args.roleDefinition.name, status: 'created' };
    }

    case 'update': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.roleName || !args.roleDefinition) {
        throw new Error('xmlaEndpoint, databaseName, roleName e roleDefinition são obrigatórios');
      }
      const tmsl = {
        alter: {
          object: { database: args.databaseName, role: args.roleName },
          role: args.roleDefinition
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'update', role: args.roleName, status: 'updated' };
    }

    case 'delete': {
      if (!args.xmlaEndpoint || !args.databaseName || !args.roleName) {
        throw new Error('xmlaEndpoint, databaseName e roleName são obrigatórios');
      }
      const tmsl = {
        delete: {
          object: { database: args.databaseName, role: args.roleName }
        }
      };
      await client.executeTmsl(args.xmlaEndpoint, tmsl);
      return { operation: 'delete', role: args.roleName, status: 'deleted' };
    }

    case 'test_rls': {
      return {
        operation: 'test_rls',
        message: 'Para testar RLS, use a API REST do Power BI com o endpoint de execute queries impersonando o usuário de teste.',
        note: 'Com autenticação Service Principal, o RLS não é aplicado. Use autenticação de usuário para testes RLS.'
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
