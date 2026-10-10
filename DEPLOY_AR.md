# النشر على رابط + ربط قاعدة البيانات (خطوة بخطوة)

هذا المشروع الآن مُؤمَّن ومُهيأ للنشر. اختر طريقة واحدة:

## 1) إنشاء قاعدة بيانات مجانية (Supabase — الأسرع)

1. ادخل https://supabase.com وأنشئ مشروع مجاني.
2. من Project Settings → Database انسخ `Connection string` (URI).
3. من SQL Editor الصق محتوى ملف `supabase/schema.sql` واضغط Run.
4. ستحصل على `DATABASE_URL` شكله:
   `postgresql://postgres:<password>@db.<ref>.supabase.co:5432/postgres?sslmode=require`

> بديل مجاني: https://neon.tech (Postgres Serverless) — نفس الخطوات.

## 2) النشر على Render (باك-إند + قاعدة بيانات — مجاني)

1. ارفع المشروع على GitHub:
   ```bash
   git init
   git add .
   git commit -m "secure vanitas release"
   git branch -M main
   git remote add origin https://github.com/<user>/<repo>.git
   git push -u origin main
   ```
2. ادخل https://render.com → New → Blueprint واختر الريبو (يقرأ `render.yaml` تلقائياً).
3. أضف متغيرات البيئة:
   - `DATABASE_URL` = رابط Supabase/Neon
   - `ADMIN_API_TOKEN` = توليد تلقائي (أو `openssl rand -base64 32`)
   - `FRONTEND_URL` = رابط الواجهة (مثلاً `https://vanitas-bot.vercel.app`)
4. بعد النشر ستحصل على رابط مثل `https://vanitas-xxxx.onrender.com`
   - جرّب: `https://<رابطك>/api/v1/health`
   - و `https://<رابطك>/api/v1/ready` (يجب أن تكون `database: connected`)

## 3) النشر على Vercel (واجهة + API)

1. ارفع على GitHub (نفس الخطوة السابقة).
2. ادخل https://vercel.com → Add New Project → اختر الريبو.
3. في Environment Variables أضف:
   - `DATABASE_URL`
   - `ADMIN_API_TOKEN` (32+ حرف)
   - `FRONTEND_URL` = دومين Vercel نفسه
   - `AI_PROVIDER=ollama` للنموذج المحلي، أو `pollinations` للنموذج المجاني المستضاف دون مفتاح. Gemini اختياري وقد يخضع لحصص أو تكلفة.
4. Deploy. ستحصل على `https://<مشروعك>.vercel.app`
5. أي تعديل جديد:
   ```bash
   git add .
   git commit -m "update"
   git push
   ```
   سيُعيد Vercel النشر تلقائياً على نفس الرابط.

## 4) التشغيل محلياً مع قاعدة بيانات

```bash
cp .env.example .env
# عدّل DATABASE_URL و ADMIN_API_TOKEN داخل .env
npm install
npm run db:migrate
npm run dev
# افتح http://localhost:3000
```

أو بـ Docker:

```bash
cp .env.example .env
# ضع POSTGRES_PASSWORD قوية داخل .env
docker compose up --build -d
docker compose logs -f vanitas
```

## 5) ما الذي تم إصلاحه أمنياً؟

- إزالة `x-user-role: ADMIN` من الواجهة. الصلاحيات تُحسم في السيرفر فقط عبر `ADMIN_API_TOKEN`.
- التسجيل الجديد دائماً `USER`. الترقية لـ `ADMIN` فقط عبر `PATCH /api/v1/admin/users/:id/role` مع توكن الأدمن.
- المفاتيح والتوكنات بـ `crypto.randomBytes` بدل `Math.random`.
- أسرار الـ Webhook لا تُعرض في `GET /webhooks` (تظهر مرة واحدة عند الإنشاء فقط).
- حماية SSRF لروابط الـ Webhook (https فقط، منع localhost/الشبكات الخاصة).
- Rate limiting لكل IP على `/api/*` + حدود أشد على Auth/AI/Bot.
- تحقق صارم من كل المدخلات + سقف `limit<=100` + حد أحجام (prompt 8KB، كود 30KB).
- منع تسريب `err.message`/stack للعميل + CSV injection guard.
- headers: `X-Frame DENY`, `CSP`, `HSTS`, `COP/COOP`, إخفاء `X-Powered-By`, CORS allowlist.
- قاعدة البيانات: schema كامل + SSL تلقائي لـ Supabase/Neon + فحص `/ready` حقيقي.
- Docker يعمل كمستخدم غير root + healthcheck + عدم نشر البوستجريس للإنترنت.

## 6) أول أدمن بعد النشر

```bash
curl -H "Authorization: Bearer $ADMIN_API_TOKEN" https://<رابطك>/api/v1/admin/users
```

ثم رقِّي نفسك من لوحة Admin أو عبر:

```bash
curl -X PATCH https://<رابطك>/api/v1/admin/users/<userId>/role \
 -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 -H "Content-Type: application/json" \
 -d '{"role":"ADMIN"}'
```

## 7) صفحات تسجيل مستقلة + دخول عبر Discord / Google / GitHub

### الروابط الجاهزة للمشاركة

- `https://<رابطك>/register` — صفحة إنشاء حساب مستقلة
- `https://<رابطك>/login` — صفحة تسجيل الدخول المستقلة

كل صفحة فيها حقول البريد/كلمة المرور + أزرار Discord و Google و GitHub.
الأزرار تتفعل **تلقائياً** بمجرد إضافة مفاتيح المنصة في متغيرات البيئة،
وإن لم تُضف مفاتيحها تظهر رسالة "غير مفعّلة" بدل الخطأ.

### تفعيل المنصات (اختر ما تشاء منها)

1. **Discord** — https://discord.com/developers/applications → New Application
   → OAuth2 → أضف Redirect:
   `https://<رابطك>/api/v1/social/discord/callback`
   ثم انسخ *Application ID* و *Client Secret*.
2. **Google** — https://console.cloud.google.com/apis/credentials
   → Create OAuth client ID (Web application) → Authorized redirect URI:
   `https://<رابطك>/api/v1/social/google/callback`
3. **GitHub** — https://github.com/settings/developers → New OAuth App
   → Authorization callback URL:
   `https://<رابطك>/api/v1/social/github/callback`

### إضافة المفاتيح في Vercel

Settings → Environment Variables، أضف (كل منصة على حدة):

```
DISCORD_CLIENT_ID=...        DISCORD_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...         GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...         GITHUB_CLIENT_SECRET=...
FRONTEND_URL=https://<رابطك>
```

ثم Redeploy. من هذا اللحظة أزرار المنصات تعمل فعلياً:
يدخل المستخدم بحسابه، ويُنشأ له حساب Vanitas تلقائياً (دور `USER`)،
ويُربط بالبريد **المُتحقَّق منه فقط** من المنصة — ولا يمكن الاستيلاء
على حساب موجود ببريد غير مُتحقق.

> ملاحظة: روابط الـ callback هذه تظهر أيضاً في `.env.example` تحت قسم
> Social login.

## 8) مفاتيح API الخارجية — الاختبار بـ cURL

نظام المفاتيح يعمل الآن فعلياً: تنشئ المفتاح من لوحة التحكم
(قسم **API Keys**)، ثم تستخدمه في أي طلب خارجي. المُعرِّف الوحيد المخزَّن
هو بصمة `sha256` للمُفتاح الخام — **لا يُخزَّن المُفتاح نفسه أبداً**،
ويُعرض مرة واحدة فقط عند الإنشاء أو التدوير (Rotate).

### أنواع المفاتيح

| النوع | الاستخدام |
|---|---|
| `sk_live_vanitas_...` | بيئة الإنتاج (الافتراضي) |
| `sk_test_vanitas_...` | بيئة الاختبار (عند اختيار `test`) |

### 1) إرسال المفتاح

طريقتان مُتكافئتان — اختر أيهما يناسبك:

```bash
# الطريقة الأولى: ترويسة مخصصة
curl -H "x-api-key: sk_live_vanitas_XXXXXXXXXXXXXXXXX" \
  https://vanitas-bot.vercel.app/api/v1/public/ping

# الطريقة الثانية: Authorization Bearer
curl -H "Authorization: Bearer sk_live_vanitas_XXXXXXXXXXXXXXXXX" \
  https://vanitas-bot.vercel.app/api/v1/public/ping
```

### 2) نقاط النهاية المتاحة

```bash
BASE=https://vanitas-bot.vercel.app/api/v1
KEY="sk_live_vanitas_XXXXXXXXXXXXXXXXX"

# التحقق من المفتاح (بدون نطاقات)
curl -H "x-api-key: $KEY" $BASE/public/ping

# بيانات المفتاح + المالك + الحدود (بدون نطاقات)
curl -H "x-api-key: $KEY" $BASE/public/me

# حالة الخدمات — يتطلب النطاق api.read
curl -H "x-api-key: $KEY" $BASE/public/status

# استهلاكك الشهري ونافذة الحصة (بدون نطاقات)
curl -H "x-api-key: $KEY" $BASE/public/quota
```

### 3) ترويسات الحصة (Rate Limit)

كل رد يحمل:

```
X-RateLimit-Limit: 600
X-RateLimit-Remaining: 594
X-RateLimit-Reset: 1767225600
```

عند تجاوز الحصة (أو نفاد الحصة الشهرية) يعود:

- `429 Too Many Requests` + ترويسة `Retry-After` (بالثواني)
- `X-RateLimit-Remaining: 0`

### 4) أخطاء المصادقة الشائعة

| الحالة | الكود | المعنى |
|---|---|---|
| بدون مفتاح | 401 | `API key required` |
| مفتاح خاطئ | 401 | `Invalid API key` |
| مفتاح مُلغى (Revoke) | 403 | `API key revoked` |
| مفتاح منتهي (انتهت مدته) | 403 | `API key expired` |
| النطاق المطلوب غير ممنوح | 403 | `Missing required scope: api.read` |
| تجاوز الدقيقة أو الشهر | 429 | `Rate limit exceeded` / `Monthly quota exceeded` |

### 5) إعدادات كل مفتاح (من اللوحة)

- `rateLimitPerMin` — عدد الطلبات بالدقيقة (10 – 10000)
- `rateLimitAlgorithm` — `sliding_window` | `fixed_window` | `token_bucket`
- `burstLimit` — سعة الانفجار لخوارزمية `token_bucket`
- `actionOnExceed` — `reject_429` (افتراضي) | `throttle_delay` | `alert_only`
- `monthlyQuota` — الحصة الشهرية (0 = بلا حد)
- `scopes` — النطاقات الممنوحة للمفتاح

مثال على تغيير الإعدادات:

```bash
curl -X PATCH -H "Authorization: Bearer <جلسة اللوحة>" \
  -H "content-type: application/json" \
  -d '{"rateLimitPerMin":600,"actionOnExceed":"throttle_delay"}' \
  https://vanitas-bot.vercel.app/api/v1/api-keys/<id>/rate-limit
```

> تنبيه: عند `throttle_delay` تُؤخَّر الطلب بدل رفضه (بحد أقصى ثانيتين)،
> وعند `alert_only` تمر كل الطلبات مع تسجيل تنبيه في سجل التدقيق.

## 9) خدمة الذكاء الاصطناعي بـ Python (AI Service)

حسب خريطة لغات المنصة، مجال الذكاء الاصطناعي وتعلّم الآلة يكون بـ **Python**،
فعملنا فصله كخدمة مستقلة داخل `services/ai-service` (FastAPI)، والتايب سكريبت
بيستدعيها عبر HTTP.

```bash
cd services/ai-service
python -m venv .venv
.venv/bin/pip install -r requirements.txt       # ويندوز: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --port 8100      # ويندوز: .venv\Scripts\uvicorn
```

ثم في `.env` (أو إعدادات Vercel/Render):

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8100
AI_SERVICE_TOKEN=مفتاح-داخلي-عشوائي-طويل     # اختياري لكن مُوصى به
```

أو مع Docker Compose (يشغّل PostgreSQL + Ollama + الخدمة Python + الواجهة معًا):

```bash
docker compose up -d
```

نقاط النهاية: `/health`, `/ready`, `/v1/ai/chat`, `/v1/ai/chat/stream` (SSE),
`/v1/ai/diagnose`, `/v1/ai/semantic-search`, `/v1/ai/youtube`.

**السلامة:** لو `AI_SERVICE_URL` غير مضبوط، أو الخدمة وقفت/بطأت، بيستخدم
المنصة سلسلة TypeScript القديمة تلقائيًا — يعني التحديث ده **لا يكسر شيئًا**.

اختبارات الخدمة (أوفلاين، بدون شبكة):

```bash
cd services/ai-service && .venv/bin/pytest -q
```

## 10) خدمة تحليل البيانات بـ Python (+ R)

حسب خريطة اللغات، مجال تحليل البيانات يكون بـ **Python/R**، ففصلناه كخدمة
مستقلة داخل `services/analytics` (FastAPI). الخدمة بتاخد نافذة سجلات استخدام
الـ API منبوابة الـ gateway وترجّع تحليل كامل: مئيات التوزيع (p50/p90/p95/p99)،
نسب الأخطاء والـ 429، مقارنة بالفترة السابقة، كشف الشذوذ (z-score)، تقرير
Markdown عربي + ملفات CSV، ورسم SVG جاهز للوحة التحكم.

```bash
cd services/analytics
python -m venv .venv
.venv/bin/pip install -r requirements.txt       # ويندوز: .venv\Scripts\pip
.venv/bin/uvicorn app.main:app --port 8200      # ويندوز: .venv\Scripts\uvicorn
```

أو من جذر المشروع:

```bash
npm run analytics:service     # تشغيل الخدمة على :8200
npm run analytics:test        # تشغيل اختباراتها (51 اختبار أوفلاين)
```

ثم في `.env`:

```dotenv
ANALYTICS_SERVICE_URL=http://127.0.0.1:8200
ANALYTICS_SERVICE_TOKEN=مفتاح-داخلي-عشوائي-طويل   # اختياري لكن مُوصى به
ANALYTICS_SERVICE_TIMEOUT_MS=10000                     # مهلة كل تحليل
```

نقاط النهاية:

| المسار | الوظيفة |
| --- | --- |
| `GET /health` · `GET /ready` | حالة الخدمة + هل R متاح |
| `POST /v1/analytics/analyze` | تحليل كامل لسجلات الاستخدام |
| `POST /v1/analytics/report` | تقرير Markdown عربي + CSV |
| `POST /v1/analytics/trend` | اتجاهات + انحدار خطي + شذوذ (R أو Python) |
| `POST /v1/analytics/chart` · `/chart.svg` | رسم SVG (سلسلة زمنية أو ترتيب المسارات) |

على مستوى المنصة (بعد تفعيل `ANALYTICS_SERVICE_URL`):

```
GET /api/v1/analytics/insights?period=24h|7d|30d   # يتطلب تسجيل الدخول
GET /api/v1/analytics/report?period=7d             # Markdown + CSV للتنزيل
```

**عن R:** لو `Rscript` موجودة على الجهاز/الصورة، الخدمة بتحسب الاتجاهات
بـ R (`stats/trend.R` — سكربت base R بدون أي حزم CRAN)، وإلا بتستخدم محرك
Python المدمج بنفس الأرقام بالظبط. تفعيل R في Docker:

```bash
docker compose build --build-arg WITH_R=1 analytics && docker compose up -d
```

**السلامة:** لو `ANALYTICS_SERVICE_URL` غير مضبوط، أو الخدمة وقفت/بطأت/ردت
بشكل غلط، بيتمّ التحليل بمحرك TypeScript المدمج (`src/server/analyticsNative.ts`)
بنفس الشكل والأرقام — يعني التحديث ده **لا يكسر شيئًا**.

اختبارات الخدمة (أوفلاين، ساعة مثبّتة، بدون R):

```bash
cd services/analytics && .venv/bin/pytest -q
node scripts/run-tests.mjs --only analytics        # نقاط النهاية عبر المنصة
```

وللتأكد إن المحرّكين متطابين رقميًا (يحتاج الخدمة شغالة على `:8200`):

```bash
npx tsx scripts/_analytics-parity.ts
```

## 11) خدمة حدود الاستخدام بـ Go (Rate Limit Service)

**المجال:** برمجة الخوادم · **اللغة:** Go · **المنفذ:** `8300`

حسب [خريطة لغات المنصة](/languages) مجال الخوادم بيسمح بـ
TypeScript/Python/**Go**/Java، فالفصل هنا مش زينة: البوابة بتشتغل بعدة نسخ
خلف load balancer، وكل نسخة بتحفظ عدّادها في ذاكرة عمليتها → السقف بيتضاعف
عدد المرات. خدمة Go بتعمل **دلو واحد مشترك** لكل النسخ.

التشغيل:

```bash
npm run ratelimit:service     # go run . على :8300
npm run ratelimit:test        # go test ./...
```

ثم في `.env`:

```dotenv
RATELIMIT_SERVICE_URL=http://127.0.0.1:8300
RATELIMIT_SERVICE_TOKEN=مفتاح-داخلي-عشوائي-طويل   # اختياري لكن مُوصى به
RATELIMIT_SERVICE_TIMEOUT_MS=300                        # مهلة كل قرار
```

نقاط النهاية:

| المسار | الوظيفة |
| --- | --- |
| `GET /health` | حالة الخدمة (مفتوحة دائمًا للأوركستريتور) |
| `GET /ready` | إحصائيات الدلوات: عدد المفاتيح، المسموح، المرفوض، المسح |
| `POST /v1/rate/check` | `{key, windowMs, max}` → `{allowed, count, remaining, retryAfterSecs}` |
| `POST /v1/rate/reset` | `{key}` أو `{all:true}` → تصفير (للإدارة والاختبارات) |

الخوارزمية **نفسها** تمامًا اللي في `src/server/security.ts`: نافذة انزلاقية
(مصفوفة طوابع زمنية لكل مفتاح)، مدخل أقدم من النافذة بيتهمّش عند كل قراءة،
وطلب مرفوض **لا يُسجَّل** في العدّاد — وقيمة `RetryAfterSecs` =
`ceil(windowMs/1000)` زي ما البوابة بتبعت `Retry-After` بالظبط. الفرق الوحيد
إضافة سقف صلب للذاكرة (`RATELIMIT_MAX_KEYS`، افتراضي 100,000) ومسح دوري كل
`RATELIMIT_SWEEP_MS` (افتراضي 5 ثواني) عشان رشّ المسارات الفريدة ما يستهلكش
الذاكرة.

**الأمان:** لو `RATELIMIT_SERVICE_TOKEN` مضبوط، كل `/v1/*` بيتطلب
`X-Internal-Token: <token>` أو `Authorization: Bearer <token>`، و`/health`
و`/ready` بيفضلوا مفتوحين (بيستخدمهم الـ healthcheck).

بالـ Docker:

```bash
docker compose up -d ratelimit
```

**السلامة:** لو `RATELIMIT_SERVICE_URL` غير مضبوط، أو الخدمة وقفت/بطأت/تجاوزت
مهلة `RATELIMIT_SERVICE_TIMEOUT_MS`/ردت بشكل غلط، بيتمّ تطبيق نفس السقف
بنافذة الذاكرة المدمجة في `src/server/security.ts` — يعني الطلب **لا يُرفض
لأن الخدمة وقعت**، والرسالة والترويسات والتزم واحد. المعروف والمقصود:
خلال انقطاع الخدمة العدّاد المحلي هو اللي بيستقبل الطلبات، وعند رجوعها الدلو
المشترك يكمّل من عدّاده هو (الفرق محدود بمدة الانقطاع).

التوجيه من البوابة (يعمل في الوضعين):

```bash
node scripts/run-tests.mjs --only rate-limit
```

الدليل: `go vet` ✅ · `go test ./...` ✅ · السلسلة البعيدة 11/11 ✅ ·
بعد قتل الخدمة 7/7 ✅ (نفس العقد من الـ native limiter).

---

## 12) تطبيق Android (Kotlin)

**المجال:** تطبيقات Android · **اللغة:** Kotlin · **المجلد:** `apps/android`

حسب [خريطة لغات المنصة](/languages) مجال تطبيقات Android لغته **Kotlin**، فبقينا
بعمل تطبيق فعلي على نفس الـ API (مش نسخة تانية من المنطق).

### البنية — موديولين

* **`core/`** — مكتبة Kotlin/JVM **خالصة** (من غير أي أندرويد): موديلات السلك،
  عميل `HttpClient` (Ktor + kotlinx.serialization)، منطق التنبيهات، وواجهة التخزين.
  **كل قرار بيتعمل هنا**، وبيتختبر على أي جهاز فيه JDK — من غير emulator.
* **`app/`** — القشرة: الشاشات (ViewBinding)، الإشعارات، WorkManager، SharedPreferences.

### البناء والاختبار

```bash
npm run android:test        # :core:test — 40 اختبارًا أوفلاين (JDK 17+ بس)
npm run android:apk         # + بناء app-debug.apk (محتاج Android SDK: android-34)
```

CI فيه job منفصل اسمه `android` بيشغّل نفس الاتنين.

### الربط بالمنصة

التطبيق **عميل** → مفيش خدمة جديدة تتقنّن، ومفيش سطر في `.env.example` ولا خدمة
في `docker-compose` (مخالفة **مقصودة** ومتسجّلة في `REBUILD_PLAN.md` §4). بيتكلم
HTTP مع نفس البوابة، بنفس الـ session token بتاع الويب
`Authorization: Bearer <token>`:

| الطلب | المسار |
| --- | --- |
| تسجيل دخول | `POST /api/v1/auth/login` |
| هوية المستخدم | `GET /api/v1/auth/me` |
| المفاتيح | `GET /api/v1/api-keys` · `POST /api/v1/api-keys` · `DELETE /api/v1/api-keys/:id` |
| الاستخدام | `GET /api/v1/api-keys/usage-analytics?period=24h\|7d\|30d` |

### التشغيل

```bash
npm run dev                                  # البوابة على :3000
cd apps/android && ./gradlew :app:installDebug
# أو افتح apps/android في Android Studio وشغّل ▶
```

* **العنوان الافتراضي** `http://10.0.2.2:3000` (زاوية المحاكي للكومبيوتر)،
  وقابل للتغيير من شاشة **الإعدادات**.
* **الأمان:** ملف `network_security_config.xml` بيسمح بـ cleartext **بس** على
  `10.0.2.2` و`localhost` — أي عنوان نشر لازم يكون `https`.
* **الإشعارات** محلّية (WorkManager كل 6 ساعة) وبتطلب إذن `POST_NOTIFICATIONS`
  أول مرة تفعّلها من الإعدادات (أندرويد 13+). حدّ الحصة الافتراضي 80%.
* **النشر:** مفيش حاجة ترفعها — الـ APK تتعمل محليًا وتنزل على الجهاز
  (`adb install app/build/outputs/apk/debug/app-debug.apk`).

---

## 13) تطبيق iPhone (Swift)

**المجال:** تطبيقات iOS · **اللغة:** Swift · **المجلد:** `apps/ios`

حسب [خريطة لغات المنصة](/languages) مجال تطبيقات iPhone لغته **Swift** — نفس
وظائف تطبيق أندرويد بالظبط، ونفس عقد الـ API، بس منفّذة بـ SwiftUI.

### البنية — حزمة + قشرة

* **`Sources/VanitasCore/`** — حزمة **SwiftPM** مالهاش أي SwiftUI فيها:
  موديلات `Codable` مطابقة لـ `src/types.ts`، عميل `async/await` خلف بروتوكول
  `HTTPTransport`، منطق التنبيهات، وواجهة التخزين. **كل قرار بيتعمل هنا**
  وبيتجوّز بـ `swift test` على أي نظام (ماك/لينكس/ويندوز) — من غير Xcode.
* **`Vanitas/`** — قشرة SwiftUI: الشاشات، الإشعارات المحلية،
  `UserDefaults`، وملف `Info.plist`.
* **`Vanitas.xcodeproj/`** — مشروع مكتوب باليد (objectVersion 56) + scheme
  مشترك، عشان البناء يتقدّر في CI من غير ما حد يفتح Xcode.

### البناء والاختبار

```bash
npm run ios:check       # فحص بنائي من غير ماك (شجرة صياغة + عقد + مشروع Xcode)
cd apps/ios && swift test   # 42 اختبارًا أوفلاين (محتاج Swift toolchain)
xcodebuild -project apps/ios/Vanitas.xcodeproj -scheme Vanitas \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO
```

CI فيه job منفصل اسمه `ios` على `macos-latest` بيشغّل الثلاثة — فالتحقق المحلي
بيوصل للـ compile الفعلي حتى على جهاز ويندوز.

### الربط بالمنصة

التطبيق **عميل** → مفيش خدمة جديدة تتقنّن، ومفيش سطر في `.env.example` ولا
خدمة في `docker-compose` (مخالفة **مقصودة** ومتسجّلة زي المرحلة 4 في
`REBUILD_PLAN.md`). بيتكلم HTTP مع نفس البوابة، بنفس الـ session token بتاع
الويب `Authorization: Bearer <token>` — ونفس المسارات المذكورة في §12 حرفيًا
(بما فيها `POST /auth/logout` و`POST /api-keys/:id/rotate`).

### التشغيل

```bash
npm run dev                    # البوابة على :3000
open apps/ios/Vanitas.xcodeproj  # ثم ⌘R
```

* **العنوان الافتراضي** `http://localhost:3000` (المحاكي بيصل للمضيف
  من خلال `localhost`)، وقابل للتغيير من شاشة **الإعدادات**.
* **الأمان (ATS):** `Info.plist` بيسمح بـ cleartext **بس** على `localhost`
  (`NSExceptionDomains` + `NSAllowsLocalNetworking`) و`NSAllowsArbitraryLoads`
  مقفول صراحةً — **جهاز حقيقي لازم `https`**.
* **الإشعارات** محلّية، وبيطلب الإذن أول مرة تفعّلها من الإعدادات.
  خلفية: `BGAppRefreshTask` كل 6 ساعات (المعرّف مسجّل في `Info.plist` —
  والاتنين بيتسجلوا في `ios-check.py` عشان ما يختلفوش) + فحص عند العودة
  للواجهة. حدّ الحصة الافتراضي 80%.
* **اللغة:** عربي/إنجليزي حسب لغة الجهاز، من غير ملفات `.lproj`.
* **النشر:** التطبيق عمليًا محتاج شهادة/حساب مدفوع على App Store — يتعمل
  Archive من Xcode. مفيش أيقونة app لسه (`AppIcon.appiconset` فاضي) فلازم
  PNG مقاس 1024 قبل الرفع.

---

## 14) برنامج سطح المكتب (C#)

**المجال:** سطح المكتب · **اللغة:** C# (.NET 10 + WPF) · **المجلد:** `apps/desktop`

حسب [خريطة لغات المنصة](/languages) مجال سطح المكتب لغته **C#** — نفس وظائف
تطبيقات الموبايل بالظبط، ونفس عقد الـ API، بس منفّذة بـ WPF على ويندوز.

### البنية — مكتبة + قشرة

نفس التقسيم اللي في المرحلتين 4 و 5، وده اللي بيخلي الاختبارات تشتغل من غير
نافذة:

* **`Vanitas.Core/`** — مكتبة **من غير أي WPF** فيها: موديلات مطابقة لـ
  `src/types.ts` (`required` يعني الحقل الناقص بيسبّب فشل تحميل بدل ما يرسوم
  فراغ)، عميل `async/await` خلف واجهة `IHttpTransport`، واجهة التخزين، ومنطق
  التنبيهات. **كل قرار بيتعمل هنا** وبيتجوّز بـ `dotnet test` — لا خادم، لا
  نافذة، لا مكتب.
* **`Vanitas.Core.Tests/`** — **46 اختبارًا أوفلاين** ضد `TransportStub`
  المبرمج.
* **`Vanitas.Desktop/`** — قشرة WPF: الشاشات، اختصارات لوحة المفاتيح،
  سجل الطلبات، وتصدير CSV. ملفاتها كلها تُبنى من الكود مباشرة
  (نوافذ الحوار) عشان أي غلط في اسم خاصية يكون **خطأ ترجمة** مش صندوق فاضي
  على الشاشة.

### إضافة خاصة بنسخة C#: `IRequestObserver`

الكلاينت بيبلّغ عن كل طلب **من داخل بتاعه `finally`** — يعني السجل بيسجّل
النجاح والخطأ والطلب اللي ما وصلش لرد، من المصدر الوحيد اللي عارف الحقيقة.
الواجهة في `Vanitas.Core` (من غير أي WPF)، و`RequestLog` في القشرة بيوصّلها
لـ `ObservableCollection` عن طريق الـ `Dispatcher`.

وبما إنها **مُبلِّغ** مش **حارس**: أي exception يطلع منها بيتطفّى —
`VanitasClient.Report` بيلتقطه، عشان واجهة سجلات فيها مشكلة ما توقفش البرنامج.
دي مغطّاة باختبار (`A_broken_observer_cannot_break_the_request`).

### البناء والاختبار

```powershell
npm run desktop:test      # 46 اختبارًا أوفلاين (محتاج .NET SDK 10)
npm run desktop:build     # + بناء قشرة WPF
dotnet run --project apps/desktop/Vanitas.Desktop/Vanitas.Desktop.csproj
```

> **ملاحظة عن التشغيل المحلي:** اختبارات .NET **بتشتغل على ويندوز عادي**،
> بعكس نسخة Swift اللي Smart App Control بيحجب ملفاتها — لأن .NET runtime
> موقّع من مايكروسوفت فالملفات المبنية محليًا بتقبَل.

CI فيه job منفصل اسمه `desktop` على `windows-latest` (WPF ما بتبنيش على لينكس)
بيشغّل `setup-dotnet 10.0.x` وبعدها الاختبارات وبعدها بناء القشرة.

### الربط بالمنصة

البرنامج **عميل** → مفيش خدمة جديدة تتقنّن، ومفيش سطر في `.env.example` ولا
خدمة في `docker-compose` (نفس الاستثناء **المقصود والمتسجّل** في المرحلتين 4
و5). بيتكلم HTTP مع نفس البوابة، بنفس الـ session token بتاع الويب
`Authorization: Bearer <token>` — ونفس المسارات المذكورة في §12 حرفيًا.

### الإعدادات والتخزين

* **العنوان الافتراضي** `http://localhost:3000`، وقابل للتغيير من
  **Settings**.
* **بيتخزّن في** `%APPDATA%\Vanitas\settings.json` (JSON مكتوب بـ
  `WriteIndented`) — نفس فكرة `localStorage` في الويب، والتوكن **مش**
  مشفّر، والمستخدم يقدر يمسكه من أي وقت بزر **Sign out**. الملف بيتكتب بعد
  أي تغيير و`OnExit` كمان، عشان ما يضيعش URL اتغيّر قبل الإغلاق بثانية.
* **الإشعارات** هنا بتشتغل على `UsageEvaluator.EvaluateAndRecord` نفسه —
  يعني اللي بيظهر في شاشة الاستخدام هو بالظبط اللي كان هيتبعت تنبيه عنه،
  وبنافذة تكرار 6 ساعات مطابقة لنسخة Swift.
* **اللغة:** عربي/إنجليزي حسب لغة النظام، من غير `.resx` ولا satellite
  assemblies — `L10n.T(en, ar)` بيتقرّأ في الوقت الحقيقي.
* **التصدير:** زرار **Download CSV** بيكتب UTF-8 بـ BOM (عشان Excel ما
  يحرّفش العربي) وأرقام بـ `CultureInfo.InvariantCulture` (عشان الفاصلة
  العشرية ما تختلفش من جهاز لجهاز).

### الاختصارات

`Ctrl+K` إنشاء مفتاح · `Ctrl+R` تحديث · `Ctrl+U` الاستخدام · `Ctrl+J` السجلات ·
`Ctrl+,` الإعدادات · `Ctrl+Q` إغلاق. القايمة دي موثّقة **جوه البرنامج** من
مصدر واحد `L10n.Shortcuts` قاعد جنب الـ handler اللي بينفّذها.

---

## 15) العقد الذكي (Solidity)

**المجال:** blockchain · **اللغة:** Solidity (Foundry) · **المجلد:** `contracts/`

حسب [خريطة لغات المنصة](/languages) مجال البلوكتشين لغته **Solidity**.
`VanitasCredit` هو **دفتر رصيد المنصة** على السلسلة.

### الفكرة الأساسية: التوقيع خارج السلسلة

كل تغيير في الرصيد (منحة أو خصم) بيتموَّق **مسبقًا** بتوقيع EIP-712 من مفتاح
الـ `operator`، وبعدين **أي حد** يقدر يرسله ويدفع الغاز — المستخدم ما يملكش ETH
وما يدفعش حاجة.

عشان كده `execute()` **غير مشروط بالمرسِل عمدًا**: الـ `msg.sender` مش بيدخل في
التصرّح أصلًا. دي جوهر خاصية «بدون غاز»، ودي كمان السبب إن كل الفحوصات في
`_execute` هي الحاجة الوحيدة بين شخص غريب وبين رصيد حد تاني.

| العملية | مَن يُوقّع؟ | ملاحظة |
|---|---|---|
| `CREDIT` | الـ `operator` | المنصة تضيف رصيدًا |
| `DEBIT` | الـ `operator` | المنصة تستهلك رصيدًا |
| `TRANSFER` | الحساب نفسه | المستخدم ينقل رصيده بمشيئته |

الحقل `op` موجود **جوه** الـ struct المُوقَّع — فلا يمكن إعادة استخدام توقيع
`CREDIT` كـ `DEBIT`، تغييره يُبطل التوقيع تمامًا كتغيير المبلغ.

> **افتراض ثقة موثّق (مش مخبّى):** مفتاح الـ `operator` يقدر يضيف ويخصم من أي
> حساب — ده مفتاح فوترة المنصة. أدِره بـ `setOperator` عند أي اختراق، واستخدم
> `setPaused` كمفتاح إيقاف طارئ.

### صفر اعتماديات خارجية

مفيش OpenZeppelin ولا `lib/` ولا git submodule. EIP-712 و`ecrecover` مكتوبين
إيدويًا جوه العقد:

* `forge build` و`forge test` **ما بياخدوش الشبكة إطلاقًا** (إلا تنزيل `solc`
  مرة واحدة) → الاختبارات أوفلاين، ومفيش `forge install` ولا
  `git submodule update` عند أول نسخ.
* `forge-std` **مستورد فعلًا جوه `lib/`** بـ `forge install --no-git` — ملفات
  عادية في المستودع، مش submodule محتاج خطوة تهيئة.
* كل byte في العقد قابل للتدقيق، وده اللي يهمّ فعلًا في عقد بيمسّ فلوس.

### البنية

```
contracts/
├── foundry.toml         # solc مثبّت على 0.8.30 + إعدادات lint/ fmt
├── src/VanitasCredit.sol# العقد — CREDIT/DEBIT/TRANSFER + admin
├── test/VanitasCredit.t.sol  # 35 اختبارًا أوفلاين على EVM داخلي
├── script/Deploy.s.sol  # سكربت النشر (forge script)
├── lib/forge-std/       # مستورد بـ --no-git (مش submodule)
└── README.md            # دليل عربي (التصميم + النشر + مرجع EIP-712)
```

### البناء والاختبار

```bash
npm run contracts:test    # 35 اختبارًا — محتاج Foundry بس، لا RPC ولا مفاتيح
npm run contracts:build
forge fmt --check         # التنسيق
forge lint                # السكون (لاحظ: بيطلع 0 حتى لو فيه ملاحظات)
forge coverage
```

| المقياس | النتيجة |
|---|---|
| الاختبارات | **35 / 35** |
| تغطية الأسطر (`src/`) | **98.78%** (السطر الناقص واحد **غير قابل للوصول عمدًا** وموضّح) |
| تغطية الدوال | **100%** |
| `forge fmt --check` / `forge lint` | نظيف / صفر ملاحظات |

> **لماذا الـ lint بوابة في CI مش بـ exit code:** `forge lint` بيطلع **0 حتى لو
> فيه ملاحظات**. عشان كده الـ job بيفحص المخرجات — نفس فكرة
> `test -z "$(gofmt -l .)"` في job بتاع Go.

### النشر

```bash
# تجربة جافة — بلا مفتاح بلا شبكة (من جذر المستودع):
forge script contracts/script/Deploy.s.sol

# على Anvil محلي (نفس الصورة اللي في docker-compose):
docker compose up -d anvil
# anvil بيطبع عشر حسابات ممولة ومفاتيحها عند الإقلاع — حطّ الأول في .env
# كـ CREDIT_DEPLOYER_PRIVATE_KEY، وبعدين:
forge script contracts/script/Deploy.s.sol \
    --rpc-url http://127.0.0.1:8545 \
    --private-key "$CREDIT_DEPLOYER_PRIVATE_KEY" --broadcast

# على شبكة حقيقية (نفس الأمر، بس CREDIT_RPC_URL مختلف):
forge script contracts/script/Deploy.s.sol \
    --rpc-url "$CREDIT_RPC_URL" \
    --private-key "$CREDIT_DEPLOYER_PRIVATE_KEY" --broadcast
```

### الربط بالمنصة

المرحلة دي **بتضيف** سطور في `.env.example` وخدمة في `docker-compose` — عكس
المرحلتين 4 و5 و6 (اللي هي عملاء HTTP وما احتجوش):

* **`.env.example`** — أربع متغيّرات: `CREDIT_RPC_URL`،
  `CREDIT_DEPLOYER_PRIVATE_KEY` (بيقبل كمان `PRIVATE_KEY`)، `CREDIT_OPERATOR`،
  و`CREDIT_CONTRACT_ADDRESS`. **ولا واحدة فيهم بيقرأها الخادم** — دي لـ
  `forge script` وللتوكيلات اللي عايز تعيد بناء الـ domain separator. و`forge
  test` ما بيستخدمش أيًّا منها.
* **`docker-compose`** — خدمة `anvil` **اختيارية** (`docker compose up -d anvil`)،
  من غيرها لا حاجة تعمل `up` ولا حاجة تنتظرها. البوابة ما بتتكلّمش مع العقد
  أصلًا.

> لاحظ إن `POSTGRES_PASSWORD` لسه هو الوحيد المطلوب في compose — الـ anvil ما
> بيقراش `.env` ولا بيقفل على أي متغيّر.

### ما الذي أُثبت فعلاً على سلسلة حقيقية؟

الاختبارات الـ 35 شغّالة على EVM داخلي. وفوقها تحقّق يدوي كامل على Anvil
(chain id 31337) بـ `forge script --broadcast` + `cast`:

| الحالة | النتيجة |
|---|---|
| النشر بـ `CREDIT_OPERATOR` مختلف عن المُنشر | `operator()` = العنوان المطلوب ✅ |
| توقيع `CREDIT` بـ `cast wallet sign --data` بعدين إرساله | `status 1`، الرصيد 1000 ✅ |
| المُرسِل دفع الغاز | رصيده ظلّ **0** ✅ |
| التوقيع بالمفتاح **الخطأ** | **مرفوض**، الرصيد بلا تغيير ✅ |
| إعادة إرسال نفس التوقيع | **مرفوضة** — الـ nonce تقدّم ✅ |
| `TRANSFER` وقّعه المستخدم نفسه | 600/400 و`totalSupply` فضل 1000 ✅ |

### CI

job منفصل اسمه `contracts` بيثبّت Foundry **مثبّت على `v1.8.5`** (خطوة إضافية
مش بتغيّر bytecode بس بتمنع مفاجآت في قواعد اللينت)، وبعدها `forge fmt --check`
ثم بوابة اللينت ثم `forge test -vvv` (الـ `-vvv` لأنه أخطاء العقد custom errors
وما تتقريش من غير تتبّع) وأخيرًا تجربة سكربت النشر الجافة. **ولا مفتاح واحد.**
