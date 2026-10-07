// Round-trip test for the new profile fields: location + techTags.
// Verifies they reach the server, are validated, persist, and surface on the
// PUBLIC /u/<username> payload (that is what actually renders for visitors).
//
//   node scripts/profile-fields-test.mjs
const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3000/api/v1';

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
const email = `proffield_${suffix}@example.com`;
const username = `proffield_${suffix}`;

// --- register -------------------------------------------------------------
const reg = await call('POST', '/auth/register', {
  body: { email, password: 'Sup3rSecret!pass', name: 'Profile Fields' },
});
check('register', reg.status === 201 || reg.status === 200, reg.json);
const token = reg.json?.token;
if (!token) {
  console.log(`\n${pass} passed, ${fail} failed — no token, aborting`);
  process.exit(1);
}

// --- save the new fields --------------------------------------------------
const save = await call('PATCH', '/auth/profile', {
  token,
  body: {
    name: 'Profile Fields',
    avatarUrl: '/images/avatar-default.svg',
    username,
    location: 'Lisbon, PT',
    techTags: ['TypeScript', 'Postgres', 'Blender'],
  },
});
check('PATCH accepts location + techTags', save.status === 200, save.json);
check(
  'user echoes location',
  save.json?.user?.location === 'Lisbon, PT',
  save.json?.user?.location,
);
check(
  'user echoes techTags',
  JSON.stringify(save.json?.user?.techTags) === JSON.stringify(['TypeScript', 'Postgres', 'Blender']),
  save.json?.user?.techTags,
);

// --- the public payload is what visitors actually see ---------------------
const pub = await call('GET', `/profiles/${username}`);
check('public profile 200', pub.status === 200, pub.json);
check('public carries location', pub.json?.profile?.location === 'Lisbon, PT', pub.json?.profile?.location);
check(
  'public carries techTags in order',
  JSON.stringify(pub.json?.profile?.techTags) === JSON.stringify(['TypeScript', 'Postgres', 'Blender']),
  pub.json?.profile?.techTags,
);

// --- clearing: '' and [] must both persist as cleared ---------------------
const clear = await call('PATCH', '/auth/profile', {
  token,
  body: { name: 'Profile Fields', avatarUrl: '/images/avatar-default.svg', location: '', techTags: [] },
});
check('PATCH clears location + tags', clear.status === 200, clear.json);
const pub2 = await call('GET', `/profiles/${username}`);
check('cleared location is absent', !pub2.json?.profile?.location, pub2.json?.profile?.location);
check('cleared tags are empty', Array.isArray(pub2.json?.profile?.techTags) && pub2.json?.profile?.techTags.length === 0, pub2.json?.profile?.techTags);

// --- validation: over-limit values must be rejected ------------------------
const tooMany = await call('PATCH', '/auth/profile', {
  token,
  body: {
    name: 'Profile Fields',
    avatarUrl: '/images/avatar-default.svg',
    techTags: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
  },
});
check('rejects >8 tags', tooMany.status === 400, tooMany.status);

const tooLong = await call('PATCH', '/auth/profile', {
  token,
  body: {
    name: 'Profile Fields',
    avatarUrl: '/images/avatar-default.svg',
    location: 'x'.repeat(61),
  },
});
check('rejects >60 char location', tooLong.status === 400, tooLong.status);

const longTag = await call('PATCH', '/auth/profile', {
  token,
  body: {
    name: 'Profile Fields',
    avatarUrl: '/images/avatar-default.svg',
    techTags: ['x'.repeat(25)],
  },
});
check('rejects >24 char tag', longTag.status === 400, longTag.status);

const notArray = await call('PATCH', '/auth/profile', {
  token,
  body: { name: 'Profile Fields', avatarUrl: '/images/avatar-default.svg', techTags: 'typescript' },
});
check('rejects non-array techTags', notArray.status === 400, notArray.status);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
