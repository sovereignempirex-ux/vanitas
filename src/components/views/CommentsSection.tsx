import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../lib/apiClient.ts';
import { DocComment } from '../../types.ts';
import { MessageCircle, Send, Trash2, Loader2 } from 'lucide-react';

const timeAgo = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
};

/**
 * REAL comment thread under a documentation page.
 * Every comment is stored in PostgreSQL and belongs to a registered account.
 * The table starts empty by design — there are NO seeded/fake comments.
 */
export const CommentsSection: React.FC<{ docId: string }> = ({ docId }) => {
  const { user, role, setIsAuthModalOpen } = useAuth();
  const [comments, setComments] = useState<DocComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .listComments(docId)
      .then((data) => {
        if (!cancelled) setComments(data.comments);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || 'Failed to load comments');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [docId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      setIsAuthModalOpen(true);
      return;
    }
    const text = body.trim();
    if (text.length < 2) return;
    setPosting(true);
    setError(null);
    try {
      const data = await api.postComment(docId, text);
      setComments((prev) => [...prev, data.comment]);
      setBody('');
    } catch (err: any) {
      setError(err?.message || 'Failed to post comment');
    } finally {
      setPosting(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.deleteComment(id);
      setComments((prev) => prev.filter((c) => c.id !== id));
    } catch (err: any) {
      setError(err?.message || 'Failed to delete comment');
    }
  };

  return (
    <section className="mt-6 border-t border-white/10 pt-5" aria-label={`Comments for ${docId}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-cyan-400" />
          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Comments</h4>
          <span className="text-[10px] font-mono text-slate-500">({comments.length})</span>
        </div>
        <span className="text-[10px] font-mono text-slate-600">DB-BACKED · REAL USERS ONLY</span>
      </div>

      {loading ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading comments…
        </div>
      ) : comments.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">
          No comments yet — be the first to share feedback on this page.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="rounded-2xl border border-white/10 bg-slate-900/50 p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  {c.authorAvatar ? (
                    <img
                      src={c.authorAvatar}
                      alt=""
                      referrerPolicy="no-referrer"
                      className="h-7 w-7 rounded-lg object-cover border border-white/15"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cyan-500/15 border border-cyan-400/30 text-[11px] font-bold text-cyan-300">
                      {(c.authorName || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{c.authorName}</p>
                    <p className="text-[10px] text-slate-500">{timeAgo(c.createdAt)}</p>
                  </div>
                </div>
                {(user && user.id === c.userId) || role === 'ADMIN' ? (
                  <button
                    onClick={() => remove(c.id)}
                    title="Delete comment"
                    className="rounded-lg p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-slate-300 whitespace-pre-wrap break-words">
                {c.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-950/40 p-2.5 text-[11px] text-red-300">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="mt-4 flex items-start gap-2.5">
        {user?.avatarUrl ? (
          <img
            src={user.avatarUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="hidden sm:block h-8 w-8 rounded-xl object-cover border border-white/15"
          />
        ) : null}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, 2000))}
          rows={2}
          placeholder={user ? 'Write a comment… (2–2000 characters)' : 'Sign in to comment'}
          className="flex-1 resize-none rounded-xl border border-white/10 bg-slate-900/70 px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:border-cyan-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={posting || body.trim().length < 2}
          className="flex items-center gap-1.5 rounded-xl bg-cyan-600 px-3.5 py-2.5 text-xs font-semibold text-white hover:bg-cyan-500 transition-all disabled:opacity-50"
        >
          {posting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          <span>Post</span>
        </button>
      </form>
      <p className="mt-1.5 text-[10px] text-slate-600">{body.length}/2000</p>
    </section>
  );
};
