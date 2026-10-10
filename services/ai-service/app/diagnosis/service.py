"""Code diagnosis service: Gemini → Pollinations → local static analyzer.

Drop-in port of `diagnoseAndFixCode` from `src/server/aiService.ts`.
"""

from __future__ import annotations

from typing import Any

from ..config import get_settings
from ..providers import gemini, pollinations
from .local_analyzer import analyze_code_locally

STRICT_INSTRUCTION = (
    "You are a strict code-analysis engine. Respond ONLY with the valid JSON "
    "object requested — no markdown fences, no prose."
)


def build_diagnosis_prompt(req: dict[str, Any]) -> str:
    """The exact JSON-schema prompt the platform sends to a model."""
    code = str(req.get("code") or "")
    language = str(req.get("language") or "typescript")
    context = req.get("context")
    analysis_mode = str(req.get("analysisMode") or "full")

    prompt = f"""You are the Vanitas Autonomous Code Analysis & Refactoring Engine powered by Gemini.
You analyze developer code snippets for:
1. Syntax errors, invalid grammar, missing brackets, broken imports, type violations, and compilation issues.
2. Security vulnerabilities, exposed raw secrets, missing Bearer authentication, missing HMAC verification, and injection flaws.
3. Architectural and refactoring improvements (e.g., exponential retry-after backoff on HTTP 429, structured async/await exception handling, strict typing, clean separation of concerns, connection reuse).
4. Maintainability and performance optimization.

Language: {language}
Analysis Focus Mode: {analysis_mode}
{f"Developer Context: {context}" if context else ""}

Respond ONLY with a valid JSON object matching this schema:
{{
  "hasErrors": boolean,
  "score": number (0-100 code health score),
  "maintainabilityIndex": number (0-100 maintainability score),
  "syntaxErrorsCount": number,
  "securityFlawsCount": number,
  "refactoringCount": number,
  "issues": [
    {{
      "line": number (1-indexed line number if determinable),
      "column": number (optional),
      "category": "syntax" | "security" | "refactor" | "performance" | "typing",
      "severity": "error" | "warning" | "info" | "security",
      "message": "concise description of the flaw or error",
      "suggestion": "actionable refactoring advice",
      "codeSnippet": "the buggy line or token"
    }}
  ],
  "fixedCode": "the complete, clean, production-ready refactored code without markdown ticks around it",
  "explanation": "structured summary explaining all syntax fixes, security hardenings, and refactoring choices made",
  "refactoringHighlights": [
    "Key refactoring highlight 1",
    "Key refactoring highlight 2"
  ],
  "securityChecks": [
    {{
      "check": "Name of verification check",
      "status": "pass" | "fail" | "warn",
      "details": "assessment description"
    }}
  ]
}}

Code to analyze:
```{language}
{code}
```"""
    return prompt


def normalize(parsed: dict[str, Any], code: str) -> dict[str, Any]:
    """Clamp and recount a model-supplied diagnosis (same rules as the TS)."""
    issues = parsed.get("issues") if isinstance(parsed.get("issues"), list) else []

    syntax_count = parsed.get("syntaxErrorsCount")
    if syntax_count is None:
        syntax_count = sum(
            1
            for issue in issues
            if isinstance(issue, dict)
            and (issue.get("category") == "syntax" or issue.get("severity") == "error")
        )

    security_count = parsed.get("securityFlawsCount")
    if security_count is None:
        security_count = sum(
            1
            for issue in issues
            if isinstance(issue, dict)
            and (issue.get("category") == "security" or issue.get("severity") == "security")
        )

    refactor_count = parsed.get("refactoringCount")
    if refactor_count is None:
        refactor_count = sum(
            1
            for issue in issues
            if isinstance(issue, dict)
            and issue.get("category") in {"refactor", "performance"}
        )

    score = _clamp(parsed.get("score"), 0, 100, 85)
    maintainability = _clamp(parsed.get("maintainabilityIndex"), 0, 100, 88)

    highlights = parsed.get("refactoringHighlights")
    checks = parsed.get("securityChecks")

    return {
        "hasErrors": parsed.get("hasErrors")
        if isinstance(parsed.get("hasErrors"), bool)
        else (syntax_count > 0 or security_count > 0),
        "score": score,
        "maintainabilityIndex": maintainability,
        "syntaxErrorsCount": int(syntax_count or 0),
        "securityFlawsCount": int(security_count or 0),
        "refactoringCount": int(refactor_count or 0),
        "issues": issues,
        "fixedCode": parsed.get("fixedCode") or code,
        "explanation": parsed.get("explanation")
        or "Analyzed code structure and applied production refactorings.",
        "refactoringHighlights": highlights if isinstance(highlights, list) else [],
        "securityChecks": checks if isinstance(checks, list) else [],
    }


def _clamp(value: Any, low: int, high: int, default: int) -> int:
    try:
        number = float(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    return int(min(high, max(low, number)))


def strip_fences(raw: str) -> str:
    text = raw.strip()
    if text.startswith("```"):
        first_newline = text.find("\n")
        text = text[first_newline + 1 :] if first_newline != -1 else text
        if text.rstrip().endswith("```"):
            text = text.rstrip()[:-3]
    return text.strip()


async def diagnose_and_fix(req: dict[str, Any]) -> dict[str, Any]:
    """Full diagnosis pipeline with the same degradation order as the TS."""
    code = str(req.get("code") or "")
    language = str(req.get("language") or "typescript")
    has_code = bool(code.strip())

    prompt = build_diagnosis_prompt(req) if has_code else ""

    if prompt and not get_settings().skip_gemini and get_settings().has_gemini:
        for model in gemini.CANDIDATE_MODELS:
            try:
                raw = await _gemini_json(model, prompt)
                if raw:
                    return normalize(raw, code)
            except Exception as error:  # noqa: BLE001
                import warnings

                warnings.warn(f"Model {model} code analysis attempt failed: {error}")

    if prompt:
        try:
            free_text = await pollinations.query_pollinations(STRICT_INSTRUCTION, prompt)
            if free_text:
                parsed = _parse(free_text)
                if parsed is not None:
                    return normalize(parsed, code)
        except Exception as error:  # noqa: BLE001
            import warnings

            warnings.warn(f"Pollinations diagnosis unavailable; using local analyzer. {error}")

    return analyze_code_locally(code, language)


async def _gemini_json(model: str, prompt: str) -> dict[str, Any] | None:
    """One structured Gemini attempt on a specific candidate model."""
    from ..providers.gemini import _post  # noqa: PLC2701 — shared REST helper

    data = await _post(
        {
            "contents": [{"role": "user", "parts": [{"text": prompt}]}],
            "generationConfig": {"responseMimeType": "application/json"},
        },
        temperature=0.15,
        model=model,
    )
    candidates = data.get("candidates") or []
    if not candidates:
        return None
    parts = ((candidates[0].get("content") or {}).get("parts")) or []
    text = "".join(str(part.get("text") or "") for part in parts if isinstance(part, dict))
    if not text:
        return None
    return _parse(text)


def _parse(raw: str) -> dict[str, Any] | None:
    import json

    try:
        parsed = json.loads(strip_fences(raw))
    except (json.JSONDecodeError, ValueError):
        return None
    return parsed if isinstance(parsed, dict) else None
