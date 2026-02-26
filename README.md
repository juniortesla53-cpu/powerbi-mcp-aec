# PowerBi MCP Server AeC

Extensão VS Code para o servidor MCP (Model Context Protocol) do Power BI customizado para a AeC.

## Funcionalidades

- **Todas as ferramentas do Microsoft Power BI MCP Server** (Remote + Modeling)
- **Painel de configuração visual** para habilitar/desabilitar ferramentas individualmente
- **Perfis de permissão** pré-definidos (Somente Leitura, Desenvolvedor, Avançado, Apenas DAX)
- **Modo somente leitura** para bloquear todas as modificações
- **Múltiplos métodos de autenticação**: Interativo, Device Code, Service Principal
- **6 prompts integrados** para tarefas comuns
- **Recarregamento dinâmico** de configuração sem reiniciar o servidor

## Ferramentas Disponíveis (18 no total)

### Consulta Remota
| Ferramenta | Descrição |
|---|---|
| `get_semantic_model_schema` | Obter esquema completo do modelo semântico |
| `generate_query` | Gerar consulta DAX com Copilot |
| `execute_query` | Executar consulta DAX |

### Modelagem
| Ferramenta | Descrição |
|---|---|
| `connection_operations` | Gerenciar conexões e workspaces |
| `database_operations` | Gerenciar bancos de dados/modelos |
| `table_operations` | CRUD em tabelas |
| `column_operations` | CRUD em colunas |
| `measure_operations` | CRUD em medidas DAX |
| `relationship_operations` | CRUD em relacionamentos |
| `dax_query_operations` | Executar, validar e analisar DAX |
| `bulk_operations` | Operações em massa |
| `transaction_operations` | Controle de transações |
| `security_role_operations` | Funções RLS *(avançado)* |
| `partition_operations` | Partições de tabelas *(avançado)* |
| `calculation_group_operations` | Grupos de cálculo *(avançado)* |
| `trace_operations` | Rastreamento e diagnóstico *(avançado)* |
| `culture_operations` | Localização e traduções *(avançado)* |

## Instalação e Desenvolvimento

```bash
# Instalar dependências
npm install

# Compilar (development)
npm run compile

# Compilar (production)
npm run package
```

## Configuração

As configurações ficam em **Extensões > PowerBi MCP AeC** ou via `settings.json`:

```json
{
  "powerbiMcpAec.auth.tenantId": "seu-tenant-id",
  "powerbiMcpAec.auth.method": "interactive",
  "powerbiMcpAec.connection.xmlaEndpoint": "powerbi://api.powerbi.com/v1.0/myorg/NomeWorkspace",
  "powerbiMcpAec.server.readOnly": false,
  "powerbiMcpAec.tools.remote.executeQuery": true,
  "powerbiMcpAec.tools.modeling.securityRoleOperations": false
}
```

## Autenticação

| Método | Uso |
|---|---|
| `interactive` | Browser popup — uso pessoal/dev |
| `deviceCode` | Código de dispositivo — ambientes sem browser |
| `clientCredentials` | Service Principal — automação/produção |

## Prompts Integrados

- `QueryData` — Consultar dados em linguagem natural
- `AnalyzeModel` — Analisar estrutura e qualidade do modelo
- `OptimizeDAX` — Otimizar e documentar medidas DAX
- `BulkDocument` — Documentar objetos automaticamente
- `CheckBestPractices` — Verificar boas práticas de modelagem
- `CreateMeasure` — Criar medida DAX por descrição

## Registro Automático no VS Code

A extensão registra o servidor MCP automaticamente em `settings.json > mcp.servers`, tornando-o disponível para o GitHub Copilot e outros agentes compatíveis com MCP.
