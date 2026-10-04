// E2E test of the REAL download system: what the page publishes (version,
// size, sha256, filename, artifact kind) must be derived from the exact bytes
// the server serves — and every count must move only when bytes leave.
//
//   TEST_BASE=http://127.0.0.1:3111/api/v1 node scripts/downloads-test.mjs
//
// Registers ONE account and deletes it again (this suite must run after the
// suites that assert an empty database and before api-key-test, or anywhere
// the database is already non-empty).
import crypto from 'crypto';

const BASE = process.env.TEST_BASE || 'http://127.0.0.1:3111/api/v1';
const ORIGIN = new URL(BASE).origin;

let pass = 0;
let fail = 0;

async function call(method, path, { token, body, raw } = {}) {
  const headers = {};
  if (!raw) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(`${BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (raw) {
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, buf, headers: res.headers };
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-json */
  }
  return { status: res.status, json, headers: res.headers };
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

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

console.log('— release catalog is honest (no fabricated sizes/hashes/counts) —');
let r = await call('GET', '/download/releases');
check('GET /download/releases → 200', r.status === 200, r);
const catalog = r.json;
const releases = catalog?.releases || [];
check('latestVersion derived from catalog (not hardcoded)', typeof catalog?.latestVersion === 'string' && catalog.latestVersion.length > 0 && releases.some((x) => x.version === catalog.latestVersion), { latestVersion: catalog?.latestVersion });
check('exactly 4 releases (apk/exe/dmg/appimage)', releases.length === 4 && ['apk', 'exe', 'dmg', 'appimage'].every((t) => releases.some((x) => x.type === t)), releases.map((x) => x.type));
for (const rel of releases) {
  check(`${rel.type}: sha256 is real 64-hex`, /^[0-9a-f]{64}$/.test(rel.sha256 || ''), rel.sha256);
  check(`${rel.type}: sizeBytes is a real positive integer`, Number.isInteger(rel.sizeBytes) && rel.sizeBytes > 0, rel.sizeBytes);
  check(`${rel.type}: sizeMb derived from sizeBytes`, typeof rel.sizeMb === 'number' && Math.abs(rel.sizeMb - rel.sizeBytes / 1048576) < 0.00001, { sizeMb: rel.sizeMb, sizeBytes: rel.sizeBytes });
  check(`${rel.type}: artifactKind disclosed as manifest`, rel.artifactKind === 'manifest', rel.artifactKind);
  check(`${rel.type}: honest filename ends with -manifest.txt`, typeof rel.filename === 'string' && rel.filename.endsWith('-manifest.txt'), rel.filename);
  check(`${rel.type}: downloadsCount is a plain number ≥ 0`, typeof rel.downloadsCount === 'number' && Number.isFinite(rel.downloadsCount) && rel.downloadsCount >= 0, rel.downloadsCount);
}

// Deterministic payload: a second fetch must describe the identical file
// (checksums must match on every replica, not just this one).
const firstShas = Object.fromEntries(releases.map((x) => [x.type, x.sha256]));
r = await call('GET', '/download/releases');
check('catalog checksums are deterministic across fetches', (r.json?.releases || []).every((x) => x.sha256 === firstShas[x.type]));

console.log('— no session → no artifact —');
r = await call('GET', '/download/apk', { raw: true });
check('unauthenticated download → 401', r.status === 401, r.status);

console.log('— one real account —');
const stamp = Date.now();
r = await call('POST', '/auth/register', {
  body: { email: `dl_${stamp}@example.com`, password: 'DownloadPass123!', name: 'Download Tester' },
});
check('register → 201', r.status === 201, r);
const tok = r.json?.token;
check('session token issued', String(tok).startsWith('vnt_sess_'), tok);

const baseline = Object.fromEntries(releases.map((x) => [x.type, x.downloadsCount]));
const currentCount = async (type) => {
  const c = await call('GET', '/download/releases');
  return (c.json?.releases || []).find((x) => x.type === type)?.downloadsCount;
};

console.log('— session download: bytes, checksum, headers, count —');
r = await call('GET', '/download/apk', { token: tok, raw: true });
check('authenticated download → 200', r.status === 200, r.status);
const meta = releases.find((x) => x.type === 'apk');
check('served bytes exactly match published sizeBytes', r.buf?.length === meta.sizeBytes, { served: r.buf?.length, published: meta.sizeBytes });
check('sha256 of served bytes matches published checksum (real end-to-end chain)', sha256(r.buf) === meta.sha256, { real: sha256(r.buf), published: meta.sha256 });
check('X-Vanitas-Checksum-SHA256 header equals published checksum', r.headers.get('x-vanitas-checksum-sha256') === meta.sha256, r.headers.get('x-vanitas-checksum-sha256'));
check('X-Vanitas-Artifact-Kind header = manifest', r.headers.get('x-vanitas-artifact-kind') === 'manifest', r.headers.get('x-vanitas-artifact-kind'));
check('Content-Type is honest text/plain', String(r.headers.get('content-type')).startsWith('text/plain'), r.headers.get('content-type'));
check('Content-Disposition carries the published filename', String(r.headers.get('content-disposition')).includes(meta.filename), r.headers.get('content-disposition'));
check('served payload is a real manifest (banner present)', String(r.buf).includes('VANITAS CLIENT BUILD MANIFEST'), String(r.buf).slice(0, 60));
check('count moved +1 (bytes were actually served)', (await currentCount('apk')) === baseline.apk + 1, { before: baseline.apk, after: await currentCount('apk') });

console.log('— metadata reads never move counts —');
r = await call('GET', '/download/apk?format=json', { token: tok });
check('format=json → 200 with release echo', r.status === 200 && r.json?.release?.type === 'apk', r.json);
check('format=json did NOT increment the count', (await currentCount('apk')) === baseline.apk + 1, await currentCount('apk'));

console.log('— signed cross-device link (QR flow) —');
r = await call('POST', '/download/apk/token');
check('minting a link without a session → 401', r.status === 401, r.status);
r = await call('POST', '/download/apk/token', { token: tok });
check('minting with a session → 200 + url + expiry', r.status === 200 && typeof r.json?.url === 'string' && r.json.url.startsWith('/api/v1/download/apk?'), r.json);
check('link TTL is 10 minutes', r.json?.expiresInSec === 600, r.json?.expiresInSec);
const linkUrl = r.json?.url;

r = await fetch(ORIGIN + linkUrl);
const signedBuf = Buffer.from(await r.arrayBuffer());
check('signed link download → 200', r.status === 200, r.status);
check('signed link serves the same checksummed bytes', sha256(signedBuf) === meta.sha256 && signedBuf.length === meta.sizeBytes, { bytes: signedBuf.length });
check('signed link download counted (+1)', (await currentCount('apk')) === baseline.apk + 2, await currentCount('apk'));

r = await fetch(ORIGIN + linkUrl.replace(/sig=[^&]+/, 'sig=tampered'));
check('tampered signature → 401', r.status === 401, r.status);
r = await fetch(ORIGIN + linkUrl.replace('/download/apk', '/download/exe'));
check('link bound to its artifact (wrong type → 401)', r.status === 401, r.status);
{
  const u = new URL(ORIGIN + linkUrl);
  u.searchParams.set('exp', String(Date.now() - 5000));
  r = await fetch(u.toString());
  check('expired link → 401', r.status === 401, r.status);
}
check('failed attempts moved no counts', (await currentCount('apk')) === baseline.apk + 2 && (await currentCount('exe')) === baseline.exe, { apk: await currentCount('apk'), exe: await currentCount('exe') });

console.log('— invalid type —');
r = await call('GET', '/download/not-a-release', { token: tok });
check('unknown artifact type → 400', r.status === 400, r.status);

console.log('— account cleanup (suite leaves no users behind) —');
r = await call('DELETE', '/auth/account', { token: tok });
check('download tester deletes own account', r.status === 200 && r.json?.success === true, r);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
