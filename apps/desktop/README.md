# 🪟 Vanitas سطح المكتب — برنامج Windows (C# + WPF)

## 🎯 الغرض

هذا هو **نطاق سطح المكتب** في خريطة اللغات، مبنيًا بـ **C#** على .NET 10 و WPF —
نفس الـ API، نفس المنطق، واجهة تشتغل على ويندوز.

الفكرة نفسها اللي في باقي المنصّات: **نطاقين منفصلين**.

| المشروع | فيه إيه | بيتشغّل إزاي |
|---|---|---|
| `Vanitas.Core` | الموديلات، الكلاينت، التخزين، منطق التنبيهات | `dotnet test` — من غير أي واجهة |
| `Vanitas.Desktop` | نوافذ WPF، اختصارات لوحة المفاتيح، سجل الطلبات، تصدير CSV | `dotnet build` |

`Vanitas.Core` ما فيهش أي ارتباط بـ WPF، عشان كده الاختبارات بتشتغل **أوفلاين
وبلا نافذة** — لا خادم، لا مكتب، لا ساعة خاصة بيها.

---

## 🗂️ بنية المجلدات

```
apps/desktop/
├── Directory.Build.props          إعدادات مشتركة (C# 14، nullable، التحذيرات أخطاء)
├── Vanitas.Desktop.slnx           حلّ المشروع (يُنشئه dotnet 10)
├── README.md
│
├── Vanitas.Core/                  ← النطاق المنطقي (UI-free)
│   ├── Models.cs                  موديلات الـ wire — 1:1 مع src/types.ts
│   ├── VanitasError.cs            network / http / decoding + isAuthFailure
│   ├── IHttpTransport + HttpClientTransport   الخياطة اللي الاختبارات تستبدلها
│   ├── IRequestObserver.cs        مخرجات السجل: الكلاينت هو اللي بيبلّغ
│   ├── VanitasClient.cs           7 endpoints، Bearer، query مرتّب
│   ├── SessionStore.cs            الواجهة + InMemorySessionStore
│   └── UsageEvaluator.cs          قواعد التنبيه (QUOTA / ERRORS / THROTTLED)
│
├── Vanitas.Core.Tests/            ← 46 اختبار، أوفلاين
│   ├── TransportStub.cs           TransportStub + ObserverStub + الـ fixtures
│   ├── VanitasClientTests.cs      العقد، الفشل، الـ observer
│   ├── UsageEvaluatorTests.cs     العتبات، التكرار، نافذة الـ 6 ساعات
│   └── SessionStoreTests.cs       الافتراضيات، السقف 500، مسح الجلسة
│
└── Vanitas.Desktop/               ← القشرة (WPF)
    ├── App.xaml(.cs)              الموارد المشتركة + معالج الأخطاء غير المتوقعة
    ├── AppEnvironment.cs          نقطة التركيب الوحيدة (store + transport + log)
    ├── PreferencesStore.cs        ISessionStore محفوظ في %APPDATA% كـ JSON
    ├── L10n.cs                    عربي/إنجليزي في الوقت الحقيقي
    ├── RequestLog.cs              سجل الطلبات (بحد أقصى 500 سطر)
    ├── CsvExport.cs               تصدير الاستخدام CSV
    ├── MainWindow.xaml(.cs)       الهيكل + اختصارات لوحة المفاتيح
    └── Views/
        ├── LoginView              الدخول (+ رمز الـ 2FA لما يطلبه الخادم)
        ├── KeysView               مفاتيح الـ API: إنشاء / تدوير / إلغاء
        ├── CreateKeyWindow        نموذج الإنشاء بالصلاحيات
        ├── RevealWindow           السرّ اللي بيتكرّر مرة واحدة
        ├── UsageView              الأرقام + التنبيهات + تنزيل CSV
        ├── LogsView               سجل الطلبات
        └── SettingsView           الخادم، العتبات، اختصارات الكيبورد
```

---

## ▶️ التشغيل والاختبارات

> **الاختبارات بتشتغل محليًا على ويندوز** (وده الفرق عن نسخة Swift، اللي
> Smart App Control بيحجب ملفاتها): .NET runtime موقّع من مايكروسوفت، فالملفات
> المبنية محليًا بتتنفّذ عادي.

### 1) الاختبارات — مفيش أي اعتماديات خارجية

```powershell
npm run desktop:test
# أو مباشرة:
node scripts/desktop-test.mjs
```

> ```
> Passed!  - Failed: 0, Passed: 46, Skipped: 0, Total: 46
> ```

### 2) الاختبارات + بناء نافذة البرنامج

```powershell
npm run desktop:build
# أو:
node scripts/desktop-test.mjs --app
```

### 3) تشغيل البرنامج نفسه

```powershell
dotnet run --project apps/desktop/Vanitas.Desktop/Vanitas.Desktop.csproj
```

> يحتاج **Windows** فقط (WPF ما بيشتغلش على لينكس/ماك). لو محتاج تطبيق
> كروس-بلاتفورم، شوف بديل **Avalonia** المذكور في `REBUILD_PLAN.md` — المنطق
> كله في `Vanitas.Core` هيوصّل للمشروع زي ما هو، واللي هيتغيّر هو القشرة بس.

### ‎npm scripts

```powershell
npm run desktop:test     # dotnet test  (النطاق المنطقي، أوفلاين)
npm run desktop:build    # + dotnet build  (قشرة WPF)
```

---

## 🔌 الاتصال بـ API

نفس الـ gateway اللي بيستخدمه الويب والموبايل — **مفيش أي endpoint جديد**:

| الده | الـ endpoint |
|---|---|
| تسجيل الدخول | `POST /api/v1/auth/login` |
| بياناتي | `GET  /api/v1/auth/me` |
| الخروج | `POST /api/v1/auth/logout` |
| قائمة المفاتيح | `GET  /api/v1/api-keys` |
| إنشاء مفتاح | `POST /api/v1/api-keys` |
| تدوير مفتاح | `POST /api/v1/api-keys/{id}/rotate` |
| إلغاء مفتاح | `DELETE /api/v1/api-keys/{id}` |
| الاستخدام | `GET  /api/v1/api-keys/usage-analytics?period=24h` |

- **العنوان الافتراضي:** `http://localhost:3000` — قابل للتغيير من
  **Settings** وبيتخزّن في `%APPDATA%\Vanitas\settings.json`.
- **المصادقة:** `Authorization: Bearer <token>` — نفس توكن الويب بالظبط.
- **مفيش سطر في `.env.example` ولا خدمة في `docker-compose.yml`**: البرنامج
  ده **عميل HTTP** زي تطبيق iOS و Android، مش خدمة بتنزل. (نفس الاستثناء
  المدوّن في المرحلتين 4 و 5.)

---

## ⌨️ الاختصارات

| المفتاح | العمل |
|---|---|
| `Ctrl+K` | إنشاء مفتاح API جديد |
| `Ctrl+R` | تحديث الشاشة الحالية |
| `Ctrl+U` | فتح شاشة الاستخدام |
| `Ctrl+J` | فتح سجل الطلبات |
| `Ctrl+,` | فتح الإعدادات |
| `Ctrl+Q` | إغلاق البرنامج |
| `Esc` | إلغاء المفتوح (عبر `IsCancel` في النوافذ) |

القائمة دي **موثقة داخل البرنامج نفسه** (شاشة Settings) ومن مصدر واحد —
`L10n.Shortcuts` — اللي قاعد جنب الـ key handler اللي بينفّذها، عشان ما
يقدرّوش يتبعدوا عن بعض.

---

## 🧪 الاختبارات (46)

كلها **تشتغل أوفلاين** ضد `TransportStub` — مفيش مكتب، مفيش خادم، مفيش ساعة
حقيقية:

| الملف | العدد | بيثبت إيه |
|---|---|---|
| `VanitasClientTests` | 22 | العقد: الـ 7 endpoints، ترميز المسارات، الفشل بـ `VanitasError`، وسلوك الـ `IRequestObserver` |
| `UsageEvaluatorTests` | 17 | العتبات المضبوطة (تُصلَّح مش تُرفض)، نافذة التكرار 6 ساعات، الترتيب الثابت |
| `SessionStoreTests` | 7 | الافتراضيات، سقف 500، إن مسح الجلسة بيمسح التنبيهات وبيسيب عنوان الخادم |

نقطتان تستحقّان الذكر لأنهم اتكتشفوا أول ما الكود اتبنى:

1. **`JsonException` كان بيهرب من الكلاينت.** ردّ 2xx بـ JSON مش مقروء كان
   بيطلع استثناء `System.Text.Json` بدل `VanitasError.Decoding` — يعني أي
   شاشة كانت هتسقط. اتصلح بـ `Decode<T>` المغلّف، ومعاه اختبار.
2. **اختبار `Missing_name_falls_back_to_prefix` في نسخة Swift ما كانش
   هينجح أبدًا** (الـ fixture الافتراضي ما بيرفعش تنبيه، فـ `alerts.first`
   كانت `nil`). اكتشفه النقل لـ C#، واتصلح في الاتنين.

---

## 🔄 التوافق مع باقي المنصّات

`Vanitas.Core` نقل **1:1** لـ `Sources/VanitasCore` (Swift) و
`core/` (Kotlin) — نفس الملفات الخمسة، نفس التسميات تقريبًا، نفس العقد:

| C# | Swift | Kotlin |
|---|---|---|
| `Models.cs` | `Models.swift` | `Models.kt` |
| `VanitasError` | `enum VanitasError` | `sealed class ApiError` |
| `IHttpTransport` | `protocol HTTPTransport` | `interface HttpTransport` |
| `VanitasClient` | `VanitasClient` | `VanitasClient` |
| `ISessionStore` | `protocol SessionStore` | `interface SessionStore` |
| `UsageEvaluator` | `UsageEvaluator` | `UsageEvaluator` |

فروق مقصودة مسجّلة:

- **`AlertThresholds`** — هنا بيُصلَّح في **الـ constructor** (ف مستحيل تتبني
  نسخة خارج النطاق)، زي Swift. نسخة Kotlin بترفض بالـ `require` بدل كده.
- **`IRequestObserver`** — ده **إضافة جديدة في نسخة C#**: الكلاينت بيبلّغ من
  داخل `finally` بتاعه، عشان السجل يفضل كامل حتى لو الطلب ما وصلش لرد. بقية
  المنصّات بتسجّل من القشرة.
- **`PathEncode`** بيستخدم `Uri.EscapeDataString` وهي أشدّ ترميزًا من نسخة
  Swift (اللي بتسيب الـ sub-delims) — آمن لأن الـ ids قطع غير معرّفة، والنتيجة
  متطابقة على كل المنصّات للاختبارات اللي بتتمرّن عليها (`a/b` → `a%2Fb`).

---

## 📌 ملاحظات

- **مفيش أي ملف `.env` ولا خدمة compose جديدة** — راجع الاستثناء فوق.
- **`bin/` و `obj/`** متجاهَلين في `.gitignore` (مخرجات بناء بيتعاود إنشاؤها).
- **الحل `.slnx`** — الصيغة الجديدة الافتراضية في .NET 10؛
  `scripts/desktop-test.mjs` بيقبل `.sln` القديمة كمان لو SDK أقدم.
- **CI:** وظيفة `desktop` على `windows-latest` في
  `.github/workflows/ci.yml` — `setup-dotnet` 10.0.x، وبعدها الاختبارات
  وبعدها بناء القشرة.
