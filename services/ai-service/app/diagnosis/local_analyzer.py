"""Robust fallback static analysis & AST-pattern refactoring engine.

Verbatim port of `analyzeCodeLocally` from `src/server/aiService.ts`: the same
seven checks, thresholds, score deltas, clamps and user-visible strings.
"""

from __future__ import annotations

import re
from typing import Any

# Check 2: raw secrets / exposed API tokens.
_SECRET_RE = re.compile(r"sk_live_[a-zA-Z0-9_-]{10,}")
_PASSWORD_RE = re.compile(r"""password\s*=\s*['"][^'"]+['"]""")
_TOKEN_RE = re.compile(r"""token\s*=\s*['"][a-zA-Z0-9_\-\.]{20,}['"]""")
_SECRET_LINE_RE = re.compile(r"""sk_live_|password\s*=|token\s*=\s*['"]""")

# Check 1: bracket balance counted per line (JS `/{/g` style global counts).
_OPEN_BRACE_RE = re.compile(r"\{")
_CLOSE_BRACE_RE = re.compile(r"\}")
_OPEN_PAREN_RE = re.compile(r"\(")
_CLOSE_PAREN_RE = re.compile(r"\)")
_OPEN_BRACKET_RE = re.compile(r"\[")
_CLOSE_BRACKET_RE = re.compile(r"\]")


def analyze_code_locally(code: str, language: str) -> dict:
    """Run the deterministic static/security analysis over a code snippet.

    Returns the same shape as the TS `CodeDiagnosisResult`: ``hasErrors``,
    ``score``, ``maintainabilityIndex``, ``syntaxErrorsCount``,
    ``securityFlawsCount``, ``refactoringCount``, ``issues`` (each dict has
    ``line``/``column``/``category``/``severity``/``message``/``suggestion``/
    ``codeSnippet``, with unknown values set to ``None``), ``fixedCode``,
    ``explanation``, ``refactoringHighlights`` and ``securityChecks``.
    """
    issues: list[dict[str, Any]] = []
    security_checks: list[dict[str, str]] = []
    refactoring_highlights: list[str] = []
    fixed_code = code
    score = 95
    lines = code.split("\n")

    # Check 1: Syntax & Bracket Balance (counted across ALL lines).
    open_braces = 0
    open_parens = 0
    open_brackets = 0
    for line in lines:
        open_braces += len(_OPEN_BRACE_RE.findall(line)) - len(
            _CLOSE_BRACE_RE.findall(line)
        )
        open_parens += len(_OPEN_PAREN_RE.findall(line)) - len(
            _CLOSE_PAREN_RE.findall(line)
        )
        open_brackets += len(_OPEN_BRACKET_RE.findall(line)) - len(
            _CLOSE_BRACKET_RE.findall(line)
        )

    if open_braces != 0 or open_parens != 0 or open_brackets != 0:
        issues.append(
            {
                "line": len(lines),
                "column": None,
                "category": "syntax",
                "severity": "error",
                "message": (
                    "Syntax error: Unmatched enclosing brackets "
                    f"(Delta: Braces {open_braces}, Parens {open_parens}, "
                    f"Brackets {open_brackets})."
                ),
                "suggestion": (
                    "Ensure all opening braces, parentheses, and brackets are "
                    "properly closed."
                ),
                "codeSnippet": lines[-1] or code,
            }
        )
        score -= 30
        if open_braces > 0:
            fixed_code += "\n}" * open_braces
        if open_parens > 0:
            fixed_code += ")" * open_parens
        if open_brackets > 0:
            fixed_code += "]" * open_brackets
        refactoring_highlights.append("Fixed unclosed bracket syntax errors.")

    # Check 2: Raw Secrets / Exposed API Tokens
    if _SECRET_RE.search(code) or _PASSWORD_RE.search(code) or _TOKEN_RE.search(code):
        secret_line_idx = -1
        for index, line in enumerate(lines):
            if _SECRET_LINE_RE.search(line):
                secret_line_idx = index
                break
        found = secret_line_idx != -1
        issues.append(
            {
                "line": secret_line_idx + 1 if found else None,
                "column": None,
                "category": "security",
                "severity": "security",
                "message": "Hardcoded production secret token detected in plain source code.",
                "suggestion": "Migrate raw secrets to process.env or secure vault injection.",
                "codeSnippet": lines[secret_line_idx] if found else None,
            }
        )
        fixed_code = re.sub(
            r"sk_live_[a-zA-Z0-9_-]+",
            'process.env.VANITAS_API_KEY || ""',
            fixed_code,
        )
        score -= 25
        refactoring_highlights.append(
            "Isolated credentials into secure environment variable configuration."
        )
        security_checks.append(
            {
                "check": "Credential Isolation & Secrets Vault",
                "status": "fail",
                "details": "Detected raw live tokens in payload. Replaced with process.env lookup.",
            }
        )
    else:
        security_checks.append(
            {
                "check": "Credential Isolation & Secrets Vault",
                "status": "pass",
                "details": "No plaintext production credentials exposed.",
            }
        )

    # Check 3: Missing Bearer Header Prefix
    if "headers" in code and "Bearer " not in code and "Authorization" in code:
        auth_line_idx = -1
        for index, line in enumerate(lines):
            if "Authorization" in line:
                auth_line_idx = index
                break
        found = auth_line_idx != -1
        issues.append(
            {
                "line": auth_line_idx + 1 if found else None,
                "column": None,
                "category": "syntax",
                "severity": "error",
                "message": 'Authorization header is missing standard "Bearer " scheme prefix.',
                "suggestion": (
                    "Prefix token string with `Bearer ${token}` to avoid HTTP 401 "
                    "Unauthorized."
                ),
                "codeSnippet": lines[auth_line_idx] if found else None,
            }
        )
        fixed_code = re.sub(
            r"""['"]?Authorization['"]?\s*:\s*([^,\n}]+)""",
            r'"Authorization": `Bearer {\g<1>}`',
            fixed_code,
        )
        score -= 15
        refactoring_highlights.append(
            "Formatted Authorization header with standard Bearer schema."
        )

    # Check 4: Rate Limiting & Throttling Resilience (HTTP 429)
    if (
        ("fetch(" in code or "axios." in code or "requests." in code)
        and "429" not in code
        and "retry" not in code
    ):
        issues.append(
            {
                "line": None,
                "column": None,
                "category": "refactor",
                "severity": "warning",
                "message": "No rate-limit (HTTP 429 / Retry-After) exponential backoff handling found.",
                "suggestion": (
                    "Implement retry backoff logic to ensure graceful recovery during "
                    "traffic bursts."
                ),
                "codeSnippet": None,
            }
        )
        score -= 15
        refactoring_highlights.append(
            "Added resilience recommendations for HTTP 429 rate limit backoff."
        )
        security_checks.append(
            {
                "check": "Rate Limiting & Ingress Resilience",
                "status": "warn",
                "details": "Client does not handle HTTP 429 throttling signals.",
            }
        )
    else:
        security_checks.append(
            {
                "check": "Rate Limiting & Ingress Resilience",
                "status": "pass",
                "details": "Proper throttle and backoff mechanism present.",
            }
        )

    # Check 5: Webhook Signature Verification Flaws (Python / JS)
    if (
        ("webhook" in code or "/webhook" in code)
        and "hmac" not in code
        and "signature" not in code
        and "sha256" not in code
    ):
        issues.append(
            {
                "line": None,
                "column": None,
                "category": "security",
                "severity": "security",
                "message": "Webhook handler does not verify cryptographic HMAC-SHA256 signature.",
                "suggestion": (
                    "Validate x-vanitas-signature header before processing incoming "
                    "webhook payloads."
                ),
                "codeSnippet": None,
            }
        )
        score -= 20
        refactoring_highlights.append(
            "Recommended HMAC-SHA256 signature verification for inbound webhooks."
        )
        security_checks.append(
            {
                "check": "Webhook Payload Integrity (HMAC)",
                "status": "fail",
                "details": "Insecure webhook receiver accepting unsigned payloads.",
            }
        )
    else:
        security_checks.append(
            {
                "check": "Webhook Payload Integrity (HMAC)",
                "status": "pass",
                "details": "Payload integrity verification present or not required.",
            }
        )

    # Check 6: Unsafe `any` Types
    if language == "typescript" and (": any" in code or "as any" in code):
        issues.append(
            {
                "line": None,
                "column": None,
                "category": "typing",
                "severity": "info",
                "message": "Use of unsafe `any` type bypasses TypeScript static compiler checks.",
                "suggestion": "Replace `any` with specific domain interfaces or `unknown`.",
                "codeSnippet": None,
            }
        )
        score -= 8
        refactoring_highlights.append(
            "Refactored dynamic `any` types into strict TypeScript interfaces."
        )

    # Check 7: SQL Concatenation / Injection Risks
    if (
        language == "sql" or "SELECT " in code or "WHERE " in code
    ) and ("${" in code or " + " in code):
        issues.append(
            {
                "line": None,
                "column": None,
                "category": "security",
                "severity": "security",
                "message": "Potential SQL injection risk due to raw string interpolation in query string.",
                "suggestion": "Use parameterized queries or prepared statements.",
                "codeSnippet": None,
            }
        )
        score -= 25
        refactoring_highlights.append(
            "Replaced raw SQL string interpolation with parameterized queries."
        )

    if len(issues) == 0:
        issues.append(
            {
                "line": None,
                "column": None,
                "category": "refactor",
                "severity": "info",
                "message": "Code passed all static syntax, security, and API integration checks.",
                "suggestion": "Ready for production deployment.",
                "codeSnippet": None,
            }
        )

    syntax_errors_count = sum(
        1
        for issue in issues
        if issue["category"] == "syntax" or issue["severity"] == "error"
    )
    security_flaws_count = sum(
        1
        for issue in issues
        if issue["category"] == "security" or issue["severity"] == "security"
    )
    refactoring_count = sum(
        1
        for issue in issues
        if issue["category"] in ("refactor", "performance", "typing")
    )

    return {
        "hasErrors": syntax_errors_count > 0 or security_flaws_count > 0,
        "score": max(20, score),
        "maintainabilityIndex": max(30, min(98, score + 5)),
        "syntaxErrorsCount": syntax_errors_count,
        "securityFlawsCount": security_flaws_count,
        "refactoringCount": refactoring_count,
        "issues": issues,
        "fixedCode": fixed_code,
        "explanation": (
            "Vanitas Code Doctor performed automated static and security analysis. "
            f"Identified {len(issues)} item(s) across syntax, security headers, "
            "rate-limiting handlers, and type safety. Refactored into a hardened, "
            "production-ready structure."
        ),
        "refactoringHighlights": refactoring_highlights
        if refactoring_highlights
        else ["Applied clean error handling and structured formatting."],
        "securityChecks": security_checks
        if security_checks
        else [
            {
                "check": "Zero-Trust Role Validation",
                "status": "pass",
                "details": "Validated permissions",
            },
            {
                "check": "Payload Sanitization",
                "status": "pass",
                "details": "No dangerous injections detected",
            },
        ],
    }
