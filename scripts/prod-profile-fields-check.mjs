// Production verification: proves the location/tech_tags migration actually
// landed on the real Postgres (the local test only covered in-memory mode).
//
//   node scripts/prod-profile-fields-check.mjs
const BASE = process.env.PROD_BASE || 'https://vanitas-bot.vercel.app/api/v1';

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
    console.log(`  FAIL  ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  }
}

const suffix = Date.now().toString(36);
const email = `migcheck_${suffix}@example.com`;
const username = `migcheck_${suffix}`;
const password = 'Sup3rSecret!pass';

const reg = await call('POST', '/auth/register', {
  body: { email, password, name: 'Migration Check' },
});
check('register', reg.status === 201 || reg.status === 200, reg.json);
const token = reg.json?.token;
if (!token) {
  console.log(`\n${pass} passed, ${fail} failed — no token (registration may be rate-limited), aborting`);
  process.exit(1);
}

// A missing column here throws `column ... does not exist` → 500. That is the
// exact failure mode the migration risk was about.
const save = await call('PATCH', '/auth/profile', {
  token,
  body: {
    name: 'Migration Check',
    avatarUrl: '/images/avatar-default.svg',
    username,
    location: 'Reykjavik, IS',
    techTags: ['Postgres', 'TypeScript'],
  },
});
check('PATCH with new columns does not 500', save.status === 200, save.json);
check('stored location', save.json?.user?.location === 'Reykjavik, IS', save.json?.user?.location);
check(
  'stored techTags',
  JSON.stringify(save.json?.user?.techTags) === JSON.stringify(['Postgres', 'TypeScript']),
  save.json?.user?.techTags,
);

const pub = await call('GET', `/profiles/${username}`);
check('public profile 200', pub.status === 200, pub.json);
check('public location', pub.json?.profile?.location === 'Reykjavik, IS', pub.json?.profile?.location);
check(
  'public techTags',
  JSON.stringify(pub.json?.profile?.techTags) === JSON.stringify(['Postgres', 'TypeScript']),
  pub.json?.profile?.techTags,
);

// Validation must still reject — proves the API guard shipped with the column.
const over = await call('PATCH', '/auth/profile', {
  token,
  body: { name: 'Migration Check', avatarUrl: '/images/avatar-default.svg', location: 'x'.repeat(61) },
});
check('still validates >60 char location', over.status === 400, over.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
