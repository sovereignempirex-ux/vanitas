import {
  User,
  ApiKey,
  AuditLog,
  WebhookEndpoint,
  WebhookDeliveryLog,
  SessionDevice,
  SystemStats,
  BotIntegration,
  FeatureFlag,
  SecurityThreat,
  PermissionScope,
  UserRole,
  ClientSource,
  ClientRelease,
  ApiKeyUsageResponse,
  AiToneStyle,
  CodeDiagnosisRequest,
  CodeDiagnosisResult,
  SemanticSearchResponse,
  YouTubeSearchResponse,
  YouTubeVideoItem,
  ExternalDatabaseConfig,
  VideoTutorialItem,
  ProductSuggestion,
} from '../types.ts';

class ApiClient {
  private baseUrl = '/api/v1';
  private roleOverride: UserRole = 'ADMIN';
  private clientSource: ClientSource = 'WEB';

  setRoleOverride(role: UserRole) {
    this.roleOverride = role;
  }

  getRoleOverride(): UserRole {
    return this.roleOverride;
  }

  setClientSource(source: ClientSource) {
    this.clientSource = source;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    headers.set('x-user-role', this.roleOverride);
    headers.set('x-client-source', this.clientSource);

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errMsg = `Request failed: ${res.status} ${res.statusText}`;
      try {
        const errorJson = await res.json();
        if (errorJson.error) errMsg = errorJson.error;
      } catch {
        // ignore json parse error
      }
      throw new Error(errMsg);
    }

    return res.json() as Promise<T>;
  }

  // Health
  async getHealth() {
    return this.request<{ status: string; uptime: number; service: string }>('/health');
  }

  async getStatus() {
    return this.request<{ platform: string; status: SystemStats['services']; stats: Record<string, number> }>('/status');
  }

  // Auth
  async getMe() {
    return this.request<{ user: User; permissions: PermissionScope[] }>('/auth/me');
  }

  async oauthLogin(provider: string) {
    return this.request<{ success: boolean; token: string; user: User }>('/auth/oauth', {
      method: 'POST',
      body: JSON.stringify({ provider }),
    });
  }

  async getSessions() {
    return this.request<{ sessions: SessionDevice[] }>('/auth/sessions');
  }

  async revokeSession(id: string) {
    return this.request<{ success: boolean }>('/auth/sessions/' + id, {
      method: 'DELETE',
    });
  }

  // API Keys
  async getApiKeys() {
    return this.request<{ keys: ApiKey[]; allScopes: { scope: PermissionScope; label: string; group: string; adminOnly: boolean }[] }>('/api-keys');
  }

  async createApiKey(params: {
    name: string;
    scopes: PermissionScope[];
    environment?: 'live' | 'test';
    rateLimitPerMin?: number;
    expiresAt?: string | null;
  }) {
    return this.request<{ key: ApiKey; rawSecret: string; revealNote: string }>('/api-keys', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async rotateApiKey(id: string) {
    return this.request<{ key: ApiKey; rawSecret: string; revealNote: string }>(`/api-keys/${id}/rotate`, {
      method: 'POST',
    });
  }

  async revokeApiKey(id: string, reason?: string) {
    return this.request<{ success: boolean; key: ApiKey }>(`/api-keys/${id}`, {
      method: 'DELETE',
      body: JSON.stringify({ reason }),
    });
  }

  async updateApiKeyScopes(id: string, scopes: PermissionScope[]) {
    return this.request<{ success: boolean; key: ApiKey }>(`/api-keys/${id}/scopes`, {
      method: 'PATCH',
      body: JSON.stringify({ scopes }),
    });
  }

  async updateApiKeyRateLimit(
    id: string,
    params: {
      rateLimitPerMin: number;
      burstLimit?: number;
      rateLimitAlgorithm?: 'sliding_window' | 'token_bucket' | 'fixed_window';
      actionOnExceed?: 'reject_429' | 'throttle_delay' | 'alert_only';
      monthlyQuota?: number;
    }
  ) {
    return this.request<{ success: boolean; key: ApiKey }>(`/api-keys/${id}/rate-limit`, {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  async simulateApiKeyTraffic(id: string, requestCount: number = 50) {
    return this.request<{
      success: boolean;
      key: ApiKey;
      simulatedBatch: number;
      currentRpm: number;
      isThrottled: boolean;
      headers: {
        'x-ratelimit-limit': number;
        'x-ratelimit-remaining': number;
        'x-ratelimit-reset': number;
        'retry-after': number;
      };
    }>(`/api-keys/${id}/simulate-traffic`, {
      method: 'POST',
      body: JSON.stringify({ requestCount }),
    });
  }

  async getKeyUsageAnalytics(period: '24h' | '7d' | '30d' = '24h') {
    return this.request<ApiKeyUsageResponse>(`/api-keys/usage-analytics?period=${period}`);
  }

  // Admin
  async getAdminUsers() {
    return this.request<{ users: User[] }>('/admin/users');
  }

  async updateUserRole(id: string, role: UserRole) {
    return this.request<{ success: boolean; user: User }>(`/admin/users/${id}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
  }

  async getAdminLogs(params: { limit?: number; offset?: number; from?: string; category?: string; search?: string }) {
    const query = new URLSearchParams();
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.offset) query.set('offset', params.offset.toString());
    if (params.from) query.set('from', params.from);
    if (params.category) query.set('category', params.category);
    if (params.search) query.set('search', params.search);

    return this.request<{ total: number; limit: number; offset: number; logs: AuditLog[] }>(`/admin/logs?${query.toString()}`);
  }

  getAdminLogsExportUrl() {
    return `${this.baseUrl}/admin/logs/export`;
  }

  async getAdminStatistics() {
    return this.request<{ stats: SystemStats; threats: SecurityThreat[] }>('/admin/statistics');
  }

  async triggerEmergencyAction(action: string, targetId?: string) {
    return this.request<{ success: boolean; maintenanceMode?: boolean; revokedCount?: number }>('/admin/emergency', {
      method: 'POST',
      body: JSON.stringify({ action, targetId }),
    });
  }

  async getFeatureFlags() {
    return this.request<{ featureFlags: FeatureFlag[] }>('/admin/feature-flags');
  }

  async toggleFeatureFlag(id: string, enabled: boolean) {
    return this.request<{ success: boolean; flag: FeatureFlag }>(`/admin/feature-flags/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  }

  // Webhooks
  async getWebhooks() {
    return this.request<{ webhooks: WebhookEndpoint[]; logs: WebhookDeliveryLog[] }>('/webhooks');
  }

  async createWebhook(name: string, url: string, events: string[]) {
    return this.request<{ webhook: WebhookEndpoint }>('/webhooks', {
      method: 'POST',
      body: JSON.stringify({ name, url, events }),
    });
  }

  async testWebhook(id: string) {
    return this.request<{ success: boolean; log: WebhookDeliveryLog }>(`/webhooks/${id}/test`, {
      method: 'POST',
    });
  }

  // Bots
  async getBots() {
    return this.request<{ bots: BotIntegration[] }>('/bot/status');
  }

  async executeBotCommand(platform: string, command: string, payload?: Record<string, unknown>) {
    return this.request<{ success: boolean; executionId: string; platform: string; command: string; output: string; timestamp: string }>('/bot/execute', {
      method: 'POST',
      body: JSON.stringify({ platform, command, payload }),
    });
  }

  // AI Chat with Semantic Video Search
  async queryAi(params: {
    persona: string;
    toneStyle?: AiToneStyle;
    prompt: string;
    enableWebSearch?: boolean;
    enableVideoSearch?: boolean;
    context?: Record<string, unknown>;
  }) {
    return this.request<{
      text: string;
      groundingSources?: { title: string; url: string }[];
      videos?: YouTubeVideoItem[];
      videoQuery?: string;
      requiresConfirmation?: {
        action: string;
        target: string;
        permission: any;
        status: 'pending';
      };
    }>('/ai/chat', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // YouTube Semantic Video Search
  async searchYouTubeVideos(query: string, limit: number = 6) {
    return this.request<YouTubeSearchResponse>(`/youtube/search?q=${encodeURIComponent(query)}&limit=${limit}`);
  }

  // AI Code Diagnosis & Auto-Fix Tool
  async diagnoseAndFixCode(params: CodeDiagnosisRequest) {
    return this.request<CodeDiagnosisResult>('/ai/diagnose-fix', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  async createSuggestion(params: { title: string; details: string; category: ProductSuggestion['category']; code?: string }) {
    return this.request<{ suggestion: ProductSuggestion }>('/suggestions', { method: 'POST', body: JSON.stringify(params) });
  }

  async getAdminSuggestions() {
    return this.request<{ suggestions: ProductSuggestion[] }>('/admin/suggestions');
  }

  async updateSuggestionStatus(id: string, status: ProductSuggestion['status'], adminNote?: string) {
    return this.request<{ suggestion: ProductSuggestion }>(`/admin/suggestions/${id}`, { method: 'PATCH', body: JSON.stringify({ status, adminNote }) });
  }

  async requestSuggestionAiFix(id: string, language = 'typescript') {
    return this.request<{ suggestion: ProductSuggestion; diagnosis: CodeDiagnosisResult }>(`/admin/suggestions/${id}/ai-fix`, { method: 'POST', body: JSON.stringify({ language }) });
  }

  // Client Releases & Downloads
  async getReleases() {
    return this.request<{
      success: boolean;
      latestVersion: string;
      releases: ClientRelease[];
    }>('/download/releases');
  }

  async getReleaseDetails(type: 'apk' | 'exe' | 'dmg' | 'appimage') {
    return this.request<{
      success: boolean;
      release: ClientRelease;
      downloadUrl: string;
    }>(`/download/${type}?format=json`);
  }

  triggerDirectDownload(type: 'apk' | 'exe' | 'dmg' | 'appimage') {
    // Initiate browser binary download stream
    const url = `${this.baseUrl}/download/${type}`;
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', '');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // AI Semantic Global Search
  async semanticSearch(query: string) {
    return this.request<SemanticSearchResponse>('/search/semantic', {
      method: 'POST',
      body: JSON.stringify({ query }),
    });
  }

  // External Cloud Databases
  async getExternalDatabases() {
    return this.request<{
      success: boolean;
      databases: ExternalDatabaseConfig[];
      recommendedFreeTiers: Array<{ provider: string; name: string; freeQuota: string; url: string }>;
    }>('/databases/external');
  }

  async testExternalDatabase(id: string) {
    return this.request<{
      success: boolean;
      latencyMs: number;
      message: string;
      database?: ExternalDatabaseConfig;
    }>('/databases/external/test', {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  async addExternalDatabase(params: {
    name: string;
    provider: ExternalDatabaseConfig['provider'];
    connectionUrl: string;
    region?: string;
  }) {
    return this.request<{
      success: boolean;
      database: ExternalDatabaseConfig;
    }>('/databases/external', {
      method: 'POST',
      body: JSON.stringify(params),
    });
  }

  // Video Tutorials
  async getVideoTutorials() {
    return this.request<{
      success: boolean;
      tutorials: VideoTutorialItem[];
    }>('/videos/tutorials');
  }
}

export const api = new ApiClient();
