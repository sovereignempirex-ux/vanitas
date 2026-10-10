# خطة إعادة البناء متعدد اللغات (Polyglot Rebuild)

المشروع الأصلي كان مبنيًا بلغتين بس (TypeScript للواجهة والخادم). الخطة دي بتعيد بناء
**كل قسم بلغته المناسبة** حسب [خريطة اللغات](/languages) الموجودة في المشروع، من غير ما
نكسر الشيئ اللي شغال: كل قسم بيتفك كـ service بلغته، والـ gateway القديم بيفضل هو المدخل
الوحيد ويسقط تلقائيًا لو أي خدمة وقفت.

| المجال | اللغة المناسبة | حالتها قبل الخطة |
| --- | --- | --- |
| 🌐 مواقع الويب | JavaScript / TypeScript | ✅ موجود ومظبوط |
| 📱 تطبيقات Android | Kotlin | ✅ تطبيق Gradle كامل (المرحلة 4) |
| 🍎 تطبيقات iPhone | Swift | ❌ غير موجود |
| 🤖 الذكاء الاصطناعي وتعلم الآلة | Python | ✅ خدمة Python (المرحلة 1) |
| 🎮 الألعاب | C# / C++ | ❌ غير موجود |
| 🖥️ برامج سطح المكتب | C# / C++ / Java | ❌ غير موجود |
| ⚡ برامج سريعة جدًا وأنظمة | C++ / Rust | ❌ غير موجود |
| 🔐 الأمن السيبراني | Python / C / C++ | ❌ غير موجود |
| 📊 تحليل البيانات | Python / R | ✅ خدمة Python (+ R اختياري) (المرحلة 2) |
| 🗄️ قواعد البيانات | SQL | ✅ موجود ومظبوط |
| 🌐 برمجة الخوادم | TypeScript / Python / Go / Java | ✅ TypeScript (gateway) + **Go** (rate limit — المرحلة 3) |
| ⛓️ البلوك تشين | Solidity / Rust | ❌ غير موجود |
| 🏢 الأنظمة والشركات الكبيرة | Java / C# / Go | ❌ غير موجود |

---

## ✅ المرحلة 1 — خدمة الذكاء الاصطناعي بـ Python

**المخرج:** `services/ai-service/` — خدمة FastAPI تستولي على مجال AI/ML.

| الملف | الوظيفة |
| --- | --- |
| `app/chain.py` | سلسلة المزوّدين: Ollama → Gemini → Pollinations → قاعدة المعرفة المحلية |
| `app/prompts.py` | personas + tones + حقائق المنصة + EXISTING PROJECT MODE (سقف 36,000 حرف) |
| `app/providers/` | gemini (REST بدون SDK) · ollama · pollinations (circuit breakers + ميزانية 26s) · local_kb |
| `app/diagnosis/` | تشخيص الكود: النماذج أولًا ثم المحلل الساكن المحلي |
| `app/semantic.py` | البحث الدلالي (فهرسة + درجة مطابقة + دعم عربي/إنجليزي) |
| `app/youtube.py` | بحث يوتيوب حقيقي (API أو بدون مفتاح) |
| `app/main.py` | `/health` `/ready` `/v1/ai/chat` `/v1/ai/chat/stream` `/v1/ai/diagnose` `/v1/ai/semantic-search` `/v1/ai/youtube` |

**الربط:** `src/server/aiRemoteClient.ts` (جديد) + `src/server/aiService.ts` بقت تفوّذ
للـ Python أولًا لما `AI_SERVICE_URL` يكون مضبوط، وترجع للسلسلة القديمة في أي لحظة فشل.

**سلامة الـ rollout:** من غير `AI_SERVICE_URL` → السلوك القديم 100%. معاه → أي خطأ/مهلة
في الخدمة = fallback تلقائي لسلسلة TypeScript. `.env` بيتبع `AI_SERVICE_URL=` فاضي افتراضيًا.

**التحقق:**
```bash
npx tsc --noEmit                     # ✅ exit=0
npm run build                        # ✅ vite + esbuild + api/index.js
node scripts/run-tests.mjs           # ✅ 7/7 suites — 461 assertion
cd services/ai-service && pytest -q  # ✅ 59 passed في 0.5s (أوفلاين، بدون مفتاح)
```

**إثبات التكامل (على جهاز حقيقي):**
1. خدمة Python شغالة على `:8100` → `/health` = `{"status":"ok","language":"python"}`
2. الـ gateway شغّال بـ `AI_SERVICE_URL=http://127.0.0.1:8100` → `/api/v1/ready`
   يرجّع `aiService: "python_remote:http://127.0.0.1:8100"`
3. `POST /api/v1/ai/chat` عبر البوابة = `POST /v1/ai/chat` على Python مباشرة →
   **النص مطابق بايت ببايت (`IDENTICAL: True`)**
4. إيقاف خدمة Python → البوابة ترجع تلقائيًا لسلسلة TypeScript من غير أي خطأ

**تدقيق السلامة أثناء التشغيل:** Pollinations رجّعت 500/402 حيّة → مُعدّي الكسر اشتغلوا
(تدوير الموديلات + المسار Legacy + التحوّل لقاعدة المعرفة المحلية مع إفصاح صريح) — مفيش crash.

---

## ✅ المرحلة 2 — تحليل البيانات (Python / R)

**المخرج:** `services/analytics/` — خدمة FastAPI تستولي على مجال تحليل البيانات.

| الملف | الوظيفة |
| --- | --- |
| `app/metrics.py` | p50/p90/p95/p99 (نفس convention بتاع الـ TS: nearest-rank)، تجزئة UTC لساعة/يوم، 429 كتقييد مش خطأ، مقارنة بالفترة السابقة، شذوذ z ≥ 2.5، SLO، خلاصة عربية |
| `app/report.py` | تقرير Markdown عربي + CSV (سلسلة زمنية / ترتيب المسارات) |
| `app/charts.py` | رسم **SVG خالص** (سلسلة زمنية + ترتيب أفقي) من غير matplotlib |
| `app/rbridge.py` + `stats/trend.R` | انحدار خطي + متوسط متحرك + شذوذ: بـ **R** (base R فقط) لو موجودة، وإلا محرك Python بنفس النتائج |
| `app/main.py` | `/health` `/ready` `/v1/analytics/{analyze,report,trend,chart,chart.svg,meta}` |

**الربط:** `src/server/analyticsRemote.ts` (جديد) + `src/server/analyticsNative.ts`
(محرك fallback مطابق رقميًا) + مسارين جداد في `server.ts`:

```
GET /api/v1/analytics/insights?period=24h|7d|30d   (يطلب تسجيل دخول)
GET /api/v1/analytics/report?period=7d             (Markdown + CSV)
```

**التحقق:**
```bash
npx tsc --noEmit                     # ✅ exit=0
npm run build                        # ✅ vite + esbuild + api/index.js
node scripts/run-tests.mjs           # ✅ 8/8 suites (25 assertion للمسار المحلي)
cd services/analytics && pytest -q   # ✅ 51 passed في 0.27s (أوفلاين، ساعة مثبّتة)
```

**إثبات التكامل (على جهاز حقيقي):**
1. الخدمة شغالة على `:8200` → `ANALYTICS_SERVICE_URL=http://127.0.0.1:8200` →
   المسار يرجّع `upstream: python_remote:…` + `engine: python` → **32/32 ✓**
2. **وقوع الخدمة** (منفذ ميّت) → نفس الطلبات ترجع `upstream: typescript_native`
   بتحليل كامل → **fallback سليم 31/31 ✓**
3. **تزاوج المحرّكين:** `npx tsx scripts/_analytics-parity.ts` →
   `PARITY OK` على ~50 حقل (نسب، أشرطة، تجميعات، شذوذ، التقرير، الـ CSV)
   لـ 400 حدث حقيقي

**قرارات توحيد بين المحرّكين:** تقريب نصف-قيمة (half-up) بدل banker's، تنسيق
الأعداد زي `String(n)` في JS (`898` مش `898.0`)، الحقول غير المطبقة تطلع
`null`، وطابع الوقت ISO بـ milliseconds + `Z`.

## ✅ المرحلة 3 — فصل الخادم (Go)

**المخرج:** `services/ratelimit/` — خدمة Go خالصة (مكتبة قياسية فقط، صفر حزم
خارجية) بتتولى **حدود الاستخدام**، وهي الجزء اللي بيستفيد فعلًا من إنها عملية
مستقلة: البوابة بتشتغل بعدة نسخ خلف load balancer وكل نسخة بتحفظ عدّادها في
ذاكرة عمليتها → السقف بيتحوّل لعدد النسخ × السقف. الخدمة بتدي **دلو واحد
مشترك**، والـ gateway بيفضل TypeScript ويمرّر القرار.

| الملف | الوظيفة |
| --- | --- |
| `limiter.go` | النافذة الانزلاقية المطابقة لـ `security.ts`: طوابع لكل مفتاح، تجاهل الأقدم من `windowMs` مع كل قراءة، الطلب المرفوض **لا يُسجَّل**، مسح دوري + سقف ذاكرة (evict الأقل نشاطًا)، عدّادات allowed/denied |
| `main.go` | `net/http` فقط: `/health` `/ready` `/v1/rate/check` `/v1/rate/reset` + مصادقة `X-Internal-Token`/`Bearer` + `MaxBytesReader` + إيقاف نظيف على SIGINT/SIGTERM |
| `limiter_test.go` · `main_test.go` | 19 اختبارًا أوفلاين: الحدود، انزلاق النافذة، استقلال الدلوات، `Retry-After = ceil(window/1000)`، المسح/الevict، تطابق التزامن (1000 ضربة)، تحقق المدخلات، المصادقة |
| `Dockerfile` | `golang:1.27-alpine` ← ثنائي ثابت (CGO مطفأ) في alpine |

**الربط:** `src/server/rateLimitRemote.ts` (جديد) + تعديل `rateLimit()` في
`src/server/security.ts`: المسار المحلي **نفسه حرفيًا** (نفس المفتاح `ip:l<ns>[:path]` /
`ip:*:l<ns>`، نفس الترويسة، نفس الرسالة)، والمسار البعيد بيستدعي Go و**يعيد
تهيئة** الـ 429 بنفس الـ body/`Retry-After` — والقرار دايمًا واحد من الاثنين
(local XOR remote) في نفس الطلب. مهلة افتراضية 300ms (`RATELIMIT_SERVICE_TIMEOUT_MS`).

**التحقق:**
```bash
npx tsc --noEmit                        # ✅ exit=0
npm run build                           # ✅ vite + esbuild + api/index.js
node scripts/run-tests.mjs              # ✅ 9/9 (native · go_remote · go مقطوع)
cd services/ratelimit && gofmt -l .     # ✅ فاضي
go vet ./...                            # ✅ exit=0
go test -count=1 ./...                  # ✅ 19 testًا
```

**إثبات التكامل (على جهاز حقيقي) — الحزمة كلها في الوضعيات التلاتة:**
1. **بدون `RATELIMIT_SERVICE_URL`** (الوضع الافتراضي للجهاز والـ CI) →
   **9/9 ✓** — السلوك زي ما هو بالظبط قبل المرحلة
2. **Go شغالة على `:8300`** → كل سقف بيعدّي على الخدمة → **9/9 ✓**، وسلسلة
   rate-limit لوحدها **13/13 ✓** (منها 4 عدّادات `/ready` في Go:
   `engine=sliding_window`، `allowed ≥ 30`، `denied ≥ 1`، `keys ≤ maxKeys`)
3. **قتل الخدمة والمتغيّر محدّد** (منفذ ميّت) → **9/9 ✓** — كل سقف نفّذه
   الـ native limiter بعقد مطابق: نفس الترويسة، نفس الرسالة، نفس السقف
4. `/api/v1/ready` بقى يعلن `rateLimitService: go_remote:… | typescript_native`
   (وأضفنا `analyticsService` بنفس الشكل)

**عثرة اكتشفها الإثبات واتحلّت:** الدلو المشترك **بيفضل شغّالًا ما بين
الـ suites**، بينما الـ runner بيعمّل سيرفر جديد لكل suite (وبالتالي دلوات
محلية فاضية). أول تشغيل كامل فشل: `comments-test` سخّنت دلو `/api/v1/comments/`
فـ `rate-limit-test` اتعوّضت بـ 429 من أول طلب، وبعدها `auth-flow` اتعثرت
بدلو ساخن من الـ run اللي قبله. الحل منطقي وموضوعي: `run-tests.mjs` بيبعت
`POST /v1/rate/reset {all:true}` قبل كل suite (no-op من غير المتغيّر) — لأن
"سيرفر نضيف لكل suite" مبقاش صح طول ما فيه مخزن مشترك.

**قرارات التصميم:** الخدمة بترجّع القرار فقط (`allowed` + `retryAfterSecs`) والبوابة
هي اللي تبني الـ 429 عشان الرسالة والترويسات تفضل byte-identical؛ `retryAfterSecs`
= `ceil(windowMs/1000)` تمامًا زي ما الـ TS بيبعته؛ والـ token ما بيطلبش على
`/health`/`/ready` عشان الـ healthcheck ما يعطلوش.

**الفارق المقصود:** أثناء انقطاع الخدمة الطلبات بتتسجّل في العدّاد المحلي،
وعند رجوعها الدلو المشترك يكمّل من عدّاده هو → الفرق محدود بمدة الانقطاع
(موثّق في `services/ratelimit/README.md` و`DEPLOY_AR.md §11`).

**البنية التحتية:** `docker-compose.yml` (خدمة `ratelimit:8300` + healthcheck +
`RATELIMIT_SERVICE_URL` داخل حاوية البوابة) · job جديد `ratelimit` في CI
(gofmt + vet + test) · `npm run ratelimit:service|ratelimit:test` ·
`.env.example` (3 متغيرات) · `README.md` (جدول الـ stack + الشجرة) ·
`DEPLOY_AR.md §11` · `services/ratelimit/README.md` بالعربي.

## ✅ المرحلة 4 — تطبيق Android (Kotlin)

**المكان:** `apps/android/` — مشروع Gradle كامل (Gradle 8.9 · AGP 8.5.2 · Kotlin
2.0.20 · compileSdk/targetSdk 34 · minSdk 26) بملف wrapper مرفوع مع المشروع.

**كيف اتعمل:** التطبيق مش مجرد شاشات — **كل قرار في موديول واحد يُختبر على JDK عادي**:

- `core/` — مكتبة **Kotlin/JVM خالصة** (مفيش أي Android فيها): موديلات السلك مطابقة
  لـ `src/types.ts`، عميل **Ktor HttpClient** + kotlinx.serialization، منطق التنبيهات،
  وواجهة `SessionStore`. بيتختبر بـ **MockEngine** — من غير emulator ولا سيرفر ولا مفاتيح.
- `app/` — القشرة اللي حواليها: الشاشات (ViewBinding)، الإشعارات، WorkManager،
  والتخزين على SharedPreferences.

**الشاشات:** دخول (بريد + كلمة مرور، وكود **2FA** بيظهر تلقائيًا لما السيرفر يطلبه) ·
لوحة تحكم (`GET /auth/me` + خروج) · **المفاتيح** (قائمة · إنشاء بنطاقات · عرض السر
مرة واحدة · إلغاء بتأكيد) · **الاستخدام** (`usage-analytics` بـ 3 فترات + مجاميع
الفترة + بطاقة لكل مفتاح: الحصة/الطلبات/النجاح/الأخطاء/429) · **إعدادات** (عنوان
الخادم · تبديل التنبيهات مع طلب إذن الإشعارات على Android 13+ · حدّ الحصة 50–100%).

**الإشعارات:** عامل دوري (كل 6 ساعات، بشبكة متصلة فقط) بيسحب نافذة 24 ساعة،
و`UsageEvaluator` في `:core` هو اللي **يقرّر**: حصة ≥ الحدّ · نسبة أخطاء ≥ 10% بعد
20 طلبًا · نسبة 429 ≥ 10% — مع مفاتيح `dedupe` مقسّمة على نافذة زمنية (مفيش تكرار،
وبعد النافذة التنبيه يقدر يرجع). التوكن المرفوض بيقفل العامل بدل ما يستنزف البطارية.

**العقد مع الـ API:** نفس المسارات ونفس `Authorization: Bearer` بتاع الويب —
`POST /auth/login` · `GET /auth/me` · `GET /api-keys` · `POST /api-keys` ·
`POST /api-keys/:id/rotate` · `DELETE /api-keys/:id` · `GET /api-keys/usage-analytics`،
والأرقام بتتقري زي ما `db.ts` بيبعتها (`successRate` و`quotaUsedPercent` من 0 لـ 100).

**قواعد المرونة:** `ignoreUnknownKeys` (السيرفر ممكن يضيف حقول قبل ما التطبيق
يتحدّث) + كل حقل غير إجباري ليه default → والفشل بيطلع **متنمّق** (`Network` /
`Http` / `Decoding`) مش stack trace. أول ما التوكن يترفض، الشاشة ترجّعك للدخول.
الـ cleartext مقفول إلا على `10.0.2.2`/`localhost` (شبكة أمان مخصّصة) فالإنتاج لازم HTTPS.

**البنية التحتية:** job جديد `android` في CI (setup-java 17 · `:core:test` ·
`assembleDebug` لما `android-34` يكون متاح) · `npm run android:test` و
`npm run android:apk` · `apps/android/README.md` بالعربي + نصوص الواجهة في
`values-ar/`.
**ملاحظة مقصودة:** مفيش سطر في `.env.example` ولا خدمة في `docker-compose` — التطبيق ده
**عميل** بيتكلم HTTP مع نفس البوابة الموجودة، مفيش process جديد يتقنّن
(مخالفة مقصودة للقاعدة 3 ومتسجّلة هنا).

**إثبات التكامل (على جهاز حقيقي — JDK 17 + android-34):**
```
node scripts/android-test.mjs   # ✅ BUILD SUCCESSFUL — 40 testًا، 0 فشل
                                #    VanitasClient 17 · UsageEvaluator 17 · SessionStore 6
npm run android:apk             # ✅ :app:assembleDebug → app-debug.apk (7.84 MB)
```

**عثرة اكتشفها الإثبات واتحلّت:** اختباران فشلا لأن **توقعات الاختبار هي الغلط**،
مش الكود: (1) اختبار الاستخدام كتب في الـ payload `period: 24h` وهو بيأكّد `7d` —
والسيرفر بينقّل نفس الـ period اللي اتطلب فعلًا؛ (2) `KeysResponse` كل حقولها optional، فـ
`{"not": "..."}` **بيتصدّق** بنجاح بدل ما يفشل → اتغيّر لـ `{"keys": "not-an-array"}`
عشان يبقى خطأ نوع حقيقي. وكمان `tools:text` من غير namespace في layout كان هيكسر
AAPT قبل ما يبان.


## ✅ المرحلة 5 — تطبيق iPhone (Swift)

**المكان:** `apps/ios/` — حزمة SwiftPM (`VanitasCore`) + قشرة SwiftUI +
مشروع `Vanitas.xcodeproj` **مكتوب باليد** (objectVersion 56) مع scheme مشترك.

**كيف اتعمل:** نفس فلسفه أندرويد بالظبط: **المنطق لوحده، والواجهة حوالينه**.

- `Sources/VanitasCore/` — حزمة SwiftPM **مالهاش أي SwiftUI فيها**: موديلات
  `Codable` مطابقة لـ `src/types.ts`، عميل `async/await` خلف بروتوكول
  `HTTPTransport` (يعني الاختبار يقدر يحقن نقل مُبرمَج بدل `URLSession`)،
  `UsageEvaluator` بنفس قواعد أندرويد، و`SessionStore` كبروتوكول. بتتجمّع
  وتتجوّز بـ **`swift test`** على أي نظام — من غير Xcode ولا simulator.
- `Vanitas/` — قشرة SwiftUI: دخول (بريد + كلمة مرور + حقل 2FA بيظهر لما
  السيرفر يطلبه)، لوحة حساب، مفاتيح (إنشاء بنطاقات · عرض السرّة مرة واحدة
  مع نسخ · تدوير · إلغاء بتأكيد)، استخدام بـ 3 فترات، وإعدادات (عنوان
  الخادم · إشعارات · حدّ الحصة 50–100%).

**الإشعارات:** `BGAppRefreshTask` كل 6 ساعات (معرّفه مسجّل في `Info.plist`
ولو اختلف بين الشرائح التطبيق بيسقط وقت الإقلاع — عشان كده `ios-check.py`
بيقارن بينهم)، وفوقه فحص عند العودة للواجهة `scenePhase == .active` —
والتانيين بينادوا نفس `evaluateAndRecord`.

**البنية التحتية للتحقق (مفيش ماك عندنا):** `scripts/ios-check.py` بيفحص محليًا
ـ شجرة الصياغة لكل `.swift` عبر tree-sitter · اتساق `project.pbxproj` (كل
المعرّفات بتترابط + الملفات على القرص == الملفات في المشروع) · إن كل مسار
الـ client موجود فعلًا في `src/server` · إن كل حقل في `src/types.ts` موجود في
`Models.swift` · صحّة plist/scheme/JSON · وتطابق معرّف مهمة الخلفية. والـ
**compilation الحقيقية** في job جديد `ios` على `macos-latest`
(`swift test` + `xcodebuild`).

**قواعد المرونة:** `Codable` بيتخطّى حقول السلك المجهولة · الفشل بيطلع
متنمّق (`network` / `http` / `decoding`) · `.network` **مش** بيسجّل الخروج
(السيرفر مقطوع ≠ توكن مرفوض) · أول `401` بيرجّعك للدخول · و`logout` فاشل
مش بيمنع إنك تخرج محليًا. الـ ATS مقفول ما عدا `localhost` — الإنتاج لازم
HTTPS (موثّق في `apps/ios/README.md`).

**البنية التحتية:** job جديد `ios` في CI · `npm run ios:check` ·
`apps/ios/README.md` بالعربي · `README.md` + `DEPLOY_AR.md §13`.
**ملاحظة مقصودة:** مفيش سطر في `.env.example` ولا خدمة في `docker-compose` —
التطبيق ده **عميل** بيتكلم HTTP مع نفس البوابة الموجودة (مخالفة مقصودة
للقاعدة 3، مسجّلة زي المرحلة 4).

**إثبات التكامل (محليًا — Windows، من غير ماك):**
```
python scripts/ios-check.py   # ✅ كل الفحوصات — 21 ملف Swift يتسجّل
                              #    52 معرّف pbxproj يترابط · 7 مسارات client
                              #    موجودة في البوابة · 5 موديلات بتحمل كل
                              #    حقول types.ts · plist/scheme/JSON سليمة
swift test                    # ✅ Build complete! (12.79s) — الـ 21 مصدر +
                              #    الـ 6 views + الـ 42 اختبار يتبنيوا
                              #    ويربطوا بدون أي error (Swift 6.4 / Win)
```

**أربع حواجز كانت بتمنع `swift test` محليًا — كلها اتحلّت:**
`swiftc` كان **بيشتغل** من غير ما يلاقي الـ stdlib، وSwiftPM كان **بيخرج فورًا** بـ
`0xC0E90002` من غير رسالة. الأربعة أسباب:
1. **runtime DLLs** (`swiftCore.dll`, `Foundation.dll` …) موجودة في
   `Runtimes\6.4.0\usr\bin` — مجلد مش على الـ PATH.
2. **SwiftPM كان رافض يبدأ** بـ ``could not find CLI tool `link` `` — محتاج
   `link.exe`/`cl.exe` من Visual Studio، يعني `VsDevCmd.bat` لازم يتحمّل.
3. **الـ stdlib ما كانش يتلقى** — `swiftc` محتاج `SDKROOT` يشاور على
   `...\Windows.platform\Developer\SDKs\Windows.sdk` (مش `SWIFT_SDK` ولا
   `SWIFT_SDK_ROOT` — جربتهم، لوحدهم `SDKROOT` هو اللي شغّال).
4. **UCRT headers ناقصة** (`stdlib.h`, `stdio.h`, `corecrt.h`) — Windows SDK
   ما كانتش متنصّبة أصلًا (كان فيه `NETFXSDK` بس) → اتنصّبت 10.0.26100.

**وأربعة أخطاء حقيقية في الكود طلعوا لأول مرة** — لأن ده أول مرة يتبنى:
1. **`FoundationNetworking`** — على Windows وLinux، `URLSession`/`URLRequest`/
   `URLResponse` في module منفصل عن `Foundation` → `#if canImport(FoundationNetworking)`
   في `VanitasClient.swift` و`TransportStub.swift` (على Darwin بيتحوّل لـ no-op).
2. **`URLSession` ما بتحقّقش من `HTTPTransport`** — corelibs بيوفر
   `data(for:delegate:)` بس، والـ parameter الإضافي بيمنعه يبقى *witness* →
   اتحوّل لـ forwarding method صريح داخل `#if canImport(FoundationNetworking)`.
3. **`import VanitasCore` ناقص** في `TransportStub.swift` → `cannot find type
   'HTTPTransport'`. و`unreachable()` كان جسمها `throw` من غير `throws` في
   التوقيع — ما كانتش هتتبنى على أي platform.
4. **`URL.percentEncodedPath`** — API خاص بـ Darwin → استُبدل بـ
   `URLComponents` المتوفر على كل المنصّات (عبر helper `encodedPath(_:)`).

**ليه التشغيل (execution) لسه محكوم بـ CI:** `Build complete!` بيثبت إن كل الـ
21 مصدر + الـ 6 views + الـ 42 اختبار يتبنيوا ويربطوا. بس **Smart App Control**
(مقياس أمان ويندوز، حالته `evaluation` — `VerifiedAndReputablePolicyState = 1`)
بيمنع تشغيل ملفات الاختبار المحلية، لأن الملف المبني محليًا عمره ما يبقى عنده
"reputation". تبديل `llvm-lib.exe` المحجوب بـ `lib.exe` من MSVC **نجح** وخلى
البناء يخلص فعلًا، لكن التشغيل نفسه مرفوض. إقفال SAC ممكن بس **خطوة مش رجعة
فيها** (محتاجة إعادة تنصيب ويندوز)، فالقرار: **البناء محليًا + التشغيل على
macOS في job `ios`**.

**ملاحظة تشغيلية على Windows:** التنصيب الـ winget بيقسّم الـ toolchain على
`Toolchains/` + `Runtimes/` + `Platforms/` من غير ما يجمّعهم على الـ PATH — فشغّل
`swift test` محتاج تحميل `VsDevCmd.bat` + الاتنين دول على الـ PATH + `SDKROOT`.
بعد التنصيب، `apps/ios/.build/` بيتجنّب (أضيف لـ `.gitignore`) لأن SwiftPM بيدوّر
على كل `.swift` جوّاه، وفيه `DerivedSources/test_entry_point.swift` مولّدة.

**عثرة اكتشفتها المراجعة واتحلّت:** (1) اختبار بيعرّف `let usage = try usage(...)`
— الاسم كان بيشاور على نفسه → اتغيّر لـ `usageFixture`; (2) `Section(title) { }`
شكل مهجّر → اتحوّل لـ `Section { } header: { }` (14 موضع) عشان البناء يبقى
من غير warnings; (3) قاعدة **حقيقية موثّقة في Swift Forums**: أي خاصية
`private` في الـ struct تنزّل الـ memberwise initializer لمستوى الملف → خصائص
كل view بيتبني من ملف تاني (وخصائص `@main VanitasApp` نفسها — لازم يكون
فيه `init()` متاح للـ witness بتاع `App`) بقت `internal` مقصودة ومعلّقة
بتعليق; (4) `tokenProvider` كان بيأسّر `self` فكنت هعمل retain cycle بين
الـ environment والـ client المخزّن فيه → بقى `tokenProvider: { [prefs = store] in prefs.token }`
(بيأسّر المتجر بس).

**ليه `swift test` لسه ما اتجربش محليًا:** مفيش Swift toolchain على الجهاز،
والبديل (تنصيب `Swift.Toolchain` 6.4.0) بيطلب UAC. عشان كده التحقق المحلي
متبني على **tree-sitter (صياغة)** + **pbxproj (اتساق المشروع)** + **مقارنة
العقد مع `src/types.ts` والبوابات** — تلات طبقات بتشيّد أخطاء كتير من غير
compiler، والـ compile الحقيقي شغّال في job `ios` على `macos-latest`.

## ✅ المرحلة 6 — برنامج سطح المكتب (C#)

**.NET 10 + WPF** (`المجلدات`: `apps/desktop`) — لوحة مفاتيح ✅، سجلات ✅،
تنزيلات ✅، متصل بنفس الـ API ✅.

> **الاختيار:** **WPF** بدل Avalonia. السبب عملي: runtime الـ
> `Microsoft.WindowsDesktop.App` **موجود فعلًا** على الجهاز، فالبناء اشتغل من
> أول مرة من غير أي تنزيل NuGet للفريمورك. و`REBUILD_PLAN` بيسمح بالاتنين.
> المنطق كله في `Vanitas.Core` من غير أي WPF، فالانتقال لـ Avalonia لاحقًا
> هيتقتصر على القشرة.
>
> **الإصدار:** .NET **10** مش 8 — ده اللي مثبّت على الجهاز (SDK 10.0.401)،
> وهو LTS الجديد. الوظيفة في CI بتحدد `setup-dotnet 10.0.x` عشان تحديث صورة
> الـ runner ما يغيّرش إصدار اللغة.

### البنية — مكتبة بلا واجهة + قشرة (نفس تقسيم المرحلتين 4 و 5)

```
apps/desktop/
├── Vanitas.Core/           Models, VanitasError, IHttpTransport+HttpClientTransport,
│                           IRequestObserver, VanitasClient, SessionStore, UsageEvaluator
├── Vanitas.Core.Tests/     TransportStub + ObserverStub + fixtures, 46 اختبار
└── Vanitas.Desktop/        App, AppEnvironment, PreferencesStore, L10n,
                            RequestLog, CsvExport, MainWindow + 6 views
```

`Directory.Build.props` بيفرض **C# 14 + nullable + `TreatWarningsAsErrors`**
على المشروعات التلاتة، فالبناء بيتجاوز لو ظهر أي warning.

### الدليل

* **`node scripts/desktop-test.mjs --app`** →
  `Passed! - Failed: 0, Passed: 46, Total: 46` + `Build succeeded. 0 Warning(s) 0 Error(s)`
* **`npm run desktop:test`** / **`npm run desktop:build`** — مضافين في `package.json`.
* **CI job `desktop`** على `windows-latest` (WPF ما بتبنيش على لينكس) بـ
  `setup-dotnet 10.0.x` ← الاختبارات ← بناء القشرة. الملف بيتحقّق من YAML.
* **الاختبارات بتشتغل محليًا على ويندوز** — ده فرق جوهري عن المرحلة 5:
  ملفات الاختبار المبنية بـ .NET **بتقبَل** لأن .NET runtime موقّع من
  مايكروسوفت، فالـ Smart App Control ما يمنعش تشغيلها.
* `.gitignore` بيتجنّب `apps/desktop/**/bin/` و`**/obj/` (اتأكّد بـ `git check-ignore`).
* إضافة `desktop` في جدول الـ Tech Stack وفي شجرة المشروع في `README.md`،
  و`## 14)` في `DEPLOY_AR.md`، و`apps/desktop/README.md` عربي كامل.

### تطبيق بنود المرحلة المطلوبة (لوحة مفاتيح / سجلات / تنزيلات)

* **لوحة مفاتيح** — 7 اختصارات (`Ctrl+K/R/U/J/,/Q` + `Esc`) في
  `Window.PreviewKeyDown` موحّدة في مكان واحد، **وقايمة موثّقة داخل
  البرنامج** من مصدر واحد `L10n.Shortcuts` قاعد جنب الـ handler اللي
  بينفّذها — فما يقدّرش يتبعدوا.
* **سجلات** — `RequestLog`: بُعث 500 سطر، `ObservableCollection`، بيتمّ عبر
  `Dispatcher` (عشان `ConfigureAwait(false)` ما يحرقش الـ UI thread)، وبيتغذّى
  من `IRequestObserver` اللي الكلاينت بيبلّغ من `finally` بتاعه.
* **تنزيلات** — `CsvExport.Save`: حوار حفظ، UTF-8 بـ BOM (Excel والعربي)،
  أرقام `InvariantCulture`، و`Escape` بيتبع RFC 4180 + تحيّن Excel
  (`=`, `+`, `-`, `@` في الأول).

### العثور اللي اتكشفت أول ما الكود اتبنى (7)

1. **`JsonException` كان بيهرب من الكلاينت** — ردّ 2xx بـ JSON مش مقروء كان
   بيطلع استثناء `System.Text.Json` بدل `VanitasError.Decoding`، يعني كل شاشة
   كانت هتسقط. اتصلح بـ `Decode<T>` + اختبار.
2. **اختبار `Missing_name_falls_back_to_prefix` في نسخة Swift ما كانش
   هينجح أبدًا** — الـ fixture الافتراضي ما بيرفعش تنبيه، فـ `alerts.first`
   كانت `nil` و`XCTAssertEqual(nil, "vk_live_zz")` كانت هتفشل. **اكتشفه النقل
   لـ C#** (وأول تنفيذ للاختبارين)، واتصلح في **الاتنين**.
3. `RowHeaderVisibility` مش خاصية موجودة في XAML — وزيادة، لأن
   `HeadersVisibility="Column"` بتكفي (اتشال من 3 ملفات).
4. `Application.DispatcherUnhandledException` **حدث** مش method قابل
   للـ override → اتحوّل لـ اشتراك في `OnStartup`.
5. `_keys = _usage = _logs = _settings = null` متسلسل — C# بيلمّس النوع من
   أقصى اليمين فبيرفض باقي التعيينات → اتحوّل لـ 4 جمل منفصلة.
6. `{Binding Path}` بيتقرا كـ "الخاصية Path بتاعة الـ binding" — اتحوّل
   لـ `RequestEntry.Route` عشان يبقى واضح.
7. `top?.Endpoint` ناقص `?? ""` — `params string[]` ما بياخدش `string?`.

### فروق مقصودة عن بقية المنصّات

* **`IRequestObserver` إضافة جديدة في C#** — باقي المنصّات بتسجّل من القشرة؛
  هنا القرار اتاخد جوّه الكلاينت عشان السجل يفضل كامل حتى لو الطلب ما وصلش
  لرد (بيتوقّف عند `finally`).
* **`AlertThresholds` بيُصلَّح في الـ constructor** (زي Swift، ف مستحيل تتبني
  نسخة خارج النطاق) — نسخة Kotlin بترفض بالـ `require`.
* **`PathEncode` بيستخدم `Uri.EscapeDataString`** وهي أشدّ من نسخة Swift
  (اللي بتسيب الـ sub-delims) — آمن لأن الـ ids قطع غير معرّفة، والنتيجة
  متطابقة على كل المنصّات للاختبارات اللي بتتمرّن عليها (`a/b` → `a%2Fb`).
* **مفيش سطر في `.env.example` ولا خدمة في `docker-compose`** — البرنامج
  **عميل HTTP** زي تطبيقَي iOS وAndroid. (نفس الاستثناء المدوّن في المرحلتين
  4 و 5.)

### إضافة اتركّز هنا

`PreferencesStore` بيتخزّن في `%APPDATA%\Vanitas\settings.json` كـ JSON،
وبيتكتب بعد أي تغيير **وفي `OnExit`** — عشان URL اتغيّر قبل الإغلاق بثانية ما
يضيعش. وبيتجنّب أي قراءة فاسدة بـ `try/catch` (الإعدادات الفاسدة = مافيش
إعدادات، والافتراضيات آمنة دايمًا).

## ✅ المرحلة 7 — البلوك تشين (Solidity)

عقد ذكائي لإدارة رصيد/كريدت المنصة **مع التوقيع off-chain (EIP-712)** + سكربت نشر
واختبارات Forge/Foundry.

### البنية

```
contracts/
├── foundry.toml              # solc مثبّت على 0.8.30 + إعدادات fmt/ lint
├── src/VanitasCredit.sol     # العقد — CREDIT/DEBIT/TRANSFER + admin
├── test/VanitasCredit.t.sol  # 35 اختبارًا أوفلاين على EVM داخلي
├── script/Deploy.s.sol       # سكربت النشر (forge script)
├── lib/forge-std/            # مستورد بـ forge install --no-git (مش submodule)
└── README.md                 # عربي كامل (التصميم + النشر + مرجع EIP-712)
```

### القرارات

* **التوقيع off-chain عشان «بدون غاز»:** الخلفية توقّع `Action` بمفتاح
  `operator`، وأي طرف ثالث يرسلها ويدفع الغاز. عشان كده **`execute()`
  غير مشروط بالمرسِل عمدًا** — الـ `msg.sender` ما بيدخلش في التصرّح.
* **الحقل `op` جوّه الـ struct المُوقَّع** بدل تلات typehashes منفصلة: تغيير
  العملية يُبطل التوقيع تمامًا كتغيير المبلغ، فلا تُعاد كريديت موقّعة كديبت.
  كمان بيخلي `executeBatch` موحّد البنية.
* **`TRANSFER` يوقّعه الحساب نفسه**؛ `CREDIT`/`DEBIT` يوقّعها `operator` بس —
  يعني مفتاح الفوترة **ما يقدّرش** ينقل فلوس مستخدم لمكان تاني.
* **صفر اعتماديات خارجية:** EIP-712 و`ecrecover` مكتوبين يدويًا، فـ
  `forge build`/`forge test` ما بياخدوش الشبكة إطلاقًا (إلا تنزيل `solc` مرة
  واحدة). و`forge-std` مستورد بـ `--no-git` → ملفات عادية في المستودع، مفيش
  `.gitmodules` ولا `git submodule update` عند أول نسخ (اتأكّد بـ
  `git status -- .gitmodules` = فاضي).
* **`domainSeparator` يُحسب في كل استدعاء مش مخزّن** — النسخة المخزّنة تبطل
  عند تفريع السلسلة.
* **hand-rolled ECDSA بمرافقة EIP-2** (رفض `s` المرتفع و`v` خارج 27/28) +
  **nonce واحد لكل حساب عبر كل العمليات** + **deadline**.
* **`executeBatch` ذرّي بالكامل** — تطبيق جزء من دفعة فوترة أسوأ من فشلها.
* **`setPaused` بيشتغل وانتم موقوفين**، وإلا كان العقد الموقوف مستحيل الاسترجاع.

### الدليل

* **`forge test`** → `35 passed; 0 failed; 0 skipped` (منهم fuzz ×2 بـ 256 run).
* **`forge coverage`** على `src/VanitasCredit.sol` →
  **lines 98.78% (81/82) · statements 96.84% · branches 85.71% · funcs 100%**.
  السطر الناقص **واحد بس** ومقصود: `revert UnknownOperation` في فرع `else`
  بـ `_execute` — **غير قابل للوصول** لأن `_expectedSigner` بترفض أي عملية
  غريبة قبلها. التعليق فوقه في الكود شارح ليه فاضل ومحميّ.
* **`forge fmt --check`** → exit 0 · **`forge lint`** → **صفر ملاحظات**
  (مخرجات فاضية تمامًا).
* **`forge script script/Deploy.s.sol`** (تجربة جافة بلا مفتاح بلا RPC) →
  `Script ran successfully` + عنوان العقد.
* **`npm run contracts:test` / `contracts:build` / `contracts:fmt`** — مضافين في
  `package.json`.
* **CI job `contracts`** بـ `foundry-rs/foundry-toolchain@v1` مثبّت على `v1.8.5`
  ← `forge fmt --check` ← بوابة اللينت ← `forge test -vvv` ← تجربة سكربت النشر.
  الملف بيتحقّق من YAML (10 وظائف).
* **`.gitignore`** بيتجنّب `contracts/out/` و`contracts/cache/` و
  `contracts/broadcast/`، ومكتوب إن `lib/forge-std` **مقصود إن يتتبع**
  (اتأكّد بـ `git check-ignore`).
* إضافة `Blockchain` في جدول الـ Tech Stack وفي خريطة اللغات وفي شجرة
  المشروع في `README.md`، و`## 15)` في `DEPLOY_AR.md`، و`contracts/README.md`
  عربي كامل.

### أثر فعلي على سلسلة حقيقية (وليس فقط EVM داخلي)

شغّلت Anvil محليًا (chain id 31337) ونفّذت المسار كاملًا بـ
`forge script --broadcast` + `cast wallet sign --data` + `cast send`:

| الحالة | النتيجة |
|---|---|
| النشر مع `CREDIT_OPERATOR` مختلف عن المُنشر | `operator()` = العنوان المطلوب ✅ |
| توقيع `CREDIT` off-chain ثم إرساله بيد طرف ثالث | `status 1`، `balanceOf(user)` = 1000 ✅ |
| المُرسِل دفع الغاز | رصيده ظلّ **0** — لم يحصل على شيء ✅ |
| التوقيع بالمفتاح **الخطأ** | **مرفوض**، الرصيد بلا تغيير ✅ |
| إعادة إرسال نفس التوقيع (replay) | **مرفوضة** — الـ nonce تقدّم ✅ |
| `TRANSFER` وقّعه المستخدم نفسه | 600/400 و`totalSupply` فضل **1000** ✅ |

(لاحظ إن أول محاولة للـ transfer **فشلت** — الـ nonce كان 1 مش 2 بعد الـ
credit، ومفتاح المستخدم اللي استخدمته كان بتاع حساب تالت. الاتنين اتصلحوا
بالتحقّق من `cast wallet address --private-key` بدل التخمين.)

### تطبيق بنود المرحلة المطلوبة

* **عقد لإدارة الرصيد** ✅ — `VanitasCredit`، `balanceOf`/`totalSupply`/`nonces`.
* **التوقيع off-chain** ✅ — EIP-712 domain + `Action` typehash، أثبتها اختباران
  صريحان (`test_DigestIsTheStandardEip712Composite` و
  `test_DomainSeparatorBindsChainAndContract`) بحيث أي تعديل على الـ domain
  يُبطل كل توقيع موجود ويفشل الاختبار.
* **سكربت نشر** ✅ — `script/Deploy.s.sol`، بيشتغل جافًّا بلا مفتاح وبيقبل
  `CREDIT_DEPLOYER_PRIVATE_KEY` أو `PRIVATE_KEY`.
* **اختبارات Forge/Foundry** ✅ — 35 اختبارًا.

### انحرافات مدوّنة عن القواعد العامة

* **القاعدة 3 بتتحقّق بالفعل هنا** — عكس المرحلتين 4 و5 و6: أضفت **4 سطور في
  `.env.example`** و**خدمة `anvil` في `docker-compose.yml`**. لكن مهمة مهمة:
  **ولا واحدة في المتغيّرات بيقرأها الخادم** (العقد سلسلة مستقلة والبوابة ما
  بتتكلّمش معاه)، وخدمة الـ anvil **اختيارية** — مفيش حاجة بتعتمد عليها، و
  `docker compose up` العادي ما بيتغيّرش.
* **القاعدة 1 (مفيش كسر)** متحقّقة بالكامل: العقد ملف مستقل، لا خدمة جديدة
  ولا client ولا سطر واحد في كود TypeScript اتغيّر → **لا حاجة إعادة بناء**
  `dist/server.cjs` ولا `api/index.js`.
* **`forge lint` ما بيطلعش غير صفر حتى لو فيه ملاحظات** → بوابة CI بتفحص
  المخرجات (نفس فكرة `test -z "$(gofmt -l .)"` في job بتاع Go) بدل الاعتماد
  على الـ exit code.

### العثور اللي اتكشفت أول ما الكود اتبنى (7)

1. **`expectRevert` كان بيتقفل على غلط.** كل الـ 9 اختبارات اللي فشلت كان
   فيها `_sign(...)` متقيّد كـ argument جوّه `credit.execute(...)` بعد
   `vm.expectRevert` — و`_signFor` بينادي `target.hashTypedData(action)` وهو
   **external call** لـ `credit` (متغيّر نوع contract). فالـ expectRevert كان
   بيتقفل عليه هو، ويقول «اللي بعد ما رجعش». الحل: ترقية كل توقيع لمتغيّر
   قبل `expectRevert`. اتكتب توضيح دايم فوق `_sign` عشان ما يتحدّثش تاني.
   (لاحظ: `vm.prank` ما بيأثّرش — الـ cheatcalls مستبعدة.)
2. **كتم الـ lint بسطر واحد ما بيشتغلش مع العبارة متعددة الأسطر.**
   `// forge-lint: disable-next-line(...)` بتتسجّل `unused` لأن Foundry
   بتطابقها بالسطر والتشخيص ممتدّ على أكتر من سطر. الحل: الـ emits اتعملت
   **سطر واحد** + رفع `[fmt] line_length` لـ 120 عشان `forge fmt` ما يعيدش
   لفّها ويكسر الكتم صامتًا (والسبب ده مكتوب جوّه التعليق نفسه).
3. **`environment-read-across-mutation`** على `vm.warp(block.timestamp + …)`.
   اتعدّل لـ `vm.getBlockTimestamp()` (اللي اللينت نفسه بيقترحه) — وأصبح فرصة
   إزاحة `block.timestamp - 1 - 1 days` المربكة متغيّر واضح `signedAt`.
4. **فتحة حقيقية في التغطية:** `transferOwnership` **مسار نجاحه كان غير
   مختبر** (فشلته بس). اتضاف `test_TransferOwnershipHandsOverControl` اللي
   بيثبت إن المالك القديم بيفقد كل صلاحياته والجديد بيورثها كلها.
5. **`domainSeparator()` و`hashAction()`** كانا غير مغطّى مباشر في lcov رغم
   نداءهما من `hashTypedData`. اتضاف اختباران بتناديهم صراحة **وكمان
   توثّقان تركيب EIP-712 للمُتكاملين** — فأي تعديل على الـ domain يفشل الاختبار.
6. **خط غير قابل للوصول اتكشف بالتغطية:** `revert UnknownOperation` في فرع
   `else` بالـ dispatch — لأن `_expectedSigner` بترفض أولًا. سيباه عمدًا
   كحماية (لو حد زاد `op` في المتوقّع بدون فرع في التوزيع، ده اللي يمنع
   معاملة تستهلك nonce وما تغيّرش حاجة)، والتعليق فوقه موثّق إنه مقصود.
7. **الاستعلام الغلط مش خطأ العقد:** أول محاولة على Anvil، `cast call
   … "name()(string)"` رجع revert. السبب إن الـ getter اسمه **`NAME()`**
   (حالة الأحرف بتاعت الـ constant نفسها) —
   `cast sig 'NAME()'` = `0xa3f4df7e` و`cast sig 'name()'` = `0x06fdde03`، يعني
   نداء `name()` بيوصل لدالة مش موجودة فيرجع فاضي. العقد سليم؛ الاستعلام كان
   غلط.


### اكتشافات أول تشغيل حقيقي للـ CI (بعد الرفع)

كل المراحل السبع كانت غير مُثبّتة لحد لحظة الرفع، فـ **دي أول مرة الـ jobs
بتاعة Python وiOS تشتغل أصلاً** — وكانت محليًا كلها خضراء على Windows.

8. **`pytest` و`python -m pytest` مش متساويين — والفرق بيكسر الاتنين.**
   CI بينادي `pytest -q` (الـ console script). ده **ما بيحطّش cwd في
   `sys.path`**، فـ `from app.config import …` في `conftest.py` بيرمي
   `ModuleNotFoundError` → pytest **exit code 4 (USAGE_ERROR)** قبل ما يجمع
   اختبار واحد — يعني شكله فشل اختبارات وهو ما شغّلش حاجة. `python -m pytest`
   بتحطّ cwd تلقائيًا، عشان كده كان كل حاجة خضراء محليًا. الحل: سطر
   `pythonpath = .` في `pytest.ini` بتاع الخدمتين، فالاتنين شغالين بأي طريقة
   استدعاء. **الأعراض المضلّلة:** الـ step اسمه «Pytest» والمخرجات بتقول exit 4
   مش exit 1، و`pip install` نجح — فالأولى تودّي لاتجاه غلط تمامًا.
9. **`swift test` ما اشتغلش محليًا أبدًا** (Smart App Control مفعّل → تنفيذ
   binaries غير موقّعة ممنوع)، فالـ CI هو أول من شغّله — وفضّح assertion قديم:
   الـ fixture المشترك `keyJSON()` بيعلن **سكوبين** `["apikeys:read",
   "usage:read"]`، بينما `testKeyListParsesAndIgnoresUnknownFields` كان بيقارن
   بعنصر واحد. التوأم بتاعه في C# عنده fixture بعنصر واحد، وعشان كده job بتاع
   Desktop كان أخضر. الحل: التوسيع للاتنين (يغطّي تحليل مصفوفة أكتر من سكوب)
   بدل التصغير.

10. **`xcodebuild` كان هيولّع حتى بعد ما `swift test` نجح** — الخطوة الجاية
    في job بتاع iOS، وما اشتغلتش محليًا أبدًا. الـ pbxproj المكتوب بالإيد كان
    بيعمل compile **للملفات الخمسة بتاعت `VanitasCore` جوّه الـ app module
    نفسه**، وفي نفس الوقت ملفات الـ shell بتعمل `import VanitasCore` — يعني
    module مش موجود → `no such module`. الحزمة ما كانتش مربوطة بالمشروع أصلًا:
    مافيش `XCLocalSwiftPackageReference` ولا `packageProductDependencies`. الحل:
    إضافة المرجع المحلي (`relativePath = .`) + `XCSwiftPackageProductDependency`
    للحزمة + `packageProductDependencies` على الـ target + product في
    `Frameworks`، و**شيل الملفات الخمسة من `PBXSourcesBuildPhase`** (لو فضلوا،
    نفس الملفات هيتبنّوا مرتين: مرة في الـ app ومرة في الحزمة). الـ file refs
    اتسيبت عشان `ios-check.py` بيطالب إن كل `path = *.swift` على القرص يكون
    مذكور — فالفحص بيمنع حذفها بالغلط. اتأكد بعد التعديل: «parses as an Xcode
    project» + «all 50 object ids resolve».

ملاحظة تشغيلية: أي فشل في `run-tests.mjs` لازم **يتكرّر قبل الحكم** — البناء
بتاع Swift بيحِمل الجهاز فترًا، وأدى في محاولة واحدة لـ `auth-flow` و
`server-orders` يفشلوا بـ «server not reachable»، ثم ينجحوا كلهم في التكرار
البلا حِمل.

---

## قواعد عامة لكل مرحلة

1. **مفيش كسر:** أي خدمة جديدة اختيارية؛ لو وقفت المنصة ترجع للمسار القديم تلقائيًا.
2. **الاختبارات قابلة للاشتغال أوفلاين** (mock للمزوّدين) عشان CI ما يحتاجش مفاتيح.
3. **كل مرحلة ليها:** بنية مجلدات + اختبارات + README عربي + سطر في `.env.example`
   + إضافة في `docker-compose.yml` + تحديث `README.md`/`DEPLOY_AR.md`.
4. **التوقف للمراجعة** بعد كل مرحلة قبل ما نبدأ اللي بعدها.
