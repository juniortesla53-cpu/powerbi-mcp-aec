import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'generate_query',
  description:
    'Gera uma consulta DAX otimizada a partir de uma pergunta em linguagem natural usando o motor Copilot do Power BI. Requer licença Copilot na organização.',
  inputSchema: {
    type: 'object',
    properties: {
      semanticModelId: {
        type: 'string',
        description: 'ID do modelo semântico do Power BI'
      },
      question: {
        type: 'string',
        description: 'Pergunta em linguagem natural que deseja responder com DAX'
      },
      schemaContext: {
        type: 'object',
        description: 'Contexto de esquema relevante (tabelas, colunas, medidas) para melhorar a qualidade da geração',
        properties: {
          tables: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes das tabelas relevantes para a pergunta'
          },
          columns: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes das colunas relevantes (formato: Tabela[Coluna])'
          },
          measures: {
            type: 'array',
            items: { type: 'string' },
            description: 'Nomes das medidas relevantes'
          }
        }
      }
    },
    required: ['semanticModelId', 'question']
  }
};

export async function handler(
  args: { semanticModelId: string; question: string; schemaContext?: unknown },
  client: PowerBiClient
): Promise<unknown> {
  const daxQuery = await client.generateDaxQuery(
    args.semanticModelId,
    args.question,
    args.schemaContext
  );

  return {
    semanticModelId: args.semanticModelId,
    question: args.question,
    generatedDaxQuery: daxQuery,
    note: 'Revise a consulta DAX antes de executar. Consultas complexas podem precisar de ajustes manuais.'
  };
}
