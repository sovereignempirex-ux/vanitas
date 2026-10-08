export type UserRole = 'USER' | 'ADMIN';

/**
 * Account verification badge (Meta/TikTok style, granted by admins only):
 * '' = no badge, USER = verified member, DEVELOPER = builder, ADMIN = staff.
 */
export type VerificationType = '' | 'USER' | 'DEVELOPER' | 'ADMIN';

/**
 * Developer invite link — created by an admin, handed to someone who does
 * NOT have an account yet; the role/badge is applied when they register
 * through it (single-use or limited-use, revocable, expiring).
 */
export interface AdminInvite {
  id: string;
  token: string;
  createdBy: string;
  createdByName: string;
  role: UserRole;
  verification: VerificationType;
  note: string;
  maxUses: number;
  uses: number;
  revoked: boolean;
  expiresAt: string;
  createdAt: string;
}

export type ClientSource = 'WEB' | 'BOT' | 'MOBILE' | 'DESKTOP' | 'APPLICATION' | 'OTHER';

/**
 * A user-published profile link (GitHub, site, Discord…) shown as a chip on
 * /u/<username>. The server only ever stores a short label plus a validated
 * https:// URL — nothing else can reach this shape.
 */
export interface ProfileLink {
  label: string;
  url: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  username: string;
  avatarUrl: string;
  bio?: string;
  /** User-chosen #RRGGBB profile accent (banner tint); unset = default gradient. */
  accentColor?: string;
  /** One-line status under the name ("Now building …"), ≤80 chars, single line. */
  statusLine?: string;
  /** Up to 5 published https links (server-validated). */
  profileLinks?: ProfileLink[];
  /** Free-text location ("Lisbon, PT") shown on /u/<username>. ≤60 chars. */
  location?: string;
  /** Up to 8 short tech tags ("TypeScript", "Postgres"). Each ≤24 chars. */
  techTags?: string[];
  role: UserRole;
  /** Verification badge granted by an admin — see VerificationType. */
  verification: VerificationType;
  twoFactorEnabled: boolean;
  createdAt: string;
  lastLoginAt: string;
  connectedAccounts: {
    google: boolean;
    github: boolean;
    discord: boolean;
  };
}

/**
 * A single comment surfaced on a profile's public activity list. Comments are
 * ordinary public docs content — a profile only aggregates what anyone can
 * already read on the docs page. Never includes user ids or emails.
 */
export interface PublicUserComment {
  /** Docs section slug (matches the /docs#<slug> anchor, e.g. "scopes"). */
  docSlug: string;
  body: string;
  createdAt: string;
}

/**
 * Public, shareable profile for /u/<username> — what anyone with the link can
 * see. Never includes email or internal ids.
 */
export interface PublicProfile {
  name: string;
  username: string;
  avatarUrl: string;
  bio: string;
  role: UserRole;
  verification: VerificationType;
  createdAt: string;
  connectedAccounts: User['connectedAccounts'];
  /** User-chosen banner accent, mirrored from the account record. */
  accentColor?: string;
  /** One-line status under the name — same value the account holder saved. */
  statusLine?: string;
  /** The account holder's published links (label + https URL only). */
  links?: ProfileLink[];
  /** The account holder's location, exactly as saved (≤60 chars). */
  location?: string;
  /** The account holder's tech tags, in the order they saved them. */
  techTags?: string[];
  /** Real number of docs comments this author wrote (0 on a fresh account). */
  commentCount?: number;
  /** The newest few of those comments — newest first, capped server-side. */
  recentComments?: PublicUserComment[];
}

/** Minimal account identity returned by authenticated account search. */
export interface SocialAccount {
  username: string;
  name: string;
  avatarUrl: string;
  verification: VerificationType;
  statusLine?: string;
}

export interface SocialConversation extends SocialAccount {
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
}

export interface DirectMessage {
  id: string;
  senderUsername: string;
  recipientUsername: string;
  content: string;
  createdAt: string;
  readAt: string | null;
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
  /**
   * sha256 hex of the raw secret. Defined NON-ENUMERABLE on the object at
   * runtime (Object.defineProperty) so JSON.stringify can never leak it.
   */
  secretHash?: string;
  /** Quota period 'YYYY-MM' — currentUsageThisMonth resets when this rolls. */
  usagePeriod?: string;
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
  category: 'ADMIN' | 'API' | 'SECURITY' | 'AUTH' | 'KEYS' | 'BOT' | 'DATABASE';
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
  /** Account that created this endpoint — rows predating ownership
   * hardening have none and are therefore admin-only. */
  ownerId?: string;
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
  /** Real 4xx/5xx count (excluding 429) recorded for this key in the window. */
  errorCount: number;
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
  /** Real 4xx/5xx count (excluding 429) across the whole window. */
  overallErrorCount: number;
  overallAvgLatencyMs: number;
}

export type AiToneStyle = 'architect' | 'security' | 'developer' | 'bot' | 'arabic';

export interface ProductSuggestion {
  id: string;
  title: string;
  details: string;
  category: 'bug' | 'feature' | 'ux';
  status: 'open' | 'reviewing' | 'resolved';
  createdAt: string;
  authorName: string;
  code?: string;
  adminNote?: string;
}

/** A real comment under a documentation page, written by a registered user. */
export interface DocComment {
  id: string;
  docId: string;
  userId: string;
  authorName: string;
  authorAvatar: string;
  body: string;
  createdAt: string;
}

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
  /** Real size of the published artifact (computed from the served bytes). */
  sizeMb: number;
  /** Exact artifact length in bytes — the source of truth for the UI. */
  sizeBytes: number;
  downloadUrl: string;
  filename: string;
  /** Real sha256 of the published artifact — verifiable end to end. */
  sha256: string;
  /**
   * What is actually downloadable today. 'manifest' = the signed build
   * manifest (text) — native binaries are not published yet; the catalog
   * serves 'binary' once real packages exist.
   */
  artifactKind: 'manifest' | 'binary';
  minOsVersion: string;
  architecture: string;
  description: string;
  features: string[];
  /** Real downloads served by this process — starts at 0, never seeded. */
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
  searchEngine: 'youtube_api' | 'youtube_keyless' | 'none';
  aiSummary?: string;
}

/** One persisted chat exchange for the signed-in account. */
export interface AiChatHistoryMessage {
  id: string;
  userId?: string;
  role: 'user' | 'ai';
  content: string;
  persona?: string;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Publishing & Sandbox — real GitHub projects and individual code files,
// published by their signed-in owners. Nothing is ever seeded: the
// gallery starts empty on a fresh install.
// ---------------------------------------------------------------------------

/** A single file inside a published project. */
export interface PublishedFile {
  path: string;
  content: string;
  language: string;
}

export interface PublishedProject {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  ownerAvatar: string;
  /** 'github' = imported from the owner's GitHub account, 'manual' = pasted code. */
  source: 'github' | 'manual';
  title: string;
  description: string;
  /** Original repository URL (github imports only). */
  repoUrl: string;
  language: string;
  /** True when the project contains an index.html → sandbox preview available. */
  isWeb: boolean;
  fileCount: number;
  createdAt: string;
}

/** Project detail — includes the full file list. */
export interface PublishedProjectDetail extends PublishedProject {
  files: PublishedFile[];
}

/** A single published code file ("snippet"). */
export interface PublishedSnippet {
  id: string;
  ownerId: string;
  ownerName: string;
  ownerUsername: string;
  ownerAvatar: string;
  title: string;
  language: string;
  content: string;
  createdAt: string;
}

/** A repository row from the signed-in user's GitHub account (never includes the token). */
export interface GitHubRepoInfo {
  fullName: string;
  name: string;
  owner: string;
  description: string;
  language: string;
  htmlUrl: string;
  isPrivate: boolean;
  updatedAt: string;
  sizeKb: number;
}

/** A third-party OAuth application registered by the user.
 *  The client secret is returned exactly once — on creation. */
export interface OAuthApp {
  id: string;
  ownerId: string;
  name: string;
  clientId: string;
  redirectUris: string[];
  scopes: string[];
  createdAt: string;
}

/** Validated authorize request + signed consent ticket. */
export interface OAuthAuthorizeValidation {
  ticket: string;
  app: { name: string; clientId: string; scopes: string[] };
  redirectUri: string;
  state: string;
}

/** OAuth scope definitions shown in the consent screen. */
export interface OAuthScopeInfo {
  id: string;
  label: string;
  description: string;
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
  /** Set only after a real probe — absent means "never tested". */
  lastTestedAt?: string;
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
