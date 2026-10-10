# خدمة تحليل البيانات — Vanitas Analytics Service

**المجال:** تحليل البيانات · **اللغة:** Python (+ R اختياري) · **المنفذ:** `8200`

حسب [خريطة لغات المنصة](/languages) مجال تحليل البيانات بيكون بـ Python/R،
فدوّرنا نموذج الشبكة الـ microservice نفسه اللي استخدمناه لخدمة الـ AI:
**البوابة (TypeScript) بتستدعي الخدمة بـ HTTP، ولو الخدمة مش شغالة بترجع تستخدم
المحرك المحلي المدمج** — نفس الأرقام، مفيش كسر.

## الوظائف

| الملف | الوظيفة |
| --- | --- |
| `app/metrics.py` | التحليل الكامل: p50/p90/p95/p99، تجزئة UTC لساعات/أيام، حالات الحالة (2xx..5xx)، 429 كـ *تَقييد* مش خطأ، مقارنة بالفترة السابقة، شذوذ z-score ≥ 2.5، SLO، وخلاصات عربية |
| `app/report.py` | تقرير Markdown عربي + ملفات CSV (سلسلة زمنية / ترتيب المسارات) |
| `app/charts.py` | رسوم SVG **بدون أي مكتبة** (bar/line للسلسلة الزمنية + ترتيب أفقي) |
| `app/rbridge.py` | انحدار خطي + متوسط متحرك + شذوذ: بـ **R** لو موجودة، وإلا بمحرك Python بنفس النتائج |
| `stats/trend.R` | سكربت R (base R فقط — صفر حزم CRAN) بيقرأ CSV ويكتب `key=value` |
| `app/main.py` | واجهة FastAPI |

## نقاط النهاية

```
GET  /health                    # {"status":"ok","service":"vanitas-analytics"}
GET  /ready                     # {"r":"available"|"python_fallback", ...}
GET  /v1/analytics/meta         # الفترات والوحدات المدعومة
POST /v1/analytics/analyze      # {events[], period, nowMs?} → تحليل كامل
POST /v1/analytics/report       # → {markdown, timeseriesCsv, endpointsCsv, analysis}
POST /v1/analytics/trend        # → اتجاهات (محرك R أو Python)
POST /v1/analytics/chart        # → {"svg": "..."}  (chart: timeseries|endpoints)
POST /v1/analytics/chart.svg    # → image/svg+xml خام
```

حدّ الأحداث في الطلب الواحد `ANALYTICS_MAX_EVENTS` (افتراضي 50,000)؛ أي تجاوز
بيتقص من الأحدث بدل ما يُرجَع خطأ، عشان تضخّم الطلبات ما يوقّفش التحليل.

**الأمان:** لو `ANALYTICS_SERVICE_TOKEN` مضبوط، كل `/v1/analytics/*` بيتطلب
`X-Internal-Token: <token>` أو `Authorization: Bearer <token>`، ما عدا
`/health` و`/ready` و`/meta` (بيستخدمها الأوركستريتور). بدون متغير الـ token
الخدمة مفتوحة (وضع التطوير المحلي).

## التشغيل

```bash
cd services/analytics
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # ويندوز
.venv/bin/pip install -r requirements.txt                 # لينكس/ماك
.venv/Scripts/uvicorn app.main:app --port 8200            # ويندوز
.venv/bin/uvicorn app.main:app --port 8200                # لينكس/ماك
```

من جذر المشروع:

```bash
npm run analytics:service     # تشغيل الخدمة على :8200
npm run analytics:test        # تشغيل اختباراتها
```

ربطها بالمنصة في `.env`:

```dotenv
ANALYTICS_SERVICE_URL=http://127.0.0.1:8200
ANALYTICS_SERVICE_TOKEN=        # اختياري (X-Internal-Token)
ANALYTICS_SERVICE_TIMEOUT_MS=10000
```

أو بـ Docker:

```bash
docker compose build --build-arg WITH_R=1 analytics   # مع R
docker compose up -d analytics
```

## الاختبارات

```bash
cd services/analytics && pytest -q      # 51 اختبار، أوفلاين، 0.3 ثانية
```

- **ساعة مثبّتة:** كل الاختبارات بتحسب على `2026-10-04T23:20Z` عشان تكون
  حتمية 100%.
- **مفيش شبكة ولا R:** مفيش نداء خارجي خالص، والمحرك R بيتمّ اختباره بـ
  محاكاة توفّره + قارئ مخرجاته.
- **اختبارات المنصة:** `node scripts/run-tests.mjs --only analytics` (بيشغّل
  المنصة وبيطلب `/api/v1/analytics/*` فعليًا).

## التوازي مع محرك TypeScript

`src/server/analyticsNative.ts` هو نسخة الـ fallback، و لازم يطلعوا **نفس
الأرقام بالظبط**. للتحقق (مع الخدمة شغالة):

```bash
npx tsx scripts/_analytics-parity.ts
```

بينقارن حوالي 50 حقل (نسب، أشرطة زمنية، تجميعات، شذوذ، التقرير والـ CSV)
وبيفشل لو في أي اختلاف. قواعد التوحيد المُتّبعة: تقريب نصف-قيمة (half-up) مش
banker's، تنسيق الأعداد زي `String(n)` في JavaScript (`898` مش `898.0`)،
والحقول غير المطبقة بتطلع `null` مش مفقودة.

## متغيرات البيئة

| المتغير | الافتراضي | الوظيفة |
| --- | --- | --- |
| `ANALYTICS_SERVICE_HOST` | `0.0.0.0` | العنوان |
| `ANALYTICS_SERVICE_PORT` | `8200` | المنفذ |
| `ANALYTICS_SERVICE_TOKEN` | — | مفتاح `X-Internal-Token` |
| `ANALYTICS_SERVICE_TIMEOUT_MS` | — | (من جهة العميل) مهلة كل طلب |
| `ANALYTICS_MAX_EVENTS` | `50000` | حد أحداث التحليل الواحد |
| `ANALYTICS_SERVICE_DOCS` | `true` | تفعيل `/docs` |
| `RSCRIPT_PATH` | `Rscript` | مسار ثنائي R (اختياري) |
