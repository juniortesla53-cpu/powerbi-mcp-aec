import { PublicClientApplication, ConfidentialClientApplication, AuthenticationResult } from '@azure/msal-node';
import { AuthConfig, AuthMethod } from '../types/index.js';

// ============================================================
// Authentication Provider for Power BI APIs
// Supports: Interactive, Device Code, Client Credentials
// ============================================================

const POWER_BI_SCOPE = 'https://analysis.windows.net/powerbi/api/.default';
const REDIRECT_URI = 'http://localhost:3000';

export class AuthProvider {
  private pca?: PublicClientApplication;
  private cca?: ConfidentialClientApplication;
  private cachedToken?: AuthenticationResult;
  private config: AuthConfig;

  constructor(config: AuthConfig) {
    this.config = config;
    this.initializeClients();
  }

  private initializeClients(): void {
    const msalConfig = {
      auth: {
        clientId: this.config.clientId,
        authority: `https://login.microsoftonline.com/${this.config.tenantId || 'common'}`
      }
    };

    if (this.config.method === 'clientCredentials' && this.config.clientSecret) {
      this.cca = new ConfidentialClientApplication({
        auth: {
          ...msalConfig.auth,
          clientSecret: this.config.clientSecret
        }
      });
    } else {
      this.pca = new PublicClientApplication(msalConfig);
    }
  }

  // Update config and reinitialize
  updateConfig(config: AuthConfig): void {
    this.config = config;
    this.cachedToken = undefined;
    this.initializeClients();
  }

  async getAccessToken(): Promise<string> {
    // Check cached token validity (5 min buffer)
    if (this.cachedToken && this.cachedToken.expiresOn) {
      const expiresOn = new Date(this.cachedToken.expiresOn);
      if (expiresOn.getTime() - Date.now() > 5 * 60 * 1000) {
        return this.cachedToken.accessToken;
      }
    }

    const token = await this.acquireToken();
    this.cachedToken = token;
    return token.accessToken;
  }

  private async acquireToken(): Promise<AuthenticationResult> {
    switch (this.config.method) {
      case 'interactive':
        return this.acquireInteractive();
      case 'deviceCode':
        return this.acquireDeviceCode();
      case 'clientCredentials':
        return this.acquireClientCredentials();
      default:
        throw new Error(`Método de autenticação desconhecido: ${this.config.method}`);
    }
  }

  private async acquireInteractive(): Promise<AuthenticationResult> {
    if (!this.pca) throw new Error('PublicClientApplication não inicializado');

    // Try silent first
    const accounts = await this.pca.getAllAccounts();
    if (accounts.length > 0) {
      try {
        const result = await this.pca.acquireTokenSilent({
          scopes: [POWER_BI_SCOPE],
          account: accounts[0]
        });
        return result;
      } catch {
        // Silent failed, fall through to interactive
      }
    }

    // Interactive popup
    return this.pca.acquireTokenInteractive({
      scopes: [POWER_BI_SCOPE],
      redirectUri: REDIRECT_URI,
      prompt: 'select_account'
    });
  }

  private async acquireDeviceCode(): Promise<AuthenticationResult> {
    if (!this.pca) throw new Error('PublicClientApplication não inicializado');

    return this.pca.acquireTokenByDeviceCode({
      scopes: [POWER_BI_SCOPE],
      deviceCodeCallback: (response) => {
        // Log to stderr so MCP server stdio doesn't get polluted
        process.stderr.write(`\n[PowerBi MCP AeC] Para autenticar, acesse:\n${response.verificationUri}\nE insira o código: ${response.userCode}\n\n`);
      }
    });
  }

  private async acquireClientCredentials(): Promise<AuthenticationResult> {
    if (!this.cca) throw new Error('ConfidentialClientApplication não inicializado');
    if (!this.config.tenantId) throw new Error('tenantId é obrigatório para Client Credentials');

    return this.cca.acquireTokenByClientCredential({
      scopes: [POWER_BI_SCOPE]
    }) as Promise<AuthenticationResult>;
  }

  clearCache(): void {
    this.cachedToken = undefined;
  }

  isAuthenticated(): boolean {
    if (!this.cachedToken) return false;
    if (!this.cachedToken.expiresOn) return false;
    return new Date(this.cachedToken.expiresOn).getTime() > Date.now();
  }
}

// Singleton instance (used by MCP server process)
let authProviderInstance: AuthProvider | null = null;

export function getAuthProvider(config?: AuthConfig): AuthProvider {
  if (!authProviderInstance && config) {
    authProviderInstance = new AuthProvider(config);
  } else if (authProviderInstance && config) {
    authProviderInstance.updateConfig(config);
  }
  if (!authProviderInstance) {
    throw new Error('AuthProvider não inicializado. Forneça config na primeira chamada.');
  }
  return authProviderInstance;
}
