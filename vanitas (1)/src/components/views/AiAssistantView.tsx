import React, { useState } from 'react';
import { api } from '../../lib/apiClient.ts';
import { AiToneStyle, CodeDiagnosisResult, ProductSuggestion } from '../../types.ts';
import {
  Sparkles,
  Send,
  Code,
  Shield,
  FileCode2,
  Terminal,
  Activity,
  Globe,
  ExternalLink,
  Bot,
  User,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Copy,
  Check,
  Wrench,
  Bug,
  Cpu,
  Layers,
  ArrowRight,
  ShieldAlert,
  Flame,
  Zap,
  Play,
  RotateCw,
  Sliders,
  FileCheck,
  Search,
  BookOpen,
  MessageSquare,
  ArrowLeftRight,
  Filter,
  CheckCheck,
  Gauge,
  Lock,
  FileText,
  Lightbulb,
  ClipboardCheck,
} from 'lucide-react';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: string;
  sources?: { title: string; url: string }[];
  requiresConfirmation?: {
    action: string;
    target: string;
    permission: string;
    status: string;
  };
}

const SAMPLE_BUGGY_CODES: { label: string; lang: 'typescript' | 'python' | 'curl' | 'json' | 'sql' | 'javascript'; code: string; desc: string }[] = [
  {
    label: 'Hardcoded Secret & Missing Bearer',
    lang: 'typescript',
    desc: 'Exposes raw production token and misses Bearer HTTP authorization prefix.',
    code: `// Buggy implementation with leaked credentials
import axios from 'axios';

const VANITAS_TOKEN = "sk_live_prod_994828194817294821";

async function fetchUserData() {
  const response = await axios.get("https://vanitas-bot.vercel.app/api/v1/auth/me", {
    headers: {
      "Authorization": VANITAS_TOKEN, // Missing 'Bearer ' prefix
    }
  });
  return response.data;
}`,
  },
  {
    label: 'Syntax Error & Unclosed Brackets',
    lang: 'typescript',
    desc: 'Contains unclosed curly braces, syntax error, and unhandled promise exception.',
    code: `async function syncPlatformMetrics(endpoint: string, payload: any) {
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      body: JSON.stringify(payload)
    // Missing closing brace and error catch logic
`,
  },
  {
    label: 'Unhandled HTTP 429 & Missing Backoff',
    lang: 'typescript',
    desc: 'Crashes on rate-limited responses without retry-after backoff logic.',
    code: `async function batchDispatchCommands(commands: any[]) {
  for (const cmd of commands) {
    // Fails to handle rate limiting and throws unhandled promise rejection on 429
    const res = await fetch("https://vanitas-bot.vercel.app/api/v1/bot/execute", {
      method: "POST",
      headers: {
        "Authorization": \`Bearer \${process.env.VANITAS_KEY}\`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ platform: "discord", command: cmd.name })
    });
    const data = await res.json();
    console.log("Executed:", data);
  }
}`,
  },
  {
    label: 'Python Bot Webhook without Signature Check',
    lang: 'python',
    desc: 'Lacks HMAC sha256 verification on incoming webhook payloads.',
    code: `from flask import Flask, request, jsonify
app = Flask(__name__)

@app.route('/webhook', methods=['POST'])
def handle_vanitas_event():
    # Insecure: accepting unverified payloads without HMAC verification
    event = request.json
    print("Received event:", event.get("event"))
    return jsonify({"received": True})`,
  },
  {
    label: 'SQL String Concatenation Flaw',
    lang: 'sql',
    desc: 'Raw string interpolation creates direct SQL injection vulnerability.',
    code: `// Insecure dynamic SQL builder
function findUserByEmail(userEmail: string) {
  const query = "SELECT id, name, role FROM users WHERE email = '" + userEmail + "' AND status = 'active'";
  return db.execute(query);
}`,
  },
];

export const AiAssistantView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'chat' | 'code_doctor' | 'toolbelt' | 'suggestions'>('chat');
  const [persona, setPersona] = useState<'code' | 'api' | 'security' | 'analyst' | 'docs' | 'admin'>('code');
  const [toneStyle, setToneStyle] = useState<AiToneStyle>('developer');
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [suggestionTitle, setSuggestionTitle] = useState('');
  const [suggestionDetails, setSuggestionDetails] = useState('');
  const [suggestionCode, setSuggestionCode] = useState('');
  const [suggestionCategory, setSuggestionCategory] = useState<ProductSuggestion['category']>('feature');
  const [suggestionMessage, setSuggestionMessage] = useState('');
  const [suggestions, setSuggestions] = useState<ProductSuggestion[]>([]);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [aiFix, setAiFix] = useState<CodeDiagnosisResult | null>(null);

  // Code Doctor State
  const [doctorCode, setDoctorCode] = useState(SAMPLE_BUGGY_CODES[0].code);
  const [doctorLang, setDoctorLang] = useState<'typescript' | 'javascript' | 'python' | 'curl' | 'json' | 'sql'>('typescript');
  const [analysisMode, setAnalysisMode] = useState<'full' | 'syntax_only' | 'security_only' | 'refactor_only'>('full');
  const [doctorLoading, setDoctorLoading] = useState(false);
  const [doctorResult, setDoctorResult] = useState<CodeDiagnosisResult | null>(null);
  const [doctorCopied, setDoctorCopied] = useState(false);
  const [selectedIssueCategory, setSelectedIssueCategory] = useState<string>('all');
  const [activeResultView, setActiveResultView] = useState<'report' | 'comparison' | 'refactored_only'>('report');
  const [highlightedLine, setHighlightedLine] = useState<number | null>(null);

  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      sender: 'ai',
      text: `### 🌌 مرحباً بك في نظام الذكاء الاصطناعي لمنصة Vanitas\n\nأنا وكيل الذكاء الاصطناعي المدمج والمطور لمنصة فانيتاس المركزية. تم تزويدي بنماذج استدلال متقدمة (**Gemini 3.7 Flash**) وأدوات ذكية متخصصة:\n\n1. **مصلح الكود الذكي ومحلل الأخطاء (Automated Code Doctor)**: تحليل الكود المصدري، اكتشاف الأخطاء البرمجية (Syntax Errors) والثغرات الأمنية (Security Flaws)، واقتراح حلول التحسين وإعادة الهيكلة (Refactoring Improvements).\n2. **توليد الكود وبناء الـ Payloads**: كتابة أكواد TypeScript و Python و cURL جاهزة للإنتاج.\n3. **فحص ومصفوفة الصلاحيات**: التحقق من \`assertGrantableScopes\` ومعدلات التدفق (Rate Limits).\n4. **دعم كامل للغة العربية والإنجليزية** مع إمكانية التبديل بين أساليب الحوار (مهندس نظم، مدقق أمني، مبرمج عملي، ديمون البوت).\n\nكيف يمكنني مساعدتك اليوم؟`,
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);

  const quickPrompts = [
    { text: 'صلح الكود البرمجي واكتشف الأخطاء والثغرات', style: 'arabic' as AiToneStyle, persona: 'code' as const },
    { text: 'كيف اربط بوت Discord عبر /api/v1/bot/execute؟', style: 'arabic' as AiToneStyle, persona: 'api' as const },
    { text: 'Explain how assertGrantableScopes prevents privilege escalation', style: 'security' as AiToneStyle, persona: 'security' as const },
    { text: 'Generate a TypeScript client for rotating keys with retry backoff', style: 'developer' as AiToneStyle, persona: 'code' as const },
  ];

  const handleSend = async (textToSend?: string, overrideStyle?: AiToneStyle, overridePersona?: any) => {
    const prompt = textToSend || input;
    if (!prompt.trim() || loading) return;

    const styleToUse = overrideStyle || toneStyle;
    const personaToUse = overridePersona || persona;

    const userMsg: Message = {
      id: `usr_${Date.now()}`,
      sender: 'user',
      text: prompt,
      timestamp: new Date().toLocaleTimeString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    if (!textToSend) setInput('');
    setLoading(true);

    try {
      const res = await api.queryAi({
        persona: personaToUse,
        toneStyle: styleToUse,
        prompt,
        enableWebSearch,
      });

      const aiMsg: Message = {
        id: `ai_${Date.now()}`,
        sender: 'ai',
        text: res.text,
        timestamp: new Date().toLocaleTimeString(),
        sources: res.groundingSources,
        requiresConfirmation: res.requiresConfirmation,
      };

      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `err_${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **خطأ في محرك الاستدلال الذكي**: ${err.message || 'تعذر الاتصال بمحرك Gemini، يرجى المحاولة مرة أخرى.'}`,
          timestamp: new Date().toLocaleTimeString(),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRunCodeDoctor = async (codeToRun?: string, langToRun?: any) => {
    const targetCode = codeToRun || doctorCode;
    const targetLang = langToRun || doctorLang;
    if (!targetCode.trim() || doctorLoading) return;

    setDoctorLoading(true);
    setDoctorResult(null);

    try {
      const res = await api.diagnoseAndFixCode({
        code: targetCode,
        language: targetLang,
        analysisMode,
        autoFix: true,
      });
      setDoctorResult(res);
    } catch (err: any) {
      console.error('Failed diagnosing code:', err);
    } finally {
      setDoctorLoading(false);
    }
  };

  const copyText = async (id: string, text: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        textarea.remove();
      }
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      setCopiedId(`error-${id}`);
      setTimeout(() => setCopiedId(null), 2500);
    }
  };

  const loadSuggestions = async () => {
    setSuggestionsLoading(true);
    try { setSuggestions((await api.getAdminSuggestions()).suggestions); } catch { setSuggestions([]); }
    finally { setSuggestionsLoading(false); }
  };

  const submitSuggestion = async () => {
    if (!suggestionTitle.trim() || !suggestionDetails.trim()) return;
    try {
      await api.createSuggestion({ title: suggestionTitle, details: suggestionDetails, category: suggestionCategory, code: suggestionCode || undefined });
      setSuggestionTitle(''); setSuggestionDetails(''); setSuggestionCode('');
      setSuggestionMessage('تم إرسال الاقتراح للمراجعة.');
      loadSuggestions();
    } catch (error: any) { setSuggestionMessage(error.message || 'تعذر إرسال الاقتراح.'); }
  };

  const copyFixedCode = () => {
    if (doctorResult?.fixedCode) {
      navigator.clipboard.writeText(doctorResult.fixedCode);
      setDoctorCopied(true);
      setTimeout(() => setDoctorCopied(false), 2000);
    }
  };

  const applyFixedCodeToEditor = () => {
    if (doctorResult?.fixedCode) {
      setDoctorCode(doctorResult.fixedCode);
      setHighlightedLine(null);
    }
  };

  // Helper to extract code blocks from chat text for 1-click code doctor analysis
  const extractCodeBlocksFromText = (text: string) => {
    const regex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
    const blocks: { lang: string; code: string }[] = [];
    let match;
    while ((match = regex.exec(text)) !== null) {
      blocks.push({
        lang: match[1] || 'typescript',
        code: match[2].trim(),
      });
    }
    return blocks;
  };

  const filteredIssues = doctorResult?.issues.filter((issue) => {
    if (selectedIssueCategory === 'all') return true;
    if (selectedIssueCategory === 'syntax') return issue.category === 'syntax' || issue.severity === 'error';
    if (selectedIssueCategory === 'security') return issue.category === 'security' || issue.severity === 'security';
    if (selectedIssueCategory === 'refactor') return issue.category === 'refactor' || issue.category === 'performance';
    if (selectedIssueCategory === 'typing') return issue.category === 'typing';
    return true;
  }) || [];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header & Main Mode Navigation */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-500/20 border border-blue-500/30 text-cyan-300 shadow-md">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Vanitas AI Intelligence Copilot</h1>
              <p className="text-xs text-slate-400 mt-0.5">
                Automated code parsing, syntax error diagnosis, refactoring recommendations, and multi-tone AI orchestration powered by Gemini.
              </p>
            </div>
          </div>
        </div>

        {/* Mode Tabs */}
        <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-slate-950 p-1">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <MessageSquare className="h-4 w-4" />
            <span>AI Copilot & Styles</span>
          </button>

          <button
            onClick={() => { setActiveTab('suggestions'); loadSuggestions(); }}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'suggestions' ? 'bg-amber-600 text-white shadow-md shadow-amber-600/30' : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Lightbulb className="h-4 w-4" />
            <span>Suggestions</span>
          </button>

          <button
            onClick={() => setActiveTab('code_doctor')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'code_doctor'
                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Wrench className="h-4 w-4" />
            <span>Code Doctor & Refactor</span>
            <span className="rounded-full bg-cyan-400/20 px-1.5 py-0.2 font-mono text-[9px] text-cyan-200">Gemini</span>
          </button>

          <button
            onClick={() => setActiveTab('toolbelt')}
            className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              activeTab === 'toolbelt'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
            }`}
          >
            <Cpu className="h-4 w-4" />
            <span>Smart Toolbelt</span>
          </button>
        </div>
      </div>

      {/* TAB 1: AI COPILOT CHAT & PERSONA & TONE STYLES */}
      {activeTab === 'chat' && (
        <div className="space-y-4">
          {/* Controls Bar: Persona & Tone Style Selector */}
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-4 backdrop-blur-xl flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            {/* Tone Style Switcher */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Sliders className="h-3.5 w-3.5 text-blue-400" />
                Response Tone & Personality Style (أسلوب الرد)
              </span>
              <div className="flex flex-wrap gap-1.5">
                {[
                  { id: 'developer', label: 'Developer Friendly', desc: 'Pragmatic & Clear' },
                  { id: 'architect', label: 'Systems Architect', desc: 'Enterprise & Design' },
                  { id: 'security', label: 'Security Auditor', desc: 'Zero-Trust Checks' },
                  { id: 'bot', label: 'Bot Daemon', desc: 'Machine Structured' },
                  { id: 'arabic', label: 'مهندس برمجيات عربي', desc: 'شرح فني بالعربية' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setToneStyle(s.id as AiToneStyle)}
                    className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                      toneStyle === s.id
                        ? 'border-blue-500 bg-blue-600/20 text-blue-200 shadow-md shadow-blue-600/20'
                        : 'border-white/10 bg-slate-900/60 text-slate-400 hover:border-white/20 hover:text-slate-200'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Persona Switcher */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5 text-cyan-400" />
                Domain Reasoning Focus
              </span>
              <div className="flex items-center gap-1 overflow-x-auto rounded-xl border border-white/10 bg-slate-900/80 p-1">
                {[
                  { id: 'code', label: 'Code', icon: Code },
                  { id: 'api', label: 'API', icon: Terminal },
                  { id: 'security', label: 'Security', icon: Shield },
                  { id: 'analyst', label: 'Metrics', icon: Activity },
                  { id: 'docs', label: 'Docs', icon: FileCode2 },
                  { id: 'admin', label: 'Admin Fix', icon: ShieldCheck },
                ].map((p) => {
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setPersona(p.id as any)}
                      className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all ${
                        persona === p.id
                          ? 'bg-blue-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
                      }`}
                    >
                      <Icon className="h-3 w-3" />
                      <span>{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Main Chat Interface */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 backdrop-blur-xl shadow-2xl overflow-hidden flex flex-col h-[580px]">
            {/* Messages Stream */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {messages.map((msg) => {
                const codeBlocks = extractCodeBlocksFromText(msg.text);

                return (
                  <div
                    key={msg.id}
                    className={`flex gap-3 sm:gap-4 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    {msg.sender === 'ai' && (
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600/30 to-cyan-500/20 border border-blue-500/30 text-cyan-300 shadow-md">
                        <Sparkles className="h-4 w-4" />
                      </div>
                    )}

                    <div
                      className={`max-w-2xl rounded-2xl p-4 text-xs sm:text-sm leading-relaxed ${
                        msg.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-tr-sm shadow-lg shadow-blue-600/20'
                          : 'bg-slate-900/90 text-slate-200 border border-white/10 rounded-tl-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap font-sans">{msg.text}</div>

                      {/* Automated Code Block Inspector Action Trigger */}
                      {codeBlocks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                          <span className="text-[11px] font-mono text-cyan-300 font-semibold flex items-center gap-1.5">
                            <Wrench className="h-3.5 w-3.5 text-cyan-400" />
                            Detected Code Block ({codeBlocks.length})
                          </span>
                          {codeBlocks.map((blk, bIdx) => (
                            <div key={bIdx} className="flex gap-2">
                            <button
                              onClick={() => {
                                setDoctorCode(blk.code);
                                setDoctorLang((blk.lang as any) || 'typescript');
                                setActiveTab('code_doctor');
                                handleRunCodeDoctor(blk.code, blk.lang || 'typescript');
                              }}
                              className="w-full flex items-center justify-between rounded-xl border border-cyan-500/30 bg-cyan-950/30 hover:bg-cyan-900/40 p-2.5 text-xs text-cyan-200 transition-all font-medium"
                            >
                              <div className="flex items-center gap-2 truncate">
                                <Zap className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                                <span className="truncate">Send to Code Doctor & Auto-Fix ({blk.lang || 'code'})</span>
                              </div>
                              <ArrowRight className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                            </button>
                            <button
                              onClick={() => copyText(`${msg.id}-code-${bIdx}`, blk.code)}
                              title="نسخ مقطع الكود"
                              className="rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-3 text-cyan-300 hover:bg-cyan-900/40"
                            >
                              {copiedId === `${msg.id}-code-${bIdx}` ? <ClipboardCheck className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Grounding Web Search Sources */}
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="mt-4 pt-3 border-t border-white/10">
                          <p className="text-[11px] font-mono font-semibold uppercase text-cyan-300 mb-1.5 flex items-center gap-1">
                            <Globe className="h-3.5 w-3.5" />
                            Grounding Verified Sources
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {msg.sources.map((s, idx) => (
                              <a
                                key={idx}
                                href={s.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 text-[11px] text-slate-300 hover:border-cyan-400/40 hover:text-white transition-colors"
                              >
                                <span className="truncate max-w-[180px]">{s.title}</span>
                                <ExternalLink className="h-3 w-3 text-cyan-400" />
                              </a>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Security Action Confirmation Drawer */}
                      {msg.requiresConfirmation && (
                        <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-200">
                          <div className="flex items-center gap-2 font-bold">
                            <AlertTriangle className="h-4 w-4 text-amber-400" />
                            <span>Authorization Action Required: {msg.requiresConfirmation.action}</span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-300">
                            Target: {msg.requiresConfirmation.target} (Scope: {msg.requiresConfirmation.permission})
                          </p>
                          <div className="mt-3 flex gap-2">
                            <button className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-500">
                              Confirm Action
                            </button>
                            <button className="rounded-lg border border-white/10 px-3 py-1 text-xs text-slate-400 hover:text-white">
                              Dismiss
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Action footer */}
                      <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                        <span>{msg.timestamp}</span>
                        {msg.sender === 'ai' && (
                          <button
                            onClick={() => copyText(msg.id, msg.text)}
                            className="rounded-lg border border-white/10 px-2 py-1 hover:border-cyan-400/40 hover:text-white flex items-center gap-1"
                          >
                            {copiedId === msg.id ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3 text-slate-400" />}
                            <span>{copiedId === msg.id ? 'تم النسخ' : copiedId === `error-${msg.id}` ? 'تعذر النسخ' : 'نسخ إلى الحافظة'}</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {msg.sender === 'user' && (
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-white/10 text-white">
                        <User className="h-4 w-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-3 items-center text-xs text-cyan-300 animate-pulse">
                  <Sparkles className="h-4 w-4 animate-spin" />
                  <span>Vanitas AI reasoning & synthesizing solution...</span>
                </div>
              )}
            </div>

            {/* Quick Chips Bar */}
            <div className="border-t border-white/10 bg-slate-900/40 p-2.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
              <span className="text-[10px] font-mono uppercase text-slate-500 flex-shrink-0">Suggested:</span>
              {quickPrompts.map((qp, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(qp.text, qp.style, qp.persona)}
                  className="flex-shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-[11px] text-slate-300 hover:border-blue-500/40 hover:text-white transition-colors"
                >
                  {qp.text}
                </button>
              ))}
            </div>

            {/* Input Bar */}
            <div className="p-3 sm:p-4 border-t border-white/10 bg-slate-950/90 flex items-center gap-3">
              {/* Grounding Web Search Toggle */}
              <button
                onClick={() => setEnableWebSearch(!enableWebSearch)}
                className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all ${
                  enableWebSearch
                    ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                    : 'border-white/10 bg-slate-900 text-slate-400 hover:text-slate-200'
                }`}
                title="Toggle Live Web Grounding Search"
              >
                <Globe className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Web Search</span>
              </button>

              <input
                type="text"
                placeholder={`Ask ${persona.toUpperCase()} assistant (Style: ${toneStyle})...`}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                className="flex-1 rounded-xl border border-white/10 bg-slate-900/80 px-4 py-2 text-xs text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none"
              />

              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="flex items-center justify-center rounded-xl bg-blue-600 p-2.5 text-white shadow-lg shadow-blue-600/30 hover:bg-blue-500 disabled:opacity-40 transition-all"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: AI CODE DOCTOR & AUTOMATED REFACTORING ENGINE */}
      {activeTab === 'code_doctor' && (
        <div className="space-y-6">
          {/* Code Doctor Hero Banner */}
          <div className="rounded-3xl border border-cyan-500/30 bg-gradient-to-r from-slate-950 via-cyan-950/20 to-slate-950 p-6 backdrop-blur-2xl shadow-2xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Wrench className="h-5 w-5 text-cyan-400" />
                  <h2 className="text-lg font-bold text-white">Automated Code Doctor & Refactoring Tool</h2>
                  <span className="rounded-full bg-cyan-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-500/30">
                    AST & Gemini Powered
                  </span>
                </div>
                <p className="text-xs text-slate-300 max-w-2xl">
                  Parses user-provided code blocks, identifies syntax errors, flags exposed secrets & authorization gaps, and suggests architectural refactoring improvements with 1-click apply.
                </p>
              </div>

              {/* Sample Presets */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-mono uppercase text-slate-400 block">Preset Test Cases:</span>
                <div className="flex flex-wrap gap-1.5">
                  {SAMPLE_BUGGY_CODES.map((sample, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setDoctorCode(sample.code);
                        setDoctorLang(sample.lang as any);
                        setDoctorResult(null);
                        setHighlightedLine(null);
                      }}
                      className="rounded-lg border border-white/10 bg-slate-900/80 px-2.5 py-1 text-[11px] font-medium text-slate-300 hover:border-cyan-400/40 hover:text-white transition-all"
                    >
                      {sample.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar when Result Exists */}
          {doctorResult && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 animate-in fade-in">
              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3.5 backdrop-blur-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Code Health</span>
                  <span
                    className={`text-lg font-bold font-mono ${
                      doctorResult.score >= 80
                        ? 'text-emerald-400'
                        : doctorResult.score >= 50
                        ? 'text-amber-400'
                        : 'text-rose-400'
                    }`}
                  >
                    {doctorResult.score} / 100
                  </span>
                </div>
                <Gauge className="h-5 w-5 text-slate-500" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3.5 backdrop-blur-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Syntax & Errors</span>
                  <span className="text-lg font-bold font-mono text-rose-400">
                    {doctorResult.syntaxErrorsCount ?? doctorResult.issues.filter(i => i.category === 'syntax' || i.severity === 'error').length}
                  </span>
                </div>
                <Bug className="h-5 w-5 text-rose-500/50" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3.5 backdrop-blur-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Security Flaws</span>
                  <span className="text-lg font-bold font-mono text-amber-400">
                    {doctorResult.securityFlawsCount ?? doctorResult.issues.filter(i => i.category === 'security' || i.severity === 'security').length}
                  </span>
                </div>
                <ShieldAlert className="h-5 w-5 text-amber-500/50" />
              </div>

              <div className="rounded-2xl border border-white/10 bg-slate-950/80 p-3.5 backdrop-blur-xl flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-slate-400 font-medium block">Refactoring Suggestions</span>
                  <span className="text-lg font-bold font-mono text-cyan-300">
                    {doctorResult.refactoringCount ?? doctorResult.issues.filter(i => i.category === 'refactor' || i.category === 'performance').length}
                  </span>
                </div>
                <CheckCheck className="h-5 w-5 text-cyan-500/50" />
              </div>
            </div>
          )}

          {/* Main Code Editor & Results Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Input Code Editor */}
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 backdrop-blur-xl shadow-xl flex flex-col space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-cyan-400" />
                  <span className="text-xs font-bold text-white">Source Code Input & AST Target</span>
                </div>

                <div className="flex items-center gap-2">
                  {/* Analysis Mode Selector */}
                  <select
                    value={analysisMode}
                    onChange={(e) => setAnalysisMode(e.target.value as any)}
                    className="rounded-xl border border-white/10 bg-slate-900 px-2.5 py-1 text-[11px] text-slate-300 focus:outline-none focus:border-cyan-500"
                    title="Select Analysis Focus"
                  >
                    <option value="full">Full Scan (Syntax + Sec + Refactor)</option>
                    <option value="syntax_only">Syntax Errors Only</option>
                    <option value="security_only">Security Hardening Only</option>
                    <option value="refactor_only">Refactor & Performance Only</option>
                  </select>

                  {/* Language Picker */}
                  <select
                    value={doctorLang}
                    onChange={(e) => setDoctorLang(e.target.value as any)}
                    className="rounded-xl border border-white/10 bg-slate-900 px-3 py-1 text-xs text-slate-300 focus:outline-none focus:border-cyan-500"
                  >
                    <option value="typescript">TypeScript</option>
                    <option value="javascript">JavaScript</option>
                    <option value="python">Python</option>
                    <option value="curl">cURL / Bash</option>
                    <option value="json">JSON Payload</option>
                    <option value="sql">SQL Query</option>
                  </select>
                </div>
              </div>

              {/* Interactive Code Area with Line Numbers */}
              <div className="relative flex-1 min-h-[340px] rounded-2xl border border-white/10 bg-slate-900/90 overflow-hidden flex font-mono text-xs">
                {/* Line Numbers Column */}
                <div className="w-10 bg-slate-950/60 border-r border-white/5 py-4 px-2 select-none text-slate-600 text-right space-y-[4.8px]">
                  {doctorCode.split('\n').map((_, lIdx) => {
                    const lineNum = lIdx + 1;
                    const isFlagged = highlightedLine === lineNum;
                    return (
                      <div
                        key={lIdx}
                        className={`transition-colors ${isFlagged ? 'text-rose-400 font-bold' : ''}`}
                      >
                        {lineNum}
                      </div>
                    );
                  })}
                </div>

                <textarea
                  value={doctorCode}
                  onChange={(e) => setDoctorCode(e.target.value)}
                  placeholder="Paste your TypeScript, JavaScript, Python, or API script here to diagnose and fix..."
                  className="flex-1 w-full h-full min-h-[340px] p-4 bg-transparent text-slate-200 placeholder:text-slate-600 focus:outline-none resize-none leading-relaxed font-mono"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  {doctorCode.split('\n').length} lines • {doctorCode.length} chars • Mode: {analysisMode}
                </span>

                <button
                  onClick={() => handleRunCodeDoctor()}
                  disabled={doctorLoading || !doctorCode.trim()}
                  className="flex items-center gap-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 px-4 py-2 text-xs font-semibold text-white shadow-lg shadow-cyan-600/30 transition-all disabled:opacity-40"
                >
                  {doctorLoading ? (
                    <>
                      <RotateCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Parsing AST & Running Gemini...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="h-3.5 w-3.5" />
                      <span>Analyze & Refactor Code</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right: Diagnosis & Fixed Code View */}
            <div className="rounded-3xl border border-white/10 bg-slate-950/80 p-5 backdrop-blur-xl shadow-xl flex flex-col space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-emerald-400" />
                  <span className="text-xs font-bold text-white">Diagnostic & Refactoring Output</span>
                </div>

                {doctorResult && (
                  <div className="flex items-center gap-1.5">
                    {/* View Switcher: Report, Comparison, Refactored */}
                    <div className="flex items-center rounded-xl border border-white/10 bg-slate-900 p-0.5">
                      <button
                        onClick={() => setActiveResultView('report')}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          activeResultView === 'report' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Report
                      </button>
                      <button
                        onClick={() => setActiveResultView('comparison')}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          activeResultView === 'comparison' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Compare
                      </button>
                      <button
                        onClick={() => setActiveResultView('refactored_only')}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all ${
                          activeResultView === 'refactored_only' ? 'bg-cyan-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        Code
                      </button>
                    </div>

                    <button
                      onClick={applyFixedCodeToEditor}
                      className="flex items-center gap-1 rounded-xl border border-cyan-500/30 bg-cyan-950/30 px-2.5 py-1 text-[11px] font-semibold text-cyan-300 hover:bg-cyan-900/40 transition-all"
                      title="Replace current editor content with refactored code"
                    >
                      <CheckCheck className="h-3 w-3" />
                      <span>Apply Fix</span>
                    </button>

                    <button
                      onClick={copyFixedCode}
                      className="flex items-center gap-1 rounded-xl border border-emerald-500/30 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-900/40 transition-all"
                    >
                      {doctorCopied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{doctorCopied ? 'Copied' : 'Copy'}</span>
                    </button>
                  </div>
                )}
              </div>

              {doctorLoading ? (
                <div className="flex-1 min-h-[340px] flex flex-col items-center justify-center text-center p-6 space-y-3">
                  <Sparkles className="h-8 w-8 text-cyan-400 animate-spin" />
                  <p className="text-xs font-medium text-slate-300">Parsing syntax tree, security boundaries & refactoring patterns...</p>
                  <p className="text-[11px] text-slate-500 font-mono">Gemini 3.7 Flash autonomous analysis in progress</p>
                </div>
              ) : doctorResult ? (
                <div className="space-y-4 overflow-y-auto max-h-[520px] pr-1">
                  {/* VIEW 1: REPORT & FLUSTER ISSUES */}
                  {activeResultView === 'report' && (
                    <div className="space-y-4">
                      {/* Category Filters */}
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
                        {[
                          { id: 'all', label: 'All Issues', count: doctorResult.issues.length },
                          { id: 'syntax', label: 'Syntax Errors', count: doctorResult.issues.filter(i => i.category === 'syntax' || i.severity === 'error').length },
                          { id: 'security', label: 'Security', count: doctorResult.issues.filter(i => i.category === 'security' || i.severity === 'security').length },
                          { id: 'refactor', label: 'Refactoring', count: doctorResult.issues.filter(i => i.category === 'refactor' || i.category === 'performance').length },
                          { id: 'typing', label: 'Type Safety', count: doctorResult.issues.filter(i => i.category === 'typing').length },
                        ].map((cat) => (
                          <button
                            key={cat.id}
                            onClick={() => setSelectedIssueCategory(cat.id)}
                            className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold flex items-center gap-1.5 transition-all ${
                              selectedIssueCategory === cat.id
                                ? 'bg-cyan-500/20 border border-cyan-500/40 text-cyan-200'
                                : 'border border-white/5 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            <span>{cat.label}</span>
                            <span className="rounded-full bg-black/40 px-1.5 text-[9px] font-mono">{cat.count}</span>
                          </button>
                        ))}
                      </div>

                      {/* Explanation Summary */}
                      {doctorResult.explanation && (
                        <div className="rounded-2xl border border-white/10 bg-slate-900/70 p-3.5 text-xs text-slate-300 leading-relaxed space-y-2">
                          <span className="text-[11px] font-bold text-white uppercase tracking-wider block flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-cyan-400" />
                            Refactoring & Diagnostic Summary
                          </span>
                          <p>{doctorResult.explanation}</p>

                          {doctorResult.refactoringHighlights && doctorResult.refactoringHighlights.length > 0 && (
                            <ul className="list-disc list-inside space-y-1 text-[11px] text-cyan-200 pt-1">
                              {doctorResult.refactoringHighlights.map((hl, hIdx) => (
                                <li key={hIdx}>{hl}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}

                      {/* Issues List */}
                      <div className="space-y-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Identified Flaws ({filteredIssues.length})
                        </span>
                        {filteredIssues.map((issue, idx) => (
                          <div
                            key={idx}
                            onClick={() => issue.line && setHighlightedLine(issue.line)}
                            className={`rounded-xl border p-3 text-xs space-y-1.5 cursor-pointer transition-all hover:scale-[1.01] ${
                              issue.severity === 'security' || issue.severity === 'error'
                                ? 'border-rose-500/30 bg-rose-950/20 text-rose-200 hover:border-rose-500/50'
                                : issue.severity === 'warning'
                                ? 'border-amber-500/30 bg-amber-950/20 text-amber-200 hover:border-amber-500/50'
                                : 'border-blue-500/30 bg-blue-950/20 text-blue-200 hover:border-blue-500/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold flex items-center gap-1.5">
                                {issue.severity === 'security' ? (
                                  <ShieldAlert className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                                ) : issue.category === 'syntax' || issue.severity === 'error' ? (
                                  <Bug className="h-3.5 w-3.5 text-rose-400 flex-shrink-0" />
                                ) : (
                                  <CheckCheck className="h-3.5 w-3.5 text-cyan-400 flex-shrink-0" />
                                )}
                                <span>{issue.message}</span>
                              </span>
                              <div className="flex items-center gap-1.5">
                                {issue.line && (
                                  <span className="font-mono text-[10px] text-slate-400 bg-black/40 px-1.5 py-0.5 rounded border border-white/5">
                                    Line {issue.line}
                                  </span>
                                )}
                                <span className="font-mono text-[9px] uppercase px-1.5 py-0.5 rounded bg-black/40 border border-white/10">
                                  {issue.severity}
                                </span>
                              </div>
                            </div>
                            <p className="text-[11px] text-slate-300 pt-0.5">
                              💡 <strong>Suggested Refactoring:</strong> {issue.suggestion}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Security Verification Matrix */}
                      {doctorResult.securityChecks && doctorResult.securityChecks.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                            Security & Policy Verification Matrix
                          </span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {doctorResult.securityChecks.map((check, cIdx) => (
                              <div key={cIdx} className="rounded-xl border border-white/5 bg-slate-900/40 p-2.5 text-xs flex items-center justify-between">
                                <span className="text-slate-300 font-medium text-[11px]">{check.check}</span>
                                <span
                                  className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                                    check.status === 'pass'
                                      ? 'bg-emerald-500/10 text-emerald-400'
                                      : check.status === 'warn'
                                      ? 'bg-amber-500/10 text-amber-400'
                                      : 'bg-rose-500/10 text-rose-400'
                                  }`}
                                >
                                  {check.status}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* VIEW 2: SIDE BY SIDE COMPARISON */}
                  {activeResultView === 'comparison' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-rose-400 uppercase tracking-wider block">
                            Original Code
                          </span>
                          <pre className="rounded-xl border border-rose-500/20 bg-slate-900/90 p-3 font-mono text-[11px] text-rose-200 overflow-x-auto max-h-[380px] whitespace-pre-wrap leading-relaxed">
                            {doctorCode}
                          </pre>
                        </div>

                        <div className="space-y-1.5">
                          <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block">
                            Refactored & Hardened
                          </span>
                          <pre className="rounded-xl border border-emerald-500/20 bg-slate-900/90 p-3 font-mono text-[11px] text-emerald-200 overflow-x-auto max-h-[380px] whitespace-pre-wrap leading-relaxed">
                            {doctorResult.fixedCode}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* VIEW 3: REFACTORED CODE ONLY */}
                  {activeResultView === 'refactored_only' && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider block flex items-center gap-1">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Refactored Production Code
                        </span>
                      </div>
                      <pre className="rounded-2xl border border-emerald-500/30 bg-slate-900/90 p-4 font-mono text-xs text-emerald-300 overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[440px]">
                        {doctorResult.fixedCode}
                      </pre>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex-1 min-h-[340px] flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-500">
                  <Wrench className="h-8 w-8 text-slate-600" />
                  <p className="text-xs">Click "Analyze & Refactor Code" to parse syntax and identify optimizations.</p>
                  <p className="text-[11px] text-slate-600">Supports TypeScript, JavaScript, Python, cURL, JSON, and SQL.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: SUGGESTIONS & ADMIN AI REMEDIATION */}
      {activeTab === 'suggestions' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl space-y-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-amber-300" />
              <div><h2 className="font-bold text-white">تقديم اقتراح أو بلاغ</h2><p className="text-xs text-slate-400">أرسل مشكلة أو ميزة، ويمكن إرفاق كود لمراجعته.</p></div>
            </div>
            <input value={suggestionTitle} onChange={(e) => setSuggestionTitle(e.target.value)} placeholder="عنوان مختصر" className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
            <select value={suggestionCategory} onChange={(e) => setSuggestionCategory(e.target.value as ProductSuggestion['category'])} className="w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-200 outline-none">
              <option value="feature">ميزة جديدة</option><option value="bug">خطأ برمجي</option><option value="ux">تجربة مستخدم</option>
            </select>
            <textarea value={suggestionDetails} onChange={(e) => setSuggestionDetails(e.target.value)} placeholder="اشرح الاقتراح أو الخطأ وخطوات تكراره" className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-amber-400" />
            <textarea value={suggestionCode} onChange={(e) => setSuggestionCode(e.target.value)} placeholder="مقطع كود اختياري للتحليل والإصلاح" className="min-h-28 w-full rounded-xl border border-white/10 bg-slate-900 p-3 font-mono text-xs text-white outline-none focus:border-amber-400" />
            <button onClick={submitSuggestion} className="w-full rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-slate-950 hover:bg-amber-400">إرسال للمراجعة</button>
            {suggestionMessage && <p className="text-xs text-emerald-300">{suggestionMessage}</p>}
          </section>

          <section className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl space-y-3">
            <div className="flex items-center justify-between"><div><h2 className="font-bold text-white">طابور الأدمن</h2><p className="text-xs text-slate-400">راجع البلاغ ثم اطلب إصلاحاً مقترحاً من الذكاء الاصطناعي.</p></div><button onClick={loadSuggestions} className="text-xs text-cyan-300 hover:text-white">تحديث</button></div>
            {suggestionsLoading ? <p className="text-xs text-slate-400">جارٍ التحميل…</p> : suggestions.length === 0 ? <p className="text-xs text-slate-500">لا توجد اقتراحات ظاهرة. يلزم دور الأدمن لعرض الطابور.</p> : suggestions.map((item) => (
              <div key={item.id} className="rounded-2xl border border-white/10 bg-slate-900/70 p-3">
                <div className="flex justify-between gap-3"><strong className="text-sm text-white">{item.title}</strong><span className="text-[10px] uppercase text-amber-300">{item.status}</span></div>
                <p className="mt-1 text-xs text-slate-400">{item.details}</p>
                <div className="mt-3 flex gap-2">
                  <button onClick={async () => { await api.updateSuggestionStatus(item.id, 'reviewing'); loadSuggestions(); }} className="rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-300 hover:text-white">قيد المراجعة</button>
                  {item.code && <button onClick={async () => { const result = await api.requestSuggestionAiFix(item.id); setAiFix(result.diagnosis); loadSuggestions(); }} className="rounded-lg bg-cyan-600/20 px-2 py-1 text-[11px] font-semibold text-cyan-200 hover:bg-cyan-600/30">اطلب إصلاح AI</button>}
                </div>
              </div>
            ))}
            {aiFix && <div className="rounded-2xl border border-emerald-500/30 bg-emerald-950/20 p-3"><div className="flex justify-between"><span className="text-xs font-bold text-emerald-300">إصلاح مقترح من AI</span><button onClick={() => copyText('suggestion-fix', aiFix.fixedCode)} className="text-[11px] text-emerald-200">{copiedId === 'suggestion-fix' ? 'تم النسخ' : 'نسخ الكود'}</button></div><pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-[11px] text-emerald-100">{aiFix.fixedCode}</pre></div>}
          </section>
        </div>
      )}

      {/* TAB 4: PLATFORM SMART TOOLBELT */}
      {activeTab === 'toolbelt' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {/* Tool 1: Scope & Permission Matrix Auditor */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
                <Shield className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Scope & Privilege Inspector</h3>
                <p className="text-[11px] text-slate-400">Validate assertGrantableScopes compliance</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Verify if an actor with a given role (USER, DEVELOPER, ADMIN) is legally permitted to create or modify specific scopes without privilege escalation.
            </p>
            <button
              onClick={() => {
                setActiveTab('chat');
                handleSend('Review the entire scope matrix and verify assertGrantableScopes rules.', 'security', 'security');
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 py-2.5 text-xs font-semibold transition-all"
            >
              <span>Audit Scope Matrix</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Tool 2: Bot Gateway Payload Builder */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Bot Ingress Dispatcher</h3>
                <p className="text-[11px] text-slate-400">Generate WhatsApp & Discord payloads</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Synthesize signed JSON command structures to interact with WhatsApp and Discord daemons through <code className="font-mono text-emerald-300">/api/v1/bot/execute</code>.
            </p>
            <button
              onClick={() => {
                setActiveTab('chat');
                handleSend('Write a production curl command to dispatch an announcement to Discord and WhatsApp.', 'bot', 'api');
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 py-2.5 text-xs font-semibold transition-all"
            >
              <span>Build Bot Payload</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Tool 3: Rate Limit & Throttling Calculator */}
          <div className="rounded-3xl border border-white/10 bg-slate-950/70 p-6 backdrop-blur-xl shadow-xl space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-white">Rate Limit & Capacity Planner</h3>
                <p className="text-[11px] text-slate-400">Calculate Token Bucket & Sliding Window limits</p>
              </div>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Formulate optimal RPM limits and burst buffers depending on your client architecture, concurrency projections, and monthly quotas.
            </p>
            <button
              onClick={() => {
                setActiveTab('chat');
                handleSend('How do sliding window and token bucket rate limits differ in handling microservice bursts?', 'architect', 'analyst');
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 py-2.5 text-xs font-semibold transition-all"
            >
              <span>Calculate Ingress Policy</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
