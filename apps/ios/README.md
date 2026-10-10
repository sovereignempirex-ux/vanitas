# 📱 Vanitas iOS — تطبيق iPhone (Swift + SwiftUI)

> المرحلة 5 من خطة إعادة البناء: كل مجال بلغته الصح.
> نفس وظائف تطبيق أندرويد بالظبط، ونفس عقد الـ API بتاع الويب — بس منفّذة بـ
> **Swift / SwiftUI** لأن ده الـ stack الصحيح لمنصة iOS.

---

## 📦 المتطلبات

| | |
|---|---|
| **للاختبارات** | أي جهاز عليه `swift` (5.9+) — **macOS أو Linux أو Windows** |
| **لبناء التطبيق** | macOS + Xcode 15+ (بيستخدم `IPHONEOS_DEPLOYMENT_TARGET = 16.0`) |
| **البوابة شغالة** | `npm run dev` على `http://localhost:3000` |

ملاحظة مهمة: **الاختبارات مالهاش علاقة بـ Xcode** — دي حزمة SwiftPM عادية
بتشتغل بأمر `swift test` على أي نظام، والـ app نفسه قشرة SwiftUI فوق نفس
المنطق.

---

## 🗂️ البنية

```
apps/ios/
├── Package.swift                 # حزمة SwiftPM: VanitasCore + 42 اختبار
├── Sources/VanitasCore/          # ⚙️ المنطق الخالص — من غير أي SwiftUI
│   ├── Models.swift              #    عقد السلك (مطابق لـ src/types.ts)
│   ├── ApiError.swift            #    VanitasError: network / http / decoding
│   ├── VanitasClient.swift       #    عميل async/await + HTTPTransport للحقن
│   ├── SessionStore.swift        #    بروتوكول التخزين + تنفيذ في الذاكرة
│   └── UsageEvaluator.swift      #    قرارات التنبيهات + dedupe على نافذة
├── Tests/VanitasCoreTests/       # 🧪 42 اختبار أوفلاين (مفيش سيرفر/شبكة)
│   ├── TransportStub.swift       #    نقل مُبرمَج + مولّدات الـ fixtures
│   ├── VanitasClientTests.swift  #    18
│   ├── UsageEvaluatorTests.swift #    17
│   └── SessionStoreTests.swift   #     7
├── Vanitas.xcodeproj/            # 🛠️ مشروع Xcode مكتوب باليد + scheme مشترك
└── Vanitas/                      # 📲 قشرة SwiftUI
    ├── VanitasApp.swift          #    @main + AppDelegate (BGTask كل 6 ساعات)
    ├── AppEnvironment.swift      #    مصدر الحقيقة الوحيد للواجهة
    ├── PreferencesStore.swift    #    SessionStore على UserDefaults
    ├── Notifier.swift            #    إشعارات محلية عبر UNUserNotificationCenter
    ├── L10n.swift                #    نصوص EN/AR في وقت التشغيل
    ├── Info.plist                #    ATS + معرّف مهمة الخلفية
    ├── Assets.xcassets/          #    لون مميّز + مكان الأيقونة
    └── Views/                    #    Root · Login · Dashboard · Keys · Usage · Settings
```

**الفصل ده مش تحسين شكل — ده اللي بيخلّي الاختبار تشتغل على Windows:**
كل قرار (العقد، العميل، التنبيهات، التخزين) في `VanitasCore` مالوش أي علاقة
بـ SwiftUI، فبيتجمّع ويتجوّز بـ `swift test` من غير ما يتفعّل أي كود واجهة
أصلًا — عشان كده الشاشات مش داخلة في الحزمة.

---

## ▶️ التشغيل والاختبار

```bash
# 1) اختبارات المنطق — أوفلاين بالكامل، من غير سيرفر ولا مفاتيح
cd apps/ios
swift test
#   Executed 42 tests, with 0 failures

# 2) فحص محلي من غير macOS (شجرة الصياغة + عقد + مشروع Xcode)
python scripts/ios-check.py

# 3) بناء التطبيق (على ماك فقط)
xcodebuild -project Vanitas.xcodeproj -scheme Vanitas \
  -destination 'generic/platform=iOS Simulator' build CODE_SIGNING_ALLOWED=NO

# 4) من جوه Xcode
open apps/ios/Vanitas.xcodeproj    # اضغط ⌘R
```

### 🪟 على Windows

`swift test` بيشتغل فعلاً — بس تنصيب الـ winget (`Swift.Toolchain`) بيقسّم الـ
toolchain على تلات مجلدات (`Toolchains/` + `Runtimes/` + `Platforms/`) من غير ما
يجمّعهم على الـ PATH، فلازم تجهّز البيئة بنفسك:

1. **Visual Studio** (أو Build Tools) — عشان `cl.exe` و`link.exe`. لازم
   `VsDevCmd.bat` يتحمّل الأول، غير كده SwiftPM بيخرج فورًا بـ
   ``could not find CLI tool `link` ``.
2. **Windows SDK** — بتدّي UCRT (`stdlib.h`, `stdio.h`, `corecrt.h`). مش
   متنصّبة افتراضيًا، ومن غيرها الـ compiler بيقول `'stdlib.h' file not found`.
3. **`SDKROOT`** يشاور على
   `...\Windows.platform\Developer\SDKs\Windows.sdk` — ده اللي بيخلي `swiftc`
   يلاقي الـ stdlib. جربت `SWIFT_SDK` و`SWIFT_SDK_ROOT` و`SWIFT_PLATFORM_SDK_ROOT`:
   **`SDKROOT`** لوحده هو الشغّال.
4. **`Runtimes\6.4.0\usr\bin`** على الـ PATH — فيها `swiftCore.dll` و
   `Foundation.dll` (ملفات الـ runtime مش في مجلد الـ toolchain).

بالأربع دول بيظهر `Build complete!` فعلًا — الـ 21 مصدر + الـ 6 views + الـ 42
اختبار يتبنيوا ويربطوا.

> ⚠️ **بس التشغيل (execution)** ممكن يتمنع لو **Smart App Control** مفعّل:
> الملف المبني محليًا عمره ما يبقى عنده "reputation"، فالنظام يرفض تشغيل ملف
> الاختبار برسالة `An Application Control policy has blocked this file`.
> مسار MSVC `lib.exe` مكان `llvm-lib.exe` بحل مشكلة البناء، لكن التشغيل نفسه
> مرفوض — فالأمانة: **البناء محليًا + التشغيل على macOS في job `ios`**.

> 🧹 بعد أول `swift test`، `scripts/ios-check.py` بيتجنّب `.build/` (مضاف لـ
> `.gitignore`) لأن SwiftPM بيكتب جوّاه ملفات `.swift` مولّدة
> (`DerivedSources/test_entry_point.swift`).

### 🔧 npm scripts

```bash
npm run ios:check    # الفحص المحلي من غير macOS
```

---

## 🔌 العقد مع الـ API

نفس المسارات ونفس `Authorization: Bearer` بتاع الويب بالحرف:

| العملية | المسار |
|---|---|
| دخول (بريد + كلمة مرور + 2FA اختياري) | `POST /api/v1/auth/login` |
| جلب المستخدم الحالي | `GET  /api/v1/auth/me` |
| خروج (فاشل؟ العرض مش هيستنى) | `POST /api/v1/auth/logout` |
| قائمة المفاتيح | `GET  /api/v1/api-keys` |
| إنشاء مفتاح | `POST /api/v1/api-keys` |
| تدوير سرّ | `POST /api/v1/api-keys/:id/rotate` |
| إلغاء مفتاح | `DELETE /api/v1/api-keys/:id` |
| نافذة الاستخدام | `GET  /api/v1/api-keys/usage-analytics?period=…` |

- **الأرقام** بتتقري زي ما `db.ts` بيبعتها: `successRate` و`quotaUsedPercent`
  من 0 لـ 100، و`JSONDecoder` بيقبل عدد صحيح في حقل `Double`.
- **حقول جديدة:** `Codable` في Swift بيتخطّى الحقول المجهولة تلقائيًا، يعني
  السيرفر يقدر يزوّد حقل قبل ما التطبيق يتحدّث من غير ما يكسر.
- **ملاحظة مقصودة:** مفيش `secretHash` في الموديلات — ده سرّ الداخلي ما
  بينبعتش أبدًا للعميل.

---

## 🔔 منطق التنبيهات

`UsageEvaluator` هو **وحده** اللي بيقرّر، نفس قواعد أندرويد حرفيًا:

- حصة شهرية ≥ الحدّ المضبوط في الإعدادات (افتراضي 80%) — **من غير شرط
  عدد الطلبات** (الحصة ممكن تتفنى بحركة الشاشة ما شافتهاش).
- نسبة الأخطاء ≥ 10% بعد ما يكون فيه ≥ 20 طلب (قلّة الطلبات ضجيج مش إشارة).
- نسبة 429 ≥ 10% بعد ≥ 20 طلب.
- مفاتيح `dedupe` = `KIND:keyId:window` حيث `window = nowMs / 6h` — يعني
  **مفيش تكرار جوه النافذة، وبعد 6 ساعات نفس المشكلة تقدر تتعاد**.
- القيم خارج المدى بتتقصّ (`AlertThresholds`) مش بتتسجّل — عكس تطبيق
  أندرويد اللي بيحرّسها بـ `require`، والفرق ده **موثّق ومقصود**.

التنفيذ بيشتغل مرتين: مرة من الواجهة (`scenePhase == .active`) ومرة من
`BGAppRefreshTask` كل 6 ساعات — والاتنين بيمرّوا على نفس `evaluateAndRecord`.

---

## 🧪 الاختبارات

42 اختبار، كلها أوفلاين ومحسوبة على ساعة ثابتة:

| الملف | العدد | بيثبت إيه |
|---|---|---|
| `VanitasClientTests` | 18 | بناء المسارات وتشفير الـ path · ترويسة `Bearer` بتتحط وبتتشال · 2FA بيتعرّف على `401` ومعاه `twoFactorRequired` · رسالة الخطأ بتوصلك زي ما هي · شبكة مقطوعة = `.network` (مش sign-out) · JSON غلط = `.decoding` باسم المسار · `logout` مش بيمنع الخروج |
| `UsageEvaluatorTests` | 17 | الحدّ بالضبط · تحت الحدّ صامت · التقسيم على صفر مينفّر · شرط 20 طلب · استقرار الـ dedupe · نافذة جديدة ترجّع التنبيه · تقصّ القيم |
| `SessionStoreTests` | 7 | الافتراضي `http://localhost:3000` · مفيش حاجة "اتشافت" قبل ما تتعال · الخروج يمسح التوكن **والتاريخ** · التواريخ محدودة بـ 500 |

الاختبارات **مبنيّة على فكّ ترميز JSON جاهز** مش على تهيئة الموديلات مباشرة —
يعني لو عقد السلك اتغيّر، الاختبار هو أول حاجة يقع.

---

## ⚠️ حدود معروفة

1. **التشفير (ATS):** `Info.plist` بيسمح بـ `http` على `localhost` بس
   (`NSExceptionDomains` + `NSAllowsLocalNetworking`)، و`NSAllowsArbitraryLoads`
   **مقفول صراحةً**. جهاز حقيقي لازم HTTPS — لو حطيت IP الشبكة هيتمنع
   ويظهرلك خطأ شبكة.
2. **مفيش أيقونة app:** `AppIcon.appiconset` فاضي (محتاج PNG مقاس 1024).
   البناء بيعدي من غيرها، والـ App Store هو اللي هيطلبها.
3. **مفيش user `@MainActor` على `AppEnvironment`:** الكلاس نفسه مش معزول
   (عشان يتبني من أي مكان)، لكن **كل داله بتعمل write على `@Published`
   متعلّقة بـ `@MainActor`** — وده مقصود ومكتوب في تعليقات الكود.
4. **نص عربي/إنجليزي في وقت التشغيل** (`L10n.t(en, ar)`) بدل ملفات
   `.lproj`: المشروع بيتعمل بـ `project.pbxproj` مكتوب باليد، وكل ملف
   مترجم زيادة = مكان تاني ممكن يغلط.

---

## 📚 تشغيله مع البوابة

```bash
# terminal 1
npm run dev                 # البوابة على :3000

# terminal 2
cd apps/ios && swift test   # منطق خالص — مالوش علاقة بالبوابة
```

تطبيق iOS **عميل HTTP** زي أندرويد: مفيش process جديد يتقنّن، ومفيش سطر
في `.env.example` ولا خدمة في `docker-compose` (مخالفة مقصودة ومسجّلة في
`REBUILD_PLAN.md`).
