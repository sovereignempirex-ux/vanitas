/**
 * Optional HTTP bridge to the Python AI microservice (`services/ai-service`).
 *
 * The AI/ML domain belongs to Python per the platform's language map, so when
 * `AI_SERVICE_URL` is configured every AI call is delegated there first. Every
 * function returns `null` whenever the service is unconfigured, unreachable,
 * slower than the budget, or answers with an unexpected shape — the caller then
 * falls back to the native TypeScript chain, so a dead Python service can never
 * take the product down.
 */
import type {
  AiQueryResult,
  GenerateAiOptions,
} from './aiService.ts';
import type {
  AiToneStyle,
  ApiKey,
  BotIntegration,
  CodeDiagnosisRequest,
  CodeDiagnosisResult,
} from '../types.ts';

const NON_STREAM_TIMEOUT_MS = Number(process.env.AI_SERVICE_TIMEOUT_MS || 24_000);
const STREAM_HEADER_TIMEOUT_MS = Number(process.env.AI_SERVICE_STREAM_TIMEOUT_MS || 8_000);

export function getAiServiceUrl(): string | null {
  const raw = (process.env.AI_SERVICE_URL || '').trim().replace(/\/+$/, '');
  return raw ? raw : null;
}

function serviceHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = process.env.AI_SERVICE_TOKEN;
  if (token) headers['X-Internal-Token'] = token;
  return headers;
}

/** POST JSON to the service; `null` on any transport/shape failure. */
async function postJson<T>(path: string, body: unknown, timeoutMs: number): Promise<T | null> {
  const base = getAiServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as T;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

async function getJson<T>(path: string, timeoutMs: number): Promise<T | null> {
  const base = getAiServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}${path}`, {
      headers: serviceHeaders(),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as T;
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function chatBody(options: GenerateAiOptions): Record<string, unknown> {
  return {
    persona: options.persona,
    toneStyle: options.toneStyle || 'developer',
    prompt: options.prompt,
    context: options.context ?? null,
    enableWebSearch: !!options.enableWebSearch,
    enableVideoSearch: !!options.enableVideoSearch,
  };
}

function toQueryResult(raw: Record<string, unknown>): AiQueryResult | null {
  if (typeof raw.text !== 'string' || !raw.text) return null;
  const engines = ['ollama', 'gemini', 'pollinations', 'pollinations_legacy', 'local_kb'];
  const engine = typeof raw.engine === 'string' && engines.includes(raw.engine)
    ? (raw.engine as AiQueryResult['engine'])
    : undefined;
  return {
    text: raw.text,
    engine,
    upstream: typeof raw.upstream === 'string' ? raw.upstream : null,
    groundingSources: Array.isArray(raw.groundingSources) ? raw.groundingSources : undefined,
    videos: raw.videos ?? undefined,
    videoQuery: typeof raw.videoQuery === 'string' ? raw.videoQuery : undefined,
  } as AiQueryResult;
}

/** Non-streaming chat through Python, or `null` to use the native chain. */
export async function remoteProcessAiQuery(
  options: GenerateAiOptions,
): Promise<AiQueryResult | null> {
  if (!getAiServiceUrl()) return null;
  const data = await postJson<Record<string, unknown>>(
    '/v1/ai/chat',
    chatBody(options),
    NON_STREAM_TIMEOUT_MS,
  );
  return data ? toQueryResult(data) : null;
}

/**
 * Streaming chat through Python. Deltas are forwarded to `onDelta` as they
 * arrive over SSE; `null` means "no usable stream — run the native chain".
 */
export async function remoteProcessAiQueryStream(
  options: GenerateAiOptions,
  onDelta: (chunk: string) => void,
): Promise<AiQueryResult | null> {
  const base = getAiServiceUrl();
  if (!base) return null;
  try {
    const response = await fetch(`${base}/v1/ai/chat/stream`, {
      method: 'POST',
      headers: serviceHeaders(),
      body: JSON.stringify(chatBody(options)),
      signal: AbortSignal.timeout(STREAM_HEADER_TIMEOUT_MS),
    });
    if (!response.ok || !response.body) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('event-stream')) {
      const raw = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const result = raw ? toQueryResult(raw) : null;
      if (result) onDelta(result.text);
      return result;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let result: AiQueryResult | null = null;
    let sawDelta = false;

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          const event = JSON.parse(payload) as Record<string, unknown>;
          if (typeof event.delta === 'string' && event.delta) {
            sawDelta = true;
            onDelta(event.delta);
          } else if (event.done && event.result && typeof event.result === 'object') {
            result = toQueryResult(event.result as Record<string, unknown>);
          }
        } catch {
          /* keep partial frames for the next line */
        }
      }
    }

    if (result) return result;
    // A stream that emitted deltas but never a final frame is still usable.
    return sawDelta ? null : null;
  } catch {
    return null;
  }
}

/** Code diagnosis through Python, or `null` for the native implementation. */
export async function remoteDiagnose(
  request: CodeDiagnosisRequest,
): Promise<CodeDiagnosisResult | null> {
  const data = await postJson<Record<string, unknown>>(
    '/v1/ai/diagnose',
    {
      code: request.code,
      language: request.language,
      context: request.context ?? null,
      analysisMode: request.analysisMode || 'full',
      autoFix: !!request.autoFix,
    },
    NON_STREAM_TIMEOUT_MS,
  );
  if (!data || typeof data.fixedCode !== 'string' || !Array.isArray(data.issues)) return null;
  return data as unknown as CodeDiagnosisResult;
}

export interface RemoteSemanticResult {
  query: string;
  intent: string;
  aiExplanation?: string;
  hits: unknown[];
  totalIndexedItems: number;
  executionTimeMs: number;
}

export async function remoteSemanticSearch(
  query: string,
  corpus: {
    docs: unknown[];
    keys: ApiKey[];
    status: unknown[];
    bots: BotIntegration[];
    threats: unknown[];
    releases: unknown[];
  },
): Promise<RemoteSemanticResult | null> {
  const data = await postJson<Record<string, unknown>>(
    '/v1/ai/semantic-search',
    { query, corpus },
    NON_STREAM_TIMEOUT_MS,
  );
  if (!data || !Array.isArray(data.hits) || typeof data.totalIndexedItems !== 'number') return null;
  return data as unknown as RemoteSemanticResult;
}

export async function remoteYouTubeSearch(
  query: string,
  maxResults: number,
): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams({ q: query, limit: String(maxResults) });
  return getJson<Record<string, unknown>>(`/v1/ai/youtube?${params.toString()}`, 15_000);
}

/** Typed voice for the assistant module — re-exported for convenience. */
export type { AiToneStyle };
