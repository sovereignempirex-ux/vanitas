import crypto from 'crypto';
import { databasePool, ensureSchema } from './pg.ts';

// ---------------------------------------------------------------------------
// GitHub connection + repository reading.
//
// The user grants access through the REAL OAuth 2.0 consent screen
// (public_repo scope — public repositories only). The access token
// is a credential: it never reaches the browser, and in PostgreSQL
// mode it is stored only as AES-256-GCM ciphertext (`enc:v1:…`),
// the same scheme invite tokens use. A database dump alone cannot
// mint GitHub requests.
// ---------------------------------------------------------------------------

/** In-memory token store (no DATABASE_URL) — process-local, like every
 *  other memory-mode credential store. */
const memoryTokens = new Map<string, string>();

// Domain-separated key so a GitHub token can never be decrypted with
// the invite-token key even though both derive from INVITE_ENC_KEY.
const githubCryptoKey = databasePool
  ? process.env.INVITE_ENC_KEY && process.env.INVITE_ENC_KEY.length >= 32
    ? crypto.createHash('sha256').update(`vanitas.github.v1|${process.env.INVITE_ENC_KEY}`).digest()
    : process.env.DATABASE_URL
      ? crypto.createHash('sha256').update(`vanitas.github.v1|${process.env.DATABASE_URL}`).digest()
      : null
  : null;

function encryptToken(token: string): string {
  if (!githubCryptoKey) return token;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', githubCryptoKey, iv);
  const ct = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return `enc:v1:${Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64url')}`;
}

function decryptToken(stored: string): string {
  if (!stored || !stored.startsWith('enc:v1:')) return stored || '';
  if (!githubCryptoKey) return '';
  try {
    const raw = Buffer.from(stored.slice('enc:v1:'.length), 'base64url');
    const decipher = crypto.createDecipheriv('aes-256-gcm', githubCryptoKey, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return ''; // key changed or row tampered with — treat as disconnected
  }
}

/** Persist the token the user just granted (upsert per account). */
export async function saveGitHubToken(userId: string, token: string): Promise<void> {
  if (!token) return;
  if (databasePool) {
    await ensureSchema();
    await databasePool.query(
      `insert into public.github_tokens (user_id, access_token)
       values ($1, $2)
       on conflict (user_id) do update set access_token = $2, updated_at = now()`,
      [userId, encryptToken(token)],
    );
    return;
  }
  memoryTokens.set(userId, token);
}

/** The decrypted token, or null when the account never connected. */
export async function getGitHubToken(userId: string): Promise<string | null> {
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query('select access_token from public.github_tokens where user_id = $1', [userId]);
    const stored = r.rows[0]?.access_token;
    return stored ? decryptToken(stored) : null;
  }
  return memoryTokens.get(userId) || null;
}

/** Forget the grant (account deletion or explicit disconnect). */
export async function clearGitHubToken(userId: string): Promise<void> {
  if (databasePool) {
    try {
      await databasePool.query('delete from public.github_tokens where user_id = $1', [userId]);
    } catch (err) {
      console.error('[github/token-clear]', (err as Error).message);
    }
    return;
  }
  memoryTokens.delete(userId);
}

// ---------------------------------------------------------------------------
// GitHub API client — the ONLY hosts this module ever talks to is
// api.github.com (fixed constant, no user input in the URL host),
// so there is no SSRF surface. Every call uses the user's own token.
// ---------------------------------------------------------------------------

const GITHUB_API = 'https://api.github.com';

/** Sentinel messages the route layer maps to precise HTTP statuses. */
export const GITHUB_ERRORS = {
  TOKEN_EXPIRED: 'GITHUB_TOKEN_EXPIRED',
  RATE_LIMITED: 'GITHUB_RATE_LIMITED',
  NOT_FOUND: 'GITHUB_NOT_FOUND',
} as const;

async function ghFetch(path: string, token: string): Promise<any> {
  const res = await fetch(`${GITHUB_API}${path}`, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'Vanitas-Publisher',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) {
    if (res.status === 401) throw new Error(GITHUB_ERRORS.TOKEN_EXPIRED);
    if (res.status === 403) throw new Error(GITHUB_ERRORS.RATE_LIMITED);
    if (res.status === 404) throw new Error(GITHUB_ERRORS.NOT_FOUND);
    throw new Error(`GITHUB_API_ERROR_${res.status}`);
  }
  return res.json();
}

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

/** The signed-in user's own repositories, most recently updated first. */
export async function listUserRepos(token: string): Promise<GitHubRepoInfo[]> {
  const data = await ghFetch('/user/repos?per_page=100&sort=updated&type=owner', token);
  if (!Array.isArray(data)) return [];
  return data.map((r: any) => ({
    fullName: String(r.full_name || ''),
    name: String(r.name || ''),
    owner: String(r.owner?.login || ''),
    description: String(r.description || ''),
    language: String(r.language || ''),
    htmlUrl: String(r.html_url || ''),
    isPrivate: !!r.private,
    updatedAt: String(r.updated_at || ''),
    sizeKb: Number(r.size || 0),
  }));
}

// ---------------------------------------------------------------------------
// Repository import — real files fetched from the GitHub API.
//
// Caps keep a single import bounded (a runaway repo cannot fill
// memory or the DB): 200 text files, 256KB per file, 2MB total.
// Binary files (by extension and by NUL-byte sniff) are skipped —
// the platform publishes readable source, not assets.
// ---------------------------------------------------------------------------

const MAX_FILES = 200;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024;

const SKIP_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'ico', 'webp', 'bmp', 'svgz',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'zip', 'tar', 'gz', 'bz2', '7z', 'rar',
  'mp4', 'webm', 'mov', 'mp3', 'wav', 'ogg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'pptx',
  'sqlite', 'db', 'jar', 'class', 'exe', 'dll', 'so', 'dylib', 'bin', 'pyc',
]);

const LANGUAGE_BY_EXT: Record<string, string> = {
  ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
  mjs: 'JavaScript', cjs: 'JavaScript', vue: 'Vue', svelte: 'Svelte',
  css: 'CSS', scss: 'SCSS', html: 'HTML', xml: 'XML',
  json: 'JSON', md: 'Markdown', mdx: 'Markdown',
  py: 'Python', rs: 'Rust', go: 'Go', java: 'Java', rb: 'Ruby',
  php: 'PHP', c: 'C', h: 'C', cpp: 'C++', hpp: 'C++', cs: 'C#',
  sql: 'SQL', sh: 'Shell', bash: 'Shell', zsh: 'Shell',
  yml: 'YAML', yaml: 'YAML', txt: 'Text',
  swift: 'Swift', kt: 'Kotlin', lua: 'Lua', r: 'R', dart: 'Dart',
  scala: 'Scala', hs: 'Haskell', ex: 'Elixir', exs: 'Elixir',
  clj: 'Clojure', elm: 'Elm', nim: 'Nim', zig: 'Zig',
};

function languageFromPath(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  return LANGUAGE_BY_EXT[ext] || (ext ? ext.toUpperCase() : 'Text');
}

export interface ImportedFile {
  path: string;
  content: string;
  language: string;
}

export interface RepoImport {
  title: string;
  description: string;
  repoUrl: string;
  language: string;
  isWeb: boolean;
  files: ImportedFile[];
}

/** Fetch a repository's metadata and readable text files. */
export async function importRepoFiles(token: string, owner: string, repo: string): Promise<RepoImport> {
  const meta = await ghFetch(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, token);
  const branch = String(meta.default_branch || 'main');
  const title = String(meta.name || repo);
  const description = String(meta.description || '');
  const language = String(meta.language || '');
  const repoUrl = String(meta.html_url || `https://github.com/${owner}/${repo}`);

  const tree = await ghFetch(
    `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
    token,
  );
  const entries = Array.isArray(tree.tree) ? tree.tree : [];

  const files: ImportedFile[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (files.length >= MAX_FILES || totalBytes >= MAX_TOTAL_BYTES) break;
    if (entry?.type !== 'blob' || typeof entry.path !== 'string') continue;
    const path = entry.path;
    if (path.includes('..')) continue; // defensive: canonical paths only
    const ext = path.split('.').pop()?.toLowerCase() || '';
    if (SKIP_EXTENSIONS.has(ext)) continue;

    const file = await ghFetch(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${
        path.split('/').map(encodeURIComponent).join('/')
      }?ref=${encodeURIComponent(branch)}`,
      token,
    );
    if (file?.encoding !== 'base64' || typeof file.content !== 'string') continue;

    const content = Buffer.from(file.content, 'base64').toString('utf8');
    const bytes = Buffer.byteLength(content);
    if (bytes === 0 || bytes > MAX_FILE_BYTES) continue;
    if (content.includes('\u0000')) continue; // binary sniff
    totalBytes += bytes;
    files.push({ path, content, language: languageFromPath(path) });
  }

  // A project is "web" when it ships an index.html (root or one folder
  // deep) — that is what the sandbox preview renders.
  const isWeb = files.some((f) => /^(?:[^/]+\/)?index\.html$/.test(f.path));
  return { title, description, repoUrl, language, isWeb, files };
}
