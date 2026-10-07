import React, { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  Loader2, Github, Globe, Code2, FileCode2, Trash2, ExternalLink,
  Rocket, Search, FolderTree, Eye, RefreshCw, AlertCircle, CheckCircle2,
  ChevronRight, Lock,
} from 'lucide-react';
import { api } from '../../lib/apiClient.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import type { GitHubRepoInfo, PublishedProject, PublishedProjectDetail, PublishedSnippet } from '../../types.ts';

type Tab = 'github' | 'projects' | 'publish' | 'gallery';

const SNIPPET_LANGUAGES = [
  'html', 'css', 'javascript', 'typescript', 'json', 'markdown',
  'python', 'sql', 'shell', 'rust', 'go', 'java', 'c', 'cpp',
  'php', 'ruby', 'vue', 'svelte', 'yaml', 'text',
];

export const PublishView: React.FC = () => {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('github');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // GitHub connection
  const [ghConnected, setGhConnected] = useState<boolean | null>(null);
  const [repos, setRepos] = useState<GitHubRepoInfo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [importing, setImporting] = useState('');

  // Projects & snippets
  const [myProjects, setMyProjects] = useState<PublishedProject[]>([]);
  const [publicProjects, setPublicProjects] = useState<PublishedProject[]>([]);
  const [mySnippets, setMySnippets] = useState<PublishedSnippet[]>([]);
  const [publicSnippets, setPublicSnippets] = useState<PublishedSnippet[]>([]);
  const [selected, setSelected] = useState<PublishedProjectDetail | null>(null);
  const [selectedLoading, setSelectedLoading] = useState(false);

  // Publish form
  const [title, setTitle] = useState('');
  const [language, setLanguage] = useState('html');
  const [content, setContent] = useState('');
  const [publishing, setPublishing] = useState(false);

  const loadGitHub = useCallback(async () => {
    try {
      const status = await api.getGitHubStatus();
      setGhConnected(status.connected);
      if (status.connected) {
        setReposLoading(true);
        try {
          const result = await api.listGitHubRepos();
          setRepos(result.repos);
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setReposLoading(false);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadMine = useCallback(async () => {
    try {
      const [projects, snippets] = await Promise.all([api.getMyProjects(), api.getMySnippets()]);
      setMyProjects(projects.projects);
      setMySnippets(snippets.snippets);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  const loadGallery = useCallback(async () => {
    try {
      const [projects, snippets] = await Promise.all([api.getPublicProjects(), api.getPublicSnippets()]);
      setPublicProjects(projects.projects);
      setPublicSnippets(snippets.snippets);
    } catch (err) {
      setError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    void loadGitHub();
    void loadMine();
    void loadGallery();
  }, [loadGitHub, loadMine, loadGallery]);

  const openProject = async (id: string) => {
    setSelected(null);
    setSelectedLoading(true);
    setError('');
    try {
      const result = await api.getProject(id);
      setSelected(result.project);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSelectedLoading(false);
    }
  };

  const importRepo = async (fullName: string) => {
    setImporting(fullName);
    setError('');
    setNotice('');
    try {
      const result = await api.importGitHubRepo(fullName);
      setNotice(`"${result.project.title}" imported — ${result.project.fileCount} files${result.project.isWeb ? ', sandbox preview ready' : ''}.`);
      await loadMine();
      await loadGallery();
      setTab('projects');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting('');
    }
  };

  const removeProject = async (id: string) => {
    setError('');
    try {
      await api.deleteProject(id);
      await loadMine();
      await loadGallery();
      if (selected?.id === id) setSelected(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeSnippet = async (id: string) => {
    setError('');
    try {
      await api.deleteSnippet(id);
      await loadMine();
      await loadGallery();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const publish = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !content.trim() || publishing) return;
    setPublishing(true);
    setError('');
    setNotice('');
    try {
      const result = await api.publishSnippet({ title: title.trim(), language, content });
      setNotice(`"${result.snippet.title}" published to the gallery.`);
      setTitle('');
      setContent('');
      await loadMine();
      await loadGallery();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setPublishing(false);
    }
  };

  const connectGitHub = () => {
    // Real OAuth consent screen — the user grants public_repo
    // access; the token comes back to the server only.
    window.location.href = '/api/v1/social/github';
  };

  const openPreview = (id: string) => window.open(`/api/v1/publish/projects/${encodeURIComponent(id)}/preview`, '_blank');
  const openSnippetPreview = (id: string) => window.open(`/api/v1/publish/snippets/${encodeURIComponent(id)}/preview`, '_blank');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'github', label: 'GitHub Import', icon: <Github className="h-3.5 w-3.5" /> },
    { id: 'projects', label: 'My Projects', icon: <FolderTree className="h-3.5 w-3.5" /> },
    { id: 'publish', label: 'Publish Code', icon: <Code2 className="h-3.5 w-3.5" /> },
    { id: 'gallery', label: 'Public Gallery', icon: <Globe className="h-3.5 w-3.5" /> },
  ];

  const projectCard = (p: PublishedProject, mine: boolean) => (
    <div key={p.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 flex-none items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-300">
          {p.isWeb ? <Globe className="h-4 w-4" /> : <FileCode2 className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <button onClick={() => void openProject(p.id)} className="truncate text-sm font-semibold text-slate-100 hover:text-cyan-200 hover:underline">
              {p.title}
            </button>
            {p.source === 'github' && <Github className="h-3.5 w-3.5 flex-none text-slate-500" />}
            {p.isWeb && <span className="flex-none rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-200">WEB</span>}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-400">
            @{p.ownerUsername}{p.language ? ` · ${p.language}` : ''} · {p.fileCount} file{p.fileCount === 1 ? '' : 's'}
          </p>
          {p.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{p.description}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button onClick={() => void openProject(p.id)} className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
              <FileCode2 className="h-3 w-3" /> Files
            </button>
            {p.isWeb && (
              <button onClick={() => openPreview(p.id)} className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/20">
                <Eye className="h-3 w-3" /> Sandbox Preview
              </button>
            )}
            {p.repoUrl && (
              <a href={p.repoUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-400/40 hover:text-cyan-200">
                <ExternalLink className="h-3 w-3" /> Source
              </a>
            )}
            {mine && (
              <button onClick={() => void removeProject(p.id)} className="flex items-center gap-1 rounded-lg border border-rose-400/20 px-2.5 py-1 text-[11px] font-medium text-rose-300/80 transition hover:border-rose-400/50 hover:text-rose-200">
                <Trash2 className="h-3 w-3" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  const snippetCard = (s: PublishedSnippet, mine: boolean) => (
    <div key={s.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-200">{s.language}</span>
        <button onClick={() => { setSelected(null); setTab('gallery'); }} className="min-w-0 truncate text-sm font-semibold text-slate-100 hover:text-cyan-200 hover:underline">
          {s.title}
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400">by @{s.ownerUsername} · {new Date(s.createdAt).toLocaleDateString()}</p>
      <pre className="mt-2 max-h-32 overflow-auto rounded-lg bg-slate-950/70 p-2.5 font-mono text-[11px] leading-relaxed text-slate-300"><code>{s.content.slice(0, 2000)}{s.content.length > 2000 ? '\n…' : ''}</code></pre>
      <div className="mt-2 flex gap-2">
        {s.language.toLowerCase() === 'html' && (
          <button onClick={() => openSnippetPreview(s.id)} className="flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] font-medium text-emerald-200 transition hover:bg-emerald-400/20">
            <Eye className="h-3 w-3" /> Sandbox Preview
          </button>
        )}
        {mine && (
          <button onClick={() => void removeSnippet(s.id)} className="flex items-center gap-1 rounded-lg border border-rose-400/20 px-2.5 py-1 text-[11px] font-medium text-rose-300/80 transition hover:border-rose-400/50 hover:text-rose-200">
            <Trash2 className="h-3 w-3" /> Delete
          </button>
        )}
      </div>
    </div>
  );

  return (
    <section className="space-y-5">
      <header>
        <p className="text-xs font-mono uppercase tracking-[0.22em] text-cyan-300">Publishing</p>
        <h1 className="mt-1 text-2xl font-bold text-white">GitHub Projects & Code Sandbox</h1>
        <p className="mt-1 text-sm text-slate-400">
          Import your own GitHub repositories with your permission, publish individual code files,
          and run web/HTML projects in an isolated sandbox.
        </p>
      </header>

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-none" /> {error}
        </div>
      )}
      {notice && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none" /> {notice}
        </div>
      )}

      <nav className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-2 rounded-xl border px-3.5 py-2 text-sm font-medium transition ${
              tab === t.id
                ? 'border-cyan-400/50 bg-cyan-400/15 text-cyan-100'
                : 'border-white/10 bg-white/[0.02] text-slate-400 hover:border-cyan-400/30 hover:text-slate-200'
            }`}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      {/* ---------------- GitHub Import ---------------- */}
      {tab === 'github' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.04] text-slate-200">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-100">GitHub connection</p>
                  <p className="text-xs text-slate-400">
                    {ghConnected === null
                      ? 'Checking connection…'
                      : ghConnected
                        ? 'Connected — your grant is stored encrypted, server-side only.'
                        : 'Not connected — grant access to import your repositories.'}
                  </p>
                </div>
              </div>
              <button
                onClick={connectGitHub}
                className="flex items-center gap-2 rounded-xl bg-cyan-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <Github className="h-4 w-4" />
                {ghConnected ? 'Reconnect / Grant Access' : 'Connect GitHub'}
              </button>
            </div>
            {ghConnected === false && (
              <p className="mt-3 flex items-start gap-1.5 text-xs text-slate-500">
                <Lock className="mt-0.5 h-3 w-3 flex-none" />
                You are redirected to GitHub's real consent screen. The platform receives an
                access token (public repositories only) that never leaves the server.
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/45 p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                <Search className="h-4 w-4 text-cyan-400" /> Your repositories
              </h2>
              <button onClick={() => void loadGitHub()} disabled={reposLoading || ghConnected !== true} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:border-cyan-400/40 disabled:cursor-not-allowed disabled:opacity-50">
                <RefreshCw className={`h-3 w-3 ${reposLoading ? 'animate-spin' : ''}`} /> Refresh
              </button>
            </div>
            {reposLoading ? (
              <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-cyan-400" />
            ) : repos.length ? (
              <div className="space-y-2">
                {repos.map((repo) => (
                  <div key={repo.fullName} className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-100">
                        <a href={repo.htmlUrl} target="_blank" rel="noreferrer" className="hover:text-cyan-200 hover:underline">{repo.fullName}</a>
                        {repo.isPrivate && <Lock className="ml-1.5 inline h-3 w-3 text-slate-500" />}
                      </p>
                      <p className="truncate text-xs text-slate-400">
                        {repo.language || '—'}{repo.description ? ` · ${repo.description}` : ''}
                      </p>
                    </div>
                    <button
                      onClick={() => void importRepo(repo.fullName)}
                      disabled={importing === repo.fullName}
                      className="flex flex-none items-center gap-1.5 rounded-lg bg-cyan-500 px-3 py-1.5 text-xs font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {importing === repo.fullName ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
                      Import
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-center text-xs text-slate-500">
                {ghConnected ? 'No repositories found on this account.' : 'Connect GitHub to list your repositories.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ---------------- My Projects ---------------- */}
      {tab === 'projects' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-200">
              <FolderTree className="h-4 w-4 text-cyan-400" /> Published by you
            </h2>
            {myProjects.length ? myProjects.map((p) => projectCard(p, true)) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
                Nothing published yet — import a repository from the GitHub tab.
              </p>
            )}
            <h2 className="mt-6 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Code2 className="h-4 w-4 text-violet-400" /> Your published code
            </h2>
            {mySnippets.length ? mySnippets.map((s) => snippetCard(s, true)) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
                No individual code files published yet — use the Publish Code tab.
              </p>
            )}
          </div>

          <aside className="h-fit rounded-2xl border border-white/10 bg-slate-950/45 p-4 xl:sticky xl:top-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Project files</h3>
            {selectedLoading ? (
              <Loader2 className="mx-auto mt-8 h-5 w-5 animate-spin text-cyan-400" />
            ) : selected ? (
              <div className="space-y-1.5">
                <p className="mb-2 text-sm font-semibold text-slate-100">{selected.title}</p>
                {selected.files.map((f) => (
                  <details key={f.path} className="group rounded-lg border border-white/[0.06] bg-white/[0.02]">
                    <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 font-mono text-[11px] text-slate-300">
                      <ChevronRight className="h-3 w-3 flex-none text-slate-500 transition group-open:rotate-90" />
                      <span className="truncate">{f.path}</span>
                      <span className="ml-auto flex-none text-[10px] text-slate-500">{f.language}</span>
                    </summary>
                    <pre className="max-h-56 overflow-auto border-t border-white/[0.06] p-3 font-mono text-[11px] leading-relaxed text-slate-300"><code>{f.content.slice(0, 4000)}{f.content.length > 4000 ? '\n…' : ''}</code></pre>
                  </details>
                ))}
                {selected.isWeb && (
                  <button onClick={() => openPreview(selected.id)} className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300">
                    <Eye className="h-4 w-4" /> Open Sandbox Preview
                  </button>
                )}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-slate-500">Select a project to browse its files.</p>
            )}
          </aside>
        </div>
      )}

      {/* ---------------- Publish Code ---------------- */}
      {tab === 'publish' && (
        <form onSubmit={publish} className="max-w-3xl space-y-4 rounded-2xl border border-white/10 bg-slate-950/45 p-5">
          <div>
            <label htmlFor="pub-title" className="mb-1.5 block text-xs font-semibold text-slate-300">Title</label>
            <input
              id="pub-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="My awesome component"
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
            />
          </div>
          <div>
            <label htmlFor="pub-lang" className="mb-1.5 block text-xs font-semibold text-slate-300">Language</label>
            <select
              id="pub-lang"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2.5 text-sm text-white outline-none focus:border-cyan-400/50"
            >
              {SNIPPET_LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            {language === 'html' && (
              <p className="mt-1.5 text-[11px] text-emerald-300/80">HTML files get a sandbox preview in the gallery.</p>
            )}
          </div>
          <div>
            <label htmlFor="pub-code" className="mb-1.5 block text-xs font-semibold text-slate-300">Code</label>
            <textarea
              id="pub-code"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              maxLength={100000}
              rows={14}
              placeholder="// Paste or write your code here"
              className="min-w-0 w-full resize-y rounded-xl border border-white/10 bg-slate-900 p-3 font-mono text-[13px] leading-relaxed text-white outline-none focus:border-cyan-400/50"
            />
            <p className="mt-1 text-right text-[10px] text-slate-500">{content.length.toLocaleString()} / 100,000</p>
          </div>
          <button
            type="submit"
            disabled={publishing || !title.trim() || !content.trim()}
            className="flex items-center gap-2 rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
            Publish to the gallery
          </button>
        </form>
      )}

      {/* ---------------- Public Gallery ---------------- */}
      {tab === 'gallery' && (
        <div className="space-y-6">
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Globe className="h-4 w-4 text-cyan-400" /> Community projects
            </h2>
            {publicProjects.length ? (
              <div className="grid gap-3 lg:grid-cols-2">{publicProjects.map((p) => projectCard(p, false))}</div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
                The project gallery is empty — published projects appear here.
              </p>
            )}
          </div>
          <div>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-200">
              <Code2 className="h-4 w-4 text-violet-400" /> Community code
            </h2>
            {publicSnippets.length ? (
              <div className="grid gap-3 lg:grid-cols-2">{publicSnippets.map((s) => snippetCard(s, false))}</div>
            ) : (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center text-xs text-slate-500">
                The code gallery is empty — published snippets appear here.
              </p>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
