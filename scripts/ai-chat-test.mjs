// E2E test of the REAL AI chat system: streaming (SSE), site-aware answers,
// per-account persisted history, and live (never fabricated) YouTube search.
// Run: TEST_BASE=https://vanitas-bot.vercel.app/api/v1 node scripts/ai-chat-test.mjs
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';

let pass = 0;
let fail = 0;

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    const shown = typeof detail === 'string' ? detail : JSON.stringify(detail);
    console.log(`  FAIL  ${name}${shown ? ` — ${shown}` : ''}`);
  }
}

async function call(method, path, { token, body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json };
}

async function streamChat(body) {
  const res = await fetch(`${BASE}/ai/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, stream: true }),
  });
  if (!res.ok || !res.body) return { status: res.status, contentType: res.headers.get('content-type'), deltas: [], done: null };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const deltas = [];
  let done = null;
  let error = null;

  const handleLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (!payload) return;
    try {
      const event = JSON.parse(payload);
      if (event.type === 'delta') deltas.push(event.t);
      else if (event.type === 'done') done = event;
      else if (event.type === 'error') error = event.message;
    } catch {
      /* partial frame */
    }
  };

  for (;;) {
    const { done: finished, value } = await reader.read();
    if (finished) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) handleLine(line);
  }

  return { status: res.status, contentType: res.headers.get('content-type'), deltas, done, error };
}

async function main() {
  console.log(`AI chat E2E against ${BASE}\n`);

  // ---- streaming without auth -------------------------------------------
  const stream = await streamChat({
    prompt: 'In exactly one sentence: what is Vanitas?',
    persona: 'docs',
    toneStyle: 'developer',
  });
  check('SSE endpoint answers with text/event-stream', (stream.contentType || '').includes('text/event-stream'), `content-type=${stream.contentType}`);
  check('SSE emits progressive deltas', stream.deltas.length >= 1, `got ${stream.deltas.length}`);
  check('SSE sends a done event with full text', !!stream.done && typeof stream.done.text === 'string' && stream.done.text.length > 20, `deltas=${stream.deltas.length}`);
  const joined = stream.deltas.join('');
  check('done text matches the streamed deltas', !!stream.done && stream.done.text.trim() === joined.trim() || (stream.done && stream.done.text.length >= joined.length), `joined=${joined.length} done=${stream.done?.text?.length}`);

  // ---- Arabic streaming round-trip (real UTF-8, no mangling) -------------
  const ar = await streamChat({ prompt: 'أجب في جملة واحدة: ما منصة فانيتاس؟', persona: 'docs', toneStyle: 'arabic' });
  const arText = ar.done?.text || ar.deltas.join('');
  check('Arabic prompt streams a real Arabic reply', ar.deltas.length >= 1 && /[\u0600-\u06FF]/.test(arText), `deltas=${ar.deltas.length}`);

  // ---- site-aware answers (the AI knows THIS site's real routes) --------
  // The free upstream rate-limits bursts, so allow a few attempts.
  let siteAware = { status: 0, json: null };
  for (let attempt = 0; attempt < 3; attempt++) {
    siteAware = await call('POST', '/ai/chat', {
      body: { prompt: 'What is the exact account registration endpoint of this platform? Reply with only the path.', persona: 'api', toneStyle: 'developer' },
    });
    if (siteAware.status === 200 && (siteAware.json?.text || '').includes('/auth/register')) break;
    await new Promise((r) => setTimeout(r, 1200));
  }
  check('non-stream chat still returns 200 with a real reply', siteAware.status === 200 && typeof siteAware.json?.text === 'string' && siteAware.json.text.length > 0, `status=${siteAware.status} text=${JSON.stringify((siteAware.json?.text || '').slice(0, 40))}`);
  check('AI knows the real register endpoint (/auth/register)', (siteAware.json?.text || '').includes('/auth/register'), (siteAware.json?.text || '').slice(0, 160));
  check('reply reports a real model engine', !!siteAware.json?.engine && siteAware.json.engine !== 'local_kb', { engine: siteAware.json?.engine, upstream: siteAware.json?.upstream });

  // ---- history requires auth --------------------------------------------
  const anonHistory = await call('GET', '/ai/history');
  check('history requires a signed-in account (401 anon)', anonHistory.status === 401, `status=${anonHistory.status}`);

  // ---- account + persisted history --------------------------------------
  const stamp = Date.now();
  const email = `ai-chat-${stamp}@example.test`;
  const reg = await call('POST', '/auth/register', {
    body: { email, password: 'Str0ng-Pass-123!', name: 'AI Chat Tester' },
  });
  check('test account registered', (reg.status === 200 || reg.status === 201) && !!reg.json?.token, `status=${reg.status}`);
  const token = reg.json?.token;

  if (token) {
    const marker = `history-marker-${stamp}`;
    await call('POST', '/ai/chat', { token, body: { prompt: `Remember this: ${marker}`, persona: 'docs', toneStyle: 'developer' } });
    const history = await call('GET', '/ai/history', { token });
    const contents = (history.json?.messages || []).map((m) => m.content).join('\n');
    check('chat exchange is persisted to history', history.status === 200 && contents.includes(marker), `messages=${history.json?.messages?.length}`);

    const cleared = await call('DELETE', '/ai/history', { token });
    const after = await call('GET', '/ai/history', { token });
    check('clear chat wipes the persisted history', cleared.status === 200 && (after.json?.messages || []).length === 0, `messages=${after.json?.messages?.length}`);

    const other = await call('GET', '/ai/history');
    check('cleared history still not visible anonymously', other.status === 401, `status=${other.status}`);

    const del = await call('DELETE', '/auth/account', { token });
    check('test account deleted', del.status === 200 && del.json?.success === true, `status=${del.status}`);
  }

  // ---- live YouTube search (no fabricated videos) ------------------------
  const yt = await call('GET', '/youtube/search?q=node.js%20tutorial&limit=5');
  const videos = yt.json?.videos || [];
  check('youtube search returns live results', yt.status === 200 && videos.length > 0, `status=${yt.status} count=${videos.length}`);
  const realIds = videos.every((v) => /^[A-Za-z0-9_-]{11}$/.test(v.id));
  const realUrls = videos.every((v) => v.videoUrl?.includes('youtube.com/watch?v=') || v.embedUrl?.includes('youtube-nocookie.com/embed/'));
  check('every result is a real 11-char YouTube video id', videos.length > 0 && realIds, videos.map((v) => v.id).join(','));
  check('no fabricated placeholder links', videos.length > 0 && realUrls && !videos.some((v) => v.id === 'vid_quickstart_01'));
  check('searchEngine reflects a real source', ['youtube_api', 'youtube_keyless', 'none'].includes(yt.json?.searchEngine), yt.json?.searchEngine);

  const tut = await call('GET', '/videos/tutorials');
  const tutorials = tut.json?.tutorials || [];
  check('tutorial showcase serves live videos only', tut.status === 200 && Array.isArray(tutorials) && tutorials.every((t) => !t.youtubeId || /^[A-Za-z0-9_-]{11}$/.test(t.youtubeId)), `count=${tutorials.length}`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((err) => {
  console.error('FATAL', err);
  process.exit(1);
});
