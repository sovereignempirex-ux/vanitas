export type UserRole = 'USER' | 'ADMIN';

export type ClientSource = 'WEB' | 'BOT' | 'MOBILE' | 'DESKTOP' | 'APPLICATION' | 'OTHER';

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string;
  bio?: string;
  role: UserRole;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string;
  connectedAccounts: {
    google: boolean;
    github: boolean;
    discord: boolean;
  };
}

export type PermissionScope =
  | 'users.read'
  | 'users.write'
  | 'users.delete'
  | 'roles.read'
  | 'roles.manage'
  | 'database.read'
  | 'database.write'
  | 'api.read'
  | 'api.write'
  | 'keys.read'
  | 'keys.create'
  | 'keys.rotate'
  | 'keys.revoke'
  | 'keys.scopes.update'
  | 'logs.read'
  | 'logs.export'
  | 'settings.read'
  | 'settings.write'
  | 'system.read'
  | 'system.manage'
  | 'security.read'
  | 'security.manage'
  | 'bot.execute'
  | 'analytics.read'
  | 'webhooks.manage';

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  maskedSecret: string;
  ownerId: string;
  ownerName: string;
  scopes: PermissionScope[];
  status: 'active' | 'revoked' | 'suspended';
  rateLimitPerMin: number;
  burstLimit?: number;
  rateLimitAlgorithm?: 'sliding_window' | 'token_bucket' | 'fixed_window';
  actionOnExceed?: 'reject_429' | 'throttle_delay' | 'alert_only';
  monthlyQuota?: number;
  currentUsageThisMonth?: number;
  currentRpmUsage?: number;
  usageCount: number;
  createdAt: string;
  lastUsedAt: string | null;
  expiresAt: string | null;
  environment: 'live' | 'test';
}

export interface AuditLog {
  id: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  actorEmail: string;
  action: string;
  category: 'ADMIN' | 'API' | 'SECURITY' | 'AUTH' | 'KEYS' | 'BOT';
  target: string;
  source: ClientSource;
  status: 'SUCCESS' | 'FAILURE' | 'WARNING';
  requestId: string;
  ipAddress: string;
  metadata?: Record<string, unknown>;
}

export interface WebhookEndpoint {
  id: string;
  name: string;
  url: string;
  events: string[];
  secret: string;
  status: 'active' | 'disabled';
  createdAt: string;
  lastTriggeredAt: string | null;
  failureCount: number;
}

export interface WebhookDeliveryLog {
  id: string;
  webhookId: string;
  event: string;
  status: 'delivered' | 'failed';
  statusCode: number;
  latencyMs: number;
  timestamp: string;
  payload: Record<string, unknown>;
}

export interface SessionDevice {
  id: string;
  browser: string;
  os: string;
  device: string;
  ip: string;
  source: ClientSource;
  isCurrent: boolean;
  createdAt: string;
  lastActiveAt: string;
}

export interface SystemStats {
  totalUsers: number;
  activeUsers: number;
  apiRequestsToday: number;
  apiRequestsThisMonth: number;
  apiQuotaLimit: number;
  p95LatencyMs: number;
  errorRate: number;
  activeApiKeys: number;
  services: {
    api: 'operational' | 'degraded' | 'outage';
    auth: 'operational' | 'degraded' | 'outage';
    database: 'operational' | 'degraded' | 'outage';
    ai: 'operational' | 'degraded' | 'outage';
    bot: 'operational' | 'degraded' | 'outage';
    webhooks: 'operational' | 'degraded' | 'outage';
  };
  requestBreakdown: {
    endpoint: string;
    count: number;
    avgLatencyMs: number;
    errorCount: number;
  }[];
  hourlyTraffic: {
    hour: string;
    requests: number;
    errors: number;
  }[];
}

export interface BotIntegration {
  id: string;
  name: string;
  platform: 'discord' | 'whatsapp' | 'telegram' | 'custom';
  apiKeyId: string;
  status: 'online' | 'offline' | 'error';
  lastPingAt: string;
  commandsExecuted: number;
  webhookUrl?: string;
}

export interface FeatureFlag {
  id: string;
  key: string;
  name: string;
  description: string;
  enabled: boolean;
  adminOnly: boolean;
  updatedAt: string;
}

export interface SecurityThreat {
  id: string;
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  title: string;
  description: string;
  source: ClientSource;
  ip: string;
  timestamp: string;
  resolved: boolean;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant' | 'system';
  persona: 'code' | 'api' | 'security' | 'analyst' | 'docs' | 'video';
  content: string;
  timestamp: string;
  groundingSources?: { title: string; url: string }[];
  videos?: YouTubeVideoItem[];
  videoQuery?: string;
  requiresConfirmation?: {
    action: string;
    target: string;
    permission: PermissionScope;
    status: 'pending' | 'confirmed' | 'cancelled';
  };
}

export type DetectedPlatform =
  | 'mobile_android'
  | 'mobile_ios'
  | 'desktop_windows'
  | 'desktop_mac'
  | 'desktop_linux'
  | 'unknown';

export interface ApiKeyUsagePoint {
  timeLabel: string;
  timestamp: string;
  totalRequests: number;
  successCount: number;
  throttledCount: number;
  errorCount: number;
  latencyMs: number;
  p95LatencyMs: number;
  [keyId: string]: string | number;
}

export interface ApiKeyUsageSummary {
  keyId: string;
  keyName: string;
  keyPrefix: string;
  environment: 'live' | 'test';
  rateLimitPerMin: number;
  totalRequests: number;
  successRate: number;
  throttledRequests: number;
  quotaUsedPercent: number;
  peakRpm: number;
  avgLatencyMs: number;
  topEndpoints: { endpoint: string; count: number; percentage: number }[];
}

export interface ApiKeyUsageResponse {
  period: '24h' | '7d' | '30d';
  timeSeries: ApiKeyUsagePoint[];
  summaries: ApiKeyUsageSummary[];
  totalVolume: number;
  overallSuccessRate: number;
  overallThrottledCount: number;
  overallAvgLatencyMs: number;
}

export type AiToneStyle = 'architect' | 'security' | 'developer' | 'bot' | 'arabic';

export interface CodeDiagnosisRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python' | 'curl' | 'json' | 'sql';
  context?: string;
  autoFix?: boolean;
  analysisMode?: 'full' | 'syntax_only' | 'security_only' | 'refactor_only';
}

export interface CodeAnalysisIssue {
  line?: number;
  column?: number;
  category?: 'syntax' | 'security' | 'refactor' | 'performance' | 'typing';
  severity: 'error' | 'warning' | 'info' | 'security';
  message: string;
  suggestion: string;
  codeSnippet?: string;
}

export interface CodeDiagnosisResult {
  hasErrors: boolean;
  score: number; // 0-100 code quality / security score
  maintainabilityIndex?: number;
  syntaxErrorsCount?: number;
  securityFlawsCount?: number;
  refactoringCount?: number;
  issues: CodeAnalysisIssue[];
  fixedCode: string;
  explanation: string;
  refactoringHighlights?: string[];
  securityChecks: {
    check: string;
    status: 'pass' | 'fail' | 'warn';
    details: string;
  }[];
}

export interface WeeklyAgentQuota {
  weeklyLimit: number;
  weeklyUsed: number;
  remainingRuns: number;
  lastRunTimestamp: number | null;
  nextAvailableTimestamp: number | null;
  canExecute: boolean;
  timeRemainingFormatted: string;
}

export interface AgentExecutionTask {
  id: string;
  title: string;
  type: 'security_audit' | 'key_optimization' | 'traffic_rebalance' | 'full_remediation';
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: string;
  findingsCount: number;
  remediationsApplied: number;
  logSummary: string[];
}

export interface ClientRelease {
  id: string;
  platform: 'android' | 'windows' | 'macos' | 'linux';
  type: 'apk' | 'exe' | 'dmg' | 'appimage';
  name: string;
  version: string;
  releaseDate: string;
  sizeMb: number;
  downloadUrl: string;
  filename: string;
  sha256: string;
  minOsVersion: string;
  architecture: string;
  description: string;
  features: string[];
  downloadsCount: number;
  buildChannel?: 'stable' | 'beta' | 'nightly';
  hardwareSupport?: string[];
  signatureVerified?: boolean;
}

export interface SemanticSearchHit {
  id: string;
  title: string;
  category: 'documentation' | 'api_keys' | 'status' | 'bot_gateway' | 'security' | 'database' | 'downloads' | 'webhooks';
  snippet: string;
  targetView: string;
  relevanceScore: number; // 0-1
  confidenceLevel: 'high' | 'medium' | 'low';
  actionLabel?: string;
  tags?: string[];
  deepLinkParams?: Record<string, string>;
}

export interface SemanticSearchResponse {
  query: string;
  intent: string;
  aiExplanation?: string;
  hits: SemanticSearchHit[];
  totalIndexedItems: number;
  executionTimeMs: number;
}

export interface YouTubeVideoItem {
  id: string;
  title: string;
  description: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  videoUrl: string;
  embedUrl: string;
  duration?: string;
  views?: string;
  tags?: string[];
  aiTakeaway?: string;
}

export interface YouTubeSearchResponse {
  query: string;
  videos: YouTubeVideoItem[];
  totalResults: number;
  searchEngine: 'gemini_grounded' | 'youtube_direct';
  aiSummary?: string;
}

export interface ExternalDatabaseConfig {
  id: string;
  name: string;
  provider: 'supabase' | 'neon' | 'upstash' | 'render' | 'railway' | 'sqlite_cloud';
  tier: 'free' | 'pro' | 'enterprise';
  connectionUrlMasked: string;
  region: string;
  status: 'connected' | 'unreachable' | 'syncing' | 'idle';
  latencyMs: number;
  tablesCount: number;
  storageUsedMb: number;
  storageMaxMb: number;
  sslEnabled: boolean;
  lastTestedAt: string;
}

export interface VideoTutorialItem {
  id: string;
  title: string;
  titleArabic?: string;
  description: string;
  category: 'getting_started' | 'api_keys' | 'bots_webhooks' | 'desktop_mobile' | 'cloud_database';
  duration: string;
  thumbnailUrl: string;
  videoEmbedUrl: string;
  youtubeId?: string;
  badge: string;
  author: string;
  tags: string[];
  highlights: string[];
}


