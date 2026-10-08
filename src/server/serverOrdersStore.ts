import crypto from 'crypto';
import { databasePool, ensureSchema } from './pg.ts';
import { secureToken, secureId } from './security.ts';

// ---------------------------------------------------------------------------
// Server request orders ("طلب سيرفرات") — the REAL intake system for
// hosting/server requests.
//
// A visitor (from an embedded widget on any website, or straight from
// the public API) picks a published plan and submits a request. The
// request enters a `pending` queue an admin reviews in the dashboard,
// then moves through approved → delivered (with the real connection
// details) or rejected (with a reason).
//
// Storage: PostgreSQL when DATABASE_URL is set, process-local
// in-memory otherwise — like every other store here. NEVER seeded:
// plans and requests only exist when someone actually creates them.
//
// Tracking: the submitter receives a one-time `trackToken`
// (sha256-hashed at rest) that lets them follow the request's status
// and collect delivery credentials without an account — this is what
// makes the embedded (anonymous) flow usable.
// ---------------------------------------------------------------------------

export type ServerRequestStatus = 'pending' | 'approved' | 'delivered' | 'rejected';
export const SERVER_REQUEST_STATUSES: ServerRequestStatus[] = ['pending', 'approved', 'delivered', 'rejected'];

export function isServerRequestStatus(value: unknown): value is ServerRequestStatus {
  return typeof value === 'string' && (SERVER_REQUEST_STATUSES as string[]).includes(value);
}

export interface ServerPlan {
  id: string;
  name: string;
  /** One-line spec summary, admin-authored ("2 vCPU · 4 GB · 80 GB NVMe"). */
  specs: string;
  /** Display price, admin-authored ("$12 / mo" or "custom quote"). */
  price: string;
  description: string;
  /** Inactive plans disappear from the public catalog immediately. */
  active: boolean;
  createdAt: string;
}

export interface ServerRequest {
  id: string;
  planId: string;
  /** Snapshot of the plan's name at submission — outlives plan edits/deletes. */
  planName: string;
  requesterName: string;
  requesterEmail: string;
  note: string;
  status: ServerRequestStatus;
  /** Message shown to the requester (progress note or rejection reason). */
  reviewNote: string;
  // Delivery details — only meaningful once status === 'delivered'.
  host: string;
  sshPort: number;
  sshUser: string;
  credentialsNote: string;
  /** sha256(trackToken) — lookup only; the raw token exists once, at creation. */
  trackTokenHash: string;
  createdAt: string;
  updatedAt: string;
}

const sha256Hex = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const iso = (v: any) => (v instanceof Date ? v.toISOString() : v || undefined);

const memoryPlans: ServerPlan[] = [];
const memoryRequests: ServerRequest[] = [];

function mapPlanRow(row: Record<string, any>): ServerPlan {
  return {
    id: row.id,
    name: row.name,
    specs: row.specs || '',
    price: row.price || '',
    description: row.description || '',
    active: !!row.active,
    createdAt: iso(row.created_at) || new Date().toISOString(),
  };
}

function mapRequestRow(row: Record<string, any>): ServerRequest {
  return {
    id: row.id,
    planId: row.plan_id || '',
    planName: row.plan_name,
    requesterName: row.requester_name,
    requesterEmail: row.requester_email,
    note: row.note || '',
    status: isServerRequestStatus(row.status) ? row.status : 'pending',
    reviewNote: row.review_note || '',
    host: row.host || '',
    sshPort: Number(row.ssh_port) || 22,
    sshUser: row.ssh_user || '',
    credentialsNote: row.credentials_note || '',
    trackTokenHash: row.track_token_hash,
    createdAt: iso(row.created_at) || new Date().toISOString(),
    updatedAt: iso(row.updated_at) || new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Plans (admin-managed catalog — the public catalog the widget/API reads)
// ---------------------------------------------------------------------------

export async function listServerPlans(opts: { includeInactive?: boolean } = {}): Promise<ServerPlan[]> {
  if (!databasePool) {
    return memoryPlans
      .filter((p) => (opts.includeInactive ? true : p.active))
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  }
  await ensureSchema();
  const r = await databasePool.query(
    opts.includeInactive
      ? 'select * from public.server_plans order by created_at desc'
      : 'select * from public.server_plans where active = true order by created_at desc',
  );
  return r.rows.map(mapPlanRow);
}

export async function getServerPlan(id: string): Promise<ServerPlan | null> {
  if (!databasePool) return memoryPlans.find((p) => p.id === id) || null;
  await ensureSchema();
  const r = await databasePool.query('select * from public.server_plans where id = $1', [id]);
  return r.rows[0] ? mapPlanRow(r.rows[0]) : null;
}

export async function createServerPlan(params: {
  name: string;
  specs: string;
  price: string;
  description: string;
  active?: boolean;
}): Promise<ServerPlan> {
  const plan: ServerPlan = {
    id: secureId('spl'),
    name: params.name,
    specs: params.specs,
    price: params.price,
    description: params.description,
    active: params.active !== false,
    createdAt: new Date().toISOString(),
  };
  if (!databasePool) {
    memoryPlans.unshift(plan);
    return plan;
  }
  await ensureSchema();
  await databasePool.query(
    `insert into public.server_plans (id, name, specs, price, description, active)
     values ($1, $2, $3, $4, $5, $6)`,
    [plan.id, plan.name, plan.specs, plan.price, plan.description, plan.active],
  );
  return plan;
}

export async function updateServerPlan(
  id: string,
  patch: Partial<Pick<ServerPlan, 'name' | 'specs' | 'price' | 'description' | 'active'>>,
): Promise<ServerPlan | null> {
  if (!databasePool) {
    const plan = memoryPlans.find((p) => p.id === id);
    if (!plan) return null;
    Object.assign(plan, patch);
    return plan;
  }
  await ensureSchema();
  const r = await databasePool.query(
    `update public.server_plans set
       name = coalesce($2, name),
       specs = coalesce($3, specs),
       price = coalesce($4, price),
       description = coalesce($5, description),
       active = coalesce($6, active)
     where id = $1
     returning *`,
    [
      id,
      patch.name ?? null,
      patch.specs ?? null,
      patch.price ?? null,
      patch.description ?? null,
      patch.active ?? null,
    ],
  );
  return r.rows[0] ? mapPlanRow(r.rows[0]) : null;
}

export async function deleteServerPlan(id: string): Promise<boolean> {
  if (!databasePool) {
    const idx = memoryPlans.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    memoryPlans.splice(idx, 1);
    return true;
  }
  await ensureSchema();
  // Requests keep their planName snapshot — no FK on purpose.
  const r = await databasePool.query('delete from public.server_plans where id = $1 returning id', [id]);
  return (r.rowCount ?? 0) > 0;
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function createServerRequest(params: {
  planId: string;
  planName: string;
  requesterName: string;
  requesterEmail: string;
  note: string;
}): Promise<{ request: ServerRequest; trackToken: string }> {
  // Shown ONCE at submission; only the sha256 hash is ever stored.
  const trackToken = secureToken('vnt_strk_', 24);
  const nowIso = new Date().toISOString();
  const request: ServerRequest = {
    id: secureId('sreq'),
    planId: params.planId,
    planName: params.planName,
    requesterName: params.requesterName,
    requesterEmail: params.requesterEmail,
    note: params.note,
    status: 'pending',
    reviewNote: '',
    host: '',
    sshPort: 22,
    sshUser: '',
    credentialsNote: '',
    trackTokenHash: sha256Hex(trackToken),
    createdAt: nowIso,
    updatedAt: nowIso,
  };
  if (!databasePool) {
    memoryRequests.unshift(request);
    return { request, trackToken };
  }
  await ensureSchema();
  await databasePool.query(
    `insert into public.server_requests
       (id, plan_id, plan_name, requester_name, requester_email, note, status, track_token_hash, created_at, updated_at)
     values ($1, $2, $3, $4, $5, $6, 'pending', $7, now(), now())`,
    [request.id, request.planId, request.planName, request.requesterName, request.requesterEmail, request.note, request.trackTokenHash],
  );
  return { request, trackToken };
}

/** Newest first, capped — the admin queue, optionally by status. */
export async function listServerRequests(status?: ServerRequestStatus, limit = 500): Promise<ServerRequest[]> {
  if (!databasePool) {
    return memoryRequests
      .filter((r) => (status ? r.status === status : true))
      .slice()
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .slice(0, limit);
  }
  await ensureSchema();
  const r = status
    ? await databasePool.query(
        'select * from public.server_requests where status = $1 order by created_at desc limit $2',
        [status, limit],
      )
    : await databasePool.query('select * from public.server_requests order by created_at desc limit $1', [limit]);
  return r.rows.map(mapRequestRow);
}

export async function getServerRequest(id: string): Promise<ServerRequest | null> {
  if (!databasePool) return memoryRequests.find((r) => r.id === id) || null;
  await ensureSchema();
  const r = await databasePool.query('select * from public.server_requests where id = $1', [id]);
  return r.rows[0] ? mapRequestRow(r.rows[0]) : null;
}

export async function findServerRequestByTrackToken(token: string): Promise<ServerRequest | null> {
  if (!token) return null;
  const hash = sha256Hex(token);
  if (!databasePool) return memoryRequests.find((r) => r.trackTokenHash === hash) || null;
  await ensureSchema();
  const r = await databasePool.query('select * from public.server_requests where track_token_hash = $1', [hash]);
  return r.rows[0] ? mapRequestRow(r.rows[0]) : null;
}

export async function updateServerRequest(
  id: string,
  patch: Partial<Pick<ServerRequest, 'status' | 'reviewNote' | 'host' | 'sshPort' | 'sshUser' | 'credentialsNote'>>,
): Promise<ServerRequest | null> {
  const apply = (row: ServerRequest): ServerRequest => {
    Object.assign(row, patch);
    row.updatedAt = new Date().toISOString();
    return row;
  };
  if (!databasePool) {
    const row = memoryRequests.find((r) => r.id === id);
    if (!row) return null;
    return apply(row);
  }
  await ensureSchema();
  const r = await databasePool.query(
    `update public.server_requests set
       status = coalesce($2, status),
       review_note = coalesce($3, review_note),
       host = coalesce($4, host),
       ssh_port = coalesce($5, ssh_port),
       ssh_user = coalesce($6, ssh_user),
       credentials_note = coalesce($7, credentials_note),
       updated_at = now()
     where id = $1
     returning *`,
    [
      id,
      patch.status ?? null,
      patch.reviewNote ?? null,
      patch.host ?? null,
      patch.sshPort ?? null,
      patch.sshUser ?? null,
      patch.credentialsNote ?? null,
    ],
  );
  return r.rows[0] ? mapRequestRow(r.rows[0]) : null;
}
