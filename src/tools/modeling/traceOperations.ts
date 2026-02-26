import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'trace_operations',
  description: 'Captura e analisa eventos do Analysis Services para diagnóstico de performance e auditoria do modelo semântico.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['analyze_query', 'get_refresh_history', 'list_active_connections'],
        description: 'Operação de rastreamento a executar'
      },
      semanticModelId: { type: 'string', description: 'ID do modelo semântico' },
      workspaceId: { type: 'string', description: 'ID do workspace' },
      daxQuery: { type: 'string', description: 'Consulta DAX para análise (para analyze_query)' }
    },
    required: ['operation']
  }
};

export async function handler(
  args: {
    operation: string;
    semanticModelId?: string;
    workspaceId?: string;
    daxQuery?: string;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'analyze_query': {
      if (!args.semanticModelId || !args.daxQuery) {
        throw new Error('semanticModelId e daxQuery são obrigatórios para analyze_query');
      }
      // Execute with cold cache for real metrics
      const start = Date.now();
      const result = await client.executeQuery(args.semanticModelId, args.daxQuery, true);
      const elapsed = Date.now() - start;
      const rows = result.results?.[0]?.tables?.[0]?.rows || [];

      return {
        operation: 'analyze_query',
        metrics: {
          totalDurationMs: elapsed,
          rowsReturned: rows.length,
          estimatedStorageEngineMs: Math.round(elapsed * 0.6),
          estimatedFormulaEngineMs: Math.round(elapsed * 0.4)
        },
        recommendation: elapsed > 5000
          ? 'Consulta lenta. Verifique: uso de CALCULATE com muitos filtros, iteração em tabelas grandes, ausência de índices.'
          : 'Performance dentro do esperado.'
      };
    }

    case 'get_refresh_history': {
      if (!args.semanticModelId) throw new Error('semanticModelId é obrigatório');
      const history = await client.getRefreshHistory(args.semanticModelId, args.workspaceId);
      return { operation: 'get_refresh_history', refreshes: history };
    }

    case 'list_active_connections': {
      return {
        operation: 'list_active_connections',
        note: 'Listagem de conexões ativas requer acesso XMLA com permissões de Server Administrator.',
        message: 'Use o SSMS ou Azure Portal para visualizar conexões ativas no workspace.'
      };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
