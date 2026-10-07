"""Build the ROOT favicon.ico from the rendered app icon.

Separate from tools/blender/make_ico.py on purpose: that one writes the
256px desktop installer icon, while /favicon.ico is the fallback that
browsers, crawlers and link-previewers request directly at the site root
regardless of the <link rel="icon"> tags in index.html.

Shipping the installer icon here would put ~395 KB on that request, so this
emits only the small square sizes that path actually needs.

    python tools/make_favicon.py
"""
import io
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "public" / "images" / "vanitas-app-icon.png"
TARGET = ROOT / "public" / "favicon.ico"

# 16/32/48 cover browser chrome, taskbar pinning and macOS Finder; 64 covers
# high-DPI shortcuts. Anything larger is wasted on this request path.
SIZES = [(16, 16), (32, 32), (48, 48), (64, 64)]


def main() -> None:
    if not SOURCE.exists():
        raise SystemExit(f"missing source render: {SOURCE}\n"
                         "run `blender -b --python tools/blender/render.py -- --asset app-icon`")

    with Image.open(SOURCE) as src:
        # The gem is cut on transparency; paste onto transparent RGBA so the
        # downscale does not fringe dark edges against the folder background.
        icon = src.convert("RGBA")

    TARGET.parent.mkdir(parents=True, exist_ok=True)
    icon.save(TARGET, format="ICO", sizes=SIZES)

    with Image.open(TARGET) as check:
        # Pillow reports ICO entries as a set of (w, h) pairs already.
        embedded = sorted(check.info.get("sizes", SIZES))
    kb = TARGET.stat().st_size / 1024
    print(f"wrote {TARGET.relative_to(ROOT)}  {kb:.1f} KB  sizes={embedded}")
    print(f"source was {SOURCE.stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    main()
