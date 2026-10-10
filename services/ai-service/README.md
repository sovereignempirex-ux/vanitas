# Vanitas AI Service (Python)

خدمة الذكاء الاصطناعي لمنصة فانيتاس — **هذا هو القسم الوحيد في المشروع اللي كانت لغته غلط**.
حسب خريطة اللغات، الـ AI/ML لازم يكون **Python**، فبقينا بنشغّله كخدمة منفصلة والـ gateway
بالتايب سكريبت بيستدعيها عبر HTTP.

```
React (TypeScript) ──► Express gateway (TypeScript) ──► AI Service (Python/FastAPI)
                                                            │
                                              Ollama ► Gemini ► Pollinations ► Local KB
```

## المخرجات (Endpoints)

| Method | Path | الوظيفة |
| --- | --- | --- |
| GET | `/health` | فحص حياة الخدمة |
| GET | `/ready` | حالة المزوّدين + آخر خطأ صادر |
| POST | `/v1/ai/chat` | إجابة كاملة (نفس سلسلة المزوّدين القديمة) |
| POST | `/v1/ai/chat/stream` | إجابة متدفقة عبر SSE (`delta` ثم `done`) |
| POST | `/v1/ai/diagnose` | تشخيص الكود (Gemini → Pollinations → المحلل المحلي) |
| POST | `/v1/ai/semantic-search` | بحث دلالي في موارد المنصة |
| GET | `/v1/ai/youtube?q=&limit=` | بحث يوتيوب حقيقي (API أو بدون مفتاح) |
| GET | `/v1/ai/personas` | قوائم الـ persona/tones المتاحة |

## التشغيل

```bash
cd services/ai-service
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt      # ويندوز
.venv/bin/pip install -r requirements.txt                    # لينكس/ماك
.venv/Scripts/uvicorn app.main:app --port 8100               # ويندوز
.venv/bin/uvicorn app.main:app --port 8100                   # لينكس/ماك
```

من جذر المشروع (بعد تثبيت المتطلبات مرة واحدة):

```bash
npm run ai:service     # تشغيل الخدمة على :8100
npm run ai:test        # تشغيل اختباراتها
```

أو عبر Docker:

```bash
docker build -t vanitas-ai services/ai-service
docker run -p 8100:8100 --env-file .env vanitas-ai
```

## ربطها بـ Vanitas

في ملف `.env`:

```dotenv
AI_SERVICE_URL=http://127.0.0.1:8100
# اختياري: لو محتاج تمنع أي حد ي calling الخدمة مباشرة
AI_SERVICE_TOKEN=some-long-random-string
```

- **من غير `AI_SERVICE_URL`**: الـ gateway بيستخدم سلسلة TypeScript القديمة زي ما هي — مفيش أي تغيير في السلوك.
- **مع `AI_SERVICE_URL`**: كل استدعاء بيروح للخدمة Python الأول؛ لو الخدمة مرجعتش أو فشلت،
  بيتم الـ fallback تلقائيًا للسلسلة القديمة. يعني **مفيش خطر لو الخدمة وقفت**.

## متغيرات البيئة

| المتغير | الوصف | الافتراضي |
| --- | --- | --- |
| `GEMINI_API_KEY` | مفتاح Gemini (اختياري) | — |
| `AI_PROVIDER` | `ollama` أو `pollinations` أو فارغ | — |
| `OLLAMA_BASE_URL` / `OLLAMA_MODEL` | عنوان Ollama المحلي | — |
| `POLLINATIONS_TOKEN` | يقلل نافذة الـ rate limit من 15s إلى 5s | — |
| `POLLINATIONS_MODEL` | قوائم الموديلات بفواصل | `openai,openai-fast` |
| `YOUTUBE_API_KEY` | بحث يوتيوب الرسمي (اختياري) | — |
| `AI_SERVICE_TOKEN` | حماية الـ endpoints الداخلية | — |
| `AI_SERVICE_PORT` | بورت الخدمة | `8100` |
| `AI_SERVICE_BUDGET_MS` | ميزانية الطلب الواحد | `26000` |

## الاختبارات

```bash
cd services/ai-service
.venv/Scripts/pytest -q      # ويندوز
.venv/bin/pytest -q          # لينكس/ماك
```

الاختبارات **أوفلاين بالكامل** — مفيش أي نداء شبكة: المزوّدين بيتـ mock والسلسلة بتتاختبر
بما فيها قاعدة المعرفة المحلية وقائمة الكسر (circuit breakers).

## بنية المشروع

```
services/ai-service/
├── app/
│   ├── main.py              # FastAPI + الـ routes
│   ├── chain.py             # سلسلة المزوّدين (Ollama → Gemini → Pollinations → Local)
│   ├── prompts.py           # personas + tones + حقائق المنصة + project mode
│   ├── config.py            # قراءة إعدادات البيئة
│   ├── semantic.py          # البحث الدلالي
│   ├── youtube.py           # بحث يوتيوب حقيقي
│   ├── providers/           # ollama / gemini / pollinations / local_kb
│   └── diagnosis/           # خدمة التشخيص + المحلل الساكن المحلي
├── tests/
├── requirements.txt
├── Dockerfile
└── README.md
```
