import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'execute_query',
  description:
    'Executa uma consulta DAX contra um modelo semântico do Power BI e retorna os resultados. O usuário precisa ter permissão Build no modelo.',
  inputSchema: {
    type: 'object',
    properties: {
      semanticModelId: {
        type: 'string',
        description: 'ID do modelo semântico do Power BI'
      },
      daxQuery: {
        type: 'string',
        description: 'Expressão DAX a executar. Ex: EVALUATE SUMMARIZECOLUMNS(\'Tabela\'[Coluna], "Total", [Medida])'
      },
      clearCache: {
        type: 'boolean',
        description: 'Limpar cache antes de executar para obter tempo real de execução. Padrão: false',
        default: false
      },
      maxRows: {
        type: 'number',
        description: 'Número máximo de linhas a retornar. Padrão: 1000',
        default: 1000
      }
    },
    required: ['semanticModelId', 'daxQuery']
  }
};

export async function handler(
  args: { semanticModelId: string; daxQuery: string; clearCache?: boolean; maxRows?: number },
  client: PowerBiClient
): Promise<unknown> {
  const maxRows = args.maxRows ?? 1000;

  // Inject TOPN if not already limited and no EVALUATE with TOPN
  let query = args.daxQuery.trim();
  if (!query.toUpperCase().includes('TOPN(') && !query.toUpperCase().includes('TOP ')) {
    // Wrap in TOPN only if it's a simple EVALUATE
    if (query.toUpperCase().startsWith('EVALUATE') && !query.toUpperCase().includes('\n')) {
      query = query.replace(/^EVALUATE\s+/i, `EVALUATE TOPN(${maxRows}, `);
      query = query + ')';
    }
  }

  const startTime = Date.now();
  const result = await client.executeQuery(args.semanticModelId, query, args.clearCache);
  const executionTimeMs = Date.now() - startTime;

  const rows = result.results?.[0]?.tables?.[0]?.rows || [];

  return {
    semanticModelId: args.semanticModelId,
    daxQuery: args.daxQuery,
    executionTimeMs,
    rowCount: rows.length,
    results: rows,
    performance: {
      executionTimeMs,
      warning: executionTimeMs > 5000 ? 'Consulta demorou mais de 5 segundos. Considere otimizar.' : undefined
    }
  };
}
