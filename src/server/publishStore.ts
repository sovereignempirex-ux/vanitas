import { databasePool, ensureSchema } from './pg.ts';
import { db } from './db.ts';
import { secureId } from './security.ts';
import type {
  PublishedFile,
  PublishedProject,
  PublishedProjectDetail,
  PublishedSnippet,
} from '../types.ts';

// ---------------------------------------------------------------------------
// Published projects + individual code snippets — REAL content
// written by signed-in accounts. PostgreSQL when DATABASE_URL is
// set, in-memory otherwise (process-local, resets on restart,
// like every other memory-mode store). NEVER seeded: a fresh
// install always starts with an empty gallery.
// ---------------------------------------------------------------------------

export interface ProjectRow {
  id: string;
  ownerId: string;
  source: 'github' | 'manual';
  title: string;
  description: string;
  repoUrl: string;
  language: string;
  isWeb: boolean;
  files: PublishedFile[];
  createdAt: string;
}

export interface SnippetRow {
  id: string;
  ownerId: string;
  title: string;
  language: string;
  content: string;
  createdAt: string;
}

const memoryProjects: ProjectRow[] = [];
const memorySnippets: SnippetRow[] = [];

export const MAX_TITLE = 120;
export const MAX_DESCRIPTION = 2000;
export const MAX_SNIPPET = 100_000;

const iso = (v: unknown): string =>
  v instanceof Date ? v.toISOString() : String(v || new Date().toISOString());

function mapProjectRow(row: Record<string, any>): ProjectRow {
  const files = Array.isArray(row.files) ? row.files : [];
  return {
    id: row.id,
    ownerId: row.owner_id,
    source: row.source === 'manual' ? 'manual' : 'github',
    title: row.title,
    description: row.description || '',
    repoUrl: row.repo_url || '',
    language: row.language || '',
    isWeb: !!row.is_web,
    files: files.map((f: any) => ({
      path: String(f?.path || ''),
      content: String(f?.content || ''),
      language: String(f?.language || ''),
    })),
    createdAt: iso(row.created_at),
  };
}

function mapSnippetRow(row: Record<string, any>): SnippetRow {
  return {
    id: row.id,
    ownerId: row.owner_id,
    title: row.title,
    language: row.language || 'text',
    content: row.content,
    createdAt: iso(row.created_at),
  };
}

/** Owner display info for gallery cards — never the email or ids. */
async function ownerInfo(
  ownerId: string,
): Promise<{ name: string; username: string; avatarUrl: string }> {
  if (databasePool) {
    const r = await databasePool.query(
      'select name, username, avatar_url from public.users where id = $1',
      [ownerId],
    );
    const row = r.rows[0];
    return {
      name: row?.name || 'Unknown',
      username: row?.username || '',
      avatarUrl: row?.avatar_url || '',
    };
  }
  const u = db.users.find((x) => x.id === ownerId);
  return { name: u?.name || 'Unknown', username: u?.username || '', avatarUrl: u?.avatarUrl || '' };
}

function toProjectCard(row: ProjectRow, owner: { name: string; username: string; avatarUrl: string }): PublishedProject {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: owner.name,
    ownerUsername: owner.username,
    ownerAvatar: owner.avatarUrl,
    source: row.source,
    title: row.title,
    description: row.description,
    repoUrl: row.repoUrl,
    language: row.language,
    isWeb: row.isWeb,
    fileCount: row.files.length,
    createdAt: row.createdAt,
  };
}

function toSnippetCard(row: SnippetRow, owner: { name: string; username: string; avatarUrl: string }): PublishedSnippet {
  return {
    id: row.id,
    ownerId: row.ownerId,
    ownerName: owner.name,
    ownerUsername: owner.username,
    ownerAvatar: owner.avatarUrl,
    title: row.title,
    language: row.language,
    content: row.content,
    createdAt: row.createdAt,
  };
}

// ---- projects -------------------------------------------------------------

export async function createProject(params: {
  ownerId: string;
  source: 'github' | 'manual';
  title: string;
  description: string;
  repoUrl: string;
  language: string;
  isWeb: boolean;
  files: PublishedFile[];
}): Promise<ProjectRow> {
  const row: ProjectRow = {
    id: secureId('prj'),
    ownerId: params.ownerId,
    source: params.source,
    title: params.title,
    description: params.description,
    repoUrl: params.repoUrl,
    language: params.language,
    isWeb: params.isWeb,
    files: params.files,
    createdAt: new Date().toISOString(),
  };
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      `insert into public.published_projects
         (id, owner_id, source, title, description, repo_url, language, is_web, files)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
      [
        row.id, row.ownerId, row.source, row.title, row.description,
        row.repoUrl, row.language, row.isWeb, JSON.stringify(row.files),
      ],
    );
    return mapProjectRow(r.rows[0]);
  }
  memoryProjects.push(row);
  return row;
}

export async function getProject(id: string): Promise<ProjectRow | null> {
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query('select * from public.published_projects where id = $1', [id]);
    return r.rows[0] ? mapProjectRow(r.rows[0]) : null;
  }
  return memoryProjects.find((p) => p.id === id) || null;
}

export async function listProjects(ownerId: string): Promise<PublishedProject[]> {
  let rows: ProjectRow[];
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      'select * from public.published_projects where owner_id = $1 order by created_at desc limit 100',
      [ownerId],
    );
    rows = r.rows.map(mapProjectRow);
  } else {
    rows = memoryProjects.filter((p) => p.ownerId === ownerId);
  }
  const out: PublishedProject[] = [];
  for (const row of rows) out.push(toProjectCard(row, await ownerInfo(row.ownerId)));
  return out;
}

export async function listPublicProjects(): Promise<PublishedProject[]> {
  let rows: ProjectRow[];
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      'select * from public.published_projects order by created_at desc limit 100',
    );
    rows = r.rows.map(mapProjectRow);
  } else {
    rows = [...memoryProjects].reverse();
  }
  const out: PublishedProject[] = [];
  for (const row of rows) out.push(toProjectCard(row, await ownerInfo(row.ownerId)));
  return out;
}

export async function deleteProject(id: string, actor: { id: string; role: string }): Promise<'deleted' | 'forbidden' | 'not_found'> {
  const row = await getProject(id);
  if (!row) return 'not_found';
  if (row.ownerId !== actor.id && actor.role !== 'ADMIN') return 'forbidden';
  if (databasePool) {
    await databasePool.query('delete from public.published_projects where id = $1', [id]);
  } else {
    const idx = memoryProjects.findIndex((p) => p.id === id);
    if (idx !== -1) memoryProjects.splice(idx, 1);
  }
  return 'deleted';
}

// ---- snippets -------------------------------------------------------------

export async function createSnippet(params: {
  ownerId: string;
  title: string;
  language: string;
  content: string;
}): Promise<SnippetRow> {
  const row: SnippetRow = {
    id: secureId('snp'),
    ownerId: params.ownerId,
    title: params.title,
    language: params.language,
    content: params.content,
    createdAt: new Date().toISOString(),
  };
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      `insert into public.published_snippets (id, owner_id, title, language, content)
       values ($1, $2, $3, $4, $5) returning *`,
      [row.id, row.ownerId, row.title, row.language, row.content],
    );
    return mapSnippetRow(r.rows[0]);
  }
  memorySnippets.push(row);
  return row;
}

export async function getSnippet(id: string): Promise<SnippetRow | null> {
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query('select * from public.published_snippets where id = $1', [id]);
    return r.rows[0] ? mapSnippetRow(r.rows[0]) : null;
  }
  return memorySnippets.find((s) => s.id === id) || null;
}

export async function listSnippets(ownerId: string): Promise<PublishedSnippet[]> {
  let rows: SnippetRow[];
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      'select * from public.published_snippets where owner_id = $1 order by created_at desc limit 100',
      [ownerId],
    );
    rows = r.rows.map(mapSnippetRow);
  } else {
    rows = memorySnippets.filter((s) => s.ownerId === ownerId);
  }
  const out: PublishedSnippet[] = [];
  for (const row of rows) out.push(toSnippetCard(row, await ownerInfo(row.ownerId)));
  return out;
}

export async function listPublicSnippets(): Promise<PublishedSnippet[]> {
  let rows: SnippetRow[];
  if (databasePool) {
    await ensureSchema();
    const r = await databasePool.query(
      'select * from public.published_snippets order by created_at desc limit 100',
    );
    rows = r.rows.map(mapSnippetRow);
  } else {
    rows = [...memorySnippets].reverse();
  }
  const out: PublishedSnippet[] = [];
  for (const row of rows) out.push(toSnippetCard(row, await ownerInfo(row.ownerId)));
  return out;
}

export async function deleteSnippet(id: string, actor: { id: string; role: string }): Promise<'deleted' | 'forbidden' | 'not_found'> {
  const row = await getSnippet(id);
  if (!row) return 'not_found';
  if (row.ownerId !== actor.id && actor.role !== 'ADMIN') return 'forbidden';
  if (databasePool) {
    await databasePool.query('delete from public.published_snippets where id = $1', [id]);
  } else {
    const idx = memorySnippets.findIndex((s) => s.id === id);
    if (idx !== -1) memorySnippets.splice(idx, 1);
  }
  return 'deleted';
}

// ---- account deletion sweep (memory mode; PG cascades via FK) -----------

export function purgePublishedData(userId: string): void {
  if (databasePool) return;
  for (let i = memoryProjects.length - 1; i >= 0; i--) {
    if (memoryProjects[i].ownerId === userId) memoryProjects.splice(i, 1);
  }
  for (let i = memorySnippets.length - 1; i >= 0; i--) {
    if (memorySnippets[i].ownerId === userId) memorySnippets.splice(i, 1);
  }
}

// ---- detail shape for the API --------------------------------------------

export async function projectDetail(row: ProjectRow): Promise<PublishedProjectDetail> {
  const owner = await ownerInfo(row.ownerId);
  const card = toProjectCard(row, owner);
  return { ...card, files: row.files };
}

export async function snippetDetail(row: SnippetRow): Promise<PublishedSnippet> {
  const owner = await ownerInfo(row.ownerId);
  return toSnippetCard(row, owner);
}

export type { PublishedFile };
