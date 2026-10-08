import React from 'react';
import { ArrowDown, ArrowUpRight, Gamepad2, Sparkles } from 'lucide-react';

const YOUTUBE = 'https://www.youtube.com/channel/UC1LDGUDCHKbDom5893YadPQ';
const DISCORD = 'https://discord.gg/nGEK964k7';

export const LandingPage: React.FC = () => (
  <main dir="rtl" className="sg-page min-h-screen overflow-hidden text-white">
    <div className="sg-noise" aria-hidden="true" />
    <header className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-6 lg:px-10">
      <a href="#home" className="flex items-center gap-3" aria-label="SilverGames الرئيسية">
        <img src="/images/silvergames-mark.svg" alt="" className="h-11 w-11" />
        <span className="font-display text-lg font-bold tracking-[.16em]">SILVER<span className="text-cyan-300">GAMES</span></span>
      </a>
      <nav className="hidden items-center gap-9 text-sm text-slate-300 md:flex">
        <a className="transition hover:text-cyan-300" href="#about">عن الاستديو</a>
        <a className="transition hover:text-cyan-300" href="#community">مجتمعنا</a>
        <a className="transition hover:text-cyan-300" href={YOUTUBE} target="_blank" rel="noreferrer">قناة يوتيوب</a>
      </nav>
      <a href={DISCORD} target="_blank" rel="noreferrer" className="rounded-full border border-white/15 px-5 py-2.5 text-sm font-semibold transition hover:border-cyan-300/60 hover:bg-cyan-300/10">انضم إلينا</a>
    </header>

    <section id="home" className="relative mx-auto grid min-h-[76vh] max-w-7xl items-center gap-8 px-6 pb-20 pt-12 lg:grid-cols-[1.05fr_.95fr] lg:px-10 lg:pb-28">
      <div className="relative z-[1] max-w-2xl">
        <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-cyan-200/15 bg-cyan-100/[.06] px-4 py-2 text-xs tracking-wide text-cyan-100"><Sparkles size={14} /> استديو ألعاب مستقل</div>
        <h1 className="font-display text-5xl font-black leading-[1.2] tracking-tight sm:text-6xl lg:text-7xl">نصنع عوالم<br /><span className="sg-shine">تستحق أن تُعاش</span></h1>
        <p className="mt-7 max-w-xl text-base leading-8 text-slate-300 sm:text-lg">نحن <b className="text-white">SilverGames</b>، استديو شغوف بصناعة تجارب ألعاب ممتعة ومجتمعات تجمع اللاعبين. تابع رحلتنا واكتشف جديدنا.</p>
        <div className="mt-9 flex flex-wrap gap-3">
          <a href={YOUTUBE} target="_blank" rel="noreferrer" className="group inline-flex items-center gap-3 rounded-full bg-cyan-300 px-6 py-3.5 font-bold text-slate-950 transition hover:bg-cyan-200">شاهد قناتنا <ArrowUpRight size={18} className="transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" /></a>
          <a href={DISCORD} target="_blank" rel="noreferrer" className="inline-flex items-center gap-3 rounded-full border border-white/20 bg-white/[.04] px-6 py-3.5 font-semibold transition hover:border-white/40 hover:bg-white/[.08]">ادخل مجتمع ديسكورد</a>
        </div>
      </div>

      <div className="relative mx-auto flex aspect-square w-full max-w-[510px] items-center justify-center">
        <div className="sg-orbit sg-orbit-one" /><div className="sg-orbit sg-orbit-two" />
        <div className="sg-art-glow" />
        <div className="relative z-[1] flex h-[72%] w-[72%] items-center justify-center rounded-[36%] border border-white/10 bg-gradient-to-br from-white/[.12] to-white/[.015] shadow-[0_30px_120px_rgba(34,211,238,.14)] backdrop-blur-sm">
          <img src="/images/silvergames-mark.svg" alt="شعار SilverGames" className="w-[73%] drop-shadow-[0_12px_45px_rgba(103,232,249,.3)]" />
        </div>
        <div className="absolute bottom-[9%] left-[3%] flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111823]/90 px-4 py-3 shadow-xl backdrop-blur"><Gamepad2 className="text-cyan-300" size={21} /><span className="text-xs text-slate-300">اللعب يجمعنا</span></div>
        <span className="absolute right-[8%] top-[13%] h-2 w-2 rounded-full bg-cyan-200 shadow-[0_0_20px_5px_rgba(103,232,249,.5)]" />
      </div>
      <a href="#about" className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 items-center gap-2 text-xs text-slate-500 md:flex">اكتشف المزيد <ArrowDown size={14} /></a>
    </section>

    <section id="about" className="relative border-y border-white/[.07] bg-white/[.025]">
      <div className="mx-auto grid max-w-7xl gap-12 px-6 py-20 lg:grid-cols-2 lg:px-10 lg:py-24">
        <div><p className="mb-4 text-xs font-bold tracking-[.25em] text-cyan-300">من نحن</p><h2 className="text-3xl font-bold sm:text-4xl">أفكار فضية، تجارب لا تُنسى</h2></div>
        <p className="max-w-2xl text-base leading-8 text-slate-300">في SilverGames نؤمن أن اللعبة أكثر من مجرد شاشة؛ إنها مغامرة، تحدٍ، وذكريات تُصنع مع الأصدقاء. نعمل على تقديم محتوى وتجارب تلهم اللاعبين وتقرّب مجتمعنا أكثر.</p>
      </div>
    </section>

    <section id="community" className="mx-auto max-w-7xl px-6 py-20 lg:px-10 lg:py-24">
      <div className="rounded-[2rem] border border-cyan-200/15 bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,.12),transparent_55%),rgba(255,255,255,.035)] px-7 py-12 text-center sm:px-12 sm:py-16">
        <img src="/images/silvergames-mark.svg" alt="" className="mx-auto mb-5 h-14 w-14" />
        <p className="mb-3 text-xs font-bold tracking-[.25em] text-cyan-300">كن جزءاً من الرحلة</p>
        <h2 className="text-3xl font-bold sm:text-4xl">اللعبة أحلى معكم</h2>
        <p className="mx-auto mt-4 max-w-xl leading-7 text-slate-300">تابع أحدث المقاطع والإعلانات على يوتيوب، أو انضم إلى ديسكورد لتكون قريباً من مجتمع SilverGames.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <a href={YOUTUBE} target="_blank" rel="noreferrer" className="rounded-full bg-white px-6 py-3 text-sm font-bold text-slate-950 transition hover:bg-cyan-100">قناة يوتيوب</a>
          <a href={DISCORD} target="_blank" rel="noreferrer" className="rounded-full border border-white/20 px-6 py-3 text-sm font-bold transition hover:bg-white/10">مجتمع ديسكورد</a>
        </div>
      </div>
    </section>

    <footer className="border-t border-white/[.07] px-6 py-7 text-center text-xs text-slate-500">© {new Date().getFullYear()} SilverGames Studio. جميع الحقوق محفوظة.</footer>
  </main>
);
