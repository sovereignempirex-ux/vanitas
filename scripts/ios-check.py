#!/usr/bin/env python3
"""Checks the iOS phase without needing macOS.

What it can prove locally (Swift itself compiles on the `ios` CI job):

  1. every ``.swift`` file parses with tree-sitter (no syntax errors);
  2. the hand-written ``project.pbxproj`` is internally consistent, references
     objects that exist, and lists exactly the sources on disk;
  3. every route the Swift client calls is a route the gateway actually
     registers, and every field of the shared wire contract exists in
     ``Models.swift``;
  4. the plist/scheme/asset JSON are well-formed.

Usage:  python scripts/ios-check.py
"""

from __future__ import annotations

import json
import pathlib
import re
import sys
import xml.etree.ElementTree as ET

ROOT = pathlib.Path(__file__).resolve().parents[1]
IOS = ROOT / "apps" / "ios"
SERVER_DIR = ROOT / "src" / "server"
TYPES = ROOT / "src" / "types.ts"

# Windows consoles default to cp1252, which cannot print ─ or Arabic.
if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# SwiftPM drops build output and workspace metadata inside apps/ios. Those
# trees are generated — they even contain a synthesised
# `DerivedSources/test_entry_point.swift` — so every structural check below
# only ever looks at the sources this project actually owns.
IGNORED_PARTS = {".build", ".swiftpm"}


def repo_files(pattern: str) -> list[pathlib.Path]:
    return sorted(
        p for p in IOS.rglob(pattern)
        if not IGNORED_PARTS.intersection(p.parts)
    )


failures: list[str] = []


def check(label: str, ok: bool, detail: str = "") -> None:
    mark = "OK  " if ok else "FAIL"
    line = f"  [{mark}] {label}"
    if detail and not ok:
        line += f" — {detail}"
    print(line)
    if not ok:
        failures.append(label)


# ---------------------------------------------------------------- 1. syntax
def check_syntax() -> None:
    print("\nSwift syntax (tree-sitter)")
    try:
        from tree_sitter import Language, Parser
        import tree_sitter_swift
    except ImportError:
        print("  [SKIP] tree-sitter-swift not installed "
              "(pip install tree-sitter tree-sitter-swift)")
        return

    parser = Parser(Language(tree_sitter_swift.language()))
    files = repo_files("*.swift")
    check(f"{len(files)} Swift files found", len(files) >= 20)

    broken: list[str] = []
    for path in files:
        tree = parser.parse(path.read_bytes())
        if tree.root_node.has_error:
            for node in walk_errors(tree.root_node):
                rel = path.relative_to(ROOT)
                broken.append(f"{rel}:{node.start_point[0] + 1}")
                break
    check("all Swift files parse", not broken, ", ".join(broken[:8]))


def walk_errors(node):
    if node.type == "ERROR" or node.is_missing:
        yield node
    for child in node.children:
        yield from walk_errors(child)


# ------------------------------------------------------------ 2. xcodeproj
def check_project() -> None:
    print("\nXcode project")
    pbx_path = IOS / "Vanitas.xcodeproj" / "project.pbxproj"
    check("project.pbxproj exists", pbx_path.is_file())
    if not pbx_path.is_file():
        return

    text = pbx_path.read_text(encoding="utf-8")

    # Parse with the same library Xcode-adjacent tooling uses.
    try:
        from pbxproj import XcodeProject

        XcodeProject.load(str(pbx_path))
        check("parses as an Xcode project", True)
    except ImportError:
        print("  [SKIP] pbxproj not installed (pip install pbxproj)")
    except Exception as exc:  # pragma: no cover - depends on the library
        check("parses as an Xcode project", False, repr(exc))

    defined = set(re.findall(r"^\t\t([0-9A-F]{24}) ", text, re.M))
    referenced = set(re.findall(r"\b([0-9A-F]{24})\b", text))
    dangling = referenced - defined
    check(f"all {len(defined)} object ids resolve", not dangling,
          ", ".join(sorted(dangling)))

    # Every source on disk is in the project, and vice versa.
    on_disk = {
        p.name for p in (IOS / "Vanitas").rglob("*.swift")
    } | {
        p.name for p in (IOS / "Sources").rglob("*.swift")
    }
    in_project = {
        name for name in re.findall(r"path = ([^;]+);", text)
        if name.endswith(".swift")
    }
    check("project lists exactly the sources on disk",
          on_disk == in_project,
          f"missing={sorted(on_disk - in_project)} extra={sorted(in_project - on_disk)}")

    # Group paths must match the filesystem.
    check("core group points at Sources/VanitasCore",
          "path = Sources/VanitasCore;" in text)
    check("views group points at Views", "path = Views;" in text)
    check("info plist setting matches the file on disk",
          "INFOPLIST_FILE = Vanitas/Info.plist;" in text
          and (IOS / "Vanitas" / "Info.plist").is_file())

    # The scheme's blueprint id must be the target's id.
    scheme = IOS / "Vanitas.xcodeproj" / "xcshareddata" / "xcschemes" / "Vanitas.xcscheme"
    check("shared scheme exists", scheme.is_file())
    if scheme.is_file():
        target = re.search(r"^(\t\t[C0-9A-F]{24}) /\* Vanitas \*/ = \{\n\t\t\tisa = PBXNativeTarget;",
                           text, re.M)
        blueprint = re.search(r'BlueprintIdentifier = "([0-9A-F]{24})"', scheme.read_text())
        check("scheme blueprint matches the native target",
              target is not None and blueprint is not None
              and target.group(1).strip() == blueprint.group(1))


# ------------------------------------------------- 3. wire contract / routes
def check_contract() -> None:
    print("\nContract with the gateway")
    client = (IOS / "Sources" / "VanitasCore" / "VanitasClient.swift").read_text(encoding="utf-8")
    models = (IOS / "Sources" / "VanitasCore" / "Models.swift").read_text(encoding="utf-8")

    server_text = "\n".join(
        p.read_text(encoding="utf-8", errors="replace")
        for p in sorted(SERVER_DIR.glob("*.ts"))
    )
    check("gateway sources found", bool(server_text))

    paths = re.findall(r'call\(\s*"([^"]+)"', client)
    check(f"{len(paths)} endpoints referenced by the client", len(paths) >= 6)

    bad_routes = []
    for raw in paths:
        # drop \(...) interpolation, including one level of nesting
        static = re.sub(r"\\\((?:[^()]|\([^()]*\))*\)", "", raw)
        tokens = (t.rstrip("/") for t in re.split(r"//+", static))
        for token in tokens:
            if token and token != "/" and token not in server_text:
                bad_routes.append(f"{raw} -> {token}")
    check("every client route exists in the gateway", not bad_routes,
          ", ".join(bad_routes))

    if not TYPES.is_file():
        check("src/types.ts present", False)
        return

    types = TYPES.read_text(encoding="utf-8", errors="replace")
    pairs = [
        ("ApiKey", "ApiKey", {"secretHash", "currentRpmUsage", "usagePeriod",
                              "rateLimitAlgorithm", "actionOnExceed"}),
        ("UsageSummary", "UsageSummary", set()),
        ("UsageAnalytics", "UsageAnalytics", set()),
        ("UsagePoint", "UsagePoint", set()),
        ("UserProfile", "UserProfile", {"bio", "accentColor"}),
    ]
    for ts_name, swift_name, ignored in pairs:
        ts_fields = ts_fields_of(types, ts_name) - ignored
        swift_fields = swift_fields_of(models, swift_name)
        missing = ts_fields - swift_fields
        check(f"{swift_name} carries every field of types.ts:{ts_name}",
              not missing, f"missing {sorted(missing)}")


def ts_fields_of(text: str, name: str) -> set[str]:
    match = re.search(r"export interface %s\b[^{]*\{(.*?)\n\}" % re.escape(name),
                      text, re.S)
    if not match:
        return set()
    return set(re.findall(r"^\s*([A-Za-z_]\w*)\??\s*:", match.group(1), re.M))


def swift_fields_of(text: str, name: str) -> set[str]:
    match = re.search(r"public struct %s\b[^{]*\{(.*?)\n\}" % re.escape(name),
                      text, re.S)
    if not match:
        return set()
    return set(re.findall(r"public let (\w+):", match.group(1)))


# ------------------------------------------------------------- 4. resources
def check_resources() -> None:
    print("\nResources")
    plists = repo_files("*.plist")
    bad = []
    for path in plists:
        try:
            ET.parse(path)
        except ET.ParseError as exc:
            bad.append(f"{path.name}: {exc}")
    check(f"{len(plists)} plist file(s) are well-formed", not bad, "; ".join(bad))

    schemes = repo_files("*.xcscheme")
    bad = []
    for path in schemes:
        try:
            ET.parse(path)
        except ET.ParseError as exc:
            bad.append(f"{path.name}: {exc}")
    check("scheme XML is well-formed", not bad, "; ".join(bad))

    catalogs = repo_files("Contents.json")
    bad = []
    for path in catalogs:
        try:
            json.loads(path.read_text(encoding="utf-8"))
        except ValueError as exc:
            bad.append(f"{path}: {exc}")
    check(f"{len(catalogs)} asset catalog file(s) are valid JSON",
          not bad, "; ".join(str(b) for b in bad))

    # The identifier BGTaskScheduler is told about at launch must be the one
    # registered in code — a mismatch crashes the app on startup.
    info = (IOS / "Vanitas" / "Info.plist").read_text(encoding="utf-8")
    app = (IOS / "Vanitas" / "VanitasApp.swift").read_text(encoding="utf-8")
    ident = re.search(r'"([a-z0-9.]+\.usagecheck)"', app)
    check("background task id matches Info.plist",
          ident is not None and ident.group(1) in info)


def main() -> int:
    print(f"iOS checks — {IOS.relative_to(ROOT)}")
    check_syntax()
    check_project()
    if SERVER_DIR.is_dir():
        check_contract()
    check_resources()

    print()
    if failures:
        print(f"{len(failures)} failed: " + "; ".join(failures))
        return 1
    print("all iOS checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
