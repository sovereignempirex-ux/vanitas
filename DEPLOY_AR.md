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
   - `AI_PROVIDER=ollama` أو اترك Gemini فارغاً
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
