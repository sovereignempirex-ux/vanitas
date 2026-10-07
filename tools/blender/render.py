# ---------------------------------------------------------------------------
# Vanitas — batch asset renderer.
#
#   blender -b --python tools/blender/render.py -- --asset all
#   blender -b --python tools/blender/render.py -- --asset auth-bg
#
# Writes into public/images/. Dimensions are pinned to the values the CSS
# already expects so no layout code has to change.
#
# Machine note: this box has Intel UHD graphics only — no CUDA/Metal — so
# every render is Cycles on CPU (10 cores). Sample counts are set low and
# paired with the denoiser; expect ~1-3 min per background, ~30s per icon.
# ---------------------------------------------------------------------------

import argparse
import math
import os
import struct
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector

import vanitas

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
OUT = os.path.join(ROOT, "public", "images")


def _setup(width, height, samples, transparent=False, view="AgX",
           background="gradient"):
    scene = vanitas.reset_scene()
    vanitas.configure_cycles(samples=samples, transparent=transparent,
                              view_transform=view)
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA" if transparent else "RGB"
    if background == "gradient":
        vanitas.set_gradient_world(strength=0.9)
    elif background == "void":
        vanitas.set_void_world(strength=1.0)
    return scene


def _save(scene, name, fmt=None):
    os.makedirs(OUT, exist_ok=True)
    if fmt:
        scene.render.image_settings.file_format = fmt
        scene.render.image_settings.color_mode = "RGB" if fmt == "JPEG" else "RGBA"
        if fmt == "JPEG":
            scene.render.image_settings.color_mode = "RGB"
            scene.render.image_settings.quality = 92
    path = os.path.join(OUT, name)
    scene.render.filepath = path
    print("RENDER_START", name)
    bpy.ops.render.render(write_still=True)
    print("RENDER_OK", name, os.path.getsize(path))


# --- backgrounds ----------------------------------------------------------

def render_auth_bg():
    """AuthPage backdrop. Sits at opacity-25 under a slate-950/90 overlay,
    so it only has to carry cool texture — no detail worth reading."""
    scene = _setup(1600, 1000, samples=72, view="AgX")
    gem = vanitas.make_gem(radius=1.5)
    vanitas.gem_material(gem, emission=0.05)
    gem.rotation_euler = (0.12, -0.18, 0.35)

    # Off-centre: AuthPage puts its form on top, so the gem belongs in the
    # right third where nothing overlaps it.
    gem.location = (1.9, 0.0, -0.15)

    vanitas.add_area("Key", (5, -5, 6), 260, vanitas.AZURE, size=1.4)
    vanitas.add_area("Rim", (-3, 4, 3), 300, vanitas.CYAN, size=1.2)
    vanitas.add_area("Fill", (0, -7, -2), 35, vanitas.GEM_BODY, size=5)

    vanitas.add_camera(location=(0.0, -9.5, 1.2), target=(0.6, 0, 0), lens=42)
    scene.view_settings.exposure = -0.5
    _save(scene, "auth-bg.jpg", fmt="JPEG")


def render_overview_hero():
    """Overview/Sidebar backdrop, also the README banner. Radically low
    contrast — it renders behind live UI at opacity-25."""
    import random

    import bmesh

    scene = _setup(1600, 1000, samples=64, view="AgX")

    gem = vanitas.make_gem(radius=1.0)
    vanitas.gem_material(gem, emission=0.12)
    # Inset from the edge — earlier passes cropped the mark against the
    # frame, and BRAND.md §2 requires clear space around it.
    gem.location = (-3.5, 1.0, 0.5)
    gem.rotation_euler = (0.3, 0.5, -0.4)

    # A jittered field of endpoints joined by lit segments. A regular grid
    # reads as confetti; jitter plus edges reads as a service map.
    rng = random.Random(20261007)
    cols, rows = 12, 8
    pts = {}
    for i in range(cols):
        for j in range(rows):
            pts[(i, j)] = (
                -7.8 + i * 1.45 + rng.uniform(-0.42, 0.42),
                3.5 + rng.uniform(0.0, 5.0),
                -3.1 + j * 0.92 + rng.uniform(-0.3, 0.3),
            )

    # Node mesh — one shared mesh, instanced per endpoint.
    node_mesh = bpy.data.meshes.new("Node")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=1, radius=0.085)
    bm.to_mesh(node_mesh)
    bm.free()
    node_mesh.materials.append(_emissive(vanitas.AZURE, 0.5))

    for pos in pts.values():
        obj = bpy.data.objects.new("Node", node_mesh)
        bpy.context.collection.objects.link(obj)
        obj.location = pos
        # Scale spread gives near/far falloff so the field has perspective.
        obj.scale = (1.0,) * 3

    # Segment mesh — thin prisms between neighbouring endpoints. Cycles has
    # no edge rendering, so the links must be real geometry.
    seg_mesh = bpy.data.meshes.new("Link")
    bm = bmesh.new()
    up = Vector((0.0, 1.0, 0.0))
    for (i, j), a in pts.items():
        for key in ((i + 1, j), (i, j + 1)):
            if key not in pts:
                continue
            b = pts[key]
            a_v, b_v = Vector(a), Vector(b)
            axis = b_v - a_v
            length = axis.length
            # Jitter can throw a pair far apart; skip those rather than
            # stretching a link across the whole frame.
            if length < 1e-4 or length > 2.6:
                continue
            axis.normalize()
            side = axis.cross(up)
            if side.length < 1e-4:
                side = axis.cross(Vector((1.0, 0.0, 0.0)))
            side.normalize()
            other = axis.cross(side).normalized()
            half = 0.018

            ring = []
            for endpoint in (a_v, b_v):
                for s, o in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
                    ring.append(bm.verts.new(
                        endpoint + side * (s * half) + other * (o * half)))
            for k in range(4):
                k2 = (k + 1) % 4
                bm.faces.new((ring[k], ring[k2], ring[4 + k2], ring[4 + k]))
            bm.faces.new((ring[0], ring[1], ring[2], ring[3]))
            bm.faces.new((ring[7], ring[6], ring[5], ring[4]))

    bm.normal_update()
    bm.to_mesh(seg_mesh)
    bm.free()
    seg_mesh.materials.append(_emissive(vanitas.SKYLINE, 0.3))

    seg_obj = bpy.data.objects.new("Links", seg_mesh)
    bpy.context.collection.objects.link(seg_obj)

    vanitas.add_area("Key", (4, -6, 6), 200, vanitas.AZURE, size=3)
    vanitas.add_area("Rim", (-6, 3, 2), 240, vanitas.CYAN, size=3)

    vanitas.add_camera(location=(1.5, -10.0, 0.6), target=(0, 1, 0), lens=38)
    scene.view_settings.exposure = -0.9
    _save(scene, "overview-hero.jpg", fmt="JPEG")


def render_docs_banner():
    """DocsView banner. The old photo blew out to pure white on the right;
    keep every pixel below clipping."""
    scene = _setup(1600, 1000, samples=64, view="AgX")

    gem = vanitas.make_gem(radius=1.25)
    # Wireframe only — a solid gem would compete with the docs copy that
    # sits on top of this banner.
    wire = gem.modifiers.new("Wire", type="WIREFRAME")
    wire.thickness = 0.035
    wire.use_replace = True
    mat = bpy.data.materials.new("Wire")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Emission Color"].default_value = vanitas.SKYLINE
    b.inputs["Emission Strength"].default_value = 2.2
    b.inputs["Base Color"].default_value = vanitas.GEM_MID
    gem.data.materials.clear()
    gem.data.materials.append(mat)
    gem.rotation_euler = (0.2, -0.35, 0.6)
    gem.location = (3.6, 0.5, -0.2)

    vanitas.add_area("Key", (5, -5, 5), 120, vanitas.AZURE, size=4)
    vanitas.add_camera(location=(0.0, -9.0, 0.8), target=(1.4, 0, 0), lens=45)
    scene.view_settings.exposure = -1.1
    _save(scene, "docs-banner.jpg", fmt="JPEG")


def _emissive(color, strength):
    mat = bpy.data.materials.new("Emit")
    mat.use_nodes = True
    b = mat.node_tree.nodes["Principled BSDF"]
    b.inputs["Emission Color"].default_value = color
    b.inputs["Emission Strength"].default_value = strength
    return mat


# --- icons ----------------------------------------------------------------

def render_app_icon():
    """vanitas-app-icon.png — 1024px, transparent, per assets.ts.

    Standard view transform, not AgX: icon art has to land the azure on
    hex rather than let the filmic curve pull it toward grey.
    """
    scene = _setup(1024, 1024, samples=128, transparent=True,
                   view="Standard", background="gradient")
    gem = vanitas.make_gem(radius=1.25)
    vanitas.gem_material(gem, emission=0.1)
    gem.rotation_euler = (0.0, 0.0, 0.45)

    vanitas.add_area("Key", (4, -4, 5), 300, vanitas.AZURE, size=1.5)
    vanitas.add_area("Rim", (-4, 3, 2), 340, vanitas.CYAN, size=1.5)
    vanitas.add_area("Fill", (0, -6, -2), 60, vanitas.GEM_BODY, size=5)

    # Wide framing — BRAND.md §2 wants roughly half the mark's height free
    # on every side, so the gem occupies the middle ~55% of the tile.
    vanitas.add_camera(location=(0.0, -8.6, 1.7), lens=50)
    scene.render.film_transparent = True
    _save(scene, "vanitas-app-icon.png")


def write_ico(png_path, ico_path, sizes=(256, 128, 64, 48, 32, 16)):
    """Wrap already-rendered PNGs into a Vista+ ICO (PNG-compressed entries).

    Blender cannot write .ico, and assets.ts promises
    vanitas-desktop-installer.ico — so the container is assembled here.
    """
    blobs = []
    for size in sizes:
        src = png_path if size == 256 else None
        if src is None:
            continue
        with open(src, "rb") as fh:
            blobs.append(fh.read())

    count = len(blobs)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    entries = b""
    data = b""
    for blob in blobs:
        # 0 in the dimension byte means 256px.
        entries += struct.pack("<BBBBHHII", 0, 0, 0, 0, 1, 32,
                               len(blob), offset)
        data += blob
        offset += len(blob)
    with open(ico_path, "wb") as fh:
        fh.write(header + entries + data)
    print("ICO_OK", ico_path, os.path.getsize(ico_path))


ASSETS = {
    "auth-bg": render_auth_bg,
    "overview-hero": render_overview_hero,
    "docs-banner": render_docs_banner,
    "app-icon": render_app_icon,
}

# Order matters: app-icon renders first so write_ico can consume its PNG.
ALL = ["app-icon", "auth-bg", "overview-hero", "docs-banner"]


def main():
    argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--asset", default="all")
    args = parser.parse_args(argv)

    names = ALL if args.asset == "all" else [args.asset]
    for name in names:
        ASSETS[name]()

    if "app-icon" in names:
        write_ico(os.path.join(OUT, "vanitas-app-icon.png"),
                  os.path.join(OUT, "vanitas-desktop-installer.ico"))


# Guarded so importing this module (make_ico.py) does not kick off a
# full re-render.
if __name__ == "__main__":
    main()
