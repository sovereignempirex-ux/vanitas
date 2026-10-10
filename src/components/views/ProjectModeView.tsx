import React, { useRef, useState } from 'react';
import { api } from '../../lib/apiClient.ts';
import { Markdown } from '../Markdown.tsx';
import { FolderOpen, FileCode2, Search, Save, LoaderCircle, ShieldCheck, AlertCircle } from 'lucide-react';

type FsFile = { kind: 'file'; name: string; getFile(): Promise<File> };
type FsDirectory = {
  kind: 'directory'; name: string;
  values(): AsyncIterable<FsFile | FsDirectory>;
  getDirectoryHandle(name: string, options?: { create?: boolean }): Promise<FsDirectory>;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<FsFile & { createWritable(): Promise<{ write(value: string): Promise<void>; close(): Promise<void> }> }>;
};
type ProposedFile = { path: string; action: 'create' | 'update'; content: string };

const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.venv', 'venv', 'target', 'vendor']);
const sourceExtensions = /\.(tsx?|jsx?|py|go|rs|java|kt|swift|cs|cpp|cc|c|h|hpp|sql|sol|r|json|toml|yaml|yml|xml|gradle|md|csproj|sln)$/i;
const manifestNames = new Set(['package.json', 'tsconfig.json', 'vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.ts', 'requirements.txt', 'pyproject.toml', 'cargo.toml', 'go.mod', 'pom.xml', 'build.gradle', 'build.gradle.kts', 'cmakelists.txt', 'package.swift']);
const maxFileBytes = 12_000;
const maxContextBytes = 32_000;

function safeRelativePath(path: string) {
  const normalized = path.replace(/\\/g, '/').replace(/^\.\//, '');
  return normalized.length > 0 && normalized.length <= 240 && !normalized.startsWith('/') &&
    !normalized.split('/').some((part) => !part || part === '.' || part === '..' || part.startsWith('.'));
}

function parseProposals(text: string): ProposedFile[] {
  const proposals: ProposedFile[] = [];
  const pattern = /```project-file\s+path="([^"]+)"\s+action="(create|update)"\s*\n([\s\S]*?)\n```/g;
  for (const match of text.matchAll(pattern)) {
    const path = match[1];
    const content = match[3];
    if (safeRelativePath(path) && content.length <= 100_000 && !proposals.some((p) => p.path === path)) {
      proposals.push({ path, action: match[2] as ProposedFile['action'], content });
    }
  }
  return proposals;
}

export const ProjectModeView: React.FC = () => {
  const rootRef = useRef<FsDirectory | null>(null);
  const originalContentsRef = useRef<Record<string, string>>({});
  const [project, setProject] = useState<any>(null);
  const [filePaths, setFilePaths] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [answer, setAnswer] = useState('');
  const [proposals, setProposals] = useState<ProposedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const connectProject = async (selectedRoot?: FsDirectory) => {
    const picker = (window as any).showDirectoryPicker as undefined | (() => Promise<FsDirectory>);
    if (!picker) {
      setNotice('اختيار المجلد غير مدعوم في هذا المتصفح. افتح المنصة في Chrome أو Edge حديث.');
      return;
    }
    setBusy(true); setNotice(''); setAnswer(''); setProposals([]);
    try {
      const root = selectedRoot || await picker();
      rootRef.current = root;
      const files: string[] = [];
      const contents: Record<string, string> = {};
      const manifests: Record<string, string> = {};
      let bytes = 0;
      const walk = async (directory: FsDirectory, prefix = ''): Promise<void> => {
        if (files.length >= 180 || bytes >= maxContextBytes) return;
        for await (const entry of directory.values()) {
          if (files.length >= 180 || bytes >= maxContextBytes) break;
          const path = prefix ? `${prefix}/${entry.name}` : entry.name;
          if (entry.kind === 'directory') {
            if (!ignoredDirectories.has(entry.name) && !entry.name.startsWith('.')) await walk(entry, path);
            continue;
          }
          files.push(path);
          const name = entry.name.toLowerCase();
          const isManifest = manifestNames.has(name) || /\.(csproj|sln)$/i.test(name) || name === 'podfile' || name === 'cmakelists.txt' || name === 'package.swift';
          if (!isManifest && !sourceExtensions.test(name)) continue;
          try {
            const file = await entry.getFile();
            if (file.size > maxFileBytes || bytes + file.size > maxContextBytes) continue;
            const content = await file.text();
            bytes += content.length;
            if (isManifest) manifests[path] = content.slice(0, 10_000);
            contents[path] = content;
          } catch { /* unreadable entries stay visible in the tree */ }
        }
      };
      await walk(root);
      const all = Object.keys(contents);
      const packageJson = Object.entries(manifests).find(([path]) => path.toLowerCase().endsWith('package.json'))?.[1];
      let pkg: any = {};
      try { pkg = packageJson ? JSON.parse(packageJson) : {}; } catch { /* report malformed manifests as detected */ }
      const languages = [...new Set(all.map((path) => {
        const ext = path.split('.').pop()?.toLowerCase();
        return ({ ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript', py: 'Python', go: 'Go', rs: 'Rust', java: 'Java', kt: 'Kotlin', swift: 'Swift', cs: 'C#', cpp: 'C++', c: 'C', sql: 'SQL', sol: 'Solidity', r: 'R' } as Record<string, string>)[ext || ''];
      }).filter(Boolean))];
      const detectedFiles = all.map((path) => ({ path, content: contents[path] }));
      originalContentsRef.current = contents;
      const manifestText = `${JSON.stringify(manifests)} ${JSON.stringify(pkg)}`.toLowerCase();
      const fileSet = new Set(files.map((path) => path.toLowerCase()));
      const analysis = {
        projectMode: true,
        rootName: root.name,
        projectType: pkg.dependencies?.react || pkg.devDependencies?.react ? 'web application' : pkg.name ? 'software project' : 'source project',
        languages,
        frameworks: ['react', 'vite', 'next', 'express', 'fastapi', 'flask', 'django', 'spring', 'unity', 'tauri', 'electron'].filter((name) => manifestText.includes(name)),
        runtime: pkg.engines?.node ? `Node.js ${pkg.engines.node}` : Object.keys(manifests).some((p) => p.toLowerCase().endsWith('go.mod')) ? 'Go' : Object.keys(manifests).some((p) => p.toLowerCase().endsWith('cargo.toml')) ? 'Rust' : Object.keys(manifests).some((p) => /pyproject\.toml|requirements\.txt$/i.test(p)) ? 'Python' : languages.includes('Java') ? 'JVM' : null,
        dependencies: Object.keys(pkg.dependencies || {}).slice(0, 40),
        packageManager: files.some((p) => p.endsWith('pnpm-lock.yaml')) ? 'pnpm' : files.some((p) => p.endsWith('yarn.lock')) ? 'yarn' : files.some((p) => p.endsWith('package-lock.json')) ? 'npm' : null,
        buildSystem: ['vite.config.ts', 'vite.config.js', 'next.config.js', 'next.config.ts', 'cmakelists.txt', 'build.gradle', 'build.gradle.kts', 'pom.xml', 'cargo.toml', 'go.mod'].filter((name) => fileSet.has(name)),
        entryPoints: files.filter((p) => /(^|\/)(main|index|app)\.(tsx?|jsx?|py|go|rs|java|kt|swift|cs)$/i.test(p)).slice(0, 20),
        frontend: languages.some((language) => ['JavaScript', 'TypeScript'].includes(language)) ? 'JavaScript/TypeScript source detected' : null,
        backend: ['express', 'fastapi', 'flask', 'django', 'spring'].find((name) => manifestText.includes(name)) || null,
        database: ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'prisma', 'drizzle'].filter((name) => manifestText.includes(name)),
        configuration: files.filter((p) => /(^|\/)(\.env\.example|\.env\.sample|tsconfig\.json|vite\.config\.|next\.config\.|dockerfile|docker-compose|\.github\/workflows\/)/i.test(p)).slice(0, 30),
        tests: files.filter((p) => /(^|\/)(__tests__\/|tests?\/|.*\.(test|spec)\.)/i.test(p)).slice(0, 40),
        deployment: files.filter((p) => /(^|\/)(vercel\.json|netlify\.toml|render\.yaml|dockerfile|docker-compose\.yml|\.github\/workflows\/)/i.test(p)).slice(0, 20),
        architecture: [...new Set(files.map((p) => p.split('/')[0]))].slice(0, 30),
        buildCommand: pkg.scripts?.build || null,
        testCommand: pkg.scripts?.test || null,
        devCommand: pkg.scripts?.dev || null,
        manifests,
        files: detectedFiles,
      };
      rootRef.current = root;
      setProject(analysis); setFilePaths(files.sort());
      setNotice(`تم تحليل ${files.length} ملفًا و${Object.keys(manifests).length} ملف إعداد. اختر طلبًا لتطوير هذا المشروع.`);
    } catch (error: any) {
      if (error?.name !== 'AbortError') setNotice(error?.message || 'تعذر فتح مجلد المشروع.');
    } finally { setBusy(false); }
  };

  const askProject = async () => {
    if (!project || !prompt.trim() || busy) return;
    setBusy(true); setAnswer(''); setProposals([]); setNotice('يفحص بنية المشروع والملفات المرتبطة بطلبك…');
    const request = `نفّذ طلبي داخل المشروع الحالي فقط، مع الحفاظ على بنيته وميزاته. حلّل السياق والملفات قبل اقتراح التغيير. عند الحاجة لتعديل ملفات، أخرج كل ملف كاملًا في كتلة project-file حسب التنسيق المحدد. لا تدّعِ تنفيذ أي تعديل.\n\nطلب المستخدم: ${prompt.trim()}`;
    try {
      const result = await api.queryAiStream({ persona: 'code', toneStyle: 'arabic', prompt: request, context: project }, (delta) => setAnswer((current) => current + delta));
      setAnswer(result.text);
      setProposals(parseProposals(result.text));
      setNotice('اكتمل تحليل الطلب. راجع أي تغييرات مقترحة قبل حفظها في المجلد.');
    } catch (error: any) {
      setNotice(`تعذر إكمال التحليل: ${error?.message || 'خطأ غير معروف'}`);
    } finally { setBusy(false); }
  };

  const applyProposals = async () => {
    const root = rootRef.current;
    if (!root || !proposals.length || busy) return;
    setBusy(true); setNotice('يحفظ الملفات التي راجعتها…');
    try {
      for (const proposal of proposals) {
        if (!safeRelativePath(proposal.path)) throw new Error(`مسار غير مسموح: ${proposal.path}`);
        const currentContent = originalContentsRef.current[proposal.path];
        if (proposal.action === 'update' && currentContent === undefined) throw new Error(`لا يمكن تحديث ملف لم يتم تحليله: ${proposal.path}`);
        const parts = proposal.path.split('/');
        let directory = root;
        for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true });
        let target: FsFile & { createWritable(): Promise<{ write(value: string): Promise<void>; close(): Promise<void> }> };
        if (proposal.action === 'create') {
          try {
            await directory.getFileHandle(parts[parts.length - 1]);
            throw new Error(`الملف موجود بالفعل؛ رُفض استبداله كملف جديد: ${proposal.path}`);
          } catch (error: any) {
            if (error?.message?.startsWith('الملف موجود بالفعل')) throw error;
            if (error?.name !== 'NotFoundError') throw error;
          }
          target = await directory.getFileHandle(parts[parts.length - 1], { create: true });
        } else {
          target = await directory.getFileHandle(parts[parts.length - 1]);
          const current = await (await target.getFile()).text();
          if (current !== currentContent) throw new Error(`تغيّر الملف منذ تحليله؛ أعد تحليل المشروع قبل الحفظ: ${proposal.path}`);
        }
        const writable = await target.createWritable();
        await writable.write(proposal.content);
        await writable.close();
      }
      setNotice(`حُفظت ${proposals.length} تغييرات في مجلد المشروع المحدد.`);
      setProposals([]);
      await connectProject(root);
    } catch (error: any) {
      setNotice(`تعذر حفظ الملفات: ${error?.message || 'تحقق من صلاحية الكتابة للمجلد.'}`);
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-300" dir="rtl">
      <section className="rounded-3xl border border-cyan-500/20 bg-slate-950/70 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-white"><FolderOpen className="h-5 w-5 text-cyan-300" /> وضع المشروع</h2>
            <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-400">اربط مجلد مشروعك لتحليل ملفات الإعداد والكود، ثم اطلب تطوير المشروع الحالي. الملفات لا تُحفظ إلا بعد مراجعة التغييرات والموافقة عليها.</p>
          </div>
          <button onClick={connectProject} disabled={busy} className="flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-cyan-500 disabled:opacity-50">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}{project ? 'اختيار مجلد آخر' : 'فتح مجلد المشروع'}
          </button>
        </div>
        {notice && <p className="mt-4 flex items-center gap-2 text-xs text-cyan-200"><ShieldCheck className="h-4 w-4 shrink-0" />{notice}</p>}
      </section>

      {project && <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <section className="space-y-4">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
            <label className="mb-2 block text-sm font-semibold text-white">ماذا تريد أن أطور في هذا المشروع؟</label>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="مثال: أضف تسجيل دخول متوافقًا مع بنية المشروع الحالية…" className="min-h-24 w-full resize-y rounded-xl border border-white/10 bg-slate-900 p-3 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none" />
            <button onClick={askProject} disabled={busy || !prompt.trim()} className="mt-3 flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500 disabled:opacity-40"><Search className="h-4 w-4" />حلل واطرح التعديل</button>
          </div>
          {answer && <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"><Markdown content={answer} /></div>}
          {!!proposals.length && <div className="rounded-2xl border border-amber-400/25 bg-amber-950/10 p-4">
            <h3 className="font-semibold text-amber-100">تغييرات جاهزة للمراجعة</h3>
            <p className="mt-1 text-xs text-slate-400">سيتم كتابة الملفات التالية داخل المجلد الذي اخترته فقط.</p>
            <div className="mt-3 space-y-2">{proposals.map((file) => <details key={file.path} className="rounded-xl border border-white/10 bg-slate-950 p-3"><summary className="cursor-pointer font-mono text-xs text-cyan-200">{file.action === 'create' ? 'إنشاء' : 'تحديث'} · {file.path}</summary><pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-3 font-mono text-[11px] text-slate-300">{file.content}</pre></details>)}</div>
            <button onClick={applyProposals} disabled={busy} className="mt-4 flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"><Save className="h-4 w-4" />مراجعة وحفظ التغييرات</button>
          </div>}
        </section>
        <aside className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
          <h3 className="font-semibold text-white">{project.rootName}</h3>
          <p className="mt-1 text-xs text-slate-400">{project.projectType} · {filePaths.length} ملف</p>
          <div className="mt-3 flex flex-wrap gap-1.5">{project.languages.map((language: string) => <span key={language} className="rounded-full bg-blue-500/10 px-2.5 py-1 text-[11px] text-blue-200">{language}</span>)}</div>
          <div className="mt-4 border-t border-white/10 pt-3"><h4 className="mb-2 text-xs font-semibold text-slate-300">بنية الملفات</h4><div className="max-h-64 space-y-1 overflow-auto">{filePaths.slice(0, 100).map((path) => <p key={path} className="flex items-center gap-2 truncate font-mono text-[10px] text-slate-500"><FileCode2 className="h-3 w-3 shrink-0" />{path}</p>)}</div></div>
          <p className="mt-4 flex gap-2 border-t border-white/10 pt-3 text-[11px] leading-5 text-slate-500"><AlertCircle className="h-4 w-4 shrink-0 text-amber-300" />يُرسل ملخص الإعدادات ومقاطع الملفات ذات الصلة إلى خدمة الذكاء الاصطناعي لإتمام التحليل.</p>
        </aside>
      </div>}
    </div>
  );
};
