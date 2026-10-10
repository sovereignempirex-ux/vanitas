"""Deterministic local knowledge-base fallback.

Verbatim port of `generateFallbackResponse` from `src/server/aiService.ts`.
Every markdown string (Arabic and English) is byte-for-byte identical to the
rendered TypeScript template literals: escaped backticks became literal
backticks, escaped `${...}` sequences became literal `${...}` text, `\\`
stays a single backslash, and only the two real interpolations
(`${persona.toUpperCase()}` / `${toneStyle.toUpperCase()}`) became Python
string concatenation.
"""

from __future__ import annotations

import re

_ARABIC_RANGE = re.compile("[؀-ۿ]")


def generate_fallback_response(
    persona: str,
    tone_style: str,
    prompt: str,
    context: dict | None = None,
) -> dict:
    """Build the disclosed local knowledge-base reply.

    Same branch order, thresholds and user-visible strings as the TS
    `generateFallbackResponse(persona, toneStyle, prompt, _context)`.
    The returned dict always carries ``text`` and adds ``groundingSources``
    (every branch except the security-confirmation one) and/or
    ``requiresConfirmation`` exactly when the TS returns them.

    ``context`` is accepted for signature parity with the TS and is unused
    there as well.
    """
    del context  # unused in the TS original (`_context`)
    p = prompt.lower().strip()

    # Arabic tone responses
    if tone_style == "arabic" or _ARABIC_RANGE.search(prompt):
        if (
            "مفتاح" in p
            or "api key" in p
            or "انشاء" in p
            or "تدوير" in p
            or "rotate" in p
        ):
            return {
                "text": """### 🔑 إدارة مفاتيح الـ API في منصة Vanitas\n\nتعتمد منصة فانيتاس نظام أمان صارم يعتمد على الصلاحيات المحددة بدقة (**Granular Scopes**) مع التحقق من الصلاحيات من جهة السيرفر لمنع أي تصعيد غير مصرح به للصلاحيات (`assertGrantableScopes`).\n\n```typescript\n// مثال: تدوير المفتاح عبر REST مباشرة — لا توجد حزمة SDK منشورة\nasync function rotateKey(keyId: string) {\n  const res = await fetch(`https://vanitas-bot.vercel.app/api/v1/api-keys/${keyId}/rotate`, {\n    method: 'POST',\n    headers: {\n      'Authorization': `Bearer ${process.env.VANITAS_API_KEY}`,\n      'Content-Type': 'application/json'\n    }\n  });\n  if (!res.ok) throw new Error(`rotate failed: ${res.status}`);\n  // المفتاح السري الجديد يظهر مرة واحدة فقط\n  const { rawSecret } = await res.json();\n  console.log('المفتاح السري الجديد:', rawSecret);\n}\n```\n\n**أبرز الصلاحيات:**\n- `api.read` / `api.write`: قراءة وكتابة الموارد الأساسية\n- `bot.execute`: تنفيذ أوامر البوت (Discord و WhatsApp)\n- `keys.rotate` / `keys.revoke`: إدارة دورة حياة المفاتيح.""",
                "groundingSources": [
                    {
                        "title": "توثيق منصة فانيتاس الرسمية: الصلاحيات والأمان",
                        "url": "https://vanitas-bot.vercel.app/docs#scopes",
                    },
                ],
            }

        if "بوت" in p or "bot" in p or "discord" in p or "whatsapp" in p:
            return {
                "text": """### 🤖 بوابة البوت المركزية في فانيتاس (Bot Gateway)\n\nتتيح المنصة ربط تطبيقات بوت WhatsApp و Discord عبر نقطة دخول موحدة `POST /api/v1/bot/execute` مع تسجيل فوري في سجلات التدقيق.\n\n```bash\ncurl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\\n  -H "Authorization: Bearer sk_live_discord_••••••••" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "platform": "discord",\n    "command": "system_status",\n    "payload": { "channel": "operations" }\n  }'\n```\n\nيتم تنفيذ الأمر بعد التحقق من صلاحية `bot.execute`، مع تسجيل كل تنفيذ في سجلات التدقيق.""",
                "groundingSources": [
                    {
                        "title": "دليل ربط البوت المركزي",
                        "url": "https://vanitas-bot.vercel.app/docs#bots",
                    },
                ],
            }

        return {
            "text": """### 🌌 مساعد الذكاء الاصطناعي لمنصة Vanitas\n\nأهلاً بك! أنا نظام الذكاء الاصطناعي المدمج لمنصة فانيتاس المركزية. يمكنني مساعدتك في:\n1. **تصحيح الكود واكتشاف الأخطاء الثنائية والأمنية**\n2. **توليد أكواد TypeScript و Python و cURL جاهزة للإنتاج**\n3. **فحص الصلاحيات ومصفوفة الأمان ومنع الثغرات**\n4. **تحليل حركة المرور وإحصائيات الاستهلاك وسرعة الاستجابة (p95 latency)**\n\nكيف تود أن نطور بنيتك التحتية اليوم؟""",
            "groundingSources": [
                {
                    "title": "توثيق فانيتاس الشامل",
                    "url": "https://vanitas-bot.vercel.app/docs",
                },
            ],
        }

    # Destructive / high-privilege detection
    if persona == "security" and (
        "revoke" in p or "delete key" in p or "block" in p or "purge" in p
    ):
        return {
            "text": """⚠️ **Security Action Verification Required**\n\nI have evaluated the requested operation against active RBAC policies. Because this is an irreversible high-impact change, please verify before execution:\n\n- **Target Entity:** Active Authorization Token / Session\n- **Policy Enforcement:** Immediate invalidation across all edge gateways\n- **Audit Compliance:** An immutable audit trail entry will be generated.""",
            "requiresConfirmation": {
                "action": "Revoke Key Authorization",
                "target": "Target API Token / Session",
                "permission": "keys.revoke",
                "status": "pending",
            },
        }

    # API Key & Scope queries
    if (
        "api key" in p
        or "create key" in p
        or "rotate" in p
        or "scopes" in p
        or "assertgrantablescopes" in p
    ):
        return {
            "text": """### 🔑 Vanitas API Key Management & Scope Resolution\n\nAll API keys in Vanitas are issued with **Granular Scopes** enforced on the server-side via `assertGrantableScopes` to eliminate privilege escalation risks.\n\n```typescript\n// Example: rotate a key over REST — no SDK package is published\nasync function rotateKey(keyId: string) {\n  const res = await fetch(`https://vanitas-bot.vercel.app/api/v1/api-keys/${keyId}/rotate`, {\n    method: 'POST',\n    headers: {\n      'Authorization': `Bearer ${process.env.VANITAS_API_KEY}`,\n      'Content-Type': 'application/json'\n    }\n  });\n  if (!res.ok) throw new Error(`rotate failed: ${res.status}`);\n  const { rawSecret } = await res.json(); // shown exactly once\n  console.log('New Secret (store safely):', rawSecret);\n}\n```\n\n**Key Scope Hierarchy:**\n- `api.read` / `api.write` — General entity query & mutation\n- `bot.execute` — Dispatches automated commands to WhatsApp, Discord, Telegram\n- `keys.create`, `keys.rotate`, `keys.revoke` — Developer token lifecycle\n- `admin.all` — Full administrative control (Admin role only)""",
            "groundingSources": [
                {
                    "title": "Vanitas Official Docs: Scopes & Permissions",
                    "url": "https://vanitas-bot.vercel.app/docs#scopes",
                },
                {
                    "title": "API Key Safe Rotation Workflow",
                    "url": "https://vanitas-bot.vercel.app/docs#keys",
                },
            ],
        }

    # Bot Gateway queries
    if (
        "bot" in p
        or "discord" in p
        or "whatsapp" in p
        or "telegram" in p
        or "execute" in p
    ):
        return {
            "text": """### 🤖 Vanitas Bot Gateway Integration\n\nVanitas provides a unified ingress for WhatsApp, Discord, and Telegram bots. The bot communicates via `POST /api/v1/bot/execute` using an API Key granted with the `bot.execute` scope.\n\n```bash\n# Send command to Discord Bot\ncurl -X POST https://vanitas-bot.vercel.app/api/v1/bot/execute \\\n  -H "Authorization: Bearer sk_live_discord_••••••••" \\\n  -H "Content-Type: application/json" \\\n  -d '{\n    "platform": "discord",\n    "command": "system_status",\n    "payload": { "notifyChannel": "ops-main" }\n  }'\n```\n\n**Supported Platforms:**\n1. **WhatsApp Core Bot**: Operational (QR/Session auth)\n2. **Discord Ops Bot**: Operational (Slash commands)\n3. **Telegram Notifier**: Standby (Webhook dispatch)\n\nAll executions generate structured audit logs tagged with the `BOT` category.""",
            "groundingSources": [
                {
                    "title": "Vanitas Bot Gateway Architecture",
                    "url": "https://vanitas-bot.vercel.app/docs#bots",
                },
            ],
        }

    # Code snippet or generic programming / SDK queries
    return {
        "text": (
            "### 🌌 Vanitas Intelligence Copilot ("
            + persona.upper()
            + " • "
            + tone_style.upper()
            + ")"
            + """\n\nHere is the recommended implementation pattern for your request:\n\n```typescript\n// No SDK package is published — the platform is a plain REST API\nconst BASE = 'https://vanitas-bot.vercel.app/api/v1';\n\nasync function run() {\n  // Public live telemetry (no auth required)\n  const status = await fetch(`${BASE}/status`).then((r) => r.json());\n  console.log('System Status:', status);\n\n  // Authenticated call with an API key holding bot.execute\n  const exec = await fetch(`${BASE}/bot/execute`, {\n    method: 'POST',\n    headers: {\n      'Authorization': `Bearer ${process.env.VANITAS_API_KEY}`,\n      'Content-Type': 'application/json'\n    },\n    body: JSON.stringify({ platform: 'discord', command: 'system_status' })\n  });\n  console.log(exec.status, await exec.json());\n}\nrun();\n```\n\n**Available Capabilities:**\n- Live Code Fixer & AST Security Scanner tool\n- Endpoint integration schemas & payload construction\n- Token scope matrix & `assertGrantableScopes` validation\n- Real-time bot gateway control for WhatsApp and Discord\n- Multi-tone generation with full Arabic & English technical support."""
        ),
        "groundingSources": [
            {
                "title": "Vanitas Central Documentation",
                "url": "https://vanitas-bot.vercel.app/docs",
            },
        ],
    }
