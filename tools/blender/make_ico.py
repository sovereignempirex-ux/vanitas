# Rebuild the Windows .ico from the current PNG without re-rendering.
# Run: blender -b --python tools/blender/make_ico.py

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from render import OUT, write_ico

write_ico(os.path.join(OUT, "vanitas-app-icon.png"),
          os.path.join(OUT, "vanitas-desktop-installer.ico"))
