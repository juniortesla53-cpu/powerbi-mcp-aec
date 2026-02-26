import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'dax_query_operations',
  description:
    'Executa, valida e analisa a performance de consultas DAX. Inclui métricas de execução e análise de gargalos de performance.',
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['execute', 'execute_with_metrics', 'analyze_performance', 'validate_syntax', 'format'],
        description: 'Operação a executar'
      },
      semanticModelId: {
        type: 'string',
        description: 'ID do modelo semântico'
      },
      daxQuery: {
        type: 'string',
        description: 'Consulta ou expressão DAX'
      },
      clearCache: {
        type: 'boolean',
        default: false,
        description: 'Limpar cache antes de executar (para métricas reais)'
      },
      maxRows: {
        type: 'number',
        default: 500,
        description: 'Número máximo de linhas a retornar'
      }
    },
    required: ['operation', 'semanticModelId', 'daxQuery']
  }
};

export async function handler(
  args: {
    operation: string;
    semanticModelId: string;
    daxQuery: string;
    clearCache?: boolean;
    maxRows?: number;
  },
  client: PowerBiClient
): Promise<unknown> {
  switch (args.operation) {
    case 'execute': {
      const startTime = Date.now();
      const result = await client.executeQuery(args.semanticModelId, args.daxQuery, false);
      const rows = result.results?.[0]?.tables?.[0]?.rows || [];
      return {
        operation: 'execute',
        rowCount: rows.length,
        executionTimeMs: Date.now() - startTime,
        results: rows.slice(0, args.maxRows ?? 500)
      };
    }

    case 'execute_with_metrics': {
      // Execute twice: warm (cached) and cold (cleared cache)
      const warmStart = Date.now();
      const warmResult = await client.executeQuery(args.semanticModelId, args.daxQuery, false);
      const warmTime = Date.now() - warmStart;

      const coldStart = Date.now();
      await client.executeQuery(args.semanticModelId, args.daxQuery, true);
      const coldTime = Date.now() - coldStart;

      const rows = warmResult.results?.[0]?.tables?.[0]?.rows || [];
      return {
        operation: 'execute_with_metrics',
        rowCount: rows.length,
        results: rows.slice(0, args.maxRows ?? 500),
        metrics: {
          warmCacheMs: warmTime,
          coldCacheMs: coldTime,
          cacheImpact: `${((coldTime - warmTime) / coldTime * 100).toFixed(1)}% slower without cache`,
          recommendation: coldTime > 5000
            ? 'Consulta lenta. Considere: materializar resultados, otimizar medidas, verificar relacionamentos.'
            : coldTime > 2000
              ? 'Performance moderada. Possível otimização disponível.'
              : 'Performance satisfatória.'
        }
      };
    }

    case 'analyze_performance': {
      // Execute with timing and provide analysis
      const start = Date.now();
      const result = await client.executeQuery(args.semanticModelId, args.daxQuery, true);
      const totalTime = Date.now() - start;
      const rows = result.results?.[0]?.tables?.[0]?.rows || [];

      const issues: string[] = [];
      const suggestions: string[] = [];

      if (totalTime > 10000) {
        issues.push('Consulta muito lenta (>10s)');
        suggestions.push('Considere materializar resultados em tabelas calculadas');
        suggestions.push('Verifique se todos os relacionamentos necessários estão ativos');
      } else if (totalTime > 5000) {
        issues.push('Consulta lenta (>5s)');
        suggestions.push('Analise o uso de CALCULATE e contextos de filtro');
      }

      if (rows.length > 100000) {
        issues.push('Resultado muito grande');
        suggestions.push('Use TOPN ou filtragem para reduzir o volume de dados retornado');
      }

      const daxUpper = args.daxQuery.toUpperCase();
      if (daxUpper.includes('SUMX(') || daxUpper.includes('AVERAGEX(')) {
        suggestions.push('Funções iteradoras (SUMX, AVERAGEX) podem ser lentas em tabelas grandes — verifique se há alternativas');
      }
      if (!daxUpper.includes('CALCULATE') && daxUpper.includes('FILTER(')) {
        suggestions.push('Considere substituir FILTER por CALCULATE com filtros diretos para melhor performance');
      }

      return {
        operation: 'analyze_performance',
        executionTimeMs: totalTime,
        rowCount: rows.length,
        issues,
        suggestions,
        rating: totalTime < 1000 ? 'Excelente' : totalTime < 3000 ? 'Bom' : totalTime < 8000 ? 'Regular' : 'Ruim'
      };
    }

    case 'validate_syntax': {
      try {
        await client.executeQuery(args.semanticModelId, `EVALUATE TOPN(1, ${args.daxQuery})`);
        return { operation: 'validate_syntax', valid: true, query: args.daxQuery };
      } catch (e) {
        return {
          operation: 'validate_syntax',
          valid: false,
          query: args.daxQuery,
          error: e instanceof Error ? e.message : String(e)
        };
      }
    }

    case 'format': {
      // Basic DAX formatting (proper indentation and line breaks)
      const formatted = args.daxQuery
        .replace(/,\s*(?=[A-Z\(])/g, ',\n    ')
        .replace(/(CALCULATE|FILTER|SUMX|AVERAGEX|COUNTROWS|RELATED|VALUES|ALL|ALLEXCEPT)\s*\(/gi,
          (match) => match.trimEnd() + '(\n    ')
        .replace(/\)\s*,/g, '\n),');
      return { operation: 'format', original: args.daxQuery, formatted };
    }

    default:
      throw new Error(`Operação desconhecida: ${args.operation}`);
  }
}
