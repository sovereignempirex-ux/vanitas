import React, { useMemo, useState } from 'react';
import {
  Apple,
  Blocks,
  BrainCircuit,
  Building2,
  ChartNoAxesColumnIncreasing,
  Code2,
  Cpu,
  Database,
  Gamepad2,
  Laptop,
  Search,
  Server,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Field = {
  title: string;
  description: string;
  languages: string[];
  icon: LucideIcon;
};

const fields: Field[] = [
  { title: 'مواقع الويب', description: 'واجهات المواقع وتطبيقات الويب التفاعلية.', languages: ['JavaScript', 'TypeScript'], icon: Code2 },
  { title: 'تطبيقات Android', description: 'تطبيقات الهواتف والأجهزة اللوحية بنظام Android.', languages: ['Kotlin'], icon: Smartphone },
  { title: 'تطبيقات iPhone', description: 'تطبيقات iPhone وiPad ضمن منظومة Apple.', languages: ['Swift'], icon: Apple },
  { title: 'الذكاء الاصطناعي وتعلم الآلة', description: 'بناء النماذج ومعالجة البيانات والتعلم الآلي.', languages: ['Python'], icon: BrainCircuit },
  { title: 'الألعاب', description: 'تطوير ألعاب ثنائية وثلاثية الأبعاد ومحركاتها.', languages: ['C#', 'C++'], icon: Gamepad2 },
  { title: 'برامج سطح المكتب', description: 'تطبيقات الحاسوب والبرامج المكتبية.', languages: ['C#', 'C++', 'Java'], icon: Laptop },
  { title: 'أنظمة عالية الأداء', description: 'الأنظمة التي تحتاج سرعة وكفاءة عاليتين.', languages: ['C++', 'Rust'], icon: Cpu },
  { title: 'الأمن السيبراني', description: 'أدوات الأمن والتحليل واختبار الأنظمة.', languages: ['Python', 'C', 'C++'], icon: ShieldCheck },
  { title: 'تحليل البيانات', description: 'تحليل البيانات والإحصاء وعرض النتائج.', languages: ['Python', 'R'], icon: ChartNoAxesColumnIncreasing },
  { title: 'قواعد البيانات', description: 'إنشاء البيانات والاستعلام عنها وإدارتها.', languages: ['SQL'], icon: Database },
  { title: 'برمجة الخوادم', description: 'واجهات API والخدمات التي تعمل على الخوادم.', languages: ['TypeScript', 'Python', 'Go', 'Java'], icon: Server },
  { title: 'البلوك تشين', description: 'العقود الذكية وتطبيقات سلاسل الكتل.', languages: ['Solidity', 'Rust'], icon: Blocks },
  { title: 'أنظمة الشركات الكبيرة', description: 'الأنظمة المؤسسية والخدمات واسعة النطاق.', languages: ['Java', 'C#', 'Go'], icon: Building2 },
];

const allLanguages = [...new Set(fields.flatMap((field) => field.languages))];

export const TechMapPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<string | null>(null);

  const visibleFields = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('ar');
    return fields.filter((field) => {
      const matchesLanguage = !selectedLanguage || field.languages.includes(selectedLanguage);
      const searchable = `${field.title} ${field.description} ${field.languages.join(' ')}`.toLocaleLowerCase('ar');
      return matchesLanguage && (!query || searchable.includes(query));
    });
  }, [search, selectedLanguage]);

  return (
    <main dir="rtl" lang="ar" className="min-h-screen overflow-hidden bg-[#05070e] text-slate-100">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(37,99,235,.18),transparent_52%)]" />
      <header className="relative mx-auto flex max-w-7xl items-center justify-between px-5 py-6 sm:px-8 lg:px-10">
        <a href="/" className="flex items-center gap-3" aria-label="العودة إلى فانيتاس">
          <img src="/images/logo.svg" alt="" className="h-10 w-10" />
          <span className="font-display text-lg font-bold tracking-[.13em]">VANITAS</span>
        </a>
        <a href="/" className="rounded-full border border-white/15 px-4 py-2 text-sm text-slate-300 transition hover:border-blue-300/50 hover:text-white">العودة للرئيسية</a>
      </header>

      <section className="relative mx-auto max-w-7xl px-5 pb-9 pt-12 text-center sm:px-8 sm:pt-16">
        <span className="inline-flex items-center gap-2 rounded-full border border-blue-300/20 bg-blue-300/[.07] px-4 py-2 text-xs font-semibold text-blue-200">
          <Code2 size={15} /> دليل تقني سريع
        </span>
        <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-black leading-tight sm:text-5xl lg:text-6xl">
          اختَر <span className="bg-gradient-to-l from-cyan-200 via-blue-300 to-indigo-300 bg-clip-text text-transparent">لغة البرمجة</span> حسب المجال
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-300 sm:text-lg">
          خريطة مختصرة تربط مجالات التقنية بلغات البرمجة المستخدمة فيها. ابحث باسم المجال أو صفِّ النتائج حسب اللغة.
        </p>
      </section>

      <section className="relative mx-auto max-w-7xl px-5 pb-16 sm:px-8 lg:px-10" aria-label="مجالات البرمجة واللغات">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-slate-950/55 p-4 shadow-2xl shadow-blue-950/20 backdrop-blur sm:p-6">
          <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[.035] px-4 py-3 focus-within:border-blue-300/50">
            <Search size={19} className="shrink-0 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="ابحث عن مجال أو لغة…"
              aria-label="ابحث عن مجال أو لغة برمجة"
              className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
            />
            <span className="hidden text-xs text-slate-500 sm:inline">{visibleFields.length} مجال</span>
          </label>

          <div className="mt-4 flex flex-wrap gap-2" aria-label="تصفية حسب اللغة">
            <button
              type="button"
              onClick={() => setSelectedLanguage(null)}
              aria-pressed={!selectedLanguage}
              className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${!selectedLanguage ? 'border-blue-300/50 bg-blue-400/15 text-blue-100' : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'}`}
            >
              كل اللغات
            </button>
            {allLanguages.map((language) => (
              <button
                key={language}
                type="button"
                onClick={() => setSelectedLanguage((current) => current === language ? null : language)}
                aria-pressed={selectedLanguage === language}
                className={`rounded-full border px-3.5 py-2 text-xs font-semibold transition ${selectedLanguage === language ? 'border-cyan-300/50 bg-cyan-300/10 text-cyan-100' : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-white'}`}
              >
                {language}
              </button>
            ))}
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-7xl text-sm text-slate-500" aria-live="polite">
          {visibleFields.length ? `يعرض ${visibleFields.length} من ${fields.length} مجالًا` : 'لا توجد نتائج مطابقة. جرّب كلمة بحث أو لغة أخرى.'}
        </p>

        {visibleFields.length > 0 && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleFields.map(({ title, description, languages, icon: Icon }, index) => (
              <article key={title} className="group relative overflow-hidden rounded-3xl border border-white/[.09] bg-gradient-to-br from-white/[.055] to-white/[.02] p-5 transition duration-200 hover:-translate-y-0.5 hover:border-blue-300/30 hover:shadow-xl hover:shadow-blue-950/20 sm:p-6">
                <span className="absolute inset-x-0 top-0 h-px bg-gradient-to-l from-transparent via-blue-300/50 to-transparent opacity-0 transition group-hover:opacity-100" />
                <div className="flex items-start justify-between gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-blue-300/15 bg-blue-300/[.07] text-blue-200"><Icon size={22} strokeWidth={1.8} /></div>
                  <span className="font-mono text-xs text-slate-600">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <h2 className="mt-5 text-lg font-bold text-white">{title}</h2>
                <p className="mt-2 min-h-12 text-sm leading-6 text-slate-400">{description}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {languages.map((language) => (
                    <button
                      key={language}
                      type="button"
                      onClick={() => setSelectedLanguage((current) => current === language ? null : language)}
                      className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition ${selectedLanguage === language ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-100' : 'border-white/10 bg-black/15 text-slate-300 hover:border-blue-300/30 hover:text-white'}`}
                      aria-label={`تصفية حسب ${language}`}
                    >
                      {language}
                    </button>
                  ))}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="relative border-t border-white/[.07] px-5 py-6 text-center text-xs text-slate-500">
        <a href="/" className="font-semibold tracking-[.16em] text-slate-300 hover:text-white">VANITAS</a>
        <span className="mx-2">·</span>دليل مجالات ولغات البرمجة
      </footer>
    </main>
  );
};
