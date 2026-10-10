# 📱 Vanitas Android — تطبيق أندرويد (Kotlin)

تطبيق رسمي لمنصة **Vanitas**: تسجيل دخول، عرض وإدارة مفاتيح الـ API، متابعة
الاستخدام، وتنبيهات محليّة — متواصل مع نفس الـ API بتاع الويب تمامًا.

> المرحلة 4 من [خطة إعادة البناء متعدد اللغات](../../REBUILD_PLAN.md).

---

## 📦 المتطلبات

| المطلوب | الإصدار | ليه |
| --- | --- | --- |
| JDK | 17+ | AGP 8.5 محتاجه |
| Android SDK | `platforms;android-34` + `build-tools;34.0.0` | للبناء فقط (`:core:test` مش محتاج SDK) |
| Gradle | متضمّن (wrapper 8.9) | **مش محتاج تثبيت Gradle** |

> `npm run android:test` بيشتغل على **JDK لوحده** — مفيش emulator، مفيش سيرفر، مفيش مفاتيح.

---

## 🗂️ البنية

```
apps/android/
├── settings.gradle.kts          # يتضمّن :core و :app
├── gradle/libs.versions.toml    # كل الإصدارات في مكان واحد
├── gradlew / gradlew.bat        # الـ wrapper مرفوع مع المشروع
├── core/                        # ⭐ المكتبة القابلة للاختبار (Kotlin/JVM خالصة)
│   └── src/main/kotlin/com/vanitas/android/core/
│       ├── Models.kt            # موديلات السلك — مطابقة لـ src/types.ts
│       ├── VanitasClient.kt     # عميل Ktor HttpClient (REST + Bearer)
│       ├── ApiError.kt          # Network / Http / Decoding
│       ├── UsageEvaluator.kt    # إمتى ننبّه المستخدم (منطق خالص)
│       └── SessionStore.kt      # واجهة التخزين (بديل InMemory للاختبارات)
│   └── src/test/kotlin/...      # 40 اختبارًا أوفلاين (MockEngine)
└── app/                         # قشرة أندرويد حواليها
    └── src/main/
        ├── AndroidManifest.xml
        ├── kotlin/com/vanitas/android/
        │   ├── VanitasApp.kt        # الحاوية (client واحد لكل serverUrl)
        │   ├── SessionStoreImpl.kt  # SharedPreferences
        │   ├── LoginActivity.kt     # + كود 2FA
        │   ├── MainActivity.kt      # لوحة التحكم /auth/me
        │   ├── KeysActivity.kt      # قائمة · إنشاء · إلغاء
        │   ├── UsageActivity.kt     # 3 فترات + بطاقة لكل مفتاح
        │   ├── SettingsActivity.kt  # الخادم · التنبيهات · حدّ الحصة
        │   ├── UsageCheckWorker.kt  # WorkManager كل 6 ساعات
        │   └── Notifier.kt          # قناة + إذن + إرسال الإشعار
        └── res/                     # layouts · values (EN) · values-ar (AR)
```

**ليه موديولين؟** لأن كل القرارات تتحط في `core` اللي **يتختبر على أي جهاز فيه JDK**،
وقشرة `app` تفضل رقيقة (شاشة + استدعاء). ده نفس نمط باقي مراحل الخطة: منطق مطابق
للمصدر الأصلي + اختبارات تثبت التطابق.

---

## ▶️ التشغيل والاختبار

```bash
# اختبارات Kotlin (أوفلاين — MockEngine، من غير سيرفر)
npm run android:test                 # = node scripts/android-test.mjs  → :core:test

# نفس الاختبارات + بناء APK تجريبي (محتاج Android SDK)
npm run android:apk                  # = … --apk                        → :app:assembleDebug

# من جوه المجلد مباشرة
cd apps/android && ./gradlew :core:test        # لينكس/ماك
cd apps/android && gradlew.bat :core:test      # ويندوز
```

> **ملاحظة exec bit:** الملف `gradlew` بيتسجّل من ويندوز بدون صفة التنفيذ
> (`core.filemode=false`) → على لينكس/ماك استخدم `sh gradlew :core:test` أو
> `npm run android:test` (السكربت بيشغّل الـ wrapper jar نفسه عن طريق `java`،
> فلا يهمّه الـ bit ولا مسافات في مسار المستخدم). بالظبط نفس السطر اللي CI بيشغّله.

**النتيجة على الجهاز الحقيقي:** `BUILD SUCCESSFUL` — **40 اختبارًا / 0 فشل**
(`VanitasClient` 17 · `UsageEvaluator` 17 · `SessionStore` 6)، و`app-debug.apk` ≈ 7.8 MB.

### التشغيل على المحاكي/الجهاز

```bash
npm run dev                     # البوابة على :3000 (على الكومبيوتر)
cd apps/android && ./gradlew :app:installDebug
```

العنوان الافتراضي `http://10.0.2.2:3000` (زاوية المحاكي للكومبيوتر)، وقابل
لتغييره من **الإعدادات**. الـ cleartext مسموح بس لـ `10.0.2.2`/`localhost` —
أي عنوان تاني لازم HTTPS (ملف `res/xml/network_security_config.xml`).

---

## 🔌 العقد مع الـ API

نفس الـ **session token** بتاع الويب، بنفس الترويسة `Authorization: Bearer <token>`:

| الاستخدام | المسار | بيرجّع |
| --- | --- | --- |
| تسجيل دخول | `POST /api/v1/auth/login` | `{ token, user, permissions }` |
| هوية المستخدم | `GET /api/v1/auth/me` | `{ user, permissions }` |
| قائمة المفاتيح | `GET /api/v1/api-keys` | `{ keys, allScopes }` |
| إنشاء مفتاح | `POST /api/v1/api-keys` | `{ key, rawSecret, revealNote }` |
| تدوير مفتاح | `POST /api/v1/api-keys/:id/rotate` | `{ key, rawSecret, … }` |
| إلغاء مفتاح | `DELETE /api/v1/api-keys/:id` | `{ success, key }` |
| الاستخدام | `GET /api/v1/api-keys/usage-analytics?period=24h\|7d\|30d` | `ApiKeyUsageResponse` |
| خروج | `POST /api/v1/auth/logout` | best-effort |

**ملاحظات مهمة:**

- `rawSecret` بيتعرض **مرة واحدة بس** في نافذة الإنشاء/التدوير — التطبيق ما بيخزّنهش.
- الأرقام بتتقري زي ما `src/server/db.ts` بيبعتها: `successRate` و`quotaUsedPercent`
  و`percentage` كلها **من 0 لـ 100** (مش أجزاء من 1).
- أي حقل جديد في السيرفر **بيتجاهل** (`ignoreUnknownKeys = true`)، وأي حقل ناقص
  **بياخد default** → التطبيق ما يوقعش.

---

## 🔔 منطق التنبيهات

`UsageEvaluator` في `:core` (يُختبر بشكل مستقل) — شغّال على أي تقرير استخدام:

| النوع | الشرط |
| --- | --- |
| `QUOTA` | `quotaUsedPercent ≥ حدّك` (بيشتغل حتى لو مفيش طلبات) |
| `ERRORS` | `totalRequests ≥ 20` **و** `errorCount/totalRequests ≥ 10%` |
| `THROTTLED` | `totalRequests ≥ 20` **و** `throttledRequests/totalRequests ≥ 10%` |

* **الحدّ قابل للتغيير** من الإعدادات (50%–100%).
* **ضد التكرار:** مفتاح `kind:keyId:نافذة` — نفس التنبيه ما بيظهرش تاني داخل
  نفس النافذة (6 ساعات)، وبعد النافذة ممكن يرجع. تغيير الحدّ في الإعدادات بيمسح
  السجل كله.
* **العامل** (`UsageCheckWorker`) بيشتغل كل 6 ساعات **لو مفيش توكن أو التنبيهات
  مقفولة يوقف نفسه**، وأي رفض (401) بيوقفه بدل إعادة المحاولة للأبد.

---

## 🧪 الاختبارات

كلها في `core/src/test` وتشتغل **أوفلاين** (.payloads مكتوبة، ساعة مثبّتة، مفيش network):

| الملف | بيثبت |
| --- | --- |
| `VanitasClientTest` (17) | المسارات/ال verbs/الترويسات · قراءة JSON · إخفاء الحقول الجديدة · الأخطاء المصنّفة (شبكة/HTTP/فك ترميز) · 2FA · ترميز الـ path |
| `UsageEvaluatorTest` (17) | الشروط الأربعة · ضجيج الطلبات القليلة · الترتيب الثابت · الـ dedupe داخل/خارج النافذة · الحدود غير الصالحة |
| `SessionStoreTest` (6) | الافتراضيات · مسح الجلسة · تقييد سجل التنبيهات (≤500) |

```bash
npm run android:test
```

**ليش مش جزء من `run-tests.mjs`؟** لأن ده runner بيشرّع `dist/server.cjs` وبياخد
Node بس، وGradle محتاج JDK → شغّال كـ job منفصل في CI (`android`) زي باقي الخدمات.

---

## ⚠️ حدود معروفة

* المظهر **XML + ViewBinding** (مش Jetpack Compose) — أخف تحميلًا وأثبت تشغيلًا،
  والمنطق كله أصلًا في `:core`.
* مفيش سجل استخدام تفصيلي/رسم بياني (الويب بيغطّيه) — التطبيق بيعرض المجاميع والبطاقات.
* `rotate` متاح في العميل لكن مش متعرّض في الواجهة لحد دلوقتي.
* إشعارات محلّية فقط (مش FCM) — مفيش سيرفر إشعارات في المنصة.
