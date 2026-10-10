import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUpRight, Bot, Check, Code2, Globe2, KeyRound, LockKeyhole, Radio, ShieldCheck, Sparkles, Workflow } from 'lucide-react';

const SITE = 'https://vanitas-bot.vercel.app/';
const PORTAL = `${SITE}login`;
const DISCORD = 'https://discord.gg/5GHPRxKpg';
const YOUTUBE = 'https://www.youtube.com/@SOVEREIGNX-72';

const copy = {
  ar: {
    nav: ['عن فانيتاس', 'المزايا', 'المجتمع', 'دليل اللغات'],
    language: 'English',
    eyebrow: 'بوابة موحدة للمطورين والبوتات',
    titleA: 'كل خدماتك،',
    titleB: 'تحت سيطرتك.',
    lead: 'فانيتاس منصة مطورين تجمع واجهات API ومفاتيح الصلاحيات والأمان والذكاء الاصطناعي في مكان واحد.',
    open: 'افتح منصة فانيتاس',
    community: 'انضم إلى ديسكورد',
    scroll: 'اكتشف فانيتاس',
    aboutKicker: 'منصة واحدة. تحكم أوضح.',
    aboutTitle: 'بُنيت لتسهّل إدارة تكاملك.',
    aboutBody: 'اربط تطبيقاتك وبوتاتك عبر بوابة API واحدة. تابع الاستخدام، راجع السجلات، وأدر الصلاحيات من لوحة تحكم مصممة للمطورين.',
    features: [
      ['بوابة API', 'نقطة دخول موحدة لتطبيقات الويب والبوتات والخدمات.', 'واجهات واضحة ومفاتيح بصلاحيات محددة.'],
      ['الأمان والتحكم', 'أدر الجلسات والمفاتيح وسجلات التدقيق من لوحة واحدة.', 'مصادقة وصلاحيات من جهة الخادم.'],
      ['مساعد ذكي', 'اسأل عن الكود والتكاملات والأمان بالعربية أو الإنجليزية.', 'خيارات مجانية عبر Ollama المحلي وPollinations.'],
    ],
    communityKicker: 'تابع المشروع',
    communityTitle: 'فانيتاس تتطور مع مجتمعها.',
    communityBody: 'تابع جديد فانيتاس على يوتيوب، أو شارك في النقاشات وانضم للمجتمع على ديسكورد.',
    youtube: 'قناة يوتيوب',
    discord: 'مجتمع ديسكورد',
    footer: 'منصة المطورين والذكاء الاصطناعي',
    ariaHome: 'الرئيسية',
    ariaLanguage: 'Switch language to English',
    featureLabel: 'مزايا المنصة',
    free: 'خيارات مجانية',
    powered: 'مصممة للمطورين',
  },
  en: {
    nav: ['About Vanitas', 'Features', 'Community', 'Language guide'],
    language: 'العربية',
    eyebrow: 'A unified gateway for developers and bots',
    titleA: 'Your services,',
    titleB: 'under control.',
    lead: 'Vanitas brings APIs, scoped keys, security controls and AI assistance together in one developer platform.',
    open: 'Open Vanitas',
    community: 'Join Discord',
    scroll: 'Explore Vanitas',
    aboutKicker: 'One platform. Clearer control.',
    aboutTitle: 'Built to simplify your integrations.',
    aboutBody: 'Connect apps and bots through one API gateway. Track usage, review audit logs and manage permissions from a dashboard made for developers.',
    features: [
      ['API gateway', 'One entry point for web apps, bots and services.', 'Clear endpoints with scoped API keys.'],
      ['Security and control', 'Manage sessions, keys and audit logs in one place.', 'Server-side authentication and authorization.'],
      ['AI copilot', 'Ask about code, integrations and security in Arabic or English.', 'Free options with local Ollama and Pollinations.'],
    ],
    communityKicker: 'Follow the project',
    communityTitle: 'Vanitas grows with its community.',
    communityBody: 'Follow Vanitas on YouTube or join the conversations and community on Discord.',
    youtube: 'YouTube channel',
    discord: 'Discord community',
    footer: 'Developer and AI platform',
    ariaHome: 'Home',
    ariaLanguage: 'التبديل إلى العربية',
    featureLabel: 'Platform features',
    free: 'Free AI options',
    powered: 'Made for developers',
  },
} as const;

const featureIcons = [KeyRound, ShieldCheck, Bot];

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
    const descriptionText = isArabic
      ? 'فانيتاس منصة مطورين تجمع واجهات API ومفاتيح الصلاحيات والأمان والذكاء الاصطناعي في مكان واحد.'
      : 'Vanitas brings APIs, scoped keys, security controls and AI assistance together in one developer platform.';
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
  }, [language, isArabic]);

  const toggleLanguage = () => {
    const next = isArabic ? 'en' : 'ar';
    setLanguage(next);
    try { localStorage.setItem('vanitas_language', next); } catch { /* The visible language still changes. */ }
  };

  return (
    <main lang={language} dir={isArabic ? 'rtl' : 'ltr'} className="vnt-landing min-h-screen overflow-hidden text-white">
      <div className="vnt-landing-noise" aria-hidden="true" />
      <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-5 sm:px-8 lg:px-10">
        <a href="#home" className="flex shrink-0 items-center gap-3" aria-label={`Vanitas ${t.ariaHome}`}>
          <img src="/images/logo.svg" alt="" className="h-10 w-10" />
          <span className="font-display text-lg font-bold tracking-[.13em]">VANITAS</span>
        </a>
        <nav className="hidden items-center gap-8 text-sm text-slate-300 md:flex" aria-label={isArabic ? 'التنقل الرئيسي' : 'Main navigation'}>
          <a className="transition hover:text-cyan-300" href="#about">{t.nav[0]}</a>
          <a className="transition hover:text-cyan-300" href="#features">{t.nav[1]}</a>
          <a className="transition hover:text-cyan-300" href="#community">{t.nav[2]}</a>
          <a className="transition hover:text-cyan-300" href="/languages">{t.nav[3]}</a>
        </nav>
        <div className="flex items-center gap-2 sm:gap-3">
          <button type="button" onClick={toggleLanguage} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-cyan-300/50 hover:text-cyan-200" aria-label={t.ariaLanguage}>
            <Globe2 size={15} /> <span>{t.language}</span>
          </button>
          <a href={PORTAL} className="hidden rounded-full border border-cyan-200/25 bg-cyan-200/10 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-200/15 sm:inline-flex">{t.open}</a>
        </div>
      </header>
      <nav className="relative z-10 mb-2 flex justify-center gap-6 px-4 text-xs text-slate-300 md:hidden" aria-label={isArabic ? 'التنقل الرئيسي' : 'Main navigation'}>
        <a className="transition hover:text-cyan-300" href="#about">{t.nav[0]}</a>
        <a className="transition hover:text-cyan-300" href="#features">{t.nav[1]}</a>
        <a className="transition hover:text-cyan-300" href="#community">{t.nav[2]}</a>
        <a className="transition hover:text-cyan-300" href="/languages">{t.nav[3]}</a>
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
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-400">
            <span className="inline-flex items-center gap-2"><Check size={14} className="text-cyan-300" /> {t.powered}</span>
            <span className="inline-flex items-center gap-2"><Check size={14} className="text-cyan-300" /> {t.free}</span>
          </div>
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
        <div className="grid gap-4 md:grid-cols-3">
          {t.features.map(([title, body, detail], index) => {
            const Icon = featureIcons[index];
            return <article key={title} className="rounded-3xl border border-white/10 bg-white/[.035] p-6 transition hover:border-cyan-200/25 hover:bg-white/[.05]">
              <div className="mb-7 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-100/[.06] text-cyan-200"><Icon size={20} /></div>
              <h3 className="text-lg font-bold">{title}</h3><p className="mt-3 min-h-14 text-sm leading-7 text-slate-300">{body}</p>
              <p className="mt-5 flex items-start gap-2 border-t border-white/[.08] pt-4 text-xs leading-6 text-slate-400"><LockKeyhole size={14} className="mt-1 shrink-0 text-cyan-300" />{detail}</p>
            </article>;
          })}
        </div>
      </section>

      <section id="community" className="mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10 lg:pb-20">
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
