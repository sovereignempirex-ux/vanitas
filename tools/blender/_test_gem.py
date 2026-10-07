# Quick geometry/material smoke test for the brand gem.
# Run: blender -b --python tools/blender/_test_gem.py

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
import vanitas

scene = vanitas.reset_scene()
gem = vanitas.make_gem(radius=1.0)
# Emission kept near-zero: it acts as a flat wash that flattens the
# faceting, which is the one thing BRAND.md §2 says must stay legible.
vanitas.gem_material(gem, emission=0.08)

vanitas.set_gradient_world(strength=0.9)
# Small sources, not 5m panels: a hard light rakes across the facets and
# separates each cut plane. Big soft lights wash them into one shape.
vanitas.add_area("Key", (4, -4, 5), 320, vanitas.AZURE, size=1.2)
vanitas.add_area("Rim", (-4, 3, 2), 380, vanitas.CYAN, size=1.2)
vanitas.add_area("Fill", (0, -6, -1), 55, vanitas.GEM_BODY, size=4)

vanitas.add_camera(location=(3.6, -3.6, 2.0), lens=60)
# Standard, not AgX: this render is judging brand colour, and AgX
# desaturates azure toward white.
vanitas.configure_cycles(samples=48, view_transform="Standard")
scene.view_settings.exposure = -0.4

scene.render.resolution_x = 640
scene.render.resolution_y = 640
scene.render.resolution_percentage = 100

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "_test_gem.png")
scene.render.filepath = out
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"

print("FACES:", len(gem.data.polygons), "VERTS:", len(gem.data.vertices))
print("RENDERING:", out)
bpy.ops.render.render(write_still=True)
print("DONE:", out, os.path.exists(out))
