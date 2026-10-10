"""Code diagnosis: the ported local analyzer and the JSON normalization."""

from __future__ import annotations

from app.diagnosis.local_analyzer import analyze_code_locally
from app.diagnosis.service import build_diagnosis_prompt, normalize, strip_fences


def test_unbalanced_brackets_are_reported_and_closed() -> None:
    code = "function broken() {\n  if (true) {\n    console.log('x');"
    result = analyze_code_locally(code, "typescript")
    assert result["syntaxErrorsCount"] >= 1
    assert result["hasErrors"] is True
    assert "Unmatched enclosing brackets" in result["issues"][0]["message"]
    assert result["fixedCode"].rstrip().endswith("}")
    assert "Fixed unclosed bracket syntax errors." in result["refactoringHighlights"]


def test_hardcoded_secret_is_detected_and_replaced() -> None:
    code = "const key = 'sk_live_abcdef1234567890';\nfetch('/x');"
    result = analyze_code_locally(code, "typescript")
    assert result["securityFlawsCount"] >= 1
    assert "process.env" in result["fixedCode"]
    assert "sk_live_abcdef1234567890" not in result["fixedCode"]
    checks = {check["check"]: check["status"] for check in result["securityChecks"]}
    assert checks["Credential Isolation & Secrets Vault"] == "fail"


def test_bearer_prefix_gap_is_fixed() -> None:
    code = "const headers = { Authorization: token };"
    result = analyze_code_locally(code, "typescript")
    messages = [issue["message"] for issue in result["issues"]]
    assert any("Bearer" in message for message in messages)
    assert "Bearer" in result["fixedCode"]


def test_webhook_without_hmac_is_a_security_failure() -> None:
    code = "app.post('/webhook', (req, res) => res.sendStatus(200));"
    result = analyze_code_locally(code, "typescript")
    assert any(
        issue["category"] == "security" and "HMAC" in issue["message"]
        for issue in result["issues"]
    )
    checks = {check["check"]: check["status"] for check in result["securityChecks"]}
    assert checks["Webhook Payload Integrity (HMAC)"] == "fail"


def test_safe_code_scores_high_with_an_info_issue() -> None:
    code = "const answer: number = 42;\nconsole.log(answer);\n"
    result = analyze_code_locally(code, "typescript")
    assert result["hasErrors"] is False
    assert result["score"] >= 80
    assert result["issues"][0]["severity"] == "info"
    assert "passed all static" in result["issues"][0]["message"]


def test_unsafe_any_is_flagged_for_typescript_only() -> None:
    ts = analyze_code_locally("const x: any = 1;", "typescript")
    py = analyze_code_locally("x = 1", "python")
    assert any(issue["category"] == "typing" for issue in ts["issues"])
    assert not any(issue["category"] == "typing" for issue in py["issues"])


def test_score_never_drops_below_the_floor() -> None:
    code = "function f( {\nconst k='sk_live_aaaaaaaaaaaaaaaa';\n"
    result = analyze_code_locally(code, "typescript")
    assert 20 <= result["score"] <= 100
    assert 30 <= result["maintainabilityIndex"] <= 98


def test_normalize_recounts_and_clamps() -> None:
    parsed = {
        "score": 500,
        "maintainabilityIndex": -3,
        "issues": [
            {"category": "syntax", "severity": "error", "message": "bad"},
            {"category": "security", "severity": "security", "message": "leak"},
            {"category": "refactor", "severity": "warning", "message": "tidy"},
        ],
    }
    result = normalize(parsed, "code")
    assert result["score"] == 100
    assert result["maintainabilityIndex"] == 0
    assert result["syntaxErrorsCount"] == 1
    assert result["securityFlawsCount"] == 1
    assert result["refactoringCount"] == 1
    assert result["hasErrors"] is True
    assert result["fixedCode"] == "code"


def test_prompt_embeds_the_code_and_schema() -> None:
    prompt = build_diagnosis_prompt(
        {"code": "let a = 1;", "language": "typescript", "analysisMode": "security"}
    )
    assert "Analysis Focus Mode: security" in prompt
    assert "```typescript" in prompt
    assert '"fixedCode"' in prompt
    assert "let a = 1;" in prompt


def test_strip_fences_tolerates_markdown_wrapping() -> None:
    assert strip_fences("```json\n{\"a\": 1}\n```") == '{"a": 1}'
    assert strip_fences('{"a": 1}') == '{"a": 1}'
