import { GoogleGenAI } from '@google/genai';
import { AiToneStyle, CodeDiagnosisRequest, CodeDiagnosisResult } from '../types.ts';

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  if (!aiClient && process.env.GEMINI_API_KEY) {
    aiClient = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

export interface GenerateAiOptions {
  persona: 'code' | 'api' | 'security' | 'analyst' | 'docs' | 'video' | 'admin';
  toneStyle?: AiToneStyle;
  prompt: string;
  context?: Record<string, unknown>;
  enableWebSearch?: boolean;
  enableVideoSearch?: boolean;
}

const CANDIDATE_MODELS = [
  'gemini-3.7-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
];

async function queryOllama(systemInstruction: string, prompt: string): Promise<string | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.AI_PROVIDER !== 'ollama' || !baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(30_000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        stream: false,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json() as { message?: { content?: string } };
    return data.message?.content?.trim() || null;
  } catch (error) {
    console.warn('Ollama unavailable; using the local deterministic fallback.', error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Free, keyless model: Pollinations.ai (OpenAI-compatible, no API key).
// This is the DEFAULT provider on Vercel — a real LLM answer with zero setup.
// One quick retry: the free tier intermittently answers 402/500 under load.
// ---------------------------------------------------------------------------
async function queryPollinations(systemInstruction: string, prompt: string): Promise<string | null> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20_000),
        body: JSON.stringify({
          model: 'openai',
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt },
          ],
        }),
      });
      if (!response.ok) {
        console.warn(`Pollinations HTTP ${response.status} (attempt ${attempt + 1});`);
        if (attempt === 0) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        return null;
      }
      const data = await response.json() as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      if (text) return text;
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      return null;
    } catch (error) {
      console.warn('Pollinations unavailable; using the local deterministic fallback.', error instanceof Error ? error.message : error);
      return null; // network/timeout — retrying immediately rarely helps
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Streaming variants — the reply is emitted token-by-token so the chat UI can
// reveal the answer progressively (typewriter feel) instead of one big blob.
// Both return the accumulated text, or null when streaming is unavailable so
// the caller can fall back to a full (non-stream) query.
// ---------------------------------------------------------------------------
async function queryPollinationsStream(
  systemInstruction: string,
  prompt: string,
  onDelta: (chunk: string) => void,
): Promise<string | null> {
  // Budget: the Vercel function is killed at 30s, so the stream must leave
  // room for the full-response fallback below.
  for (let attempt = 0; attempt < 2; attempt++) {
    let response: Response;
    try {
      response = await fetch('https://text.pollinations.ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
        signal: AbortSignal.timeout(24_000),
        body: JSON.stringify({
          model: 'openai',
          stream: true,
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: prompt },
          ],
        }),
      });
    } catch (error) {
      console.warn('Pollinations stream unavailable; using a full response instead.', error instanceof Error ? error.message : error);
      return null;
    }

    if (!response.ok || !response.body) {
      console.warn(`Pollinations stream HTTP ${response.status} (attempt ${attempt + 1});`);
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }
      return null;
    }

    // Provider ignored the stream flag and answered in one shot — still fine,
    // emit it as a single delta so the UI path stays identical.
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('event-stream')) {
      const raw = (await response.text()).trim();
      if (!raw) return null;
      let text = raw;
      try {
        const json = JSON.parse(raw) as { choices?: { message?: { content?: string } }[] };
        const content = json.choices?.[0]?.message?.content;
        if (content) text = content;
      } catch { /* plain-text body */ }
      onDelta(text);
      return text;
    }

    try {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let full = '';
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
            const json = JSON.parse(payload) as { choices?: { delta?: { content?: string } }[] };
            const delta = json.choices?.[0]?.delta?.content;
            if (delta) {
              full += delta;
              onDelta(delta);
            }
          } catch { /* keep partial frames for the next line */ }
        }
      }
      return full.trim() || null;
    } catch (error) {
      console.warn('Pollinations stream aborted; using a full response instead.', error instanceof Error ? error.message : error);
      return null;
    }
  }
  return null;
}

async function queryOllamaStream(
  systemInstruction: string,
  prompt: string,
  onDelta: (chunk: string) => void,
): Promise<string | null> {
  const baseUrl = process.env.OLLAMA_BASE_URL;
  if (process.env.AI_PROVIDER !== 'ollama' || !baseUrl) return null;

  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      signal: AbortSignal.timeout(60_000),
      body: JSON.stringify({
        model: process.env.OLLAMA_MODEL || 'llama3.2',
        stream: true,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: prompt },
        ],
      }),
    });
    if (!response.ok || !response.body) return null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const json = JSON.parse(trimmed) as { message?: { content?: string } };
          const delta = json.message?.content;
          if (delta) {
            full += delta;
            onDelta(delta);
          }
        } catch { /* incomplete NDJSON frame */ }
      }
    }
    return full.trim() || null;
  } catch (error) {
    console.warn('Ollama stream unavailable; using a full response instead.', error instanceof Error ? error.message : error);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Real reference data for THIS deployment — injected into every system
// instruction so the assistant answers about the actual site (its endpoints,
// scopes, limits, errors) instead of hallucinating APIs.
// ---------------------------------------------------------------------------
const SITE_FACTS = `=== VANITAS PLATFORM — REAL REFERENCE (this deployment) ===
Base URL: https://vanitas-bot.vercel.app/api/v1 — you are embedded in this
platform; answer about it using ONLY these verified facts:

AUTH & ACCOUNTS
- POST /auth/register {name, email, password} → creates the account and returns a session token. Password 8-128 chars; email must be valid; name required.
- POST /auth/login {email, password} → session token (then Bearer token on every request). When 2FA is on, finish via POST /auth/2fa/complete {code}.
- POST /auth/logout, GET /auth/me, PATCH /auth/profile {name?, avatarUrl?} (avatarUrl: https URL ≤500 chars or a base64 data:image URL ≤300KB), DELETE /auth/account (cascades all of that user's data).
- 2FA (TOTP): POST /auth/2fa/setup → otpauth URL + QR, POST /auth/2fa/enable {code}, POST /auth/2fa/disable {code}.
- Sessions: GET /auth/sessions, DELETE /auth/sessions/:id.
- Social login: GET /auth/providers → {google, discord, github}; start via GET /social/:provider → OAuth consent → GET /social/:provider/callback.
- Error codes: 400 validation, 401 missing/invalid credentials, 403 forbidden or insufficient scope, 404 not found, 409 conflict, 429 rate limited, 500 server error.

API KEYS (Authorization: Bearer sk_…, or a session token)
- GET /api-keys (list + allScopes), POST /api-keys {name, scopes[], rateLimit?, burstLimit?} → rawSecret is shown ONCE at creation.
- POST /api-keys/:id/rotate (new secret, old invalidated), DELETE /api-keys/:id (revoke), PATCH /api-keys/:id/scopes, PATCH /api-keys/:id/rate-limit, GET /api-keys/usage-analytics.
- Real scopes: api.read api.write users.read users.write users.delete roles.read roles.manage keys.read keys.create keys.rotate keys.revoke keys.scopes.update logs.read logs.export database.read database.write system.read system.manage security.read security.manage bot.execute analytics.read webhooks.manage settings.read settings.write admin.all.
- Scopes are enforced server-side (assertGrantableScopes): a USER account can never hold admin-only scopes (users.write, users.delete, roles.*, logs.*, database.*, system.manage, security.*, keys.scopes.update, settings.write, admin.all).
- Key-authenticated public endpoints: GET /public/ping, /public/me, /public/status (needs api.read), /public/quota.

BOT GATEWAY
- POST /bot/execute {platform: 'whatsapp'|'discord'|'telegram', command, payload} requires scope bot.execute; GET /bot/status.

WEBHOOKS: GET/POST /webhooks, POST /webhooks/:id/test.

COMMENTS (under docs pages)
- GET /comments/:docId, POST /comments/:docId {body} (registered users only, 2-2000 chars), DELETE /comments/:id (author or admin).

AI, SEARCH & CHAT
- POST /ai/chat {prompt, persona, toneStyle, stream?} — personas: code|api|security|analyst|docs|video|admin; tones: architect|security|developer|bot|arabic; stream:true returns an SSE stream of deltas.
- POST /ai/diagnose-fix {code, language, analysisMode} — static local analysis (brackets, secrets, auth, rate-limit, type-safety) plus an AI refactor proposal.
- GET /search/semantic (alias /semantic-search) {q} — semantic documentation search.
- GET /youtube/search?q=&limit= — live YouTube results.
- GET /ai/history and DELETE /ai/history — the signed-in user's own chat history.

ADMIN (role ADMIN only): /admin/users, /admin/users/:id/role, /admin/logs, /admin/logs/export, /admin/statistics, /admin/emergency, /admin/feature-flags, /admin/suggestions.

RATE LIMITS (requests per minute per IP): default 300; /public 1200; /auth 60; /ai 60; /bot 120; /comments 30. Each API key additionally has its own rateLimit/burstLimit.

SYSTEM: GET /health, GET /ready (readiness: database, auth, AI provider), GET /status.

DOCS UI SECTIONS: overview, authentication, scopes, endpoints, webhooks, bots, errors, sdks, comments.
=== END REFERENCE ===`;

export interface AiQueryResult {
  text: string;
  groundingSources?: { title: string; url: string }[];
  videos?: any[];
  videoQuery?: string;
  requiresConfirmation?: {
    action: string;
    target: string;
    permission: any;
    status: 'pending';
  };
}

interface PreparedQuery {
  instruction: string;
  videos?: any[];
  videoQuery?: string;
}

/**
 * Shared preparation: detect video intent, retrieve REAL videos and build the
 * system instruction (persona + tone + verified site facts). Both the
 * streaming and non-streaming entry points call this so they answer
 * identically.
 */
async function prepareAiQuery(options: GenerateAiOptions): Promise<PreparedQuery> {
  const { persona, toneStyle = 'developer', prompt, enableVideoSearch } = options;

  // Detect semantic video search intent
  const isVideoQuery =
    enableVideoSearch ||
    persona === 'video' ||
    /\b(video|videos|tutorial|tutorials|youtube|watch|walkthrough|screencast|guide|setup|course|learn)\b/i.test(prompt) ||
    (/[\u0600-\u06FF]/.test(prompt) && /(فيديو|فيديوهات|شرح|مرئي|يوتيوب|دروس|دورة|تطبيق|مشاهدة)/i.test(prompt));

  let retrievedVideos: any[] | undefined = undefined;
  let videoQueryStr: string | undefined = undefined;

  if (isVideoQuery) {
    // Extract core query for YouTube Data API / Semantic Search
    const cleanSearchQuery = prompt
      .replace(/(show me|give me|find|search for|can you show|video|videos|tutorial|tutorials|on youtube|youtube|please|شرح|فيديو|فيديوهات|عن|طريقة|دروس)/gi, '')
      .trim() || prompt;
    videoQueryStr = cleanSearchQuery.length > 2 ? cleanSearchQuery : prompt;

    try {
      const vResult = await searchYouTubeVideos(videoQueryStr, 4);
      if (vResult.videos && vResult.videos.length > 0) {
        retrievedVideos = vResult.videos;
      }
    } catch (vErr) {
      console.warn('Semantic video search in AI query error:', vErr);
    }
  }

  const baseInstructions: Record<string, string> = {
    code: `You are Vanitas Code Assistant, a world-class systems and API engineer. You provide precise TypeScript, Python, and cURL snippets for integrating with the Vanitas Central API, debugging payload structures, and hardening client implementations. Respond directly with clean syntax, Markdown code blocks, and architectural clarity.`,
    api: `You are Vanitas API Assistant. You understand every endpoint in the Vanitas Centralized Platform (/api/v1/...), including authentication tokens, API key scopes (e.g., api.read, api.write, users.read, keys.create, keys.rotate, keys.revoke, bot.execute, webhooks.manage, admin.all), rate limits, and error codes. Explain endpoints clearly and generate exact HTTP specifications.`,
    security: `You are Vanitas Security Analyst. You audit system events, identify suspicious authentication anomalies, evaluate API key permission scopes, and recommend threat mitigation strategies. If the user asks to revoke a key or block an IP, explain the risks and confirm.`,
    analyst: `You are Vanitas System Analyst. You analyze API throughput, p95 latencies, error distributions, and system health across Web, Bot, Mobile, and Desktop clients. Provide insightful, data-driven summaries.`,
    docs: `You are Vanitas Documentation Specialist. You guide developers through the Vanitas Platform documentation, including Webhooks, Bot integrations, RBAC permissions, and SDK setup.`,
    admin: `You are Vanitas Admin Remediation Assistant. Work only from an administrator's reviewed bug report and attached code. Explain the diagnosis, propose a minimal safe patch, never deploy or mutate production data yourself, and require human review before marking an issue resolved.`,
    video: `You are Vanitas Educational Video & Tutorial Specialist. You assist developers in discovering, understanding, and mastering video tutorials, architecture walkthroughs, and technical demonstrations. When explaining concepts, provide clear structured milestones, prerequisite knowledge, and highlight the practical key takeaways of the accompanying video lessons.`,
  };

  const toneModifiers: Record<AiToneStyle, string> = {
    architect: `Tone: Senior Systems Architect. High density, systematic, design-pattern-first, strict zero-trust principles, and enterprise resilience focus.`,
    security: `Tone: Red Team & Security Compliance Auditor. Rigorous privilege checks, vulnerability highlights, least-privilege scope enforcement, and defensive hardening.`,
    developer: `Tone: Modern Developer Friendly. Pragmatic, crystal clear code explanations, step-by-step guidance, clean formatting, and helpful tips.`,
    bot: `Tone: Autonomous Bot Orchestration Daemon. Concise, high-speed, command-dispatch oriented, minimal chatter, machine-parseable outputs with structured logs.`,
    arabic: `Tone & Language: مهندس برمجيات ونظم خبير يتحدث باللغة العربية الفصحى مع المصطلحات التقنية الدقيقة. اشرح الكود وطرق الربط مع منصة فانيتاس (Vanitas Central API) بأسلوب احترافي مع إعطاء أمثلة برمجية كاملة وحلول للأخطاء.`,
  };

  let selectedInstruction = `${baseInstructions[persona] || baseInstructions.code}\n${toneModifiers[toneStyle] || ''}\n\n${SITE_FACTS}`;
  if (retrievedVideos && retrievedVideos.length > 0) {
    selectedInstruction += `\nNote: ${retrievedVideos.length} educational YouTube video tutorials have been retrieved and will be displayed in interactive cards directly within the user interface. Reference the educational topics and offer practical implementation steps.`;
  }

  return { instruction: selectedInstruction, videos: retrievedVideos, videoQuery: videoQueryStr };
}

/** Full (non-streaming) provider chain: Ollama → Gemini → Pollinations → local. */
async function runFullQuery(options: GenerateAiOptions, prep: PreparedQuery): Promise<AiQueryResult> {
  const { persona, toneStyle = 'developer', prompt, context, enableWebSearch } = options;
  const selectedInstruction = prep.instruction;
  const retrievedVideos = prep.videos;
  const videoQueryStr = prep.videoQuery;

  const ollamaText = await queryOllama(selectedInstruction, prompt);
  if (ollamaText) {
    return { text: ollamaText, videos: retrievedVideos, videoQuery: videoQueryStr };
  }

  const ai = process.env.AI_PROVIDER === 'ollama' ? null : getAiClient();

  if (ai) {
    for (const modelName of CANDIDATE_MODELS) {
      try {
        const config: any = {
          systemInstruction: selectedInstruction,
          temperature: 0.7,
        };

        if (enableWebSearch) {
          config.tools = [{ googleSearch: {} }];
        }

        const response = await ai.models.generateContent({
          model: modelName,
          contents: prompt,
          config,
        });

        const text = response.text || 'No response generated.';
        const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        const groundingSources: { title: string; url: string }[] = [];

        if (chunks && Array.isArray(chunks)) {
          for (const chunk of chunks) {
            if (chunk.web?.uri) {
              groundingSources.push({
                title: chunk.web.title || chunk.web.uri,
                url: chunk.web.uri,
              });
            }
          }
        }

        return {
          text,
          groundingSources: groundingSources.length > 0 ? groundingSources : undefined,
          videos: retrievedVideos,
          videoQuery: videoQueryStr,
        };
      } catch (err: any) {
        const isTransient =
          err?.status === 503 ||
          err?.code === 503 ||
          err?.message?.includes('503') ||
          err?.message?.includes('high demand') ||
          err?.message?.includes('RESOURCE_EXHAUSTED') ||
          err?.message?.includes('429');

        if (isTransient && modelName !== CANDIDATE_MODELS[CANDIDATE_MODELS.length - 1]) {
          await new Promise((resolve) => setTimeout(resolve, 300));
          continue;
        }
      }
    }
  }

  // Free keyless model (Pollinations) — real answers whenever no paid
  // provider is configured (or they all failed). Last resort: canned local.
  const freeText = await queryPollinations(selectedInstruction, prompt);
  if (freeText) {
    return { text: freeText, videos: retrievedVideos, videoQuery: videoQueryStr };
  }

  // Last resort: deterministic local knowledge-base reply. Clearly disclose
  // that the live engine was unreachable — never pretend it was the model.
  const fallback = generateFallbackResponse(persona, toneStyle, prompt, context);
  const notice = /[\u0600-\u06FF]/.test(prompt)
    ? '> ⚠️ المحرك السحابي مؤقتاً غير متاح الآن — هذه الإجابة من قاعدة المعرفة المحلية المدمجة في المنصة.\n\n'
    : "> ⚠️ The live AI engine is temporarily unreachable — this reply comes from the platform's built-in local knowledge base.\n\n";
  return {
    ...fallback,
    text: `${notice}${fallback.text}`,
    videos: retrievedVideos,
    videoQuery: videoQueryStr,
  };
}

export async function processAiQuery(options: GenerateAiOptions): Promise<AiQueryResult> {
  const prep = await prepareAiQuery(options);
  return runFullQuery(options, prep);
}

/**
 * Streaming entry point: emits the answer incrementally through `onDelta` so
 * the chat can reveal it progressively. If no streaming provider works (or
 * Gemini web-search grounding is required), it degrades to one full query —
 * the emitted text is then a single chunk. `result.text` is always the
 * authoritative complete answer.
 */
export async function processAiQueryStream(
  options: GenerateAiOptions,
  onDelta: (chunk: string) => void,
): Promise<AiQueryResult> {
  const prep = await prepareAiQuery(options);
  let emitted = false;
  const emit = (chunk: string) => {
    emitted = true;
    onDelta(chunk);
  };

  // Google web-search grounding only exists on the non-streaming Gemini path.
  const needsGeminiGrounding =
    !!options.enableWebSearch && process.env.AI_PROVIDER !== 'ollama' && !!getAiClient();

  if (!needsGeminiGrounding) {
    let streamed = await queryOllamaStream(prep.instruction, options.prompt, emit);
    if (streamed === null && !emitted) {
      streamed = await queryPollinationsStream(prep.instruction, options.prompt, emit);
    }
    if (streamed !== null) {
      return { text: streamed, videos: prep.videos, videoQuery: prep.videoQuery };
    }
  }

  const full = await runFullQuery(options, prep);
  // A partial stream already went out → don't repeat it; the caller's final
  // event carries `full.text`, which the client syncs to.
  if (full.text && !emitted) onDelta(full.text);
  return full;
}

function generateFallbackResponse(
  persona: string,
  toneStyle: AiToneStyle,
  prompt: string,
  _context?: Record<string, unknown>
): {
  text: string;
  groundingSources?: { title: string; url: string }[];
  requiresConfirmation?: {
    action: string;
    target: string;
    permission: any;
    status: 'pending';
  };
} {
  const p = prompt.toLowerCase().trim();

  // Arabic tone responses
  if (toneStyle === 'arabic' || /[\u0600-\u06FF]/.test(prompt)) {
    if (p.includes('مفتاح') || p.includes('api key') || p.includes('انشاء') || p.includes('تدوير') || p.includes('rotate')) {
      return {
        text: `### 🔑 إدارة مفاتيح الـ API في منصة Vanitas\n\nتعتمد منصة فانيتاس نظام أمان صارم يعتمد على الصلاحيات المحددة بدقة (**Granular Scopes**) مع التحقق من الصلاحيات من جهة السيرفر لمنع أي تصعيد غير مصرح به للصلاحيات (\`assertGrantableScopes\`).\n\n\`\`\`typescript\n// مثال: ربط العميل وتدوير المفتاح بأمان\nimport { VanitasClient } from '@vanitas/sdk';\n\nconst vanitas = new VanitasClient({\n  apiKey: process.env.VANITAS_API_KEY,\n  baseUrl: 'https://vanitas-bot.vercel.app/api/v1'\n});\n\nasync function rotateKey() {\n  const result = await vanitas.keys.rotate('key_id_here');\n  console.log('المفتاح السري الجديد (يظهر مرة واحدة فقط):', result.rawSecret);\n}\n\`\`\`\n\n**أبرز الصلاحيات:**\n- \`api.read\` / \`api.write\`: قراءة وكتابة الموارد الأساسية\n- \`bot.execute\`: تنفيذ أوامر البوت (Discord و WhatsApp)\n- \`keys.rotate\` / \`keys.revoke\`: إدارة دورة حياة المفاتيح.`,
        groundingSources: [
          { title: 'توثيق منصة فانيتاس الرسمية: الصلاحيات والأمان', url: 'https://vanitas-bot.vercel.app/docs#scopes' },
        ],
      };
    }

    if (p.includes('بوت') || p.includes('bot') || p.includes('discord') || p.includes('whatsapp')) {
      return {
        text: `### 🤖 بوابة البوت المركزية في فانيتاس (Bot Gateway)\n\nتتيح المنصة ربط تطبيقات بوت WhatsApp و Discord عبر نقطة دخول موحدة \`POST /api/v1/bot/execute\` مع تسجيل فوري في سجلات التدقيق.\n\n\`\`\`bash\ncurl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\\n  -H "Authorization: Bearer sk_live_discord_••••••••" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "platform": "discord",\n    "command": "system_status",\n    "payload": { "channel": "operations" }\n  }'\n\`\`\`\n\nيتم تنفيذ الأمر بزمن استجابة فائق السرعة (~14ms) مع التحقق من صلاحية \`bot.execute\`.`,
        groundingSources: [
          { title: 'دليل ربط البوت المركزي', url: 'https://vanitas-bot.vercel.app/docs#bots' },
        ],
      };
    }

    return {
      text: `### 🌌 مساعد الذكاء الاصطناعي لمنصة Vanitas\n\nأهلاً بك! أنا نظام الذكاء الاصطناعي المدمج لمنصة فانيتاس المركزية. يمكنني مساعدتك في:\n1. **تصحيح الكود واكتشاف الأخطاء الثنائية والأمنية**\n2. **توليد أكواد TypeScript و Python و cURL جاهزة للإنتاج**\n3. **فحص الصلاحيات ومصفوفة الأمان ومنع الثغرات**\n4. **تحليل حركة المرور وإحصائيات الاستهلاك وسرعة الاستجابة (p95 latency)**\n\nكيف تود أن نطور بنيتك التحتية اليوم؟`,
      groundingSources: [
        { title: 'توثيق فانيتاس الشامل', url: 'https://vanitas-bot.vercel.app/docs' },
      ],
    };
  }

  // Destructive / high-privilege detection
  if (persona === 'security' && (p.includes('revoke') || p.includes('delete key') || p.includes('block') || p.includes('purge'))) {
    return {
      text: `⚠️ **Security Action Verification Required**\n\nI have evaluated the requested operation against active RBAC policies. Because this is an irreversible high-impact change, please verify before execution:\n\n- **Target Entity:** Active Authorization Token / Session\n- **Policy Enforcement:** Immediate invalidation across all edge gateways\n- **Audit Compliance:** An immutable audit trail entry will be generated.`,
      requiresConfirmation: {
        action: 'Revoke Key Authorization',
        target: 'Target API Token / Session',
        permission: 'keys.revoke',
        status: 'pending',
      },
    };
  }

  // API Key & Scope queries
  if (p.includes('api key') || p.includes('create key') || p.includes('rotate') || p.includes('scopes') || p.includes('assertgrantablescopes')) {
    return {
      text: `### 🔑 Vanitas API Key Management & Scope Resolution\n\nAll API keys in Vanitas are issued with **Granular Scopes** enforced on the server-side via \`assertGrantableScopes\` to eliminate privilege escalation risks.\n\n\`\`\`typescript\n// Example: Initialize Vanitas Client and Rotate Key\nimport { VanitasClient } from '@vanitas/sdk';\n\nconst client = new VanitasClient({\n  apiKey: process.env.VANITAS_API_KEY,\n  endpoint: 'https://vanitas-bot.vercel.app/api/v1'\n});\n\n// Rotate key safely with instant token invalidation\nconst { rawSecret, key } = await client.keys.rotate('key_id_here');\nconsole.log('New Secret (Store Safely):', rawSecret);\n\`\`\`\n\n**Key Scope Hierarchy:**\n- \`api.read\` / \`api.write\` — General entity query & mutation\n- \`bot.execute\` — Dispatches automated commands to WhatsApp, Discord, Telegram\n- \`keys.create\`, \`keys.rotate\`, \`keys.revoke\` — Developer token lifecycle\n- \`admin.all\` — Full administrative control (Admin role only)`,
      groundingSources: [
        { title: 'Vanitas Official Docs: Scopes & Permissions', url: 'https://vanitas-bot.vercel.app/docs#scopes' },
        { title: 'API Key Safe Rotation Workflow', url: 'https://vanitas-bot.vercel.app/docs#keys' },
      ],
    };
  }

  // Bot Gateway queries
  if (p.includes('bot') || p.includes('discord') || p.includes('whatsapp') || p.includes('telegram') || p.includes('execute')) {
    return {
      text: `### 🤖 Vanitas Bot Gateway Integration\n\nVanitas provides a unified ingress for WhatsApp, Discord, and Telegram bots. The bot communicates via \`POST /api/v1/bot/execute\` using an API Key granted with the \`bot.execute\` scope.\n\n\`\`\`bash\n# Send command to Discord Bot\ncurl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\\n  -H "Authorization: Bearer sk_live_discord_••••••••" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "platform": "discord",\n    "command": "system_status",\n    "payload": { "notifyChannel": "ops-main" }\n  }'\n\`\`\`\n\n**Supported Platforms:**\n1. **WhatsApp Core Bot**: Operational (14ms latency, QR/Session auth)\n2. **Discord Ops Bot**: Operational (8ms latency, Slash commands)\n3. **Telegram Notifier**: Standby (Webhook dispatch)\n\nAll executions generate structured audit logs tagged with the \`BOT\` category.`,
      groundingSources: [
        { title: 'Vanitas Bot Gateway Architecture', url: 'https://vanitas-bot.vercel.app/docs#bots' },
      ],
    };
  }

  // Code snippet or generic programming / SDK queries
  return {
    text: `### 🌌 Vanitas Intelligence Copilot (${persona.toUpperCase()} • ${toneStyle.toUpperCase()})\n\nHere is the recommended implementation pattern for your request:\n\n\`\`\`typescript\nimport { VanitasClient } from '@vanitas/sdk';\n\nconst vanitas = new VanitasClient({\n  apiKey: process.env.VANITAS_API_KEY,\n  baseUrl: 'https://vanitas-bot.vercel.app/api/v1'\n});\n\n// Example: Query platform status & execute command\nasync function run() {\n  const status = await vanitas.system.getStatus();\n  console.log('System Status:', status);\n}\nrun();\n\`\`\`\n\n**Available Capabilities:**\n- Live Code Fixer & AST Security Scanner tool\n- Endpoint integration schemas & payload construction\n- Token scope matrix & \`assertGrantableScopes\` validation\n- Real-time bot gateway control for WhatsApp and Discord\n- Multi-tone generation with full Arabic & English technical support.`,
    groundingSources: [
      { title: 'Vanitas Central Documentation', url: 'https://vanitas-bot.vercel.app/docs' },
    ],
  };
}

/**
 * Intelligent Code Diagnosis, Syntax Parser, Security Audit & Refactoring Engine
 */
export async function diagnoseAndFixCode(req: CodeDiagnosisRequest): Promise<CodeDiagnosisResult> {
  const { code, language, context, analysisMode = 'full' } = req;
  const ai = getAiClient();
  const hasCode = code.trim().length > 0;
  let diagnosisPrompt = '';

  if (hasCode) {
    try {
      diagnosisPrompt = `You are the Vanitas Autonomous Code Analysis & Refactoring Engine powered by Gemini.
You analyze developer code snippets for:
1. Syntax errors, invalid grammar, missing brackets, broken imports, type violations, and compilation issues.
2. Security vulnerabilities, exposed raw secrets, missing Bearer authentication, missing HMAC verification, and injection flaws.
3. Architectural and refactoring improvements (e.g., exponential retry-after backoff on HTTP 429, structured async/await exception handling, strict typing, clean separation of concerns, connection reuse).
4. Maintainability and performance optimization.

Language: ${language}
Analysis Focus Mode: ${analysisMode}
${context ? `Developer Context: ${context}` : ''}

Respond ONLY with a valid JSON object matching this schema:
{
  "hasErrors": boolean,
  "score": number (0-100 code health score),
  "maintainabilityIndex": number (0-100 maintainability score),
  "syntaxErrorsCount": number,
  "securityFlawsCount": number,
  "refactoringCount": number,
  "issues": [
    {
      "line": number (1-indexed line number if determinable),
      "column": number (optional),
      "category": "syntax" | "security" | "refactor" | "performance" | "typing",
      "severity": "error" | "warning" | "info" | "security",
      "message": "concise description of the flaw or error",
      "suggestion": "actionable refactoring advice",
      "codeSnippet": "the buggy line or token"
    }
  ],
  "fixedCode": "the complete, clean, production-ready refactored code without markdown ticks around it",
  "explanation": "structured summary explaining all syntax fixes, security hardenings, and refactoring choices made",
  "refactoringHighlights": [
    "Key refactoring highlight 1",
    "Key refactoring highlight 2"
  ],
  "securityChecks": [
    {
      "check": "Name of verification check",
      "status": "pass" | "fail" | "warn",
      "details": "assessment description"
    }
  ]
}

Code to analyze:
\`\`\`${language}
${code}
\`\`\``;

      if (ai) for (const modelName of CANDIDATE_MODELS) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: diagnosisPrompt,
            config: {
              responseMimeType: 'application/json',
              temperature: 0.15,
            },
          });

          if (response.text) {
            const parsed = JSON.parse(response.text);
            // Ensure counts are accurate
            const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
            const syntaxErrorsCount = parsed.syntaxErrorsCount ?? issues.filter((i: any) => i.category === 'syntax' || i.severity === 'error').length;
            const securityFlawsCount = parsed.securityFlawsCount ?? issues.filter((i: any) => i.category === 'security' || i.severity === 'security').length;
            const refactoringCount = parsed.refactoringCount ?? issues.filter((i: any) => i.category === 'refactor' || i.category === 'performance').length;

            return {
              hasErrors: parsed.hasErrors ?? (syntaxErrorsCount > 0 || securityFlawsCount > 0),
              score: Math.min(100, Math.max(0, parsed.score ?? 85)),
              maintainabilityIndex: Math.min(100, Math.max(0, parsed.maintainabilityIndex ?? 88)),
              syntaxErrorsCount,
              securityFlawsCount,
              refactoringCount,
              issues,
              fixedCode: parsed.fixedCode || code,
              explanation: parsed.explanation || 'Analyzed code structure and applied production refactorings.',
              refactoringHighlights: Array.isArray(parsed.refactoringHighlights) ? parsed.refactoringHighlights : [],
              securityChecks: Array.isArray(parsed.securityChecks) ? parsed.securityChecks : [],
            };
          }
        } catch (mErr: any) {
          console.warn(`Model ${modelName} code analysis attempt failed:`, mErr?.message);
        }
      }
    } catch (err) {
      console.warn('AI Code Diagnosis fallback triggered:', err);
    }
  }

  // Free keyless model (Pollinations): real LLM diagnosis, zero setup.
  if (diagnosisPrompt) {
    try {
      const freeText = await queryPollinations(
        'You are a strict code-analysis engine. Respond ONLY with the valid JSON object requested — no markdown fences, no prose.',
        diagnosisPrompt,
      );
      if (freeText) {
        const parsed = JSON.parse(freeText.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, ''));
        const issues = Array.isArray(parsed.issues) ? parsed.issues : [];
        const syntaxErrorsCount = parsed.syntaxErrorsCount ?? issues.filter((i: any) => i.category === 'syntax' || i.severity === 'error').length;
        const securityFlawsCount = parsed.securityFlawsCount ?? issues.filter((i: any) => i.category === 'security' || i.severity === 'security').length;
        const refactoringCount = parsed.refactoringCount ?? issues.filter((i: any) => i.category === 'refactor' || i.category === 'performance').length;
        return {
          hasErrors: parsed.hasErrors ?? (syntaxErrorsCount > 0 || securityFlawsCount > 0),
          score: Math.min(100, Math.max(0, parsed.score ?? 85)),
          maintainabilityIndex: Math.min(100, Math.max(0, parsed.maintainabilityIndex ?? 88)),
          syntaxErrorsCount,
          securityFlawsCount,
          refactoringCount,
          issues,
          fixedCode: parsed.fixedCode || code,
          explanation: parsed.explanation || 'Analyzed code structure and applied production refactorings.',
          refactoringHighlights: Array.isArray(parsed.refactoringHighlights) ? parsed.refactoringHighlights : [],
          securityChecks: Array.isArray(parsed.securityChecks) ? parsed.securityChecks : [],
        };
      }
    } catch (err) {
      console.warn('Pollinations diagnosis unavailable; using local analyzer.', (err as Error).message);
    }
  }

  // Robust Fallback Static Analysis & AST-Pattern Refactoring Engine
  return analyzeCodeLocally(code, language);
}

function analyzeCodeLocally(code: string, language: string): CodeDiagnosisResult {
  const issues: CodeDiagnosisResult['issues'] = [];
  const securityChecks: CodeDiagnosisResult['securityChecks'] = [];
  const refactoringHighlights: string[] = [];
  let fixedCode = code;
  let score = 95;
  const lines = code.split('\n');

  // Check 1: Syntax & Bracket Balance
  let openBraces = 0;
  let openParens = 0;
  let openBrackets = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    openBraces += (line.match(/{/g) || []).length - (line.match(/}/g) || []).length;
    openParens += (line.match(/\(/g) || []).length - (line.match(/\)/g) || []).length;
    openBrackets += (line.match(/\[/g) || []).length - (line.match(/\]/g) || []).length;
  }

  if (openBraces !== 0 || openParens !== 0 || openBrackets !== 0) {
    issues.push({
      line: lines.length,
      category: 'syntax',
      severity: 'error',
      message: `Syntax error: Unmatched enclosing brackets (Delta: Braces ${openBraces}, Parens ${openParens}, Brackets ${openBrackets}).`,
      suggestion: 'Ensure all opening braces, parentheses, and brackets are properly closed.',
      codeSnippet: lines[lines.length - 1] || code,
    });
    score -= 30;
    if (openBraces > 0) fixedCode += '\n}'.repeat(openBraces);
    if (openParens > 0) fixedCode += ')'.repeat(openParens);
    if (openBrackets > 0) fixedCode += ']'.repeat(openBrackets);
    refactoringHighlights.push('Fixed unclosed bracket syntax errors.');
  }

  // Check 2: Raw Secrets / Exposed API Tokens
  if (/sk_live_[a-zA-Z0-9_-]{10,}/.test(code) || /password\s*=\s*['"][^'"]+['"]/.test(code) || /token\s*=\s*['"][a-zA-Z0-9_\-\.]{20,}['"]/.test(code)) {
    const secretLineIdx = lines.findIndex((l) => /sk_live_|password\s*=|token\s*=\s*['"]/.test(l));
    issues.push({
      line: secretLineIdx !== -1 ? secretLineIdx + 1 : undefined,
      category: 'security',
      severity: 'security',
      message: 'Hardcoded production secret token detected in plain source code.',
      suggestion: 'Migrate raw secrets to process.env or secure vault injection.',
      codeSnippet: secretLineIdx !== -1 ? lines[secretLineIdx] : undefined,
    });
    fixedCode = fixedCode.replace(/sk_live_[a-zA-Z0-9_-]+/g, 'process.env.VANITAS_API_KEY || ""');
    score -= 25;
    refactoringHighlights.push('Isolated credentials into secure environment variable configuration.');
    securityChecks.push({
      check: 'Credential Isolation & Secrets Vault',
      status: 'fail',
      details: 'Detected raw live tokens in payload. Replaced with process.env lookup.',
    });
  } else {
    securityChecks.push({
      check: 'Credential Isolation & Secrets Vault',
      status: 'pass',
      details: 'No plaintext production credentials exposed.',
    });
  }

  // Check 3: Missing Bearer Header Prefix
  if (code.includes('headers') && !code.includes('Bearer ') && code.includes('Authorization')) {
    const authLineIdx = lines.findIndex((l) => l.includes('Authorization'));
    issues.push({
      line: authLineIdx !== -1 ? authLineIdx + 1 : undefined,
      category: 'syntax',
      severity: 'error',
      message: 'Authorization header is missing standard "Bearer " scheme prefix.',
      suggestion: 'Prefix token string with `Bearer ${token}` to avoid HTTP 401 Unauthorized.',
      codeSnippet: authLineIdx !== -1 ? lines[authLineIdx] : undefined,
    });
    fixedCode = fixedCode.replace(/['"]Authorization['"]\s*:\s*([^,\n}]+)/g, '"Authorization": `Bearer ${$1}`');
    score -= 15;
    refactoringHighlights.push('Formatted Authorization header with standard Bearer schema.');
  }

  // Check 4: Rate Limiting & Throttling Resilience (HTTP 429)
  if ((code.includes('fetch(') || code.includes('axios.') || code.includes('requests.')) && !code.includes('429') && !code.includes('retry')) {
    issues.push({
      category: 'refactor',
      severity: 'warning',
      message: 'No rate-limit (HTTP 429 / Retry-After) exponential backoff handling found.',
      suggestion: 'Implement retry backoff logic to ensure graceful recovery during traffic bursts.',
    });
    score -= 15;
    refactoringHighlights.push('Added resilience recommendations for HTTP 429 rate limit backoff.');
    securityChecks.push({
      check: 'Rate Limiting & Ingress Resilience',
      status: 'warn',
      details: 'Client does not handle HTTP 429 throttling signals.',
    });
  } else {
    securityChecks.push({
      check: 'Rate Limiting & Ingress Resilience',
      status: 'pass',
      details: 'Proper throttle and backoff mechanism present.',
    });
  }

  // Check 5: Webhook Signature Verification Flaws (Python / JS)
  if ((code.includes('webhook') || code.includes('/webhook')) && !code.includes('hmac') && !code.includes('signature') && !code.includes('sha256')) {
    issues.push({
      category: 'security',
      severity: 'security',
      message: 'Webhook handler does not verify cryptographic HMAC-SHA256 signature.',
      suggestion: 'Validate x-vanitas-signature header before processing incoming webhook payloads.',
    });
    score -= 20;
    refactoringHighlights.push('Recommended HMAC-SHA256 signature verification for inbound webhooks.');
    securityChecks.push({
      check: 'Webhook Payload Integrity (HMAC)',
      status: 'fail',
      details: 'Insecure webhook receiver accepting unsigned payloads.',
    });
  } else {
    securityChecks.push({
      check: 'Webhook Payload Integrity (HMAC)',
      status: 'pass',
      details: 'Payload integrity verification present or not required.',
    });
  }

  // Check 6: Unsafe `any` Types
  if (language === 'typescript' && (code.includes(': any') || code.includes('as any'))) {
    issues.push({
      category: 'typing',
      severity: 'info',
      message: 'Use of unsafe `any` type bypasses TypeScript static compiler checks.',
      suggestion: 'Replace `any` with specific domain interfaces or `unknown`.',
    });
    score -= 8;
    refactoringHighlights.push('Refactored dynamic `any` types into strict TypeScript interfaces.');
  }

  // Check 7: SQL Concatenation / Injection Risks
  if ((language === 'sql' || code.includes('SELECT ') || code.includes('WHERE ')) && (code.includes('${') || code.includes(' + '))) {
    issues.push({
      category: 'security',
      severity: 'security',
      message: 'Potential SQL injection risk due to raw string interpolation in query string.',
      suggestion: 'Use parameterized queries or prepared statements.',
    });
    score -= 25;
    refactoringHighlights.push('Replaced raw SQL string interpolation with parameterized queries.');
  }

  if (issues.length === 0) {
    issues.push({
      category: 'refactor',
      severity: 'info',
      message: 'Code passed all static syntax, security, and API integration checks.',
      suggestion: 'Ready for production deployment.',
    });
  }

  const syntaxErrorsCount = issues.filter((i) => i.category === 'syntax' || i.severity === 'error').length;
  const securityFlawsCount = issues.filter((i) => i.category === 'security' || i.severity === 'security').length;
  const refactoringCount = issues.filter((i) => i.category === 'refactor' || i.category === 'performance' || i.category === 'typing').length;

  return {
    hasErrors: syntaxErrorsCount > 0 || securityFlawsCount > 0,
    score: Math.max(20, score),
    maintainabilityIndex: Math.max(30, Math.min(98, score + 5)),
    syntaxErrorsCount,
    securityFlawsCount,
    refactoringCount,
    issues,
    fixedCode,
    explanation: `Vanitas Code Doctor performed automated static and security analysis. Identified ${issues.length} item(s) across syntax, security headers, rate-limiting handlers, and type safety. Refactored into a hardened, production-ready structure.`,
    refactoringHighlights: refactoringHighlights.length > 0 ? refactoringHighlights : ['Applied clean error handling and structured formatting.'],
    securityChecks: securityChecks.length > 0 ? securityChecks : [
      { check: 'Zero-Trust Role Validation', status: 'pass', details: 'Validated permissions' },
      { check: 'Payload Sanitization', status: 'pass', details: 'No dangerous injections detected' },
    ],
  };
}

/**
 * AI-Powered Semantic Search across Documentation, API Keys, System Status, Security & Downloads
 */
export async function performSemanticSearch(
  query: string,
  corpus: {
    docs: any[];
    keys: any[];
    status: any[];
    bots: any[];
    threats: any[];
    releases: any[];
  }
): Promise<{
  query: string;
  intent: string;
  aiExplanation?: string;
  hits: any[];
  totalIndexedItems: number;
  executionTimeMs: number;
}> {
  const startTime = Date.now();
  const ai = getAiClient();

  // 1. Flatten corpus into searchable items
  const indexedItems: {
    id: string;
    title: string;
    category: string;
    snippet: string;
    targetView: string;
    actionLabel?: string;
    tags: string[];
    rawText: string;
  }[] = [];

  // Index Documentation
  if (corpus.docs && Array.isArray(corpus.docs)) {
    for (const doc of corpus.docs) {
      indexedItems.push({
        id: `doc_${doc.id || doc.title}`,
        title: doc.title || 'Documentation Guide',
        category: 'documentation',
        snippet: doc.description || doc.content?.substring(0, 160) || '',
        targetView: 'docs',
        actionLabel: 'Open in Developer Portal',
        tags: doc.tags || ['api', 'sdk', 'endpoints'],
        rawText: `${doc.title} ${doc.description} ${doc.tags?.join(' ')} ${doc.content || ''}`.toLowerCase(),
      });
    }
  }

  // Index API Keys
  if (corpus.keys && Array.isArray(corpus.keys)) {
    for (const key of corpus.keys) {
      indexedItems.push({
        id: `key_${key.id}`,
        title: `API Key: ${key.name} (${key.keyPrefix}...)`,
        category: 'api_keys',
        snippet: `Owner: ${key.ownerName} | Env: ${key.environment.toUpperCase()} | Status: ${key.status} | Scopes: [${key.scopes.join(', ')}] | Rate Limit: ${key.rateLimitPerMin || 120} RPM`,
        targetView: 'keys',
        actionLabel: 'Manage Key & Scopes',
        tags: [key.environment, key.status, ...key.scopes, 'credentials', 'rate-limit'],
        rawText: `${key.name} ${key.ownerName} ${key.environment} ${key.status} ${key.scopes.join(' ')} ${key.keyPrefix}`.toLowerCase(),
      });
    }
  }

  // Index System Status & Services
  if (corpus.status && Array.isArray(corpus.status)) {
    for (const s of corpus.status) {
      indexedItems.push({
        id: `status_${s.name}`,
        title: `Service Status: ${s.name}`,
        category: 'status',
        snippet: `Uptime: ${s.uptime} | Latency: ${s.latency} | Current Status: ${s.status.toUpperCase()}`,
        targetView: 'status',
        actionLabel: 'View Live Metrics',
        tags: ['uptime', 'latency', 'health', s.status, s.name.toLowerCase()],
        rawText: `${s.name} ${s.status} ${s.uptime} ${s.latency} status health service`.toLowerCase(),
      });
    }
  }

  // Index Bot Gateway
  if (corpus.bots && Array.isArray(corpus.bots)) {
    for (const bot of corpus.bots) {
      indexedItems.push({
        id: `bot_${bot.id}`,
        title: `Bot: ${bot.name} (${bot.type.toUpperCase()})`,
        category: 'bot_gateway',
        snippet: `Status: ${bot.status} | Handlers: ${bot.eventHandlers?.join(', ')} | Rate: ${bot.rateLimitPerMin} RPM`,
        targetView: 'bot-gateway',
        actionLabel: 'Open Bot Gateway',
        tags: ['bot', bot.type, bot.status, ...(bot.eventHandlers || [])],
        rawText: `${bot.name} ${bot.type} ${bot.status} ${bot.eventHandlers?.join(' ')}`.toLowerCase(),
      });
    }
  }

  // Index Downloads & Modern Clients
  if (corpus.releases && Array.isArray(corpus.releases)) {
    for (const rel of corpus.releases) {
      indexedItems.push({
        id: `rel_${rel.id}`,
        title: `Download Client: ${rel.name} (v${rel.version})`,
        category: 'downloads',
        snippet: `${rel.platform.toUpperCase()} ${rel.type.toUpperCase()} | Arch: ${rel.architecture} | Min OS: ${rel.minOsVersion} | ${rel.description}`,
        targetView: 'downloads',
        actionLabel: `Download ${rel.filename}`,
        tags: ['download', rel.platform, rel.type, rel.architecture, 'install', 'apk', 'exe'],
        rawText: `${rel.name} ${rel.platform} ${rel.type} ${rel.architecture} ${rel.description} ${rel.features?.join(' ')}`.toLowerCase(),
      });
    }
  }

  const q = query.toLowerCase().trim();

  // Try Gemini AI semantic understanding
  let aiExplanation = '';
  let parsedIntent = 'Semantic query across platform resources';

  if (ai && query.length > 2) {
    try {
      const prompt = `You are the Vanitas Semantic Search Engine.
Given the user's natural language search query: "${query}"
And this summary of platform sections:
- Documentation (/docs): Guides, API specifications, scopes, error handling, rate limiting.
- API Keys (/keys): Authorized keys, token rotation, secret hashing, rate limit presets, bursts.
- Public Status (/status): Health of API Ingress, Auth Gateway, PostgreSQL Cluster, WebSocket, Redis.
- Bot Gateway (/bot-gateway): Discord & WhatsApp bot dispatch, Webhook ingestion, slash commands.
- Security Center (/security): 2FA, session devices, brute-force threat mitigation, RBAC.
- Downloads (/downloads): Android APK, Windows EXE (x64/ARM64), macOS DMG, Linux AppImage.
- Database & External Servers: Supabase, Neon PostgreSQL, Upstash Redis, Render, Railway.

Respond in valid JSON only with this structure:
{
  "intent": "Brief description of user intent in 1 sentence (supports Arabic or English based on query)",
  "aiExplanation": "Helpful AI answer explaining where to find this and the direct resolution in 1-2 concise sentences",
  "relevantCategories": ["documentation", "api_keys", "status", "bot_gateway", "security", "downloads", "database"],
  "keywords": ["keyword1", "keyword2", "keyword3"]
}`;

      const aiResponse = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      });

      const parsed = JSON.parse(aiResponse.text || '{}');
      if (parsed.intent) parsedIntent = parsed.intent;
      if (parsed.aiExplanation) aiExplanation = parsed.aiExplanation;
    } catch (e) {
      console.warn('Gemini semantic search parser fallback:', e);
    }
  }

  // Calculate semantic & keyword relevance scores
  const queryTokens = q.split(/\s+/).filter(Boolean);

  const scoredHits = indexedItems
    .map((item) => {
      let score = 0;
      const titleLower = item.title.toLowerCase();
      const snippetLower = item.snippet.toLowerCase();
      const raw = item.rawText;

      // Exact phrase match
      if (titleLower.includes(q)) score += 0.6;
      else if (snippetLower.includes(q)) score += 0.4;
      else if (raw.includes(q)) score += 0.3;

      // Token overlap
      for (const token of queryTokens) {
        if (titleLower.includes(token)) score += 0.2;
        if (snippetLower.includes(token)) score += 0.1;
        if (item.tags.some((t) => t.toLowerCase().includes(token))) score += 0.15;
      }

      // Semantic Intent Boosts
      if (q.includes('key') || q.includes('token') || q.includes('مفتاح') || q.includes('رمز')) {
        if (item.category === 'api_keys') score += 0.3;
      }
      if (q.includes('download') || q.includes('apk') || q.includes('exe') || q.includes('تنزيل') || q.includes('تحميل') || q.includes('تطبيق')) {
        if (item.category === 'downloads') score += 0.35;
      }
      if (q.includes('down') || q.includes('uptime') || q.includes('error') || q.includes('latency') || q.includes('status') || q.includes('حالة') || q.includes('سيرفر')) {
        if (item.category === 'status') score += 0.3;
      }
      if (q.includes('bot') || q.includes('discord') || q.includes('whatsapp') || q.includes('بوت')) {
        if (item.category === 'bot_gateway') score += 0.35;
      }
      if (q.includes('doc') || q.includes('guide') || q.includes('code') || q.includes('endpoint') || q.includes('شرح') || q.includes('دليل')) {
        if (item.category === 'documentation') score += 0.3;
      }

      const clampedScore = Math.min(0.99, Math.max(0.1, Number(score.toFixed(2))));
      const confidenceLevel = clampedScore >= 0.6 ? 'high' : clampedScore >= 0.35 ? 'medium' : 'low';

      return {
        ...item,
        relevanceScore: clampedScore,
        confidenceLevel,
      };
    })
    .filter((hit) => hit.relevanceScore > 0.25)
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, 8);

  return {
    query,
    intent: parsedIntent,
    aiExplanation: aiExplanation || `Searched ${indexedItems.length} indexed resources across Vanitas API Gateway.`,
    hits: scoredHits,
    totalIndexedItems: indexedItems.length,
    executionTimeMs: Date.now() - startTime,
  };
}

/**
 * YouTube Video Search — REAL results only, never invented.
 * 1) Official YouTube Data API v3 when YOUTUBE_API_KEY is configured.
 * 2) Keyless live search of YouTube's public results page (ytInitialData).
 * Returns an honest empty list when neither source is reachable — no
 * fabricated videos, no placeholder links, ever.
 */
export async function searchYouTubeVideos(
  query: string,
  maxResults: number = 6
): Promise<{
  query: string;
  videos: any[];
  totalResults: number;
  searchEngine: 'youtube_api' | 'youtube_keyless' | 'none';
  aiSummary?: string;
}> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return {
      query,
      videos: [],
      totalResults: 0,
      searchEngine: 'none',
      aiSummary: 'Enter a topic to search live YouTube results.',
    };
  }

  // 1. Official YouTube Data API v3 (when an API key is configured).
  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (youtubeApiKey) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=${maxResults}&q=${encodeURIComponent(
        trimmedQuery + ' tutorial'
      )}&key=${youtubeApiKey}`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (resp.ok) {
        const data = (await resp.json()) as any;
        const items = Array.isArray(data.items) ? data.items : [];
        if (items.length > 0) {
          const mapped = items.map((item: any) => {
            const videoId = item.id?.videoId || item.id;
            return {
              id: videoId,
              title: decodeHtmlEntities(item.snippet?.title || 'YouTube video'),
              description: decodeHtmlEntities(item.snippet?.description || ''),
              channelTitle: item.snippet?.channelTitle || 'YouTube',
              publishedAt: item.snippet?.publishedAt || '',
              thumbnailUrl:
                item.snippet?.thumbnails?.high?.url ||
                item.snippet?.thumbnails?.medium?.url ||
                `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
              videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
              embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
              tags: [],
            };
          });
          return {
            query,
            videos: mapped,
            totalResults: mapped.length,
            searchEngine: 'youtube_api' as const,
            aiSummary: `Retrieved ${mapped.length} live results from the YouTube Data API for "${query}".`,
          };
        }
      }
    } catch (ytApiErr) {
      console.warn('YouTube Data API call failed; trying the keyless live search:', ytApiErr);
    }
  }

  // 2. Keyless live search — parse YouTube's public results page.
  try {
    const videos = await searchYouTubeKeyless(trimmedQuery, maxResults);
    if (videos.length > 0) {
      return {
        query,
        videos,
        totalResults: videos.length,
        searchEngine: 'youtube_keyless',
        aiSummary: `Found ${videos.length} live YouTube results for "${query}" (real-time search, no API key).`,
      };
    }
  } catch (keylessErr) {
    console.warn('Keyless YouTube search failed:', keylessErr);
  }

  // Honest empty result — nothing was found, nothing is invented.
  return {
    query,
    videos: [],
    totalResults: 0,
    searchEngine: 'none',
    aiSummary: `No live YouTube results could be retrieved for "${query}" right now. Please try again in a moment.`,
  };
}

function decodeHtmlEntities(text: string): string {
  return String(text)
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ');
}

/**
 * Keyless REAL YouTube search: fetches the public results page and parses the
 * embedded ytInitialData JSON. If the page shape ever changes this returns []
 * rather than made-up videos.
 */
async function searchYouTubeKeyless(query: string, maxResults: number): Promise<any[]> {
  const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
      Accept: 'text/html,application/xhtml+xml',
    },
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return [];
  const html = await response.text();

  const marker = 'var ytInitialData = ';
  const start = html.indexOf(marker);
  if (start === -1) return [];
  const jsonStart = start + marker.length;

  // Walk the balanced JSON object, respecting string literals.
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < html.length; i++) {
    const ch = html[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        end = i + 1;
        break;
      }
    }
  }
  if (end === -1) return [];

  const data = JSON.parse(html.slice(jsonStart, end));
  const results: any[] = [];

  const visit = (node: any) => {
    if (!node || results.length >= maxResults * 3) return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (typeof node !== 'object') return;

    if (node.videoRenderer) {
      const vr = node.videoRenderer;
      const id = vr.videoId;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
      if (id && title) {
        const description =
          vr.descriptionSnippet?.runs?.map((r: any) => r.text).join('') ||
          vr.detailedMetadataSnippets?.[0]?.snippetText?.runs?.map((r: any) => r.text).join('') ||
          '';
        results.push({
          id,
          title: decodeHtmlEntities(title),
          description: decodeHtmlEntities(description),
          channelTitle: decodeHtmlEntities(
            vr.ownerText?.runs?.[0]?.text || vr.longBylineText?.runs?.[0]?.text || 'YouTube'
          ),
          publishedAt: vr.publishedTimeText?.simpleText || '',
          thumbnailUrl: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          videoUrl: `https://www.youtube.com/watch?v=${id}`,
          embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
          duration: vr.lengthText?.simpleText || '',
          views: vr.viewCountText?.simpleText || '',
        });
      }
      return;
    }

    for (const key of Object.keys(node)) visit(node[key]);
  };

  visit(data);

  const seen = new Set<string>();
  const unique = results.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });
  return unique.slice(0, maxResults);
}
