import React, { useEffect, useState } from 'react';
import {
  Apple,
  ArrowDown,
  ArrowUpRight,
  Blocks,
  Bot,
  BrainCircuit,
  ChartNoAxesColumnIncreasing,
  Check,
  Code2,
  Globe2,
  KeyRound,
  Laptop,
  LockKeyhole,
  Radio,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Workflow,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const SITE = 'https://vanitas-bot.vercel.app/';
const PORTAL = `${SITE}login`;
const DISCORD = 'https://discord.gg/5GHPRxKpg';
const YOUTUBE = 'https://www.youtube.com/@SOVEREIGNX-72';

const copy = {
  ar: {
    nav: ['عن فانيتاس', 'المزايا', 'المنصات', 'المجتمع', 'دليل اللغات'],
    language: 'English',
    eyebrow: 'بوابة موحدة للمطورين والبوتات',
    titleA: 'كل خدماتك،',
    titleB: 'تحت سيطرتك.',
    lead: 'فانيتاس منصة مطورين تجمع واجهات API والمفاتيح بصلاحيات محددة والأمان والذكاء الاصطناعي في مكان واحد — وتشتغل على الويب والأندرويد وiPhone وسطح المكتب.',
    open: 'افتح منصة فانيتاس',
    community: 'انضم إلى ديسكورد',
    scroll: 'اكتشف فانيتاس',
    chips: ['مفاتيح بصلاحيات محددة', 'سجلات تدقيق لكل طلب', 'خيارات ذكاء اصطناعي مجانية'],
    aboutKicker: 'منصة واحدة. تحكم أوضح.',
    aboutTitle: 'بُنيت لتسهّل إدارة تكاملك.',
    aboutBody: 'اربط تطبيقاتك وبوتاتك عبر بوابة API واحدة. تابع الاستخدام، راجع سجلات التدقيق، وأدر الصلاحيات من لوحة تحكم مصمّمة للمطورين.',
    featureLabel: 'مزايا المنصة',
    features: [
      ['بوابة API', 'نقطة دخول موحدة لتطبيقات الويب والبوتات والخدمات.', 'واجهات واضحة ومفاتيح بصلاحيات محددة.'],
      ['مفاتيح وصلاحيات', 'أنشئ المفاتيح، حدّد نطاقها، واسحبها في أي لحظة.', 'حدود معدّل ومهلة زمنية لكل مفتاح.'],
      ['مساعد ذكي', 'اسأل عن الكود والتكاملات والأمان بالعربية أو الإنجليزية.', 'خيارات مجانية عبر Ollama المحلي وPollinations.'],
      ['بوابة البوتات', 'نقطة دخول واحدة لبوتات WhatsApp وDiscord وTelegram.', 'كل تنفيذ يُسجَّل في سجل التدقيق.'],
      ['أمان وتدقيق', 'مصادقة من جهة الخادم وسجل لنشاط الحساب.', 'مراجعات جلسات وتطبيقات موثوقة.'],
      ['تحليلات وتقارير', 'تابع استهلاك المفاتيح والخدمات عبر الزمن.', 'تقريرات مبنيّة على بيانات حقيقية.'],
    ],
    platformLabel: 'المنصات',
    platformTitle: 'فانيتاس تشتغل حيث تشتغل أنت.',
    platformBody: 'نفس الحساب ونفس المفاتيح عبر الويب والموبايل وسطح المكتب — وكل مجال بلغة تليق به، مع خريطة برمجية كاملة للتطوّر.',
    platformLink: 'افتح دليل اللغات',
    platforms: [
      ['الويب', 'TypeScript', 'المنصة الأساسية والمتصفح.'],
      ['أندرويد', 'Kotlin', 'تطبيق أندرويد بنفس الحساب.'],
      ['iPhone', 'Swift', 'تطبيق iOS وiPad.'],
      ['سطح المكتب', 'C# · .NET', 'تطبيق مكتبي على ويندوز.'],
      ['العقود الذكية', 'Solidity', 'سجل رصيد موقّع خارج السلسلة.'],
    ],
    communityKicker: 'تابع المشروع',
    communityTitle: 'فانيتاس تتطور مع مجتمعها.',
    communityBody: 'تابع جديد فانيتاس على يوتيوب، أو شارك في النقاشات وانضم للمجتمع على ديسكورد.',
    youtube: 'قناة يوتيوب',
    discord: 'مجتمع ديسكورد',
    footer: 'منصة المطورين والذكاء الاصطناعي',
    ariaHome: 'الرئيسية',
    ariaLanguage: 'Switch language to English',
  },
  en: {
    nav: ['About Vanitas', 'Features', 'Platforms', 'Community', 'Language guide'],
    language: 'العربية',
    eyebrow: 'A unified gateway for developers and bots',
    titleA: 'Your services,',
    titleB: 'under control.',
    lead: 'Vanitas brings APIs, scoped keys, security controls and AI assistance together in one developer platform — running on the web, Android, iPhone and the desktop.',
    open: 'Open Vanitas',
    community: 'Join Discord',
    scroll: 'Explore Vanitas',
    chips: ['Scoped API keys', 'Audit log on every request', 'Free AI options'],
    aboutKicker: 'One platform. Clearer control.',
    aboutTitle: 'Built to simplify your integrations.',
    aboutBody: 'Connect apps and bots through one API gateway. Track usage, review audit logs and manage permissions from a dashboard made for developers.',
    featureLabel: 'Platform features',
    features: [
      ['API gateway', 'One entry point for web apps, bots and services.', 'Clear endpoints with scoped API keys.'],
      ['Keys and scopes', 'Create keys, restrict what they can reach, revoke anytime.', 'Per-key rate limits and expiry.'],
      ['AI copilot', 'Ask about code, integrations and security in Arabic or English.', 'Free options with local Ollama and Pollinations.'],
      ['Bot gateway', 'One ingress for WhatsApp, Discord and Telegram bots.', 'Every execution is written to the audit log.'],
      ['Security and audit', 'Server-side authentication with a record of account activity.', 'Session review and trusted-app grants.'],
      ['Analytics and reports', 'Watch key and service consumption over time.', 'Reports built from real usage.'],
    ],
    platformLabel: 'Platforms',
    platformTitle: 'Vanitas runs where you work.',
    platformBody: 'The same account and the same keys across web, mobile and desktop — each domain built in the language that fits it, with a full map of that landscape.',
    platformLink: 'Open the language guide',
    platforms: [
      ['Web', 'TypeScript', 'The core platform and browser.'],
      ['Android', 'Kotlin', 'The Android app, same account.'],
      ['iPhone', 'Swift', 'The iOS and iPad app.'],
      ['Desktop', 'C# · .NET', 'The Windows desktop app.'],
      ['Smart contracts', 'Solidity', 'An off-chain-signed credit ledger.'],
    ],
    communityKicker: 'Follow the project',
    communityTitle: 'Vanitas grows with its community.',
    communityBody: 'Follow Vanitas on YouTube or join the conversations and community on Discord.',
    youtube: 'YouTube channel',
    discord: 'Discord community',
    footer: 'Developer and AI platform',
    ariaHome: 'Home',
    ariaLanguage: 'التبديل إلى العربية',
  },
} as const;

// One icon per feature, in the order they are declared in `copy` above.
const featureIcons: LucideIcon[] = [Globe2, KeyRound, BrainCircuit, Bot, ShieldCheck, ChartNoAxesColumnIncreasing];
// Ditto for the platforms row.
const platformIcons: LucideIcon[] = [Globe2, Smartphone, Apple, Laptop, Blocks];

export const LandingPage: React.FC = () => {
  const [language, setLanguage] = useState<'ar' | 'en'>(() => {
    try {
      const stored = localStorage.getItem('vanitas_language');
      if (stored === 'ar' || stored === 'en') return stored;
    } catch { /* Private browsing may disable storage; keep the Arabic default. */ }
    return 'ar';
  });
  const t = copy[language];
  const isArabic = language === 'ar';

  useEffect(() => {
    const previousLang = document.documentElement.lang;
    const previousDir = document.documentElement.dir;
    const localizedMetadata = [
      document.querySelector<HTMLMetaElement>('meta[name="description"]'),
      document.querySelector<HTMLMetaElement>('meta[property="og:title"]'),
      document.querySelector<HTMLMetaElement>('meta[property="og:description"]'),
      document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]'),
      document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]'),
    ];
    const previousMetadata = localizedMetadata.map((meta) => meta?.content);
    const title = isArabic ? 'فانيتاس — منصة المطورين والذكاء الاصطناعي' : 'Vanitas — Developer and AI Platform';
    const descriptionText = t.lead;
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
    document.title = title;
    const nextMetadata = [descriptionText, title, descriptionText, title, descriptionText];
    localizedMetadata.forEach((meta, index) => {
      if (meta) meta.content = nextMetadata[index];
    });
    return () => {
      document.documentElement.lang = previousLang;
      document.documentElement.dir = previousDir;
      localizedMetadata.forEach((meta, index) => {
        if (meta && previousMetadata[index] !== undefined) meta.content = previousMetadata[index]!;
      });
    };
  }, [language, isArabic, t.lead]);

  const toggleLanguage = () => {
    const next = isArabic ? 'en' : 'ar';
    setLanguage(next);
    try { localStorage.setItem('vanitas_language', next); } catch { /* The visible language still changes. */ }
  };

  const navLabel = isArabic ? 'التنقل الرئيسي' : 'Main navigation';

  return (
    <main lang={language} dir={isArabic ? 'rtl' : 'ltr'} className="vnt-landing min-h-screen overflow-hidden text-white">
      <div className="vnt-landing-noise" aria-hidden="true" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <a href="#home" className="flex shrink-0 items-center gap-3" aria-label={`Vanitas ${t.ariaHome}`}>
          <img src="/images/logo.svg" alt="" className="h-10 w-10" />
          <span className="font-display text-lg font-bold tracking-[.13em]">VANITAS</span>
        </a>
        <nav className="hidden items-center gap-7 text-sm text-slate-300 lg:flex" aria-label={navLabel}>
          <a className="transition hover:text-cyan-300" href="#about">{t.nav[0]}</a>
          <a className="transition hover:text-cyan-300" href="#features">{t.nav[1]}</a>
          <a className="transition hover:text-cyan-300" href="#platforms">{t.nav[2]}</a>
          <a className="transition hover:text-cyan-300" href="#community">{t.nav[3]}</a>
          <a className="transition hover:text-cyan-300" href="/languages">{t.nav[4]}</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleLanguage} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-200" aria-label={t.ariaLanguage}>
            <Globe2 size={15} /> <span>{t.language}</span>
          </button>
          <a href={PORTAL} className="hidden rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-200/15 sm:inline-flex">{t.open}</a>
        </div>
      </header>
      <nav className="relative z-10 mb-2 flex flex-wrap justify-center gap-x-5 gap-y-2 px-4 text-xs text-slate-300 lg:hidden" aria-label={navLabel}>
        <a className="transition hover:text-cyan-300" href="#about">{t.nav[0]}</a>
        <a className="transition hover:text-cyan-300" href="#features">{t.nav[1]}</a>
        <a className="transition hover:text-cyan-300" href="#platforms">{t.nav[2]}</a>
        <a className="transition hover:text-cyan-300" href="#community">{t.nav[3]}</a>
        <a className="transition hover:text-cyan-300" href="/languages">{t.nav[4]}</a>
      </nav>

      <section id="home" className="relative mx-auto grid min-h-[74vh] max-w-7xl items-center gap-8 px-5 pb-20 pt-8 sm:px-8 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-28">
        <div className="relative z-[1] max-w-2xl">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-100/[.06] px-4 py-2 text-xs tracking-wide text-cyan-100"><Sparkles size={14} /> {t.eyebrow}</div>
          <h1 className="font-display text-5xl font-black leading-[1.16] tracking-tight sm:text-6xl lg:text-7xl">{t.titleA}<br /><span className="vnt-landing-shine">{t.titleB}</span></h1>
          <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">{t.lead}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <a href={PORTAL} className="group inline-flex items-center gap-3 rounded-full bg-cyan-300 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-cyan-200">{t.open}<ArrowUpRight size={18} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
            <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/[.04] px-6 py-3.5 font-semibold transition hover:border-white/40 hover:bg-white/[.08]">{t.community}<Radio size={17} /></a>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-400">
            {t.chips.map((chip) => (
              <li key={chip} className="inline-flex items-center gap-2"><Check size={14} className="text-cyan-300" /> {chip}</li>
            ))}
          </ul>
        </div>

        <div className="relative mx-auto flex aspect-square w-full max-w-[470px] items-center justify-center">
          <div className="vnt-landing-orbit vnt-landing-orbit-one" aria-hidden="true" /><div className="vnt-landing-orbit vnt-landing-orbit-two" aria-hidden="true" />
          <div className="vnt-landing-glow" aria-hidden="true" />
          <div className="relative z-[1] flex h-[70%] w-[70%] items-center justify-center rounded-[34%] border border-white/10 bg-gradient-to-br from-white/[.12] to-white/[.015] shadow-[0_30px_120px_rgba(34,211,238,.14)] backdrop-blur-sm">
            <img src="/images/logo.svg" alt="Vanitas crystal emblem" className="w-[62%] drop-shadow-[0_12px_45px_rgba(59,130,246,.38)]" />
          </div>
          <div className="absolute bottom-[8%] start-[1%] flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111823]/90 px-4 py-3 shadow-xl backdrop-blur"><Workflow className="text-cyan-300" size={20} /><span className="text-xs text-slate-300">API · Security · AI</span></div>
          <div className="absolute end-[3%] top-[10%] flex h-10 w-10 items-center justify-center rounded-xl border border-blue-300/20 bg-blue-400/10 text-blue-200"><Code2 size={19} /></div>
        </div>
        <a href="#about" className="absolute bottom-7 start-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs text-slate-500 md:flex">{t.scroll}<ArrowDown size={14} /></a>
      </section>

      <section id="about" className="relative border-y border-white/[.07] bg-white/[.025]">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-8 lg:grid-cols-2 lg:px-10 lg:py-20">
          <div><p className="mb-4 text-xs font-bold tracking-[.2em] text-cyan-300">{t.aboutKicker}</p><h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t.aboutTitle}</h2></div>
          <p className="max-w-2xl self-end text-base leading-8 text-slate-300">{t.aboutBody}</p>
        </div>
      </section>

      <section id="features" className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
        <p className="mb-7 text-xs font-bold tracking-[.2em] text-cyan-300">{t.featureLabel}</p>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {t.features.map(([title, body, detail], index) => {
            const Icon = featureIcons[index] ?? Sparkles;
            return <article key={title} className="rounded-3xl border border-white/10 bg-white/[.035] p-6 transition hover:border-cyan-200/25 hover:bg-white/[.05]">
              <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-100/[.06] text-cyan-200"><Icon size={20} /></div>
              <h3 className="text-lg font-bold">{title}</h3><p className="mt-3 min-h-14 text-sm leading-7 text-slate-300">{body}</p>
              <p className="mt-5 flex items-start gap-2 border-t border-white/[.08] pt-4 text-xs leading-6 text-slate-400"><LockKeyhole size={14} className="mt-1 shrink-0 text-cyan-300" />{detail}</p>
            </article>;
          })}
        </div>
      </section>

      <section id="platforms" className="relative border-y border-white/[.07] bg-white/[.025]">
        <div className="mx-auto max-w-7xl px-5 py-16 sm:px-8 lg:px-10 lg:py-20">
          <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
            <div className="max-w-2xl">
              <p className="mb-4 text-xs font-bold tracking-[.2em] text-cyan-300">{t.platformLabel}</p>
              <h2 className="text-3xl font-bold leading-tight sm:text-4xl">{t.platformTitle}</h2>
              <p className="mt-4 text-base leading-8 text-slate-300">{t.platformBody}</p>
            </div>
            <a href="/languages" className="group inline-flex w-fit items-center gap-2 rounded-full border border-cyan-200/25 bg-cyan-200/10 px-5 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-200/15">
              {t.platformLink}<ArrowUpRight size={17} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
          </div>
          <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {t.platforms.map(([name, language_, blurb], index) => {
              const Icon = platformIcons[index] ?? Globe2;
              return <li key={name} className="rounded-3xl border border-white/10 bg-white/[.035] p-5 transition hover:border-cyan-200/25 hover:bg-white/[.05]">
                <Icon size={20} className="text-cyan-200" />
                <p className="mt-4 text-base font-bold">{name}</p>
                <p className="mt-1 text-xs font-semibold tracking-wide text-cyan-300">{language_}</p>
                <p className="mt-3 text-xs leading-6 text-slate-400">{blurb}</p>
              </li>;
            })}
          </ul>
        </div>
      </section>

      <section id="community" className="mx-auto max-w-7xl px-5 pb-16 pt-16 sm:px-8 lg:px-10 lg:pb-20 lg:pt-20">
        <div className="rounded-[2rem] border border-cyan-200/15 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,.12),transparent_55%),rgba(255,255,255,.035)] px-6 py-11 text-center sm:px-12 sm:py-14">
          <img src="/images/logo.svg" alt="" className="mx-auto mb-5 h-12 w-12" />
          <p className="mb-3 text-xs font-bold tracking-[.2em] text-cyan-300">{t.communityKicker}</p>
          <h2 className="text-3xl font-bold sm:text-4xl">{t.communityTitle}</h2>
          <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">{t.communityBody}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <a href={YOUTUBE} target="_blank" rel="noopener noreferrer" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100">{t.youtube}</a>
            <a href={DISCORD} target="_blank" rel="noopener noreferrer" className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold transition hover:bg-white/10">{t.discord}</a>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/[.07] px-6 py-6 text-center text-xs text-slate-500"><span className="font-semibold tracking-widest text-slate-300">VANITAS</span><span className="mx-2">·</span>{t.footer}<span className="mx-2">·</span>© {new Date().getFullYear()}</footer>
    </main>
  );
};
