#!/usr/bin/env node
/**
 * PowerBi MCP Server AeC - Standalone MCP Server Process
 *
 * This script runs as a child process managed by the VS Code extension.
 * It reads its configuration from the POWERBI_MCP_AEC_CONFIG env variable
 * (path to a JSON config file written by the extension).
 *
 * Communication: stdio (Model Context Protocol)
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  ErrorCode,
  McpError
} from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';

import { ServerConfig, ToolsState } from '../types/index.js';
import { getAuthProvider } from '../auth/authProvider.js';
import { PowerBiClient } from '../tools/powerbiClient.js';
import { getEnabledToolDefinitions, dispatchToolCall } from '../tools/index.js';
import { getDefaultToolsState } from '../config/toolConfig.js';

// ---- Load configuration ----

function loadConfig(): ServerConfig {
  const configPath = process.env.POWERBI_MCP_AEC_CONFIG;

  if (configPath && fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      return JSON.parse(raw) as ServerConfig;
    } catch (e) {
      process.stderr.write(`[PowerBi MCP AeC] Erro ao ler config: ${e}\n`);
    }
  }

  // Default config when no file is found
  return {
    tools: getDefaultToolsState(),
    auth: {
      tenantId: process.env.POWERBI_TENANT_ID || 'common',
      clientId: process.env.POWERBI_CLIENT_ID || 'ea0616ba-638b-4df5-95b9-636659ae5121',
      method: 'interactive'
    },
    connection: {
      defaultSemanticModelIds: [],
      xmlaEndpoint: process.env.POWERBI_XMLA_ENDPOINT || ''
    },
    readOnly: process.env.POWERBI_READ_ONLY === 'true',
    requireConfirmation: true
  };
}

// ---- Built-in Prompts ----

const PROMPTS = [
  {
    name: 'QueryData',
    description: 'Consultar dados de um modelo semântico usando linguagem natural',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true },
      { name: 'question', description: 'Pergunta em linguagem natural', required: true }
    ]
  },
  {
    name: 'AnalyzeModel',
    description: 'Analisar a estrutura e qualidade do modelo semântico',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true }
    ]
  },
  {
    name: 'OptimizeDAX',
    description: 'Otimizar e documentar uma medida DAX existente',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true },
      { name: 'measureExpression', description: 'Expressão DAX a otimizar', required: true },
      { name: 'measureName', description: 'Nome da medida', required: false }
    ]
  },
  {
    name: 'BulkDocument',
    description: 'Documentar automaticamente objetos de um modelo semântico',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true },
      { name: 'objectType', description: 'Tipo de objeto: tables, columns, measures', required: false }
    ]
  },
  {
    name: 'CheckBestPractices',
    description: 'Verificar boas práticas de modelagem no modelo semântico',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true }
    ]
  },
  {
    name: 'CreateMeasure',
    description: 'Criar uma nova medida DAX a partir de uma descrição em linguagem natural',
    arguments: [
      { name: 'semanticModelId', description: 'ID do modelo semântico', required: true },
      { name: 'measureDescription', description: 'Descrição do que a medida deve calcular', required: true },
      { name: 'tableName', description: 'Tabela onde a medida será criada', required: false }
    ]
  }
];

function getPromptMessages(name: string, args: Record<string, string>) {
  switch (name) {
    case 'QueryData':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use get_semantic_model_schema para obter o esquema do modelo semântico ID: ${args.semanticModelId}.\n` +
            `Em seguida, use generate_query para criar uma consulta DAX para responder:\n"${args.question}"\n` +
            `Por fim, use execute_query para executar e mostrar os resultados formatados.`
        }
      }];

    case 'AnalyzeModel':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use get_semantic_model_schema para obter o esquema completo do modelo semântico ID: ${args.semanticModelId}.\n` +
            `Analise e forneça:\n1. Visão geral da estrutura (tabelas, colunas, medidas, relacionamentos)\n` +
            `2. Problemas identificados (tabelas sem relacionamento, colunas duplicadas, medidas sem descrição)\n` +
            `3. Sugestões de melhoria\n4. Score de qualidade de 1-10`
        }
      }];

    case 'OptimizeDAX':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Otimize e melhore esta medida DAX${args.measureName ? ` (${args.measureName})` : ''}:\n\n` +
            `\`\`\`dax\n${args.measureExpression}\n\`\`\`\n\n` +
            `Use dax_query_operations (validate_syntax) com semanticModelId: ${args.semanticModelId} para validar.\n` +
            `Forneça:\n1. Versão otimizada com explicação das mudanças\n` +
            `2. Análise de performance esperada\n3. Descrição documentada para a medida`
        }
      }];

    case 'BulkDocument':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use get_semantic_model_schema para obter o esquema do modelo ID: ${args.semanticModelId}.\n` +
            `Para cada ${args.objectType || 'tabela, coluna e medida'} sem descrição, gere uma descrição clara em português.\n` +
            `Em seguida use bulk_operations (bulk_document) para aplicar todas as descrições de uma vez.`
        }
      }];

    case 'CheckBestPractices':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use get_semantic_model_schema para analisar o modelo ID: ${args.semanticModelId}.\n` +
            `Verifique as seguintes boas práticas e forneça um relatório:\n` +
            `✅ Nomenclatura clara e consistente\n✅ Tabelas de dimensão vs fato bem definidas\n` +
            `✅ Todas as medidas com descrição\n✅ Colunas desnecessárias ocultas\n` +
            `✅ Medidas básicas (total, %, YoY) presentes\n✅ Hierarquias definidas\n` +
            `✅ Formato das medidas configurado\n\nAtribua uma nota de 1-10 para cada item.`
        }
      }];

    case 'CreateMeasure':
      return [{
        role: 'user',
        content: {
          type: 'text',
          text: `Use get_semantic_model_schema para obter o esquema do modelo ID: ${args.semanticModelId}.\n` +
            `Crie uma medida DAX que: "${args.measureDescription}"\n` +
            `${args.tableName ? `A medida deve ser criada na tabela: ${args.tableName}\n` : ''}\n` +
            `Forneça:\n1. Nome sugerido para a medida\n2. Expressão DAX\n3. Formato de exibição\n4. Descrição\n` +
            `Use dax_query_operations (validate_syntax) para validar antes de recomendar.`
        }
      }];

    default:
      return [{ role: 'user', content: { type: 'text', text: `Executar prompt: ${name}` } }];
  }
}

// ---- Main Server Setup ----

async function main() {
  const config = loadConfig();

  // Apply read-only mode: disable all destructive tools
  let toolsState: ToolsState = config.tools;
  if (config.readOnly) {
    const { ALL_TOOLS } = await import('../config/toolConfig.js');
    for (const tool of ALL_TOOLS) {
      if (tool.isDestructive) {
        toolsState = { ...toolsState, [tool.id]: false };
      }
    }
    process.stderr.write('[PowerBi MCP AeC] Modo somente leitura ativado — operações destrutivas bloqueadas\n');
  }

  // Initialize auth provider
  const auth = getAuthProvider(config.auth);

  // Initialize Power BI client
  const client = new PowerBiClient(auth);

  // Create MCP server
  const server = new Server(
    {
      name: 'powerbi-mcp-aec',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {},
        prompts: {}
      }
    }
  );

  // ---- List Tools Handler ----
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    const tools = getEnabledToolDefinitions(toolsState);
    process.stderr.write(`[PowerBi MCP AeC] ${tools.length} ferramentas disponíveis\n`);
    return { tools };
  });

  // ---- Call Tool Handler ----
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    process.stderr.write(`[PowerBi MCP AeC] Chamando ferramenta: ${name}\n`);

    try {
      const result = await dispatchToolCall(
        name,
        (args || {}) as Record<string, unknown>,
        client,
        toolsState
      );

      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[PowerBi MCP AeC] Erro em ${name}: ${message}\n`);

      throw new McpError(
        ErrorCode.InternalError,
        `Erro ao executar '${name}': ${message}`
      );
    }
  });

  // ---- List Prompts Handler ----
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    return { prompts: PROMPTS };
  });

  // ---- Get Prompt Handler ----
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const prompt = PROMPTS.find(p => p.name === name);
    if (!prompt) {
      throw new McpError(ErrorCode.InvalidParams, `Prompt desconhecido: ${name}`);
    }
    return {
      description: prompt.description,
      messages: getPromptMessages(name, (args || {}) as Record<string, string>)
    };
  });

  // ---- Config file watcher (reload tools on config change) ----
  const configPath = process.env.POWERBI_MCP_AEC_CONFIG;
  if (configPath) {
    fs.watchFile(configPath, { interval: 2000 }, () => {
      try {
        const newConfig = loadConfig();
        toolsState = newConfig.tools;
        if (newConfig.readOnly) {
          // Re-apply read-only restriction
        }
        auth.updateConfig(newConfig.auth);
        process.stderr.write('[PowerBi MCP AeC] Configuração recarregada\n');
      } catch (e) {
        process.stderr.write(`[PowerBi MCP AeC] Erro ao recarregar config: ${e}\n`);
      }
    });
  }

  // ---- Start transport ----
  const transport = new StdioServerTransport();
  await server.connect(transport);

  process.stderr.write('[PowerBi MCP AeC] Servidor MCP iniciado via stdio\n');
}

main().catch(error => {
  process.stderr.write(`[PowerBi MCP AeC] Erro fatal: ${error}\n`);
  process.exit(1);
});
