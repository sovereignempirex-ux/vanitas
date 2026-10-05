# تقرير تدقيق الأمان وجودة الكود — واجهة Vanitas (Frontend)

**التاريخ:** 2026-10-05
**النطاق المُدقَّق:** `src/App.tsx`، `src/main.tsx`، `src/types.ts`، `src/components/**`، `src/pages/**`، `src/context/AuthContext.tsx`، `src/lib/**`، `src/data/assets.ts`، `index.html` (واجهة أمامية فقط).
**مرجع مُقابَل (ليس ضمن التقييم):** `src/server/**` استُخدم فقط للتحقق من أن الخادم يفرض الصلاحيات فعلاً.
**منهجية:** قراءة كاملة لكل ملفات النطاق، بحث ثابت عن أغراض حقن HTML/JavaScript والسرّيات، تتبّع دورة حياة الأحداث والطلبات غير المتزامنة، وفحص الوصولية وحالات الخطأ.

---

## 1. ملخص تنفيذي

| الخطورة | العدد | أبرز المواضع |
|---|---|---|
| 🔴 Critical | **0** | لا توجد فجوة حرجة مُثبتة (لا XSS، لا سرّيات ثابتة) |
| 🟠 High | **3** | تصدير CSV معطّل، تبويب اقتراحات يستدعي مسار admin، أخطاء سجلات التدقيق تُبتلع |
| 🟡 Medium | **15** | ثقة زائدة بالـ localStorage، تتبّع admin من الواجهة فقط، ⌘K معطّل، سباقات طلبات، بيانات وهمية |
| 🔵 Low | **11** | أرقام أسطر ضخمة، كود ميت، إغلاق مؤقّتات، إمكانية الوصول، مفاتيح React |

**خلاصة:** لا توجد ثغرة XSS قابلة للاستغلال — لا يوجد `dangerouslySetInnerHTML` أو `innerHTML` أو `eval` في أي ملف أمامي، والمُخطَّط (Markdown) يبني عناصر React يدوياً. المشاكل الحقيقية تتركز في **ثلاث فئات**: (1) ميزات كسرت فعلياً في الاستخدام اليومي (تصدير CSV، تبويب الاقتراحات، ⌘K)، (2) **اعتماد كامل على الواجهة في تمييز صلاحيات admin** (الخادم يفرضها — تأكَّدنا — لكن الواجهة تعرض وصولات وادّعاءات كاذبة)، (3) **جودة**: مكوّنات بحجم 1000–1700 سطر، كود ميت، حالات خطأ صامتة، وبيانات وهمية مقدَّمة كتيليمتري حيّة.

---

## 2. النتائج عالية الخطورة (High)

### H-01 — زر «Export CSV» في سجلات التدقيق معطّل دائماً (يُعيد 401/403)

**الخطورة:** 🟠 High (وظيفة أمنية مكسورة بالكامل)
**الملفات:**
- `src/components/views/AuditLogsView.tsx:113-122`
- `src/lib/apiClient.ts:394-396` (بالمقارنة مع `apiClient.ts:72-85`)

**المقتطف:**
```tsx
// AuditLogsView.tsx
<a
  href={api.getAdminLogsExportUrl()}
  download
  className="flex items-center gap-2 rounded-xl bg-blue-600/20 border border-blue-500/30 px-4 py-2.5 text-xs font-semibold text-blue-300 hover:bg-blue-600/30 transition-all"
>
  <Download className="h-4 w-4" />
  <span>Export CSV</span>
</a>
```
```ts
// apiClient.ts:394
getAdminLogsExportUrl() {
  return `${this.baseUrl}/admin/logs/export`;
}
```

**لماذا هو مشكلة:**
المصادقة في هذا التطبيق **حصريًا عبر ترويسة `Authorization: Bearer`** ولا توجد مصادقة بالكوكيز إطلاقاً (بحث في `src/server/**` عن `cookie` = لا نتائج)، والخادم يقرأ الترويسة فقط:
```ts
// src/server/security.ts:158-159
const auth = req.headers.authorization || '';
const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
```
كل نداءات `api.request()` تضيف الترويسة يدوياً (`apiClient.ts:79-80`)، لكن التنقّل بـ `<a download>` **طلب متصفّح لا يمكنه إرسال ترويسات**، فلا يصل التوكن → الخادم يرفض. النتيجة: النقر على «Export CSV» لا يصدّر شيئاً؛ المستخدم يرى صفحة JSON خطأ أو تنزيلًا فارغًا، دون أي رسالة من الواجهة.

**التصحيح المقترح:**
```tsx
const handleExport = async () => {
  setExporting(true);
  try {
    const blob = await api.exportAdminLogsCsv(); // fetch + Authorization → res.blob()
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'audit-logs.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30_000); // نمط موجود مسبقاً في apiClient.ts:680
  } catch (e) { setError(...); } finally { setExporting(false); }
};
```
بديل: إرجاع رابط موقّع قصير الصلاحية من الخادم صالح لهذا الـ endpoint تحديداً.

---

### H-02 — تبويب «Suggestions» في المساعد الذكي يستدعي مسار admin-only → فارغ دائماً للمستخدم العادي، ويحذف اقتراحات المستخدم بعد إرسالها

**الخطورة:** 🟠 High (ميزة مخصّصة للمستخدمين معطّلة، والخطأ مبتلع)
**الملفات:**
- `src/components/views/AiAssistantView.tsx:414-418`، `:501`، `:426`
- `src/lib/apiClient.ts:614-620`

**المقتطف:**
```tsx
// AiAssistantView.tsx:414
const loadSuggestions = async () => {
  setSuggestionsLoading(true);
  try { setSuggestions((await api.getAdminSuggestions()).suggestions); } catch { setSuggestions([]); }
  finally { setSuggestionsLoading(false); }
};

// AiAssistantView.tsx:501 — زر التبويب
onClick={() => { setActiveTab('suggestions'); loadSuggestions(); }}
```
```ts
// apiClient.ts:618
async getAdminSuggestions() {
  return this.request<{ suggestions: ProductSuggestion[] }>('/admin/suggestions');
}
```

**لماذا هو مشكلة:**
1. المسار `/admin/suggestions` مُصرَّح عليه أنه **ADMIN فقط** (`src/server/aiService.ts:445` يسرد المسار ضمن قائمة مسارات الـ admin).
2. لا يوجد أي `GET /suggestions` عام — الموجود هو `POST /suggestions` فقط (`apiClient.ts:614-615`).
3. لذلك كل مستخدم عادي يفتح التبويب → `403` → `catch { setSuggestions([]) }` → **الخطأ مبتلع تماماً** والواجهة تعرض «لا توجد اقتراحات» (لا تمييز بين «لا بيانات» و«ممنوع عليك»).
4. الأسوأ: `submitSuggestion()` بعد نجاح الإرسال يستدعي `loadSuggestions()` (`AiAssistantView.tsx:426`) → يمسح القائمة ويستبدلها بـ `[]`، فيظن المستخدم أن اقتراحه اختفى.

**التصحيح المقترح:** إضافة `GET /api/v1/suggestions` عام (يُرجع اقتراحات المستخدم الحالي + المُعتمَدة)، أو على الأقل:
```tsx
catch (err: any) {
  setSuggestionsError(err?.status === 403
    ? 'القائمة متاحة للمسؤولين فقط — تم إرسال اقتراحك بنجاح.'
    : err.message);
}
```

---

### H-03 — أخطاء جلب سجلات التدقيق تُبتلع ولا تُعرض أبداً → يظهر «لا توجد سجلات» بدل الخطأ

**الخطورة:** 🟠 High (تصوّر خاطئ لبيانات أمنية: الفشل يُقدَّم كـ «لا أحداث»)
**الملف:** `src/components/views/AuditLogsView.tsx:28`، `:40-58`، `:203-208`

**المقتطف:**
```tsx
const [error, setError] = useState<string | null>(null);   // سطر 28

const fetchLogs = async () => {
  try { ... } catch (err: any) {
    setError(err.message || 'Failed fetching audit logs'); // سطر 54 — يُضَبط ولا يُعرَض أبداً
  } finally { setLoading(false); }
};
```
```tsx
// سطر 203 — ما يراه المستخدم عند الفشل
) : logs.length === 0 ? (
  <td colSpan={8} className="py-12 text-center text-xs text-slate-500 font-sans">
    No matching audit records found for selected filters.
  </td>
)
```

**لماذا هو مشكلة:**
بحث في الملف عن `error` (بحساسية الأحرف) لا يُرجع **سطراً واحداً** سوى تعريف الحالة في السطر 28 — أي أن المتغيّر يُكتب ولا يُقرأ أبداً (حالة ميتة). عند أي فشل (403، انقطاع شبكة، تحديد معدّل) تبقى `logs = []` فتعرض الجدول «لم يتم العثور على سجلات مطابقة»، وهو نص يوحي بأن **الأحداث الأمنية لم تحدث**، وهذا أخطر من عرض رسالة خطأ في شاشة تدقيق.

**التصحيح المقترح:**
```tsx
{error && !loading && (
  <tr><td colSpan={8} className="py-10 text-center">
    <AlertTriangle className="mx-auto mb-2 h-5 w-5 text-rose-400" />
    Failed to load audit logs: {error}
    <button onClick={fetchLogs} className="ml-3 underline">Retry</button>
  </td></tr>
)}
```

---

## 3. النتائج المتوسطة (Medium)

### M-01 — الدور (role) والمستخدم يُزرَعان من `localStorage` → الثقة بالعميل قبل تحقّق الخادم

**الخطورة:** 🟡 Medium (الخادم هو مصدر الحقيقة ويمنع الطلبات؛ المشكلة نافذة ثقة وواجهة كاذبة)
**الملف:** `src/context/AuthContext.tsx:53-66`

```tsx
const [user, setUser] = useState<User | null>(() => {
  try {
    const saved = localStorage.getItem('vanitas_active_user');
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return null;
});

const [role, setRoleState] = useState<UserRole>(() => {
  // Least privilege by default. Server is source of truth for ADMIN.
  return user ? user.role : 'USER';
});
```

**المشكلة:** أي شخص يحرّر `vanitas_active_user` في المتصفّح ليصبح `{"role":"ADMIN"}` يفتح **كل** شاشات الـ admin (Sidebar يُفكّ القفل، `AdminCenterView` يعرض كامل الواجهة، `AuditLogsView` يعرض الجدول) حتى يعود `/auth/me` ويصحّح القيمة — أي نافذة تعرض بيانات وادّعاءات كاذبة. لا توجد بيانات سرّية تُكشف (الخادم يرفض)، لكن الواجهة تُظهر امتيازات غير موجودة وربما تُسبّب ومضة بصرية.

**التصحيح المقترح:** عدم قراءة `role` من `localStorage` إطلاقاً — ابدأ بـ `'USER'` و `user = null`، ودع `authLoading` يحجب الشاشة (هذا المنطق موجود فعلاً في `App.tsx:121-128`)؛ احفظ `vanitas_active_user` للعرض التجميلي فقط دون اشتقاق `role` منه.

---

### M-02 — الإجراءات الإدارية محكومة من الواجهة فقط (Client-side gating)

**الخطورة:** 🟡 Medium — **ملاحظة مهمة:** تم التحقق أن الخادم يفرض `requireAdmin` على `/admin/*`، لذا لا ثغرة خادم هنا؛ المشكلة أن الواجهة تعتمد على فحص `role !== 'ADMIN'` فقط وتروي نصوصاً غير صادقة.

**(أ) لا يوجد فحص دور في مسار العرض** — `src/App.tsx:68-103`:
```tsx
const renderActiveView = () => {
  switch (activeView) {
    ...
    case 'admin-center':
    case 'admin-permissions':
    case 'admin-flags':
    case 'admin-emergency':
    case 'admin-moderation':
      return <AdminCenterView />;
    case 'admin-logs':
      return <AuditLogsView />;
```
لا شرط `role` إطلاقاً؛ كل شاشة تمنع نفسها داخلياً.

**(ب) أزرار الـ admin قابلة للنقر وهي «مقفلة»** — `src/components/Sidebar.tsx:176-188`:
```tsx
const isForbidden = role !== 'ADMIN';
return (
  <button
    key={item.id}
    onClick={() => handleSelect(item.id)}     // يعمل دائماً — القفل للتنسيق فقط
    className={`... ${isForbidden ? 'text-slate-600 hover:bg-rose-500/5 ...' : '...'}`}
```
النقر ينقل المستخدم العادي إلى `admin-emergency` (يظهر ثم شاشة 403)، أي سلوك مضطرب ومدخل غير منطقي.

**(ج) نصوص 403 تدّعي رفض الخادم دون أن يكون ذلك صحيحاً** — `src/components/views/AdminCenterView.tsx:313-319`:
```tsx
<h2 ...>403 Forbidden: Admin Privileges Required</h2>
<p ...>The Vanitas Central API has rejected this view because your current token context does not hold the
  <code ...>admin.users</code> or <code ...>admin.emergency</code> scopes.</p>
```
في الواقع **لم يُرسل أي طلب** — الرسم حدث محلياً بسبب `if (role !== 'ADMIN')` (سطر 307) قبل أي نداء شبكة. النص نفسه يتناقض مع السطر 318: *«Roles are decided by the server, never by the client»*.

**الإجراءات الإدارية المُصرَّح عنها من الواجهة فقط** (كلها خلف `if (role !== 'ADMIN') return <403/>` في `AdminCenterView.tsx:307`):

| الإجراء | الدالة | السطر |
|---|---|---|
| تغيير دور مستخدم (رفع إلى ADMIN) | `handleRoleChange` | `AdminCenterView.tsx:170-179` |
| منح/سحب شارة التوثيق | `handleVerificationChange` | `:181-193` |
| إنشاء رابط دعوة ADMIN | `handleCreateInvite` | `:195-211` |
| إبطال رابط دعوة | `handleRevokeInvite` | `:213-229` |
| حذف مستخدم نهائياً | `handleDeleteUser` | `:231-241` |
| تبديل Feature Flag | `handleToggleFlag` | `:243-252` |
| إجراء طوارئ / killswitch | `handleEmergencyAction` | `:254-270` |
| حذف تعليق | `handleDeleteComment` | `:272-282` |
| تغيير حالة اقتراح + إصلاح AI | `handleSuggestionStatus` / `handleAiFix` | `:284-304` |
| تصدير سجلات التدقيق | رابط `Export CSV` | `AuditLogsView.tsx:114-121` |

**التصحيح المقترح:**
1. تعطيل الأزرار فعلياً عند `isForbidden` (`disabled` + `aria-disabled` + `tabIndex={-1}`) بدل تغيير الألوان فقط.
2. إصلاح نص 403 ليكون صادقاً: «لم يتم فتح هذه الشاشة في الواجهة لأن حسابك ليس ADMIN — الخادم يفرض ذلك أيضاً على كل `/admin/*`».
3. (اختياري) فحص دور مركزي في `renderActiveView` لتفادي تكرار المنع في كل شاشة.

---

### M-03 — اختصار ⌘K معطّل: المُعالج لا يغلق أكثر ممّا يفتح

**الخطورة:** 🟡 Medium
**الملف:** `src/components/CommandPalette.tsx:50-62` (وهو **مُعالج `keydown` وحيد** في `src/` كله)

```tsx
const handleKeyDown = (e: KeyboardEvent) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    if (isOpen) onClose();     // يغلق فقط — لا يوجد فرع يفتح
  }
  if (e.key === 'Escape' && isOpen) {
    onClose();
  }
};
window.addEventListener('keydown', handleKeyDown);
```
بينما الواجهة تُعلن الاختصار صراحةً — `src/components/Header.tsx:98-100`:
```tsx
<kbd className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-slate-400 group-hover:text-white">
  ⌘K
</kbd>
```
و`Header` يستقبل `onOpenCommandPalette` (`App.tsx:141`) لكن لا شيء يستدعيه عند الضغط على ⌘K/Ctrl+K. بحث في `src/` عن `addEventListener('keydown'` = نتائج واحدة.

**التصحيح المقترح:**
```tsx
// في App.tsx: تمرير onOpen إلى CommandPalette، ثم في CommandPalette:
if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
  e.preventDefault();
  isOpen ? onClose() : onOpen();
}
```

---

### M-04 — أزرار الفلترة (Scope Pills) في لوحة الأوامر لا تفعل شيئاً + كود ميت

**الخطورة:** 🟡 Medium
**الملف:** `src/components/CommandPalette.tsx:44`، `:47`، `:129-133`، `:211-231`، `:140-157`

```tsx
// سطر 47 — الحالة تُحدَّث عند النقر
const [activeFilter, setActiveFilter] = useState<'all' | 'commands' | 'semantic' | 'docs' | 'keys' | 'downloads' | 'database'>('all');

// سطر 129 — لكن التصفية تعتمد على search فقط
const filteredCommands = baseCommands.filter(
  (c) =>
    c.label.toLowerCase().includes(search.toLowerCase()) ||
    c.category.toLowerCase().includes(search.toLowerCase())
);
```

**المشكلة:**
- أزرار `keys` / `docs` / `downloads` / `database` (السطور 215-218) **لا تُقرأ في أي مكان** — تغيّر لونها فقط دون أي أثر على النتائج.
- `activeFilter` يُستخدم فعلياً في موضعين فقط (`:268` و`:331`) لإخفاء كتل كاملة، وهو سلوك غير متوقّع من مستخدم يضغط «Docs» ليختفي قسم الأوامر.
- حالة ميتة أخرى: `const [semanticMode, setSemanticMode] = useState(true);` (سطر 44) — تُعلَّن ولا تُقرأ أبداً.
- `getCategoryIcon` (السطور 140-157) تطابق حالاتها على `'api_keys'`, `'documentation'`… وهي فئات نتائج البحث الدلالي، لكن أيقونات الأوامر تمرّر عبر `cmd.icon` — والنتيجة أن أيقونات نتائج `hits` تقع دائماً في `default: return Sparkles`.

**التصحيح المقترح:** إما حذف الأزرار غير العاملة و`semanticMode`، أو ربطها فعلياً:
```tsx
const filteredCommands = baseCommands.filter((c) => {
  const bySearch = (c.label + c.category).toLowerCase().includes(search.toLowerCase());
  const byScope =
    activeFilter === 'all' ? true :
    activeFilter === 'keys' ? ['keys','playground'].includes(c.view) :
    activeFilter === 'docs' ? c.view === 'docs' :
    activeFilter === 'downloads' ? c.view === 'downloads' :
    activeFilter === 'database' ? c.view === 'overview' : true;
  return bySearch && byScope;
});
```

---

### M-05 — بحث دلالي غير متزامن بلا إلغاء + لوحة أوامر بلا دلالات حوار

**الخطورة:** 🟡 Medium (سباق بيانات + وصولية)
**الملف:** `src/components/CommandPalette.tsx:82-99`، `:160`

```tsx
debounceTimerRef.current = setTimeout(async () => {
  setIsSearching(true);
  try {
    const res = await api.semanticSearch(search.trim());
    if (res && res.hits) { setSemanticResults(res); }
  } catch (err) {
    console.warn('Semantic search error:', err);   // الخطأ مبتلع بلا حالة عرض
  } finally { setIsSearching(false); }
}, 320);
```

**المشكلة:**
1. **سباق:** لا تسلسل طلبات ولا `AbortController`. كتابة سريعة («key» ثم «keys») قد تُنتج طلبين؛ إن عاد الأقدم بعد الأحدث تُستبدل النتائج الأحدث بقديمة، والمؤشر يُطفأ قبل وصول الطلب الآخر (`finally`).
2. الفشل يُطبع في الكونسول فقط — لا رسالة للمستخدم.
3. **الوصولية:** الحاوية `div` (سطر 160) بلا `role="dialog"` و`aria-modal` و`aria-label`، لا حصر للتركيز (focus trap)، والنقر على الخلفية لا يغلق (لا يوجد `onClick` على طبقة `bg-black/80`)، ولا عودة التركيز للعنصر المُطلِق.

**التصحيح المقترح:**
```tsx
const seqRef = useRef(0);
...
const seq = ++seqRef.current;
const res = await api.semanticSearch(q, { signal });   // أو تجاهل النتيجة إن تغيّر seq
if (seq === seqRef.current) setSemanticResults(res);
```
+ `<div role="dialog" aria-modal="true" aria-label="Command palette" onKeyDown={...}>` مع حصر التركيز وإغلاق بالنقر على الخلفية.

---

### M-06 — سباق جلب سجلات التدقيق + البحث خارج تبعيات الـ effect

**الخطورة:** 🟡 Medium (بيانات قد لا تطابق الفلاتر المعروضة)
**الملف:** `src/components/views/AuditLogsView.tsx:40-70`

```tsx
const fetchLogs = async () => {
  ...
  const res = await api.getAdminLogs({
    limit,
    offset: page * limit,          // يقرأ page من الإغلاق (closure)
    ...
    search: search.trim() || undefined,
  });
  ...
};

useEffect(() => {
  if (role === 'ADMIN') { fetchLogs(); }
}, [role, timeframe, category, page]);   // search غير موجود في التبعيات

const handleSearchSubmit = (e: React.FormEvent) => {
  e.preventDefault();
  setPage(0);
  fetchLogs();                          // نداء مباشر بالتغيّرات القديمة
};
```

**المشكلة:**
1. `search` ليست في تبعيات الـ `useEffect` → الكتابة في مربع البحث **دون ضغط Enter لا تُعيد الجلب أبداً** (سلوك غير متوقّع: المستخدم يرى النتائج القديمة وهو يظن أن الفلتر فعّال).
2. عند الضغط على Enter و`page > 0`: `setPage(0)` يُطلق نداء الـ effect **و** `fetchLogs()` المباشر يعمل بـ `page` القديم (مثلاً 3) → **طلبان متزامنان بـ offset مختلفين**، ومن ينتهي أخيراً يكتب الجدول، مع احتمال عرض بيانات الصفحة 3 بينما الترويسة تقول «Page 1».

**التصحيح المقترح:** جعل البحث جزءاً من الحالة المُفلترة وحذف النداء المباشر:
```tsx
useEffect(() => { if (role === 'ADMIN') fetchLogs(); }, [role, timeframe, category, page, search]);
const handleSearchSubmit = (e) => { e.preventDefault(); setPage(0); };
// أو بحث مؤجّل (debounce) بدل النموذج
```
(مع معالجة ازدواج النداء عند تغيّر أكثر من متغيّر في نفس التفاعل، أو رقم طلب متسلسل.)

---

### M-07 — استدعاء مسار admin-only لكل مستخدم + تبعيات effect ناقصة

**الخطورة:** 🟡 Medium
**الملف:** `src/components/views/OverviewView.tsx:115-140`

```tsx
const [statsData, tutData, dbData, relData] = await Promise.all([
  api.getAdminStatistics().catch(() => ({ stats: null })),   // سطر 119 — لكل المستخدمين
  api.getVideoTutorials().catch(() => ({ tutorials: [] })),
  // Connection metadata is admin-only server-side — don't even ask
  // as a regular signed-in user.
  role === 'ADMIN'
    ? api.getExternalDatabases().catch(() => ({ databases: [] }))
    : Promise.resolve({ databases: [] }),
  api.getReleases().catch(() => ({ releases: [] })),
]);
...
}, []);   // سطر 140 — التبعيات فارغة بينما يُستخدم role في سطر 123
```

**المشكلة:**
1. `api.getAdminStatistics()` = `/admin/statistics` (مسار admin-only) يُستدعى **لكل مستخدم عادي** عند فتح لوحة التحكم → `403` مضمون في كل زيارة (مضبوط بـ `.catch` فلا ينهار، لكنه ضجيج شبكة + ضجيج في سجلات التدقيق + طلب بلا فائدة). تعليق المطوّر المجاور يعترف بأن الاتصالات admin-only ثم يُطبّق المنطق على واحد فقط.
2. التبعيات `[]` مع استخدام `role`: إن عاد `/auth/me` بدور `ADMIN` بعد التركيب، لن تُحمَّل قواعد الاتصالات أبداً حتى إعادة التحميل.

**التصحيح المقترح:** تطبيق نفس الشرط على `getAdminStatistics` وإضافة `role` إلى التبعيات:
```tsx
role === 'ADMIN' ? api.getAdminStatistics().catch(() => ({ stats: null })) : Promise.resolve({ stats: null }),
...
}, [role]);
```

---

### M-08 — Webhooks: كل التسليمات تُعرض «OK» باللون الأخضر حتى لو كانت 500، وحالة التحميل لا تُعرض، والأخطاء عبر `alert()`

**الخطورة:** 🟡 Medium (تيليمتري كاذبة)
**الملف:** `src/components/views/WebhooksView.tsx:144-146`، `:18`، `:33-37`، `:53`، `:63`

```tsx
<span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400">
  {l.statusCode} OK
</span>
```

**المشكلة:**
1. `WebhookDeliveryLog.status` من نوع `'delivered' | 'failed'` (`types.ts:196`) **لا يُستخدم إطلاقاً** — تسليم فاشل بـ `statusCode: 500` يظهر **«500 OK» باللون الأخضر** في قسم «Recent Webhook Deliveries».
2. `const [loading, setLoading] = useState(true)` (سطر 18) تُضبط ولا تُعرض أبداً → لا مؤشر تحميل، والقائمة الفارغة غير مميّزة عن «لا Webhooks مسجّلة».
3. فشل التحميل الأساسي `console.warn(e)` فقط (سطر 34)، وأخطاء الإنشاء/الاختبار عبر `alert()` (سطور 53، 63) — نافذة نظام غير قابلة للوصول وغير متسقة مع بقية الواجهة.

**التصحيح المقترح:**
```tsx
<span className={`rounded px-2 py-0.5 text-[10px] font-bold ${
  l.status === 'delivered' && l.statusCode < 400
    ? 'bg-emerald-500/10 text-emerald-400'
    : 'bg-rose-500/10 text-rose-400'
}`}>{l.statusCode} {l.status === 'delivered' ? 'DELIVERED' : 'FAILED'}</span>
```
+ عرض `loading` و`error` كحالة UI بدل الكونسول و`alert()`.

---

### M-09 — Security Center: إخفاء الجلسة يفشل بصمت، وتحميل الجلسات يفشل بصمت

**الخطورة:** 🟡 Medium (ميزة أمنية بلا تغذية راجعة خطأ)
**الملف:** `src/components/views/SecurityView.tsx:38-48`، `:54-63`

```tsx
const loadSessions = async () => {
  try {
    setLoading(true);
    const res = await api.getSessions();
    setSessions(res.sessions);
  } catch (e) {
    console.warn('Failed sessions load:', e);      // لا حالة error في الواجهة
  } finally { setLoading(false); }
};

const handleRevokeSession = async (id: string) => {
  try {
    await api.revokeSession(id);
    setSessions(sessions.filter((s) => s.id !== id));
    setActionSuccess('Device session successfully revoked and invalidated.');
    setTimeout(() => setActionSuccess(null), 3000);
  } catch (err: any) {
    console.error(err);                            // المستخدم لا يعرف أن الإخفاء فشل
  }
};
```

**المشكلة:** المستخدم ينقر «Revoke» على جلسة ملوثة → يفشل الطلب → **لا رسالة خطأ ولا بقاء الجلسة** (القائمة لا تتغيّر لأن `setSessions` داخل `try`) → يظن أن الجلسة أُلغيت بينما بقيت فعّالة. بالطريقة نفسها، فشل تحميل الجلسات يُظهر قائمة فارغة توحي بعدم وجود جلسات أخرى.

**التصحيح المقترح:** إضافة `sessionError` تُعرض بجانب العنوان، ورسالة خطأ عند فشل الإخفاء (`setFormMsg({kind:'err', ...})` — النمط موجود مسبقاً في نفس الملف للمصادقة الثنائية، سطر 73).

---

### M-10 — Bot Gateway: JSON غير صالح يبتلع بصمت ويُرسَل كـ `{}`

**الخطورة:** 🟡 Medium
**الملف:** `src/components/views/BotGatewayView.tsx:51-62`، `:35-37`

```tsx
try {
  let parsed = {};
  try {
    parsed = JSON.parse(customPayload);
  } catch {
    // ignore
  }

  const res = await api.executeBotCommand(selectedPlatform, command, {
    channelId,
    ...parsed,
  });
```

**المشكلة:** المستخدم يكتب JSON ناقصاً (فاصلة زائدة مثلاً) → لا تحذير، ويُرسل الأمر بدون أي وسيطات يظن أنها أُرسلت، ثم تظهر نتائج غير متوقّعة. نفس النمط في `loadBots`: الفشل يُطبع في الكونسول فقط (سطر 36) فلا رسالة خطأ في الواجهة.

**التصحيح المقترح:**
```tsx
let parsed: Record<string, unknown> = {};
if (customPayload.trim()) {
  try { parsed = JSON.parse(customPayload); }
  catch (e) { setPayloadError('Invalid JSON — the request was NOT sent.'); return; }
}
```

---

### M-11 — ApiKeyUsageChart: سباق عند تبديل المدة السريعة + لا حالة خطأ

**الخطورة:** 🟡 Medium
**الملف:** `src/components/views/ApiKeyUsageChart.tsx:61-76`

```tsx
const fetchAnalytics = async (p: TimePeriod = period) => {
  try {
    setIsRefreshing(true);
    const data = await api.getKeyUsageAnalytics(p);
    setAnalyticsData(data);
  } catch (err) {
    console.error('Failed to load key usage analytics:', err);   // لا حالة خطأ في الواجهة
  } finally {
    setLoading(false);
    setIsRefreshing(false);
  }
};

useEffect(() => {
  fetchAnalytics(period);
}, [period]);   // بلا إلغاء عند إعادة التشغيل
```

**المشكلة:** التبديل السريع `24h → 7d → 30d` يُنتج ثلاثة طلبات بلا إلغاء؛ إن عاد `24h` أخيراً ستُعرض بياناته تحت تبويب `30d` (سابقة/لاحقة غير مؤمَّنة). وعند الفشل: الرسم يبقى فارغاً والمؤشرات مطفأة بلا أي رسالة.

**التصحيح المقترح:** `let cancelled = false` داخل الـ effect مع `if (!cancelled) setAnalyticsData(...)` وإرجاع دالة التنظيف، أو `AbortController` + حالة `analyticsError`.

---

### M-12 — إشعارات Header مُصطنعة بالكامل وتُعرض كأحداث حيّة + قوائم منسدلة بلا إغلاق خارجي ولا دلالات ARIA

**الخطورة:** 🟡 Medium (جودة/مصداقية + وصولية)
**الملف:** `src/components/Header.tsx:40-44`

```tsx
const notifications = [
  { id: 1, title: 'Key Rotated', time: '2m ago', text: 'Central Production Gateway secret was safely rotated.' },
  { id: 2, title: 'Bot Execution', time: '18m ago', text: 'Autonomous Discord Sentinel executed /vanitas status.' },
  { id: 3, title: 'Security Alert', time: '45m ago', text: 'Rate limit threshold reached for /api/v1/admin from external IP.' },
];
```

**المشكلة:**
1. ثلاثة أحداث أمنية **مختلقة** (تدوير مفتاح، تنفيذ بوت، تجاوز معدّل من IP خارجي) بتوقيتات ثابتة «منذ 2د/18د/45د» — في منتج أمني هذا ادّعاء غير صادق، والمستخدم قد يتخذ إجراءً بناءً على «تنبيه» غير حقيقي.
2. القوائم المنسدلة (`isSourceMenuOpen:127`, `isNotifOpen:185`, `isProfileMenuOpen:217`) تُغلق بالنقر الداخلي فقط: لا `useEffect` في الملف إطلاقاً (الاستيراد `useState` فقط) → **لا إغلاق بالنقر خارجياً ولا بـ Escape**، ولا `aria-haspopup`/`aria-expanded`/`role="menu"`.

**التصحيح المقترح:** جلب الإشعارات من الخادم (أو حذفها)، وإضافة:
```tsx
useEffect(() => {
  if (!(isProfileMenuOpen || isNotifOpen || isSourceMenuOpen)) return;
  const onDocClick = () => { setIsProfileMenuOpen(false); setIsNotifOpen(false); setIsSourceMenuOpen(false); };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onDocClick();
  document.addEventListener('mousedown', onDocClick);
  window.addEventListener('keydown', onKey);
  return () => { document.removeEventListener('mousedown', onDocClick); window.removeEventListener('keydown', onKey); };
}, [isProfileMenuOpen, isNotifOpen, isSourceMenuOpen]);
```
وإضافة `aria-haspopup="menu"` و`aria-expanded={...}` على الأزرار.

---

### M-13 — `logout()` لا يمسح كل حالة الجلسة → مستخدم تالٍ يرث شاشة وصلاحيات المستخدم السابق

**الخطورة:** 🟡 Medium
**الملف:** `src/context/AuthContext.tsx:283-289`

```tsx
const logout = () => {
  // Revoke the server session and clear the stored Bearer token.
  api.logout().catch(() => undefined);
  setUser(null);
  setRoleState('USER');
  localStorage.removeItem('vanitas_active_user');
};
```

**المشكلة:** (التوكن يُمسح فعلاً في `finally` داخل `apiClient.ts:163-168` — هذا جيد). لكن ما يتبقّى بعد الخروج في نفس التبويب:
- `activeView` يبقى كما كان (مثلاً `'admin-logs'`) → أول مستخدم يسجّل الدخول بعد ذلك **يهبط مباشرة على شاشة الـ admin** (ستظهر له 403 لكنه بدأ من شاشة خاطئة).
- `permissions` تبقى من المستخدم السابق ولا تُصفَّر (ملاحظة: هذه الحالة **ميتة أصلاً** — انظر L-08).
- `vanitas_agent_quota_<userId>` لا تُحذف (تراكم في `localStorage`).

**التصحيح المقترح:**
```tsx
const logout = () => {
  api.logout().catch(() => undefined);
  setUser(null); setRoleState('USER'); setPermissions([]);
  setActiveView('welcome'); setIsAuthModalOpen(false);
  localStorage.removeItem('vanitas_active_user');
};
```

---

### M-14 — مؤقّم كل ثانية يُعيد رسم الشجرة كلها لميزة **ميتة** (نظام حصة الوكيل)

**الخطورة:** 🟡 Medium (أداء + كود ميت)
**الملف:** `src/context/AuthContext.tsx:143-148`، `:45-47`، `:317-353`

```tsx
// Live timer update for countdown
useEffect(() => {
  const timer = setInterval(() => {
    setWeeklyAgentQuota(calculateQuota());
  }, 1000);
  return () => clearInterval(timer);
}, [calculateQuota]);
```

**المشكلة:**
1. `AuthProvider` يلفّ التطبيق كله (`App.tsx:189`) → تحديث حالة كل ثانية يعني **إعادة رسم كل المستهلكين مرة/ثانية** بشكل دائم (مؤقّم سليم من حيث التنظيف، لكنه بلا سبب مفيد).
2. **السبب نفسه ميت:** `weeklyAgentQuota` و`executeAgentRun` و`resetAgentQuota` تُعرَف وتُصدَّر في السطور 45-47 و375-377، والبحث في `src/` كله لا يُجد **أي مستهلك** لها خارج `AuthContext`. أي أن ~100 سطر من منطق الحصة + المؤقّم + مفاتيح `vanitas_agent_quota_*` تعمل بلا وجهَ لاستهلاك.
3. لو استُخدمت يوماً: الحصة **عرضية بالكامل** (تُكتب في `localStorage` عند `executeAgentRun`:331) ويمكن تجاوزها بمسح مفتاح واحد، وزر `resetAgentQuota`:343 يعيد الضبط بلا قيد.

**التصحيح المقترح:** حذف المنطق الميت والمؤقّم، أو إن كانت الميزة مطلوبة: نقل الحصة إلى الخادم (الخادم يحسب `remainingRuns` ويعيد 429 عند التجاوز) وتحديث العدّاد كل ثانية داخل مكوّن العدّاد نفسه لا في الجذر.

---

### M-15 — توكن الجلسة يُخزَّن في `localStorage` (خطر XSS مُتراكَم)

**الخطورة:** 🟡 Medium (لا يوجد مغبِّر XSS حالي — دفاع متعمّق)
**الملف:** `src/lib/apiClient.ts:37-59`

```ts
/** Token stored after login (Bearer). Never store raw API secrets in localStorage long-term. */
private getAuthToken(): string | null {
  try {
    return localStorage.getItem('vanitas_auth_token');
  } catch { return null; }
}
...
setAuthToken(token: string | null) {
  try {
    if (token) localStorage.setItem('vanitas_auth_token', token);
    else localStorage.removeItem('vanitas_auth_token');
  } catch { /* ignore */ }
}
```

**المشكلة:** أي سكربت ينفَّذ في سياق الصفحة (XSS مستقبلي، امتداد متصفّح خبيث، سرقة من طرف ثالث) يستطيع قراءة توكن الجلسة والانتحال بسهولة. التعليق في الكود يعترف بأن المخاطر مقصورة على الـ API secrets وليس توكن الجلسة. مع `httpOnly`-cookies ل=session لكان توكن الجلسة غير مقروء من JS.

**التصحيح المقترح:** ترحيل الجلسة إلى كوكي `httpOnly; Secure; SameSite=Strict` (يحتاج دعماً في الخادم)، أو على الأقل التقليل من مدة صلاحية التوكن وإعادة تدويره عند كل تبويب.

---

## 4. النتائج المنخفضة (Low)

### L-01 — تجاوز محتمل في قائمة الروابط المسموحة داخل `Markdown.tsx`
**`src/components/Markdown.tsx:152`**
```tsx
// https://…, site paths (but NOT protocol-relative //host), #fragments, mailto.
const safe = /^(https?:\/\/|\/(?!\/)|#|mailto:)/i.test(href) ? href : '#';
```
النمط يسمح بـ `/\evil.com` — المتصفّح **يعامل `\` كـ `/`** فيمسحه إلى `//evil.com` (رابط protocol-relative) وينتقل لمضيف خارجي رغم نيّة المنع. مقارنة مع `src/lib/urls.ts:19-22` الذي يرفض `//` صراحةً.
**التصحيح:** استخدام `safeWebHref(href) || '#'` بدل النمط اليدوي (الأداة موجودة بالفعل في `src/lib/urls.ts`).

### L-02 — روابط ملفات المستخدمين تُحقن في `href` بلا تحقق دفاعي
**`src/pages/ProfilePage.tsx:193`** و **`src/components/views/ProfileView.tsx:461`**
```tsx
<a
  href={l.url}
  target="_blank"
  rel="noopener noreferrer nofollow"
```
الخادم يتحقق من `^https://` عند الحفظ (`server.ts:709`)، لذا لا ثغرة اليوم — لكن `ProfilePage` يعرض روابط **مستخدمين آخرين** على صفحة عامة، فأي تراجع في التحقق يتحوّل مباشرة إلى تنفيذ `javascript:`. `AiAssistantView.tsx:689` و`OverviewView.tsx:660` يفعلان الشيء الصحيح عبر `safeWebHref`.
**التصحيح:** `href={safeWebHref(l.url) || '#'}` في الموضعين.

### L-03 — `setTimeout` تُضبط دون تنظيف → تحديث حالة بعد إزالة المكوّن
نمط متكرر في 10 ملفات، مثال `src/components/views/DownloadsView.tsx:99-102`:
```tsx
setTimeout(() => setDownloadDone(null), 6000);
...
setTimeout(() => setDownloadError(null), 8000);
```
المواقع: `AdminCenterView.tsx:167`، `ApiKeysView.tsx:160,293`، `AiAssistantView.tsx:407,410,434`، `ProfileView.tsx:269,279`، `SecurityView.tsx:59,125`، `DocsView.tsx:27`، `PlaygroundView.tsx:244`، `LandingPage.tsx:154`، `ProfilePage.tsx:119`.
**الأثر:** تحذيرات React في الوضع التطويري/`memory leak` طفيفة عند التنقل السريع.
**التصحيح:** استخدام `useEffect` مع `return () => clearTimeout(t)` أو تتبّع المُؤقّتات في ref وتliminarها عند الإزالة.

### L-04 — الشريط الجانبي خارج الشاشة يبقى قابلاً للتركيز بلوحة المفاتيح + خلفية غير تفاعلية
**`src/components/Sidebar.tsx:88-98`**
```tsx
{isMobileOpen && (
  <div onClick={() => setIsMobileOpen(false)} className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden" />
)}
<aside className={`... ${isMobileOpen ? 'translate-x-0 ...' : '-translate-x-full'}`}>
```
عند الإغلاق يُخفى بالتحريك فقط (`-translate-x-full`) دون `inert`/`hidden` → أزرار التنقّل تبقى في ترتيب التركيز ويقفز إليها مستخدم لوحة المفاتيح دون أن يراها. والخلفية `div` بـ `onClick` لا تعمل بالكيبورد.
**التصحيح:** إضافة `inert={!isMobileOpen}` (أو `aria-hidden` + `tabIndex={-1}` للأبناء)، وتحويل الخلفية إلى `<button aria-label="Close menu">`.

### L-05 — لا `role="dialog"` ولا `aria-modal` ولا `aria-expanded` في أي مكوّن
بحث في `src/` عن `role="dialog"` / `aria-modal` / `aria-expanded` = **صفر نتائج** (يوجد `aria-label` و`aria-hidden` في مواضع محدودة).
النوافذ المتأثرة: `AuditLogsView.tsx:290-328` (نافذة فحص السجل)، `AuthModal.tsx:48`، `CommandPalette.tsx:160`، نوافذ `ProfileView` و`DownloadsView`.
**الأثر:** قارئ الشاشة يعلن «صفحة» بدل «حوار»، لا حصر تركيز، ولا عودة تركيز عند الإغلاق.
**التصحيح:** إضافة `role="dialog" aria-modal="true" aria-labelledby={...}` + focus trap + استعادة التركيز.

### L-06 — `AuthModal.tsx` (221 سطراً) مكوّن **ميت تماماً** وغير قابل للفتح
**الملفات:** `src/components/AuthModal.tsx:1-241`، `src/App.tsx:130-135`، `src/components/Header.tsx:214/304-311`
```tsx
// App.tsx:130 — الحدث يسبق رسم الهيكل
if (!user) {
  if (path === '/') return <LandingPage />;
  return <AuthPage mode={path === '/register' ? 'register' : 'login'} />;
}
return ( ... <AuthModal /> ... );   // App.tsx:182 — يُرسم فقط عندما user != null
```
```tsx
// Header.tsx:214 و304
{user ? (
  ... <button onClick={() => setIsAuthModalOpen(true)}> ...   // لا يظهر: user دائماً موجود هنا
) : (
  <button onClick={() => setIsAuthModalOpen(true)}>Sign In</button>   // فرع غير قابل للوصول
)}
```
المُستدعي الآخر `CommentsSection.tsx:54-56` (`if (!user) setIsAuthModalOpen(true)`) غير قابل للوصول أيضاً لأن `DocsView` يُرسم داخل الهيكل الموقّع فقط.
إضافة إلى ذلك: نص **«Forgot?»** (`AuthModal.tsx:202`) `span` بلا `onClick` (لا يوجد مسار استعادة كلمة المرور)، وادّعاء **«End-to-end Encrypted»** (سطر 233) غير صحيح تقنياً (المصادقة ليست E2EE)، ولا خطوة رمز 2FA رغم أن الخادم يدعم `twoFactorRequired` (`apiClient.ts:154`).
**التصحيح:** حذف المكوّن وتصحيح مسار الاستعادة، أو دمجه فعلياً كـ «تبديل الحساب» مع تسمية صادقة.

### L-07 — بيانات وهمية مصوَّرة كحالة حيّة
- `src/components/Sidebar.tsx:55` شارة `3 Online` ثابتة، `:63` شارة `Hardened`، `:39,42,72` شارات `Live` — لا مصدر بيانات ولا استدعاء شبكة لأي منها.
- `src/components/Header.tsx:41-43` إشعارات مختلقة (M-12).
- `src/components/Header.tsx:80` شارة `v1.4 PROD` ثابتة.
- `src/pages/LandingPage.tsx:32-36` استجابة `PING_RESPONSE` معلَنة تُعرض كـ «Response» مع ختم زمني مكتوب داخل السلسلة.
**التصحيح:** ربطها بمصدر بيانات حقيقي أو تسميتها بوضوح كـ «نموذج/معاينة».

### L-08 — حالة `permissions` ميتة + قيمة عرض ابتدائية غير موجودة في مبدّل العروض
- `src/context/AuthContext.tsx:68` `const [permissions, setPermissions] = useState<PermissionScope[]>([])` تُملأ من `/auth/me` (السطور 172، 228، 263، 305) وتُصدَّر (361) — **ولا تُقرأ في أي مكوّن** (بحث عن `permissions` في `src/` = لا استهلاك). الواجهة تُصرَّف على `role` فقط رغم وجود نموذج صلاحيات كامل (`types.ts:104-129`).
- `src/context/AuthContext.tsx:69` `useState<string>('welcome')` بينما `renderActiveView` في `App.tsx:68-103` ليس لديه حالة `'welcome'` → يقع في `default` ويعرض `OverviewView` بينما `Sidebar` يحسب `isActive = activeView === item.id` (`Sidebar.tsx:119`) فلا يُضاء أي عنصر عند أول فتح.
**التصحيح:** حذف `permissions` إن لم تُستخدم أو ربطها بواجهة صلاحيات حقيقية، وتوحيد القيمة الابتدائية إلى `'overview'`.

### L-09 — كشف الردّ تدريجياً بمؤقّم 30ms يُعيد رسم قائمة الرسائل ~33 مرة/ثانية
**`src/components/views/AiAssistantView.tsx:243-257`**
```tsx
revealRef.current.timer = window.setInterval(() => {
  ...
  setMessages((prev) => prev.map((m) => (m.id === aiId ? { ...m, text } : m)));
}, 30);
```
التنظيف سليم (`:233-238` و`useEffect` في `:284-289`)، لكن التأثير يُحدِّث مصفوفة الرسائل كاملة في كل نبضة أثناء البثّ الطويل.
**التصحيح:** استخدام `requestAnimationFrame` + تجميع التحديثات، أو تحريك النص عبر CSS (`max-width`/`steps()`) بدل حالة React.

### L-10 — `alert()` و`confirm()` لنافذة النظام في إجراءات حسّة
**`AdminCenterView.tsx:184, 215, 232, 255, 273`** (حذف مستخدم، إجراء طوارئ، إبطال دعوة) و**`WebhooksView.tsx:53, 63`**.
**المشكلة:** نوافذ غير قابلة للوصول (لا دعم لقارئ الشاشة بشكل جيد)، غير قابلة للتنسيق، تُحجب خيط التنفيذ، ومتسقة فقط داخل الملف الواحد.
**التصحيح:** نافذة تأكيد مخصّصة موحدة (نمط النوافذ موجود أصلاً في `AuditLogsView.tsx:290` و`ApiKeysView`) مع حصر تركيز وإغلاق بـ Escape.

### L-11 — مشكلة تطوير: قراءة fragment الـ OAuth تحت StrictMode ضعيفة
**`src/pages/AuthPage.tsx:94-108`** مع `<StrictMode>` في `src/main.tsx:8`
```tsx
useEffect(() => {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) { pendingFragment.current = 'none'; return; }
  ...
  window.history.replaceState(null, '', window.location.pathname);   // يمسح الـ hash
}, []);
```
في وضع التطوير يُستدعى الـ effect مرتين: الاستدعاء الأول يقرأ التوكن ثم يمسح الـ hash، والاستدعاء الثاني يجد `hash` فارغاً ويكتب `'none'` فوق `pendingFragment` → **ضياع توكن OAuth** (يظهر كخطأ دخول). في بنية الإنتاج لا يحدث التكرار.
**التصحيح:** حفظ النتيجة في ref مرة واحدة عبر تهيئة `useRef` منفصلة لا يُعاد تقييمها، أو قراءة `window.location.hash` داخل `useMemo` بحالة أولوية لا تُمسح.

---

## 5. قيود جودة كود (Quality)

### 5.1 حجم المكوّنات

| السطور | الملف |
|---:|---|
| 1711 | `src/components/views/ApiKeysView.tsx` |
| 1372 | `src/components/views/AiAssistantView.tsx` |
| 1255 | `src/components/views/OverviewView.tsx` |
| 1080 | `src/components/views/AdminCenterView.tsx` |
| 1041 | `src/components/views/ProfileView.tsx` |
| 832 | `src/components/views/DownloadsView.tsx` |
| 750 | `src/lib/apiClient.ts` |
| 573 | `src/components/views/ApiKeyUsageChart.tsx` |
| 548 | `src/components/views/PlaygroundView.tsx` |
| 543 | `src/types.ts` |
| 494 | `src/pages/AuthPage.tsx` |
| 465 | `src/pages/LandingPage.tsx` |
| 451 | `src/components/views/SecurityView.tsx` |

**المشكلة:** خمسة ملفات تتجاوز 1000 سطر، وكلها مكوّنات React واحدة تحمل الحالة والمنطق والعرض معاً (مثال: `ApiKeysView` يحتوي إنشاء المفاتيح + التدوير + الإلغاء + التصدير + كشف السر + الأيقونات كلها). هذا يجعل المراجعة، إعادة الاستخدام، واختبار المنطق شبه مستحيل، ويرفع كلفة أي إعادة رسم.
**التوصية:** فصل طبقة البيانات (custom hooks: `useApiKeys`, `useAdminUsers`, `useAuditLogs`) عن العرض، وتقسيم العروض الكبيرة إلى مكوّنات فرعية حسب القسم (النموذج أنفسهم منظّمون بـ `SECTION_META` في `AdminCenterView.tsx:37-64` — التقسيم منطقي لكن الملف ما زال واحداً).

### 5.2 كود ميت مُثبَّت
| الموقع | الوصف |
|---|---|
| `AuthModal.tsx` (221 سطر) | غير قابل للفتح نهائياً (L-06) |
| `AuthContext.tsx:45-47, 92-148, 317-353` | نظام حصة الوكيل كاملاً بلا مستهلك + مؤقّم ثانية (M-14) |
| `AuthContext.tsx:68, 361` | حالة `permissions` لا تُقرأ (L-08) |
| `CommandPalette.tsx:44` | `semanticMode` مُعلَن ولا يُقرأ |
| `CommandPalette.tsx:140-157` | `getCategoryIcon`: حالاتها لا تطابق فئات الأوامر الحقيقية |
| `CommandPalette.tsx:215-218` | 4 أزرار فلترة بلا أثر |
| `AuditLogsView.tsx:28` | حالة `error` تُضَبط ولا تُعرض (H-03) |
| `WebhooksView.tsx:18` | حالة `loading` لا تُعرض |
| `apiClient.ts:61-66` | `setRoleOverride`/`getRoleOverride` للاسترجاع فقط (مُعلَن في الكود أنه no-op — مقبول لكنه حشو) |

### 5.3 إمكانية الوصول (A11y)
- لا `role="dialog"` / `aria-modal` / `aria-expanded` / `role="menu"` في المشروع كله (L-05).
- عناصر `<div onClick>` بلا `role="button"` ولا دعم كيبورد: خلفية `Sidebar.tsx:90`، بطاقات الرسم البياني `ApiKeyUsageChart.tsx` (~490-498)، نوافذ كثيرة.
- نوافذ `AuditLogsView` و`AuthModal` و`CommandPalette` بلا حصر تركيز (focus trap) ولا عودة تركيز عند الإغلاق.
- الشريط الجانبي خارج الشاشة يبقى في ترتيب التركيز (L-04).
- كتم الصوت/تقليل الحركة: الرسوم المتحركة كثيرة (`animate-ping`, `animate-pulse`, `animate-spin`) دون احترام `prefers-reduced-motion`.

### 5.4 إدارة الأخطاء والحالات
حالات الخطأ المبتلعة (تُطبع في الكونسول أو تُبتلع) بدل عرضها:
`SecurityView.tsx:44,61` · `WebhooksView.tsx:34` · `BotGatewayView.tsx:36` · `ApiKeyUsageChart.tsx:67` · `AiAssistantView.tsx:416` · `OverviewView.tsx:90,134,155` · `DownloadsView.tsx:85` (هذا الأخير على الأقل يعرض `metadataError` — نمط جيد يمكن تعميمه).
المموّج المعقّد: `AuditLogsView` لديه حالة خطأ ولا يعرضها إطلاقاً (H-03).

---

## 6. ما تم فحصه ووُجد جيداً (نقاط إيجابية)

1. **لا أغراض حقن XSS:** لا `dangerouslySetInnerHTML` ولا `innerHTML` ولا `eval` ولا `new Function` في `src/` (النتيجة الوحيدة تعليق في `Markdown.tsx:5`).
2. **`Markdown.tsx` يبني عناصر React يدوياً** (`parseBlocks`/`renderInline`) فلا يمكن لمخرجات النموذج حقق أي وسم، وأكواد الخصوصية تُرسم كنص داخل `<code>`.
3. **وحدة تحقق الروابط موجودة وصحيحة منطقياً:** `src/lib/urls.ts` يرفض `javascript:`/`data:`/`//host` وحروف التحكّم (`\u0000-\u001F`)، ويُستخدم في `AiAssistantView.tsx:689` (مصادر AI) و`OverviewView.tsx:660` و`safeEmbedSrc` لإطار YouTube (`OverviewView.tsx:52-54`). *الملاحظة الوحيدة: عدم استخدامه في موضعين (L-02) وتبديل يدوي في `Markdown.tsx:152` (L-01).*
4. **لا سرّيات ثابتة:** لا مفاتيح API مُضمَّنة في الكود أو `index.html`؛ الاعتماد الوحيد على البيئة `import.meta.env.VITE_API_BASE_URL` (`src/lib/runtime.ts:5`).
5. **المصادقة من طرف الخادم فقط:** `apiClient.ts:75-77` يحذف صراحةً `x-user-role` و`x-user-id` من كل طلب — لا يمكن تزوير الدور عبر الترويسات.
6. **حاجز CSV ضد حقن الصيغ:** `ApiKeysView.tsx:408-416` يطبّق `csvCell` (مطابق لقاعدة الخادم `server/security.ts:96`) فيمنع `=cmd|...` من التنفيذ عند فتح الملف في Excel.
7. **سلوكيات مصادقة صحيحة:** كشف OAuth يُمحى من السجل فوراً (`AuthPage.tsx:107`)، والتوكن يُتحقّق من شكله `/^vnt_sess_[A-Za-z0-9_-]{40,}$/` (`:122`)، ويوجد **حارس session fixation** يتجاهل التوكن المحقون إن كان المستخدم مسجّلاً بالفعل (`:123`).
8. **`logout` يمسح التوكن دائماً** بـ `finally` حتى لو فشل نداء الخادم (`apiClient.ts:163-168`).
9. **تنظيف المؤقّتات في `AiAssistantView`** (`:284-289`) و`CommentsSection` (علم `cancelled`) نمط سليم.
10. **حالات «تدهور صادق» في `DownloadsView.tsx:82-87`**: عند فشل الكتالوج تُخفى الأحجام والـ checksums بدل اختلاقها.
11. **`ErrorBoundary` حول التطبيق** (`main.tsx:10-12`) يمنع الصفحة البيضاء عند انهيار الرسم.
12. **صفحة الأدوار في لوحة الأوامر تحجب أوامر الـ admin للغير** (`CommandPalette.tsx:117-126`) — سلوك فلترة صحيح.

---

## 7. خطة عمل مقترحة (حسب الأولوية)

**الأولوية 1 — ميزات مكسورة تُستخدم يومياً**
1. إصلاح تصدير CSV عبر `fetch` + `Authorization` (H-01).
2. إتاحة قائمة الاقتراحات للمستخدم العادي أو إظهار حالة 403 واضحة بدل الإخفاء (H-02).
3. عرض أخطاء سجلات التدقيق + ربط `search` بالـ effect وإزالة السباق (H-03 + M-06).
4. تفعيل ⌘K فعلياً (M-03).

**الأولوية 2 — صحة الواجهة والأمان الدفاعي**
5. إزالة الثقة بـ `role` من `localStorage` وتصحيح نصوص 403 لتكون صادقة (M-01 + M-02).
6. تعطيل أزرار الـ admin المقفلة فعلياً (`disabled`/`aria-disabled`) (M-02).
7. تذييل نصوص حالات الخطأ في `SecurityView` / `WebhooksView` / `BotGatewayView` / `ApiKeyUsageChart` (M-08..M-11).
8. إضافة `safeWebHref` في `ProfilePage.tsx:193` و`ProfileView.tsx:461` و`Markdown.tsx:152` (L-01, L-02).

**الأولوية 3 — جودة وصيانة**
9. حذف الكود الميت: `AuthModal`، نظام حصة الوكيل + مؤقّم الثانية، `permissions`، `semanticMode`، أزرار الفلترة الميتة (M-14, L-06, L-08, M-04).
10. استبدال الإشعارات/الشارات المختلقة ببيانات حقيقية أو تسميتها «معاينة» (M-12, L-07).
11. إضافة الطبقة الأساسية لإمكانية الوصول على كل نافذة (`role="dialog"`, `aria-modal`, focus trap, Escape) (L-05, M-05).
12. تقسيم المكوّنات >1000 سطر إلى hooks + مكوّنات فرعية (5.1).
13. توحيد إدارة الأخطاء: حالة `error` + `Retry` بدل `console.*` و`alert()` (5.4, L-10).

---

*ملاحظة نطاق: لم يُقيَّم الخادم (`src/server/**`) ضمن هذا التقرير؛ كل استشهاد به هو دليل مُقابَل فقط على أن فرض الصلاحيات يتم هناك.*
