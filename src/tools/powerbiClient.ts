import axios, { AxiosInstance } from 'axios';
import { AuthProvider } from '../auth/authProvider.js';
import { DaxQueryResult, SemanticModelSchema } from '../types/index.js';

// ============================================================
// Power BI REST API Client
// ============================================================

const PBI_BASE_URL = 'https://api.powerbi.com/v1.0/myorg';

export class PowerBiClient {
  private http: AxiosInstance;
  private auth: AuthProvider;

  constructor(auth: AuthProvider) {
    this.auth = auth;
    this.http = axios.create({ baseURL: PBI_BASE_URL, timeout: 60_000 });

    // Inject auth token on every request
    this.http.interceptors.request.use(async (config) => {
      const token = await this.auth.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  // ---- Semantic Model Schema ----

  async getSemanticModelSchema(datasetId: string): Promise<SemanticModelSchema> {
    const [tablesRes, measuresRes, relsRes] = await Promise.all([
      this.http.get(`/datasets/${datasetId}/tables`),
      this.http.get(`/datasets/${datasetId}/measures`).catch(() => ({ data: { value: [] } })),
      this.http.get(`/datasets/${datasetId}/relationships`).catch(() => ({ data: { value: [] } }))
    ]);

    const tables = (tablesRes.data.value || []).map((t: Record<string, unknown>) => ({
      name: t.name as string,
      columns: (t.columns as Record<string, unknown>[] || []).map((c: Record<string, unknown>) => ({
        name: c.name as string,
        dataType: c.dataType as string,
        isHidden: c.isHidden as boolean,
        description: c.description as string
      })),
      measures: []
    }));

    return {
      tables,
      measures: measuresRes.data.value || [],
      relationships: relsRes.data.value || []
    };
  }

  // ---- DAX Query Execution ----

  async executeQuery(datasetId: string, daxQuery: string, clearCache = false): Promise<DaxQueryResult> {
    const response = await this.http.post(`/datasets/${datasetId}/executeQueries`, {
      queries: [{ query: daxQuery }],
      serializerSettings: { includeNulls: true },
      ...(clearCache && { impersonatedUserName: null })
    });
    return response.data;
  }

  // ---- Copilot DAX Generation ----

  async generateDaxQuery(datasetId: string, question: string, schemaContext?: unknown): Promise<string> {
    try {
      const response = await this.http.post(`/datasets/${datasetId}/generateDaxQuery`, {
        question,
        schemaContext: schemaContext || {}
      });
      return response.data?.query || '';
    } catch {
      throw new Error(
        'Geração de DAX via Copilot falhou. Verifique se sua organização tem licença Copilot para Power BI.'
      );
    }
  }

  // ---- Dataset Info ----

  async getDataset(datasetId: string): Promise<Record<string, unknown>> {
    const response = await this.http.get(`/datasets/${datasetId}`);
    return response.data;
  }

  async listDatasets(groupId?: string): Promise<Record<string, unknown>[]> {
    const url = groupId ? `/groups/${groupId}/datasets` : '/datasets';
    const response = await this.http.get(url);
    return response.data.value || [];
  }

  async listWorkspaces(): Promise<Record<string, unknown>[]> {
    const response = await this.http.get('/groups');
    return response.data.value || [];
  }

  // ---- XMLA / TMSL Operations ----
  // Used for modeling operations via the XMLA endpoint

  async executeTmsl(xmlaEndpoint: string, tmslCommand: unknown): Promise<unknown> {
    const token = await this.auth.getAccessToken();
    const response = await axios.post(
      xmlaEndpoint,
      { execute: { Commands: [{ Statement: JSON.stringify(tmslCommand) }] } },
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        timeout: 120_000
      }
    );
    return response.data;
  }

  // ---- Refresh Operations ----

  async refreshDataset(datasetId: string, groupId?: string): Promise<void> {
    const url = groupId
      ? `/groups/${groupId}/datasets/${datasetId}/refreshes`
      : `/datasets/${datasetId}/refreshes`;
    await this.http.post(url, { notifyOption: 'NoNotification' });
  }

  async getRefreshHistory(datasetId: string, groupId?: string): Promise<Record<string, unknown>[]> {
    const url = groupId
      ? `/groups/${groupId}/datasets/${datasetId}/refreshes`
      : `/datasets/${datasetId}/refreshes`;
    const response = await this.http.get(url);
    return response.data.value || [];
  }
}
