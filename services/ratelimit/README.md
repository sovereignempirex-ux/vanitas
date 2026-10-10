# خدمة حدود الاستخدام — Vanitas Rate Limit Service

**المجال:** برمجة الخوادم · **اللغة:** Go (مكتبة قياسية فقط) · **المنفذ:** `8300`

حسب [خريطة لغات المنصة](/languages) مجال الخوادم بيسمح بـ
TypeScript/Python/**Go**/Java — وفصل حدود الاستخدام لخدمة Go مش زينة شكلية:
البوابة (TypeScript) بتشتغل بعدة نسخ خلف load balancer وكل نسخة بتحفظ عدّادها
في ذاكرة عمليتها، يعني السقف المسموح بيتحوّل لعدد النسخ × السقف الأصلي. الخدمة دي
بتدي **دلو واحد مشترك** لكل النسخ، والبوابة بتستدعيها بـ HTTP **ولو مش
شغالة/بطيئة بترجع تستخدم النافذة المحلية المدمجة** — نفس العقد، مفيش كسر.

## الوظائف

| الملف | الوظيفة |
| --- | --- |
| `limiter.go` | النافذة الانزلاقية: مصفوفة طوابع زمنية لكل مفتاح + مسح دوري + سقف ذاكرة (evict الأقل نشاطًا) + عدّادات |
| `main.go` | واجهة HTTP بمكتبة `net/http` فقط (صحة/جاهزية/تحقق/تصفير + مصادقة `X-Internal-Token` + إيقاف نظيف) |
| `limiter_test.go` · `main_test.go` | اختبارات أوفلاين: الحدود، انزلاق النافذة، التزامن، التحقق من المدخلات، المصادقة |
| `Dockerfile` | `golang:1.27-alpine` ← ثنائي ثابت (CGO مطفأ) في صورة alpine |

## نقاط النهاية

```
GET  /health            # {"status":"ok","service":"vanitas-ratelimit","language":"go"}
GET  /ready             # {engine, keys, maxKeys, allowed, denied, sweeps, uptimeSec}
POST /v1/rate/check     # {key, windowMs, max} → {allowed, count, remaining, retryAfterSecs, ...}
POST /v1/rate/reset     # {key} | {all:true} → {cleared}
```

**الخوارزمية مطابقة حرفيًا** لـ `src/server/security.ts`:

- نافذة انزلاقية (مصفوفة طوابع لكل مفتاح، الأقدم من `windowMs` يتهمّش مع كل قراءة) — مش نافذة ثابتة.
- الطلب المرفوض **لا يُسجَّل** (الـ TS بيرجع قبل `push`)، فالعدّاد ما يتزحلقش لحاله.
- `retryAfterSecs = ceil(windowMs / 1000)` — نفس قيمة `Retry-After` اللي بتطلع من البوابة.
- كل "مفتاح limiter" (`namespace`) لوحده: نفس مفتاح الـ TS `ip:l<ns>[:path]` أو `ip:*:l<ns>` لـ `perIpOnly`.
- الفارق الوحيد: سقف ذاكرة صلب (`RATELIMIT_MAX_KEYS`، افتراضي 100,000) ومسح دوري كل
  `RATELIMIT_SWEEP_MS` (افتراضي 5,000ms) — الـ TS بيمسح كل 1000 طلب. الاتنين بيعملوا نفس الشغل.

**الأمان:** لو `RATELIMIT_SERVICE_TOKEN` مضبوط، لازم `X-Internal-Token: <token>`
أو `Authorization: Bearer <token>` على `/v1/*` (بيترجع 401 غير كده)، و`/health`
و`/ready` بيفضلوا مفتوحين عشان الـ healthcheck. بدون الـ token الخدمة مفتوحة
(وضع التطوير المحلي).

## التشغيل

```bash
cd services/ratelimit
go run .                    # على 0.0.0.0:8300
go test ./...               # اختباراتها (أوفلاين، بدون أي مكتبة خارجية)
```

من جذر المشروع:

```bash
npm run ratelimit:service   # تشغيل الخدمة على :8300
npm run ratelimit:test      # تشغيل اختباراتها
```

ربطها بالمنصة في `.env`:

```dotenv
RATELIMIT_SERVICE_URL=http://127.0.0.1:8300
RATELIMIT_SERVICE_TOKEN=        # اختياري (X-Internal-Token)
RATELIMIT_SERVICE_TIMEOUT_MS=300
```

أو بـ Docker:

```bash
docker compose up -d ratelimit
```

المتغيرات اللي بتتحكم في الخدمة نفسها:

| المتغير | الافتراضي | الوظيفة |
| --- | --- | --- |
| `RATELIMIT_HOST` | `0.0.0.0` | العنوان |
| `RATELIMIT_PORT` | `8300` | المنفذ |
| `RATELIMIT_SWEEP_MS` | `5000` | فترة مسح الدلوات الفارغة |
| `RATELIMIT_MAX_KEYS` | `100000` | أقصى عدد دلوات في الذاكرة |
| `RATELIMIT_SERVICE_TOKEN` | فاضي | سر داخلي مشترك |

## السلامة (Fallback)

لو `RATELIMIT_SERVICE_URL` غير مضبوط، أو الخدمة **وقفت/بطأت/تجاوزت المهلة/ردت
بشكل غلط**، الكود في `src/server/rateLimitRemote.ts` بيرجّع `null` و`rateLimit()`
في `src/server/security.ts` بيستخدم النافذة المحلية المدمجة — نفس الترويسة، نفس
الرسالة (`Too many requests. Slow down and retry.`)، نفس السقف. **الخدمة
ما بتوقّفش الطلب.**

ال traded-off المقصود أثناء انقطاع الخدمة: الطلبات بتتسجّل في العدّاد المحلي،
وعند رجوع الخدمة الدلو المشترك يكمّل من عدّاده هو — يعني الفرق محدود بمدة
الانقطاع بس (وأكيد ما يزيدش السقف المسموح).

## الاختبارات

```bash
go vet ./...                # فحص ثابت
go test ./...               # وحدات + HTTP (gofmt -l لازم يكون فاضي)
node scripts/run-tests.mjs --only rate-limit   # عبر المنصة، في الوضعين
```

**ملاحظة مهمة على الدلو المشترك:** بما إنه مقصود إنو يتقاسم بين كل نسخ
البوابة (وبين كل حالات التشغيل)، فهو **بيفضل فاضيًا بس لو محدش استخدمه**.
`scripts/run-tests.mjs` بيدي كل suite سيرفر جديد، فبيضيف خطوة بنفس المعنى:
بيبعت `POST /v1/rate/reset {all:true}` لـ Go قبل كل suite — وإلا الدلوات الساخنة
من الـ suite اللي فاتت (أكيد `/api/v1/comments/` و `/api/v1/auth/`) هتفرمل الـ
suite اللي بعدها بـ 429 على طول. من غير `RATELIMIT_SERVICE_URL` الخطوة دي
بتصير no-op.

الدليل من المرحلة 3: `gofmt`/`go vet` ✅ · `go test` ✅ (19 testًا) ·
الحزمة كاملة في **ثلاث وضعيات**: بدون متغيّر **9/9** ✅ · مع Go شغالة
**9/9** (والسلسلة 13/13) ✅ · مع Go مقفولة والمتغيّر محدّد **9/9** ✅.
