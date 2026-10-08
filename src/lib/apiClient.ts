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
  DocComment,
  AiChatHistoryMessage,
  AdminInvite,
  PublicProfile,
  ProfileLink,
  SocialAccount,
  SocialConversation,
  DirectMessage,
  GitHubRepoInfo,
  PublishedProject,
  PublishedProjectDetail,
  PublishedSnippet,
  OAuthApp,
  OAuthAuthorizeValidation,
  OAuthGrant,
} from '../types.ts';

class ApiClient {
  private baseUrl = '/api/v1';
  private clientSource: ClientSource = 'WEB';

  /** Token stored after login (Bearer). Never store raw API secrets in localStorage long-term. */
  private getAuthToken(): string | null {
    try {
      return localStorage.getItem('vanitas_auth_token');
    } catch {
      return null;
    }
  }

  /** Read-only view of the current session token for same-origin tools
   * (API Playground) that build their own fetch calls. */
  getSessionToken(): string | null {
    return this.getAuthToken();
  }

  setAuthToken(token: string | null) {
    try {
      if (token) localStorage.setItem('vanitas_auth_token', token);
      else localStorage.removeItem('vanitas_auth_token');
    } catch {
      // ignore
    }
  }

  // Kept for backwards-compat with older UI code. Role is now decided
  // SERVER-SIDE only — this is a no-op and never sent to the backend.
  setRoleOverride(_role: UserRole) {}
  getRoleOverride(): UserRole {
    return 'USER';
  }

  setClientSource(source: ClientSource) {
    this.clientSource = source;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    // SECURITY: never send x-user-role / x-user-id. Auth is Bearer server-side.
    headers.delete('x-user-role');
    headers.delete('x-user-id');
    headers.set('x-client-source', this.clientSource);
    const token = this.getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers,
    });

    if (!res.ok) {
      let errMsg = `Request failed: ${res.status} ${res.statusText}`;
      let errBody: unknown = null;
      try {
        const errorJson = await res.json();
        errBody = errorJson;
        if (errorJson.error) errMsg = errorJson.error;
      } catch {
        // ignore json parse error
      }
      const error: Error & { status?: number; body?: unknown } = new Error(errMsg);
      error.status = res.status; // callers can distinguish server rejection (4xx/5xx) from network failure
      error.body = errBody; // structured flags (e.g. twoFactorRequired) survive the throw
      throw error;
    }

    return res.json() as Promise<T>;
  }

  // Health
  async getHealth() {
    return this.request<{ status: string; uptime: number; service: string }>('/health');
  }

  async getStatus() {
    return this.request<{
      platform: string;
      status: SystemStats['services'];
      database: 'connected' | 'unreachable' | 'in-memory-fallback';
      stats: {
        totalRequestsToday: number;
        requests24h: number;
        errors24h: number;
        p95LatencyMs: number;
        errorRate: number;
        activeApiKeys: number;
        logins24h: number;
        failedLogins24h: number;
      };
      hourlyTraffic: { hour: string; requests: number; errors: number }[];
      components: { id: string; status: 'operational' | 'degraded' | 'outage'; detail: string }[];
      uptimeSeconds: number;
      serverTime: string;
    }>('/status');
  }

  // Auth
  async getMe() {
    return this.request<{ user: User; permissions: PermissionScope[] }>('/auth/me');
  }

  /** Create a real account (scrypt-hashed password, server-side session).
   *  Pass `invite` to redeem a developer invite link — the granted role/badge
   *  is applied server-side the moment the account is created. */
  async register(params: { email: string; password: string; name: string; invite?: string }) {
    const data = await this.request<{ token: string; user: User; permissions: PermissionScope[] }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setAuthToken(data.token);
    return data;
  }

  /** Password login. Returns a session token stored as Bearer.
   *  When the account has real 2FA enabled, pass the 6-digit TOTP `code` —
   *  without it the server answers 401 with `twoFactorRequired: true`. */
  async login(params: { email: string; password: string; code?: string }) {
    const data = await this.request<{ token: string; user: User; permissions: PermissionScope[] }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    });
    this.setAuthToken(data.token);
    return data;
  }

  /** Revoke the server session; always clears the local token. */
  async logout() {
    try {
      await this.request<{ success: boolean }>('/auth/logout', { method: 'POST' });
    } finally {
      this.setAuthToken(null);
    }
  }

  /** Revoke SOME account's session (multi-account menu): the request
   *  must carry THAT account's token, not the active one's. */
  async revokeToken(token: string) {
    try {
      await fetch(`${this.baseUrl}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
    } catch {
      // Server unreachable — still forget the entry locally.
    }
  }

  /** Persist profile edits. `username`/`bio`/`accentColor`/`statusLine`/`links`/`location`/`techTags` are optional — omit = unchanged. */
  async updateProfile(params: {
    name: string;
    avatarUrl: string;
    username?: string;
    bio?: string;
    accentColor?: string;
    statusLine?: string;
    links?: ProfileLink[];
    location?: string;
    techTags?: string[];
  }) {
    return this.request<{ user: User; permissions: PermissionScope[] }>('/auth/profile', {
      method: 'PATCH',
      body: JSON.stringify(params),
    });
  }

  /** Live @username availability for the signed-in account. */
  async getUsernameAvailability(username: string) {
    return this.request<{ available: boolean; reason?: string; current?: boolean }>(
      `/auth/username-available?username=${encodeURIComponent(username)}`,
    );
  }

  /** Public, shareable profile for /u/<username>. */
  async getPublicProfile(username: string) {
    return this.request<{ profile: PublicProfile }>(`/profiles/${encodeURIComponent(username)}`);
  }

  async searchAccounts(query: string) {
    return this.request<{ accounts: SocialAccount[] }>(`/members/accounts?q=${encodeURIComponent(query)}`);
  }

  async getConversations() {
    return this.request<{ conversations: SocialConversation[] }>('/members/conversations');
  }

  async getDirectMessages(username: string) {
    return this.request<{ messages: DirectMessage[] }>(`/members/conversations/${encodeURIComponent(username)}`);
  }

  async sendDirectMessage(username: string, content: string) {
    return this.request<{ message: DirectMessage }>(`/members/messages`, {
      method: 'POST', body: JSON.stringify({ username, content }),
    });
  }

  // ---- GitHub publishing + sandbox ----
  /** Is the account connected to GitHub? (never exposes the token) */
  async getGitHubStatus() {
    return this.request<{ connected: boolean; provider: string }>('/github/status');
  }

  /** The signed-in user's own repositories, via their OAuth grant. */
  async listGitHubRepos() {
    return this.request<{ repos: GitHubRepoInfo[] }>('/github/repos');
  }

  /** Import a GitHub repository ("owner/name") as a published project. */
  async importGitHubRepo(repo: string) {
    return this.request<{ project: PublishedProjectDetail }>('/github/import', {
      method: 'POST', body: JSON.stringify({ repo }),
    });
  }

  async getMyProjects() {
    return this.request<{ projects: PublishedProject[] }>('/publish/projects');
  }

  async getPublicProjects() {
    return this.request<{ projects: PublishedProject[] }>('/publish/projects/public');
  }

  async getProject(id: string) {
    return this.request<{ project: PublishedProjectDetail }>(`/publish/projects/${encodeURIComponent(id)}`);
  }

  async deleteProject(id: string) {
    return this.request<{ success: boolean }>(`/publish/projects/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** Publish an individual code file. */
  async publishSnippet(params: { title: string; language: string; content: string }) {
    return this.request<{ snippet: PublishedSnippet }>('/publish/snippets', {
      method: 'POST', body: JSON.stringify(params),
    });
  }

  async getMySnippets() {
    return this.request<{ snippets: PublishedSnippet[] }>('/publish/snippets');
  }

  async getPublicSnippets() {
    return this.request<{ snippets: PublishedSnippet[] }>('/publish/snippets/public');
  }

  async deleteSnippet(id: string) {
    return this.request<{ success: boolean }>(`/publish/snippets/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  // ---- OAuth provider: register third-party apps ("Sign in with Vanitas") ----
  async listOAuthApps() {
    return this.request<{ apps: OAuthApp[]; availableScopes: string[] }>('/oauth/apps');
  }

  /** Register a third-party app. `type: 'public'` (SPA/mobile) mints NO
   *  secret — PKCE becomes mandatory instead. Confidential apps get the
   *  client secret back exactly once, in a reveal-once block. */
  async createOAuthApp(params: {
    name: string;
    redirectUris: string[];
    scopes: string[];
    type?: 'confidential' | 'public';
  }) {
    return this.request<{ app: OAuthApp; clientSecret: string | null; revealNote: string }>('/oauth/apps', {
      method: 'POST', body: JSON.stringify(params),
    });
  }

  async deleteOAuthApp(id: string) {
    return this.request<{ success: boolean }>(`/oauth/apps/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  /** Apps with live access to this account (the "authorized apps" review). */
  async listOAuthGrants() {
    return this.request<{ grants: OAuthGrant[] }>('/oauth/grants');
  }

  /** Cut every live token this account granted to one app. */
  async revokeOAuthGrant(appId: string) {
    return this.request<{ success: boolean; revoked: number }>(
      `/oauth/grants/${encodeURIComponent(appId)}`,
      { method: 'DELETE' },
    );
  }

  /** Withdraw every connected app at once ("sign out of all"). */
  async revokeAllOAuthGrants() {
    return this.request<{ success: boolean; revoked: number }>('/oauth/grants', { method: 'DELETE' });
  }

  /** Validate an incoming authorize request (called by the
   *  /oauth/consent page with the signed-in session). */
  async validateOAuthAuthorize(query: URLSearchParams) {
    return this.request<OAuthAuthorizeValidation>(`/oauth/authorize?${query.toString()}`);
  }

  /** Submit the user's consent decision → the final redirect URL. */
  async postOAuthDecision(ticket: string, decision: 'allow' | 'deny') {
    return this.request<{ redirectUrl: string }>('/oauth/authorize/decision', {
      method: 'POST', body: JSON.stringify({ ticket, decision }),
    });
  }

  // Real two-factor authentication (RFC 6238 TOTP).
  async setupTwoFactor() {
    return this.request<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', { method: 'POST' });
  }

  async enableTwoFactor(code: string) {
    return this.request<{ success: boolean }>('/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  async disableTwoFactor(code: string) {
    return this.request<{ success: boolean }>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  /** Finish an OAuth login paused for a TOTP code (#vnt_2fa challenge). */
  async completeTwoFactor(state: string, code: string) {
    const data = await this.request<{ token: string; user: User; permissions: PermissionScope[] }>(
      '/auth/2fa/complete',
      { method: 'POST', body: JSON.stringify({ state, code }) },
    );
    this.setAuthToken(data.token);
    return data;
  }

  // Doc comments — real, DB-backed discussion under each docs page.
  async listComments(docId: string) {
    return this.request<{ comments: DocComment[]; total: number }>(`/comments/${encodeURIComponent(docId)}`);
  }

  async postComment(docId: string, body: string) {
    return this.request<{ comment: DocComment }>(`/comments/${encodeURIComponent(docId)}`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    });
  }

  async deleteComment(id: string) {
    return this.request<{ success: boolean }>(`/comments/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  /** Which social providers have keys configured server-side (for UI buttons). */
  async getProviders() {
    return this.request<{ providers: Record<string, boolean> }>('/auth/providers');
  }

  async getSessions() {
    return this.request<{ sessions: SessionDevice[] }>('/auth/sessions');
  }

  async revokeSession(id: string) {
    return this.request<{ success: boolean }>('/auth/sessions/' + id, {
      method: 'DELETE',
    });
  }

  /** Rotate the password: proves the current one server-side, and every
   * OTHER session of the account is revoked with it. */
  async changePassword(currentPassword: string, newPassword: string) {
    return this.request<{ success: boolean; sessionsRevoked: number }>('/auth/password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
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

  // NOTE: simulateApiKeyTraffic was removed — inflating usage counters without
  // real requests was a fake system. See getKeyUsageAnalytics for the real,
  // per-request telemetry.

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

  async updateUserVerification(id: string, verification: string) {
    return this.request<{ success: boolean; user: User }>(`/admin/users/${id}/verification`, {
      method: 'PATCH',
      body: JSON.stringify({ verification }),
    });
  }

  /** Create a developer invite link (admin only) — grants role/badge on signup. */
  async createAdminInvite(body: { role: string; verification: string; note: string; maxUses: number }) {
    return this.request<{ invite: AdminInvite }>('/admin/invites', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  async listAdminInvites() {
    return this.request<{ invites: AdminInvite[] }>('/admin/invites');
  }

  /** Revoke an invite link — it stops redeeming immediately. */
  async revokeAdminInvite(id: string) {
    return this.request<{ success: boolean; invite: AdminInvite }>(`/admin/invites/${id}`, {
      method: 'DELETE',
    });
  }

  /** Public: what does this invite link grant? (valid / reason when dead) */
  async previewInvite(token: string) {
    return this.request<{
      valid: boolean;
      reason?: string;
      role?: string;
      verification?: string;
      creatorName?: string;
      note?: string;
      expiresAt?: string;
    }>(`/invites/${encodeURIComponent(token)}`);
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

  /**
   * CSV export needs the Bearer header, which a plain `<a download>` cannot
   * carry (no cookies in this app) — so we fetch the bytes ourselves and hand
   * the browser a blob. Resolves only after the download actually starts.
   */
  async downloadAdminLogsCsv(): Promise<{ bytes: number; filename: string }> {
    const token = this.getAuthToken();
    const headers = new Headers();
    headers.set('Accept', 'text/csv');
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${this.baseUrl}/admin/logs/export`, { headers });
    if (!res.ok) {
      let errMsg = `Export failed: ${res.status} ${res.statusText}`;
      try {
        const body = (await res.json()) as { error?: string };
        if (body?.error) errMsg = body.error;
      } catch {
        // non-JSON error body (e.g. HTML) — keep the status text
      }
      const error: Error & { status?: number } = new Error(errMsg);
      error.status = res.status;
      throw error;
    }

    const disposition = res.headers.get('Content-Disposition') || '';
    const filename =
      disposition.match(/filename="([^"]+)"/)?.[1] || `vanitas_audit_logs_${Date.now()}.csv`;

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoke on the next tick: revoking synchronously can cancel the download
    // in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    return { bytes: blob.size, filename };
  }

  async deleteAdminUser(id: string) {
    return this.request<{ success: boolean; user: { id: string; name: string } }>(`/admin/users/${id}`, { method: 'DELETE' });
  }

  async listAdminComments() {
    return this.request<{ comments: DocComment[]; total: number }>('/admin/comments');
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

  /**
   * Streamed AI chat (SSE): `onDelta` receives every token as it arrives so
   * the UI can reveal the reply progressively. Resolves with the final
   * authoritative result (the server's `done` event). Throws when the stream
   * never produced anything — callers should then fall back to `queryAi`.
   */
  async queryAiStream(
    params: {
      persona: string;
      toneStyle?: AiToneStyle;
      prompt: string;
      enableWebSearch?: boolean;
      enableVideoSearch?: boolean;
      context?: Record<string, unknown>;
    },
    onDelta: (delta: string) => void,
  ): Promise<{
    text: string;
    engine?: string;
    upstream?: string | null;
    groundingSources?: { title: string; url: string }[];
    videos?: YouTubeVideoItem[];
    videoQuery?: string;
    requiresConfirmation?: {
      action: string;
      target: string;
      permission: any;
      status: 'pending';
    };
  }> {
    const headers = new Headers({ 'Content-Type': 'application/json' });
    headers.set('x-client-source', this.clientSource);
    const token = this.getAuthToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);

    const res = await fetch(`${this.baseUrl}/ai/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...params, stream: true }),
    });

    // A proxy or an older server may answer plain JSON — accept it as-is.
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const json = (await res.json()) as { text?: string };
      if (json.text) onDelta(json.text);
      return json as any;
    }

    if (!res.ok || !res.body) {
      const err: Error & { status?: number } = new Error(`AI stream failed: ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let accumulated = '';
    let final: any = null;
    let serverError: string | null = null;

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) return;
      const payload = trimmed.slice(5).trim();
      if (!payload) return;
      try {
        const event = JSON.parse(payload);
        if (event.type === 'delta' && typeof event.t === 'string') {
          accumulated += event.t;
          onDelta(event.t);
        } else if (event.type === 'done') {
          final = event;
        } else if (event.type === 'error') {
          serverError = event.message || 'AI engine error';
        }
      } catch {
        /* partial frame — next chunk completes it */
      }
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) handleLine(line);
    }

    if (serverError) throw new Error(serverError);
    if (final) {
      return {
        text: typeof final.text === 'string' ? final.text : accumulated,
        engine: final.engine,
        upstream: final.upstream,
        groundingSources: final.groundingSources,
        videos: final.videos,
        videoQuery: final.videoQuery,
        requiresConfirmation: final.requiresConfirmation,
      };
    }
    if (accumulated) return { text: accumulated };
    throw new Error('AI stream produced no output');
  }

  /** The signed-in account's persisted chat history (newest page, ascending). */
  async getAiHistory() {
    return this.request<{ messages: AiChatHistoryMessage[] }>('/ai/history');
  }

  /** Wipe the signed-in account's chat history. */
  async clearAiHistory() {
    return this.request<{ success: boolean; removed: number }>('/ai/history', { method: 'DELETE' });
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

  /**
   * Authenticated download. A plain <a> click cannot carry the session
   * Bearer token (it used to save a 401 JSON body while the UI celebrated),
   * so we fetch the artifact WITH credentials, then hand the real bytes to
   * the browser. Resolves only after the download actually starts — the
   * caller gets the true byte count and filename, or a thrown error.
   */
  async downloadRelease(
    type: 'apk' | 'exe' | 'dmg' | 'appimage',
    fallbackFilename?: string,
  ): Promise<{ bytes: number; filename: string }> {
    const headers: Record<string, string> = {};
    const token = this.getAuthToken();
    if (token) headers.authorization = `Bearer ${token}`;

    const res = await fetch(`${this.baseUrl}/download/${type}`, { headers });
    if (!res.ok) {
      let message = `Download failed (HTTP ${res.status})`;
      try {
        const body = await res.json();
        if (body?.error) message = String(body.error);
      } catch {
        /* non-json error body */
      }
      const error: Error & { status?: number } = new Error(message);
      error.status = res.status;
      throw error;
    }

    const blob = await res.blob();
    const disposition = res.headers.get('content-disposition') || '';
    const nameFromHeader = /filename="([^"]+)"/.exec(disposition)?.[1];
    const filename = nameFromHeader || fallbackFilename || type;

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 30_000);

    return { bytes: blob.size, filename };
  }

  /**
   * Mint a short-lived signed link for cross-device downloads (the QR modal).
   * The scanning phone has no session — this link (10-minute expiry, bound to
   * this artifact and this account) is its credential.
   */
  async getDownloadLink(type: 'apk' | 'exe' | 'dmg' | 'appimage') {
    return this.request<{ url: string; expiresAt: string; expiresInSec: number }>(
      `/download/${type}/token`,
      { method: 'POST' },
    );
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
