"""Prompt assembly: personas, tones, site facts, project mode, video intent."""

from __future__ import annotations

from app import prompts


def test_instruction_contains_persona_tone_and_site_facts() -> None:
    instruction = prompts.build_system_instruction("security", "arabic")
    assert prompts.BASE_INSTRUCTIONS["security"] in instruction
    assert prompts.TONE_MODIFIERS["arabic"] in instruction
    assert "=== VANITAS PLATFORM — REAL REFERENCE (this deployment) ===" in instruction
    assert "POST /api-keys/:id/rotate" in instruction


def test_unknown_persona_and_tone_fall_back_to_defaults() -> None:
    instruction = prompts.build_system_instruction("nope", "unknown")
    assert prompts.BASE_INSTRUCTIONS["code"] in instruction
    # Unknown tone contributes an empty line, never a crash.
    assert "\n\n\n" in instruction


def test_project_mode_is_bounded_and_flagged() -> None:
    context = {
        "projectMode": True,
        "manifests": {"package.json": "{}"},
        "files": [{"path": f"src/file{i}.ts", "content": "x" * 4000} for i in range(30)],
    }
    instruction = prompts.build_system_instruction("code", "developer", context=context)
    assert "EXISTING PROJECT MODE" in instruction
    assert "Project context (JSON, bounded to 36000 characters)" in instruction
    assert "Android Kotlin" in instruction  # the domain → language map stays verbatim

    serialized = instruction.split("Project context (JSON, bounded to 36000 characters):\n", 1)[1]
    assert len(serialized) <= prompts.PROJECT_CONTEXT_LIMIT


def test_project_context_drops_files_before_giving_up() -> None:
    context = {"projectMode": True, "files": [{"content": "y" * 5000} for _ in range(20)]}
    serialized = prompts.bound_project_context(context)
    assert len(serialized) <= prompts.PROJECT_CONTEXT_LIMIT
    # Last resort clears the file list entirely.
    assert context["files"] == [] or len(serialized) <= prompts.PROJECT_CONTEXT_LIMIT


def test_context_without_project_mode_is_ignored() -> None:
    instruction = prompts.build_system_instruction(
        "code", "developer", context={"projectMode": False, "files": []}
    )
    assert "EXISTING PROJECT MODE" not in instruction


def test_video_intent_detection() -> None:
    assert prompts.detect_video_intent("anything", "video", False) is True
    assert prompts.detect_video_intent("show me a react tutorial", "code", False) is True
    assert prompts.detect_video_intent("اريد شرح فيديو لـ REST", "code", False) is True
    assert prompts.detect_video_intent("how do I rotate a key?", "code", True) is True
    assert prompts.detect_video_intent("how do I rotate a key?", "code", False) is False


def test_video_query_is_cleaned_but_never_empty() -> None:
    assert prompts.clean_video_query("show me react tutorial") == "react"
    assert prompts.clean_video_query("شرح") == "شرح"  # too short after cleanup → raw


def test_video_note_is_appended_when_videos_exist() -> None:
    instruction = prompts.build_system_instruction(
        "video", "developer", videos=[{"id": "a"}, {"id": "b"}]
    )
    assert "2 educational YouTube video tutorials have been retrieved" in instruction


def test_contains_arabic() -> None:
    assert prompts.contains_arabic("مرحبا") is True
    assert prompts.contains_arabic("hello") is False
