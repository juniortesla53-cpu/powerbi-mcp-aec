import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { PowerBiClient } from '../powerbiClient.js';

export const definition: Tool = {
  name: 'get_semantic_model_schema',
  description:
    'Recupera metadados completos de um modelo semântico do Power BI: tabelas, colunas, medidas, relacionamentos, tipos de dados e hierarquias.',
  inputSchema: {
    type: 'object',
    properties: {
      semanticModelId: {
        type: 'string',
        description: 'ID do modelo semântico (dataset) do Power BI. Encontre na URL: app.powerbi.com/groups/{workspaceId}/datasets/{semanticModelId}'
      },
      includeHidden: {
        type: 'boolean',
        description: 'Incluir objetos ocultos (tabelas, colunas, medidas). Padrão: false',
        default: false
      }
    },
    required: ['semanticModelId']
  }
};

export async function handler(
  args: { semanticModelId: string; includeHidden?: boolean },
  client: PowerBiClient
): Promise<unknown> {
  const schema = await client.getSemanticModelSchema(args.semanticModelId);

  // Filter hidden objects unless explicitly requested
  if (!args.includeHidden) {
    schema.tables = schema.tables.map(table => ({
      ...table,
      columns: table.columns.filter(c => !c.isHidden),
      measures: table.measures.filter(m => !m.isHidden)
    })).filter(t => !(t as { isHidden?: boolean }).isHidden);
    schema.measures = schema.measures.filter(m => !m.isHidden);
  }

  const summary = {
    totalTables: schema.tables.length,
    totalColumns: schema.tables.reduce((sum, t) => sum + t.columns.length, 0),
    totalMeasures: schema.measures.length + schema.tables.reduce((sum, t) => sum + t.measures.length, 0),
    totalRelationships: schema.relationships.length
  };

  return {
    semanticModelId: args.semanticModelId,
    summary,
    schema
  };
}
