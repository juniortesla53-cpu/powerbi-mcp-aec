import * as fs from 'fs';
import * as path from 'path';
import { Tool } from '@modelcontextprotocol/sdk/types.js';
import axios from 'axios';

// ============================================================
// Local Power BI Desktop Operations
// Detects and queries Power BI Desktop running locally via
// the embedded Analysis Services (msmdsrv.exe) instance.
// No authentication required — local connection only.
// ============================================================

export const definition: Tool = {
  name: 'local_pbi_operations',
  description: `Detecta e interage com o Power BI Desktop aberto localmente na máquina.
Usa o Analysis Services embutido no Power BI Desktop via porta local (sem autenticação).
Operações disponíveis:
- detect: Encontra instâncias do Power BI Desktop em execução e lista os modelos abertos
- get_schema: Obtém o esquema completo de um modelo local (tabelas, colunas, medidas)
- execute_dax: Executa uma consulta DAX no modelo local
- list_tables: Lista as tabelas disponíveis no modelo local`,
  inputSchema: {
    type: 'object',
    properties: {
      operation: {
        type: 'string',
        enum: ['detect', 'get_schema', 'execute_dax', 'list_tables'],
        description: 'Operação a executar'
      },
      database: {
        type: 'string',
        description: 'Nome do banco de dados/modelo (obrigatório para get_schema, execute_dax, list_tables)'
      },
      query: {
        type: 'string',
        description: 'Consulta DAX a executar (obrigatório para execute_dax)'
      },
      port: {
        type: 'number',
        description: 'Porta do Analysis Services local (opcional — detectada automaticamente)'
      }
    },
    required: ['operation']
  }
};

// ---- Port discovery ----

interface PbiInstance {
  port: number;
  workspacePath: string;
}

function findPbiDesktopInstances(): PbiInstance[] {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) return [];

  const workspacesDir = path.join(
    localAppData,
    'Microsoft', 'Power BI Desktop', 'AnalysisServicesWorkspaces'
  );

  if (!fs.existsSync(workspacesDir)) return [];

  const instances: PbiInstance[] = [];
  try {
    const entries = fs.readdirSync(workspacesDir);
    for (const entry of entries) {
      const portFile = path.join(workspacesDir, entry, 'Data', 'msmdsrv.port.txt');
      if (fs.existsSync(portFile)) {
        const portStr = fs.readFileSync(portFile, 'utf-8').trim();
        const port = parseInt(portStr, 10);
        if (!isNaN(port) && port > 0) {
          instances.push({ port, workspacePath: path.join(workspacesDir, entry) });
        }
      }
    }
  } catch {
    // ignore filesystem errors
  }
  return instances;
}

// ---- XMLA SOAP helpers ----

function soapEnvelope(body: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<Envelope xmlns="http://schemas.xmlsoap.org/soap/envelope/">
  <Body>${body}</Body>
</Envelope>`;
}

async function xmlaRequest(port: number, soapAction: string, body: string): Promise<string> {
  const response = await axios.post(
    `http://localhost:${port}/xmla`,
    soapEnvelope(body),
    {
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"${soapAction}"`
      },
      timeout: 10_000,
      responseType: 'text'
    }
  );
  return response.data as string;
}

// Extract text content of all matching XML tags (simple regex, no external deps)
function extractTagValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    const val = match[1].trim();
    if (val) results.push(val);
  }
  return results;
}

// ---- List databases (DBSCHEMA_CATALOGS) ----

async function listDatabases(port: number): Promise<string[]> {
  const body = `
  <Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
    <RequestType>DBSCHEMA_CATALOGS</RequestType>
    <Restrictions><RestrictionList/></Restrictions>
    <Properties><PropertyList/></Properties>
  </Discover>`;
  try {
    const xml = await xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Discover', body);
    return extractTagValues(xml, 'CATALOG_NAME');
  } catch {
    // Try without /xmla path suffix
    try {
      const response = await axios.post(
        `http://localhost:${port}`,
        soapEnvelope(`
  <Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
    <RequestType>DBSCHEMA_CATALOGS</RequestType>
    <Restrictions><RestrictionList/></Restrictions>
    <Properties><PropertyList/></Properties>
  </Discover>`),
        {
          headers: {
            'Content-Type': 'text/xml; charset=utf-8',
            'SOAPAction': '"urn:schemas-microsoft-com:xml-analysis:Discover"'
          },
          timeout: 10_000,
          responseType: 'text'
        }
      );
      return extractTagValues(response.data as string, 'CATALOG_NAME');
    } catch {
      return [];
    }
  }
}

// ---- List tables (TMSCHEMA_TABLES) ----

async function listTables(port: number, database: string): Promise<string[]> {
  const body = `
  <Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
    <RequestType>TMSCHEMA_TABLES</RequestType>
    <Restrictions>
      <RestrictionList>
        <DatabaseName>${database}</DatabaseName>
      </RestrictionList>
    </Restrictions>
    <Properties>
      <PropertyList>
        <Catalog>${database}</Catalog>
      </PropertyList>
    </Properties>
  </Discover>`;
  try {
    const xml = await xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Discover', body);
    return extractTagValues(xml, 'Name');
  } catch {
    return [];
  }
}

// ---- Get schema (tables + columns + measures) ----

async function getSchema(port: number, database: string): Promise<Record<string, unknown>> {
  const [tablesXml, columnsXml, measuresXml] = await Promise.allSettled([
    xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Discover',
      `<Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
        <RequestType>TMSCHEMA_TABLES</RequestType>
        <Restrictions><RestrictionList><DatabaseName>${database}</DatabaseName></RestrictionList></Restrictions>
        <Properties><PropertyList><Catalog>${database}</Catalog></PropertyList></Properties>
      </Discover>`),
    xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Discover',
      `<Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
        <RequestType>TMSCHEMA_COLUMNS</RequestType>
        <Restrictions><RestrictionList><DatabaseName>${database}</DatabaseName></RestrictionList></Restrictions>
        <Properties><PropertyList><Catalog>${database}</Catalog></PropertyList></Properties>
      </Discover>`),
    xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Discover',
      `<Discover xmlns="urn:schemas-microsoft-com:xml-analysis">
        <RequestType>TMSCHEMA_MEASURES</RequestType>
        <Restrictions><RestrictionList><DatabaseName>${database}</DatabaseName></RestrictionList></Restrictions>
        <Properties><PropertyList><Catalog>${database}</Catalog></PropertyList></Properties>
      </Discover>`)
  ]);

  return {
    tables: tablesXml.status === 'fulfilled' ? extractTagValues(tablesXml.value, 'Name') : [],
    columns: columnsXml.status === 'fulfilled' ? extractTagValues(columnsXml.value, 'Name') : [],
    measures: measuresXml.status === 'fulfilled' ? extractTagValues(measuresXml.value, 'Name') : []
  };
}

// ---- Execute DAX ----

async function executeDax(port: number, database: string, query: string): Promise<unknown> {
  const body = `
  <Execute xmlns="urn:schemas-microsoft-com:xml-analysis">
    <Command>
      <Statement>${query.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Statement>
    </Command>
    <Properties>
      <PropertyList>
        <Catalog>${database}</Catalog>
        <Format>Tabular</Format>
        <Content>SchemaData</Content>
      </PropertyList>
    </Properties>
  </Execute>`;

  const xml = await xmlaRequest(port, 'urn:schemas-microsoft-com:xml-analysis:Execute', body);

  // Extract rows from tabular response
  const rows = extractTagValues(xml, 'row');
  if (rows.length === 0) {
    // Try to detect errors
    const errors = extractTagValues(xml, 'ErrorCode');
    if (errors.length > 0) {
      const msgs = extractTagValues(xml, 'Description');
      throw new Error(`Erro DAX: ${msgs.join(', ') || errors.join(', ')}`);
    }
    return { rows: [], message: 'Consulta executada — nenhum dado retornado' };
  }

  // Parse each row's cell values (simplified — values are in XML cells)
  const parsedRows = rows.map(rowXml => {
    const cells: Record<string, string> = {};
    const cellRegex = /<t:([^>]+)>([^<]*)<\/t:\1>/g;
    const cellRegex2 = /<([A-Za-z_][^>\s]*)>([^<]*)<\/\1>/g;
    let m;
    while ((m = cellRegex.exec(rowXml)) !== null) cells[m[1]] = m[2];
    while ((m = cellRegex2.exec(rowXml)) !== null) cells[m[1]] = m[2];
    return cells;
  });

  return { rows: parsedRows, rowCount: parsedRows.length };
}

// ---- Main handler ----

export async function handler(
  args: Record<string, unknown>
): Promise<unknown> {
  const operation = args.operation as string;
  const database = args.database as string | undefined;
  const query = args.query as string | undefined;
  const forcedPort = args.port as number | undefined;

  // Discover instances
  const instances = findPbiDesktopInstances();

  if (operation === 'detect') {
    if (instances.length === 0) {
      return {
        found: false,
        message: 'Nenhuma instância do Power BI Desktop encontrada. Abra um arquivo .pbix e tente novamente.',
        hint: 'O Power BI Desktop precisa estar aberto com um relatório carregado.'
      };
    }

    const results = await Promise.all(
      instances.map(async (inst) => {
        const databases = await listDatabases(inst.port);
        return {
          port: inst.port,
          connectionString: `localhost:${inst.port}`,
          databases,
          databaseCount: databases.length
        };
      })
    );

    return {
      found: true,
      instanceCount: results.length,
      instances: results,
      message: `${results.length} instância(s) do Power BI Desktop encontrada(s).`,
      usage: 'Use a operação get_schema ou execute_dax com o campo "database" para interagir com um modelo específico.'
    };
  }

  // For remaining operations, resolve port
  let port = forcedPort;
  if (!port) {
    if (instances.length === 0) {
      throw new Error('Power BI Desktop não está em execução. Abra um arquivo .pbix primeiro.');
    }
    port = instances[0].port;
  }

  if (operation === 'list_tables') {
    if (!database) {
      // List all databases first
      const databases = await listDatabases(port);
      if (databases.length === 0) throw new Error('Nenhum modelo encontrado na porta ' + port);
      if (databases.length === 1) {
        const tables = await listTables(port, databases[0]);
        return { database: databases[0], port, tables };
      }
      return { databases, message: 'Múltiplos modelos — especifique o campo "database"', port };
    }
    const tables = await listTables(port, database);
    return { database, port, tables };
  }

  if (operation === 'get_schema') {
    const db = database ?? (await listDatabases(port))[0];
    if (!db) throw new Error('Nenhum modelo encontrado. Especifique o campo "database".');
    const schema = await getSchema(port, db);
    return { database: db, port, connectionString: `localhost:${port}`, schema };
  }

  if (operation === 'execute_dax') {
    if (!query) throw new Error('Campo "query" é obrigatório para execute_dax.');
    const db = database ?? (await listDatabases(port))[0];
    if (!db) throw new Error('Nenhum modelo encontrado. Especifique o campo "database".');
    const result = await executeDax(port, db, query);
    return { database: db, port, ...result as object };
  }

  throw new Error(`Operação desconhecida: ${operation}`);
}
