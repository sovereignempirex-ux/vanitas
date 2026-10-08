import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { ServerPlan, ServerRequest, ServerRequestStatus } from '../../types.ts';
import {
  Server,
  Lock,
  Plus,
  Trash2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  PackageCheck,
  Clock,
  Copy,
  Code2,
  Pencil,
  Save,
  Inbox,
} from 'lucide-react';

/** Visual identity per lifecycle status (badge + icon). */
const STATUS_META: Record<ServerRequestStatus, { label: string; cls: string; icon: React.ElementType }> = {
  pending: { label: 'Pending', cls: 'text-amber-300 bg-amber-500/15 border-amber-500/30', icon: Clock },
  approved: { label: 'Approved', cls: 'text-sky-300 bg-sky-500/15 border-sky-500/30', icon: CheckCircle2 },
  delivered: { label: 'Delivered', cls: 'text-emerald-300 bg-emerald-500/15 border-emerald-500/30', icon: PackageCheck },
  rejected: { label: 'Rejected', cls: 'text-rose-300 bg-rose-500/15 border-rose-500/30', icon: XCircle },
};

const STATUS_ORDER: ServerRequestStatus[] = ['pending', 'approved', 'delivered', 'rejected'];

type Tab = 'requests' | 'plans' | 'embed';

const copyText = (text: string): void => {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text);
  } catch {
    /* clipboard unavailable — the snippet is selectable anyway */
  }
};

const CodeBlock: React.FC<{ children: string; label?: string }> = ({ children, label }) => {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-2xl border border-slate-700/60 bg-slate-950/80 overflow-hidden">
      {label && (
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-500">{label}</span>
          <button
            type="button"
            onClick={() => {
              copyText(children);
              setCopied(true);
              setTimeout(() => setCopied(false), 1400);
            }}
            className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-semibold text-slate-400 hover:text-white hover:border-slate-500 transition-colors"
          >
            <Copy className="h-3 w-3" /> {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      )}
      <pre className="overflow-x-auto p-4 font-mono text-[11px] leading-relaxed text-sky-200/90 whitespace-pre-wrap break-all">
        {children}
      </pre>
    </div>
  );
};

const StatusBadge: React.FC<{ status: ServerRequestStatus }> = ({ status }) => {
  const meta = STATUS_META[status] ?? STATUS_META.pending;
  const Icon = meta.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${meta.cls}`}>
      <Icon className="h-3 w-3" /> {meta.label}
    </span>
  );
};

/** Server Request Orders — the admin side of "طلب سيرفرات":
 *  review the intake queue, move requests through their lifecycle,
 *  publish the plan catalog the embed widget shows, and grab the
 *  embed/API snippets for third-party sites. */
export const ServerOrdersView: React.FC = () => {
  const { role } = useAuth();
  const [tab, setTab] = useState<Tab>('requests');
  const [requests, setRequests] = useState<ServerRequest[]>([]);
  const [plans, setPlans] = useState<ServerPlan[]>([]);
  const [filter, setFilter] = useState<ServerRequestStatus | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [expandedId, setExpandedId] = useState('');

  // Plans editor state
  const [planDraft, setPlanDraft] = useState<{ name: string; specs: string; price: string; description: string } | null>(null);
  const [planEditingId, setPlanEditingId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [reqRes, planRes] = await Promise.all([api.listServerRequests(), api.listServerPlansAdmin()]);
      setRequests(reqRes.requests);
      setPlans(planRes.plans);
    } catch (err) {
      setError((err as Error).message || 'Could not load server requests');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'ADMIN') void load();
  }, [role, load]);

  // If not admin, render 403 Forbidden Screen (same pattern as AdminCenterView).
  if (role !== 'ADMIN') {
    return (
      <div className="rounded-3xl border border-rose-500/30 bg-slate-950/80 p-8 sm:p-12 text-center backdrop-blur-xl animate-in zoom-in-95">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-rose-500/20 text-rose-400 border border-rose-500/30">
          <Lock className="h-8 w-8" />
        </div>
        <h2 className="mt-4 font-display text-2xl font-bold text-white">403 Forbidden: Admin Privileges Required</h2>
        <p className="mt-2 text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
          The server-request queue exposes requester emails and hand-off credentials — it is readable by{" "}
          <code className="font-mono text-rose-300 font-bold">ADMIN</code> only.
        </p>
        <p className="mt-4 text-[11px] text-slate-500">
          Roles are decided by the server, never by the client — sign in with a real ADMIN account to open this queue.
        </p>
      </div>
    );
  }

  const counts: Record<ServerRequestStatus, number> = { pending: 0, approved: 0, delivered: 0, rejected: 0 };
  requests.forEach((r) => {
    if (counts[r.status] !== undefined) counts[r.status]++;
  });
  const visible = filter === 'all' ? requests : requests.filter((r) => r.status === filter);

  const patchRequest = async (id: string, patch: Parameters<typeof api.updateServerRequest>[1]) => {
    setBusyId(id);
    setError('');
    try {
      const { request } = await api.updateServerRequest(id, patch);
      setRequests((prev) => prev.map((r) => (r.id === request.id ? request : r)));
    } catch (err) {
      setError((err as Error).message || 'Could not update the request');
    } finally {
      setBusyId('');
    }
  };

  const savePlan = async () => {
    if (!planDraft) return;
    if (planDraft.name.trim().length < 3) {
      setError('Plan name must be at least 3 characters');
      return;
    }
    setError('');
    try {
      if (planEditingId) {
        const { plan } = await api.updateServerPlan(planEditingId, planDraft);
        setPlans((prev) => prev.map((p) => (p.id === plan.id ? plan : p)));
      } else {
        const { plan } = await api.createServerPlan(planDraft);
        setPlans((prev) => [...prev, plan]);
      }
      setPlanDraft(null);
      setPlanEditingId('');
    } catch (err) {
      setError((err as Error).message || 'Could not save the plan');
    }
  };

  const removePlan = async (id: string) => {
    setError('');
    try {
      await api.deleteServerPlan(id);
      setPlans((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setError((err as Error).message || 'Could not delete the plan');
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const embedSnippet = `<script src="${origin}/embed/server-orders.js" data-label="Request a Server" defer></script>`;

  const tabs: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'requests', label: `Requests${requests.length ? ` (${requests.length})` : ''}`, icon: Inbox },
    { id: 'plans', label: `Plans (${plans.length})`, icon: Server },
    { id: 'embed', label: 'Embed & API', icon: Code2 },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Header */}
      <div className="rounded-3xl border border-slate-700/60 bg-slate-950/80 p-6 sm:p-8 backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 border border-sky-500/30 text-sky-300">
              <Server className="h-6 w-6" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold text-white">Server Requests</h1>
              <p className="text-xs text-slate-400">
                Queue of hosting requests from the embeddable widget & public API — plan catalog, review, delivery.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 rounded-xl border border-slate-700 px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-800 pt-4">
          {tabs.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-colors ${
                  tab === t.id
                    ? 'bg-sky-500/15 border border-sky-500/40 text-sky-200'
                    : 'border border-transparent text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <Icon className="h-4 w-4" /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-xs text-rose-300">{error}</div>
      )}

      {/* ------------------------------- REQUESTS ------------------------------- */}
      {tab === 'requests' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                filter === 'all' ? 'border-slate-400 bg-slate-700/60 text-white' : 'border-slate-700 text-slate-400 hover:text-white'
              }`}
            >
              All · {requests.length}
            </button>
            {STATUS_ORDER.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setFilter(s)}
                className={`rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition-colors ${
                  filter === s ? STATUS_META[s].cls : 'border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                {STATUS_META[s].label} · {counts[s]}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-10 text-center text-xs text-slate-500">
              Loading the queue…
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-10 text-center">
              <Inbox className="mx-auto h-10 w-10 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-300">No requests here yet</p>
              <p className="mt-1 text-xs text-slate-500 max-w-md mx-auto">
                Requests arrive from the embeddable widget or the public API — open the <b>Embed &amp; API</b> tab to
                install the widget on a site or curl the endpoints directly.
              </p>
            </div>
          ) : (
            visible.map((req) => {
              const expanded = expandedId === req.id;
              const busy = busyId === req.id;
              return (
                <div key={req.id} className="rounded-3xl border border-slate-700/60 bg-slate-950/80 backdrop-blur-xl overflow-hidden">
                  <div className="flex flex-wrap items-center gap-3 p-5">
                    <StatusBadge status={req.status} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">
                        {req.planName} <span className="text-slate-500 font-normal">— {req.requesterName}</span>
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {req.requesterEmail} · {req.id} · {new Date(req.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? '' : req.id)}
                      className="rounded-xl border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-slate-500 transition-colors"
                    >
                      {expanded ? 'Hide details' : 'Review'}
                    </button>
                  </div>

                  {expanded && (
                    <div className="border-t border-slate-800 p-5 space-y-5">
                      {req.note && (
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Requester note</p>
                          <p className="mt-1 whitespace-pre-wrap rounded-xl bg-slate-900/70 border border-slate-800 p-3 text-xs text-slate-300">
                            {req.note}
                          </p>
                        </div>
                      )}

                      {/* Review note — shown to the requester on the track page */}
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                          Review note (visible to the requester)
                        </p>
                        <textarea
                          key={`rn-${req.id}-${req.reviewNote.length}`}
                          defaultValue={req.reviewNote}
                          rows={2}
                          placeholder="Progress update or rejection reason…"
                          onBlur={(e) => {
                            const v = e.target.value;
                            if (v !== req.reviewNote) void patchRequest(req.id, { reviewNote: v });
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500/60 resize-y"
                        />
                      </div>

                      {/* Lifecycle actions */}
                      <div className="flex flex-wrap gap-2">
                        {req.status !== 'pending' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchRequest(req.id, { status: 'pending' })}
                            className="rounded-xl border border-slate-600 px-3.5 py-2 text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
                          >
                            Move back to pending
                          </button>
                        )}
                        {req.status !== 'approved' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchRequest(req.id, { status: 'approved' })}
                            className="rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20 disabled:opacity-50"
                          >
                            <CheckCircle2 className="mr-1 inline h-3.5 w-3.5" /> Approve
                          </button>
                        )}
                        {req.status !== 'rejected' && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void patchRequest(req.id, { status: 'rejected' })}
                            className="rounded-xl border border-rose-500/40 bg-rose-500/10 px-3.5 py-2 text-[11px] font-semibold text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
                          >
                            <XCircle className="mr-1 inline h-3.5 w-3.5" /> Reject
                          </button>
                        )}
                      </div>

                      {/* Delivery block — required before "delivered" */}
                      <DeliveryForm request={req} busy={busy} onSave={(patch) => void patchRequest(req.id, patch)} />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* -------------------------------- PLANS -------------------------------- */}
      {tab === 'plans' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-400">
              Active plans are served to the widget at <code className="font-mono text-sky-300">GET /api/v1/servers/plans</code>.
              Existing requests keep a snapshot of the plan name even if you edit or delete it here.
            </p>
            <button
              type="button"
              onClick={() => {
                setPlanEditingId('');
                setPlanDraft({ name: '', specs: '', price: '', description: '' });
              }}
              className="flex items-center gap-2 rounded-xl bg-sky-500/15 border border-sky-500/40 px-4 py-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors"
            >
              <Plus className="h-4 w-4" /> New plan
            </button>
          </div>

          {planDraft && (
            <div className="rounded-3xl border border-sky-500/30 bg-slate-950/80 p-5 space-y-3">
              <p className="text-xs font-bold uppercase tracking-widest text-sky-300">
                {planEditingId ? 'Edit plan' : 'New plan'}
              </p>
              <input
                value={planDraft.name}
                onChange={(e) => setPlanDraft({ ...planDraft, name: e.target.value })}
                placeholder="Name (e.g. VPS Starter)"
                maxLength={80}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/60"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={planDraft.specs}
                  onChange={(e) => setPlanDraft({ ...planDraft, specs: e.target.value })}
                  placeholder="Specs (2 vCPU · 4 GB · 80 GB NVMe)"
                  maxLength={300}
                  className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/60"
                />
                <input
                  value={planDraft.price}
                  onChange={(e) => setPlanDraft({ ...planDraft, price: e.target.value })}
                  placeholder="Price ($12 / mo, custom quote…)"
                  maxLength={120}
                  className="rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/60"
                />
              </div>
              <textarea
                value={planDraft.description}
                onChange={(e) => setPlanDraft({ ...planDraft, description: e.target.value })}
                placeholder="Description (shown under the plan in the widget)"
                rows={3}
                maxLength={1000}
                className="w-full rounded-xl border border-slate-700 bg-slate-900/70 px-3 py-2 text-sm text-slate-200 outline-none focus:border-sky-500/60 resize-y"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void savePlan()}
                  className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/25"
                >
                  <Save className="h-4 w-4" /> Save plan
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlanDraft(null);
                    setPlanEditingId('');
                    setError('');
                  }}
                  className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {plans.length === 0 && !planDraft ? (
            <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-10 text-center">
              <Server className="mx-auto h-10 w-10 text-slate-600" />
              <p className="mt-3 text-sm font-semibold text-slate-300">No plans published yet</p>
              <p className="mt-1 text-xs text-slate-500">
                Create the first plan — the widget and public API show only active plans.
              </p>
            </div>
          ) : (
            plans.map((plan) => (
              <div
                key={plan.id}
                className={`rounded-3xl border bg-slate-950/80 p-5 backdrop-blur-xl ${
                  plan.active ? 'border-slate-700/60' : 'border-slate-800 opacity-60'
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">
                      {plan.name}
                      {plan.price && <span className="ml-2 text-xs font-normal text-emerald-300">{plan.price}</span>}
                      {!plan.active && (
                        <span className="ml-2 rounded-full border border-slate-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400">
                          Inactive
                        </span>
                      )}
                    </p>
                    {plan.specs && <p className="mt-0.5 text-xs text-slate-400 font-mono">{plan.specs}</p>}
                    {plan.description && <p className="mt-1 text-xs text-slate-500">{plan.description}</p>}
                    <p className="mt-1 text-[10px] text-slate-600 font-mono">{plan.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void api.updateServerPlan(plan.id, { active: !plan.active }).then(({ plan: updated }) =>
                        setPlans((prev) => prev.map((p) => (p.id === updated.id ? updated : p))),
                      )}
                      className={`rounded-xl border px-3 py-1.5 text-[11px] font-semibold transition-colors ${
                        plan.active
                          ? 'border-slate-600 text-slate-300 hover:text-white'
                          : 'border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/10'
                      }`}
                    >
                      {plan.active ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlanEditingId(plan.id);
                        setPlanDraft({
                          name: plan.name,
                          specs: plan.specs,
                          price: plan.price,
                          description: plan.description,
                        });
                      }}
                      className="rounded-xl border border-slate-600 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white"
                    >
                      <Pencil className="mr-1 inline h-3 w-3" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => void removePlan(plan.id)}
                      className="rounded-xl border border-rose-500/40 px-3 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-500/10"
                    >
                      <Trash2 className="mr-1 inline h-3 w-3" /> Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ------------------------------ EMBED & API ------------------------------ */}
      {tab === 'embed' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-slate-700/60 bg-slate-950/80 p-6 space-y-3 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Code2 className="h-4 w-4 text-sky-300" /> Install the widget on any website
            </h2>
            <p className="text-xs text-slate-400">
              One script tag — the floating button, plan dropdown, form and one-time tracking token all come from this
              line. Works on any origin (Vercel, WordPress, plain HTML): the widget talks to the public API with CORS{' '}
              <code className="font-mono text-sky-300">*</code>.
            </p>
            <CodeBlock label="HTML">{embedSnippet}</CodeBlock>
            <div className="grid gap-3 sm:grid-cols-2 text-[11px] text-slate-400">
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <code className="text-sky-300 font-mono">data-plan="spl_…"</code> — preselect a plan by id.
              </div>
              <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                <code className="text-sky-300 font-mono">data-position="bottom-left"</code> — dock left instead of right.
              </div>
            </div>
            <CodeBlock label="Listen for submissions on your site">{`window.addEventListener('vanitas:server-request', e => {
  // e.detail = { id, status, planName, trackToken, trackPath }
  console.log('new server request', e.detail.id);
});`}</CodeBlock>
          </div>

          <div className="rounded-3xl border border-slate-700/60 bg-slate-950/80 p-6 space-y-3 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-white">Tracking page</h2>
            <p className="text-xs text-slate-400">
              Give the requester this link (the token is appended automatically after submission):
            </p>
            <CodeBlock label="URL">{`${origin}/embed/track.html?token=vnt_strk_…`}</CodeBlock>
          </div>

          <div className="rounded-3xl border border-slate-700/60 bg-slate-950/80 p-6 space-y-3 backdrop-blur-xl">
            <h2 className="text-sm font-bold text-white">Public API (no auth, rate-limited, CORS *)</h2>
            <CodeBlock label="1 · List active plans">{`curl ${origin}/api/v1/servers/plans`}</CodeBlock>
            <CodeBlock label="2 · Submit a request">{`curl -X POST ${origin}/api/v1/servers/requests \\
  -H 'Content-Type: application/json' \\
  -d '{"planId":"spl_...","name":"Sara","email":"sara@example.com","note":"needs IPv6"}'`}</CodeBlock>
            <CodeBlock label="3 · Track with the returned token">{`curl ${origin}/api/v1/servers/requests/track/vnt_strk_...`}</CodeBlock>
            <p className="text-[11px] text-slate-500">
              Submitting returns <code className="font-mono text-sky-300">trackToken</code> exactly once (only its
              sha256 is stored). A hidden <code className="font-mono text-sky-300">website</code> honeypot field and a
              15/min per-IP budget keep bots out of the queue.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

/** Inline editor for the hand-off details; "Save & mark delivered"
 *  performs both — the server requires a host before a delivery. */
const DeliveryForm: React.FC<{
  request: ServerRequest;
  busy: boolean;
  onSave: (patch: {
    status?: ServerRequestStatus;
    host?: string;
    sshPort?: number;
    sshUser?: string;
    credentialsNote?: string;
  }) => void;
}> = ({ request, busy, onSave }) => {
  const [open, setOpen] = useState(false);
  const [host, setHost] = useState('');
  const [sshUser, setSshUser] = useState('');
  const [sshPort, setSshPort] = useState('22');
  const [creds, setCreds] = useState('');

  useEffect(() => {
    setHost(request.host);
    setSshUser(request.sshUser);
    setSshPort(String(request.sshPort || 22));
    setCreds(request.credentialsNote);
  }, [request]);

  if (!open) {
    return (
      <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-400 min-w-0">
            {request.status === 'delivered' && request.host ? (
              <span className="font-mono text-emerald-300">
                {request.sshUser || 'root'}@{request.host}:{request.sshPort}
              </span>
            ) : (
              <span>No delivery details attached yet.</span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 px-3 py-1.5 text-[11px] font-semibold text-slate-300 hover:text-white hover:border-slate-500"
          >
            <Server className="h-3.5 w-3.5" /> {request.host ? 'Edit delivery' : 'Add delivery details'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 space-y-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-300">
        Delivery — connection details (only the track-token holder can read them)
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="Host / IP (required)"
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60"
        />
        <input
          value={sshUser}
          onChange={(e) => setSshUser(e.target.value)}
          placeholder="SSH user (root)"
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60"
        />
        <input
          value={sshPort}
          onChange={(e) => setSshPort(e.target.value.replace(/[^0-9]/g, ''))}
          placeholder="Port"
          inputMode="numeric"
          className="rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60"
        />
      </div>
      <textarea
        value={creds}
        onChange={(e) => setCreds(e.target.value)}
        placeholder="Credentials note / next steps (password reset instructions, keys, panel URL…)"
        rows={2}
        maxLength={1000}
        className="w-full rounded-xl border border-slate-700 bg-slate-900/80 px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60 resize-y"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const port = Number(sshPort || '22');
            onSave({
              status: 'delivered',
              host: host.trim(),
              sshUser: sshUser.trim(),
              sshPort: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
              credentialsNote: creds.trim(),
            });
            setOpen(false);
          }}
          className="flex items-center gap-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 px-4 py-2 text-[11px] font-semibold text-emerald-200 hover:bg-emerald-500/25 disabled:opacity-50"
        >
          <PackageCheck className="h-3.5 w-3.5" /> Save &amp; mark delivered
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            const port = Number(sshPort || '22');
            onSave({
              host: host.trim(),
              sshUser: sshUser.trim(),
              sshPort: Number.isInteger(port) && port >= 1 && port <= 65535 ? port : 22,
              credentialsNote: creds.trim(),
            });
            setOpen(false);
          }}
          className="rounded-xl border border-slate-600 px-4 py-2 text-[11px] font-semibold text-slate-300 hover:text-white disabled:opacity-50"
        >
          Save without delivering
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border border-slate-700 px-4 py-2 text-[11px] font-semibold text-slate-400 hover:text-white"
        >
          Cancel
        </button>
      </div>
      {request.status !== 'delivered' && (
        <p className="text-[10px] text-slate-500">
          “Save &amp; mark delivered” moves the request to <b className="text-emerald-300">delivered</b> immediately —
          the server rejects an empty host.
        </p>
      )}
    </div>
  );
};
