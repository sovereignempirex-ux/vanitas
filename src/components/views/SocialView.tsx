import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import { Loader2, MessageCircle, Search, Send, UserRound, Users } from 'lucide-react';
import { api } from '../../lib/apiClient.ts';
import { DirectMessage, SocialAccount, SocialConversation } from '../../types.ts';
import { useAuth } from '../../context/AuthContext.tsx';

export const SocialView: React.FC = () => {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [accounts, setAccounts] = useState<SocialAccount[]>([]);
  const [conversations, setConversations] = useState<SocialConversation[]>([]);
  const [selected, setSelected] = useState<SocialAccount | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [loadingSearch, setLoadingSearch] = useState(false);
  const [loadingThread, setLoadingThread] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const refreshInbox = useCallback(async () => {
    try { setConversations((await api.getConversations()).conversations); }
    catch (err) { setError((err as Error).message); }
  }, []);

  useEffect(() => { void refreshInbox(); }, [refreshInbox]);

  // Refresh the persisted inbox and open thread so new messages arrive without
  // pretending to provide a websocket/push connection the server does not have.
  useEffect(() => {
    const timer = window.setInterval(async () => {
      try {
        const [inbox, thread] = await Promise.all([
          api.getConversations(),
          selected ? api.getDirectMessages(selected.username) : Promise.resolve(null),
        ]);
        setConversations(inbox.conversations);
        if (thread) setMessages(thread.messages);
      } catch {
        // Keep the last successfully loaded data visible during brief outages.
      }
    }, 5000);
    return () => window.clearInterval(timer);
  }, [selected]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) { setAccounts([]); setLoadingSearch(false); return; }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoadingSearch(true); setError('');
      try {
        const result = await api.searchAccounts(term);
        if (!cancelled) setAccounts(result.accounts);
      } catch (err) { if (!cancelled) { setAccounts([]); setError((err as Error).message); } }
      finally { if (!cancelled) setLoadingSearch(false); }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timer); };
  }, [query]);

  const openConversation = async (account: SocialAccount) => {
    setSelected(account); setMessages([]); setError(''); setLoadingThread(true);
    try { setMessages((await api.getDirectMessages(account.username)).messages); await refreshInbox(); }
    catch (err) { setError((err as Error).message); }
    finally { setLoadingThread(false); }
  };

  const send = async (event: FormEvent) => {
    event.preventDefault();
    const content = draft.trim();
    if (!selected || !content || sending) return;
    setSending(true); setError('');
    try {
      const result = await api.sendDirectMessage(selected.username, content);
      setMessages((items) => [...items, result.message]); setDraft(''); await refreshInbox();
    } catch (err) { setError((err as Error).message); }
    finally { setSending(false); }
  };

  const accountRow = (account: SocialAccount | SocialConversation, subtitle?: string) => (
    <button key={account.username} onClick={() => void openConversation(account)} className="flex w-full items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-left transition hover:border-cyan-400/30 hover:bg-white/[0.05]">
      <img src={account.avatarUrl || '/images/avatar-default.svg'} alt="" className="h-10 w-10 rounded-full object-cover" />
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-slate-100">{account.name}</span><span className="block truncate text-xs text-slate-400">@{account.username}{subtitle ? ` · ${subtitle}` : ''}</span></span>
      {'unreadCount' in account && account.unreadCount > 0 && <span className="rounded-full bg-cyan-400/15 px-2 py-0.5 text-[10px] font-semibold text-cyan-200">{account.unreadCount}</span>}
      <MessageCircle className="h-4 w-4 text-cyan-400" />
    </button>
  );

  return <section className="space-y-5">
    <header><p className="text-xs font-mono uppercase tracking-[0.22em] text-cyan-300">Community</p><h1 className="mt-1 text-2xl font-bold text-white">Accounts & Messages</h1><p className="mt-1 text-sm text-slate-400">Find registered members and send them a private message.</p></header>
    {error && <div role="alert" className="rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{error}</div>}
    <div className="grid min-h-[560px] gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <aside className="space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-4">
        <label className="block text-xs font-semibold text-slate-300">Search accounts</label>
        <div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-500" /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name or @username" className="w-full rounded-xl border border-white/10 bg-slate-900 py-2.5 pl-9 pr-9 text-sm text-white outline-none focus:border-cyan-400/50" />{loadingSearch && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-cyan-400" />}</div>
        {query.trim().length >= 2 && <div className="space-y-2">{accounts.map((account) => accountRow(account))}{!loadingSearch && accounts.length === 0 && <p className="px-1 py-2 text-xs text-slate-500">No registered accounts found.</p>}</div>}
        {query.trim().length < 2 && <div className="border-t border-white/[0.08] pt-4"><h2 className="mb-3 flex items-center gap-2 text-xs font-semibold text-slate-300"><MessageCircle className="h-4 w-4 text-cyan-400" />Recent conversations</h2><div className="space-y-2">{conversations.map((conversation) => accountRow(conversation, conversation.lastMessage))}{conversations.length === 0 && <p className="text-xs text-slate-500">Your inbox is empty.</p>}</div></div>}
      </aside>
      <div className="flex min-h-[560px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-950/45">
        {selected ? <>
          <div className="flex items-center gap-3 border-b border-white/[0.08] p-4"><img src={selected.avatarUrl || '/images/avatar-default.svg'} alt="" className="h-10 w-10 rounded-full object-cover" /><div><p className="text-sm font-semibold text-white">{selected.name}</p><a href={`/u/${encodeURIComponent(selected.username)}`} className="text-xs text-cyan-300 hover:underline">@{selected.username}</a></div></div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">{loadingThread ? <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-cyan-400" /> : messages.length ? messages.map((message) => { const mine = message.senderUsername === user?.username; return <div key={message.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}><div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${mine ? 'bg-blue-600/30 text-blue-50' : 'bg-white/[0.07] text-slate-200'}`}><p className="whitespace-pre-wrap break-words">{message.content}</p><time className="mt-1 block text-right text-[10px] text-slate-400">{new Date(message.createdAt).toLocaleString()}</time></div></div>; }) : <p className="mt-12 text-center text-sm text-slate-500">No messages yet. Start the conversation.</p>}</div>
          <form onSubmit={send} className="flex gap-2 border-t border-white/[0.08] p-3"><textarea aria-label="Message" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000} rows={2} placeholder="Write a message…" className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400/50" /><button disabled={sending || !draft.trim()} className="self-end rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50" aria-label="Send message">{sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</button></form>
        </> : <div className="flex flex-1 flex-col items-center justify-center p-8 text-center"><Users className="h-10 w-10 text-slate-600" /><h2 className="mt-3 text-base font-semibold text-slate-200">Choose an account</h2><p className="mt-1 max-w-sm text-sm text-slate-500">Search by name or username, or open a recent conversation to view and send messages.</p><UserRound className="mt-6 h-4 w-4 text-slate-700" /></div>}
      </div>
    </div>
  </section>;
};
