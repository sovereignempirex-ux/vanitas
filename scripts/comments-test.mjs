// E2E test of the REAL comment system: PostgreSQL-backed, written only by
// registered accounts, and seeded with ZERO fake comments (asserted below).
// Run: TEST_BASE=https://vanitas-bot.vercel.app/api/v1 node scripts/comments-test.mjs
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';

let pass = 0;
let fail = 0;

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

function check(name, cond, detail) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} → ${JSON.stringify(detail)}`);
  }
}

// Wait for server
let up = false;
for (let i = 0; i < 20; i++) {
  try {
    const r = await call('GET', '/health');
    if (r.status === 200) {
      up = true;
      break;
    }
  } catch {
    /* not yet */
  }
  await new Promise((r) => setTimeout(r, 500));
}
if (!up) {
  console.error('server not reachable');
  process.exit(1);
}

const stamp = Date.now();
const doc = `test-comments-${stamp}`; // valid slug: ^[a-z0-9][a-z0-9-]{0,63}$
const otherDoc = `test-other-${stamp}`;

console.log('— two real accounts —');
let r = await call('POST', '/auth/register', {
  body: { email: `cmt_a_${stamp}@example.com`, password: 'CommentPass123!', name: 'Commenter Alpha' },
});
check('register A → 201', r.status === 201, r);
const tokA = r.json?.token;
r = await call('POST', '/auth/register', {
  body: { email: `cmt_b_${stamp}@example.com`, password: 'CommentPass123!', name: 'Commenter Beta' },
});
check('register B → 201', r.status === 201, r);
const tokB = r.json?.token;
check('both sessions are real tokens', String(tokA).startsWith('vnt_sess_') && String(tokB).startsWith('vnt_sess_'), { tokA, tokB });

console.log('— zero seeded comments —');
r = await call('GET', `/comments/${doc}`);
check('fresh doc → 200 + exactly 0 comments', r.status === 200 && r.json?.total === 0 && Array.isArray(r.json?.comments) && r.json.comments.length === 0, r.json);
r = await call('GET', '/comments/bot-gateway-integration');
check('uncommented real doc → 0 comments (nothing is ever seeded)', r.status === 200 && r.json?.total === 0, r.json);

console.log('— authentication required to write —');
r = await call('POST', `/comments/${doc}`, { body: { body: 'Sneaking in without an account' } });
check('POST without session → 401', r.status === 401, r);
r = await call('DELETE', '/comments/some-id');
check('DELETE without session → 401', r.status === 401, r);

console.log('— validation —');
r = await call('POST', `/comments/${doc}`, { token: tokA, body: { body: 'x' } });
check('body <2 chars → 400', r.status === 400, r);
r = await call('POST', `/comments/${doc}`, { token: tokA, body: { body: 'a'.repeat(2001) } });
check('body >2000 chars → 400', r.status === 400, r);
r = await call('POST', '/comments/bad_id!', { token: tokA, body: { body: 'valid body here' } });
check('invalid doc id → 400', r.status === 400, r);

console.log('— posting real comments —');
r = await call('POST', `/comments/${doc}`, { token: tokA, body: { body: 'First real comment from the suite.' } });
check('POST with session → 201', r.status === 201, r);
const cmtA = r.json?.comment;
check('comment carries docId + body', cmtA?.docId === doc && cmtA?.body === 'First real comment from the suite.', cmtA);
check('comment records author name + user id', cmtA?.authorName === 'Commenter Alpha' && typeof cmtA?.userId === 'string' && cmtA.userId.length > 0, cmtA);
check('comment has a real timestamp', !Number.isNaN(Date.parse(cmtA?.createdAt)), cmtA?.createdAt);

r = await call('POST', `/comments/${doc}`, { token: tokB, body: { body: 'Second real comment from another account.' } });
check('another account can comment → 201', r.status === 201, r);
const cmtB = r.json?.comment;

r = await call('GET', `/comments/${doc}`);
check('list → 2 comments', r.json?.total === 2 && r.json.comments.length === 2, r.json);
check('two different authors', r.json?.comments?.[0]?.userId !== r.json?.comments?.[1]?.userId, r.json.comments);

r = await call('GET', `/comments/${otherDoc}`);
check('other docs unaffected (isolation)', r.json?.total === 0, r.json);

console.log('— delete permissions —');
r = await call('DELETE', `/comments/${cmtA.id}`, { token: tokB });
check("another user cannot delete → 403", r.status === 403, r);
r = await call('DELETE', `/comments/${cmtA.id}`, { token: tokA });
check('owner delete → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', `/comments/${doc}`);
check('list after delete → 1', r.json?.total === 1, r.json);
r = await call('DELETE', `/comments/${cmtA.id}`, { token: tokA });
check('double delete → 404', r.status === 404, r);

console.log('— cleanup —');
r = await call('DELETE', `/comments/${cmtB.id}`, { token: tokB });
check('cleanup delete → success', r.status === 200 && r.json?.success === true, r);
r = await call('GET', `/comments/${doc}`);
check('doc empty after cleanup', r.json?.total === 0, r.json);

console.log('— account cleanup (production stays empty) —');
// B first: A may hold the bootstrap ADMIN role while B still exists.
r = await call('DELETE', '/auth/account', { token: tokB });
check('B deletes own account', r.status === 200 && r.json?.success === true, r);
r = await call('DELETE', '/auth/account', { token: tokA });
check('A deletes own account', r.status === 200 && r.json?.success === true, r);
r = await call('POST', '/auth/register', {
  body: { email: `cmt_final_${stamp}@example.com`, password: 'CommentPass123!', name: 'Final Check' },
});
check('DB empty → bootstrap ADMIN again', r.status === 201 && r.json?.user?.role === 'ADMIN', r.json?.user);
r = await call('DELETE', '/auth/account', { token: r.json?.token });
check('final account removed', r.status === 200, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
