# ---------------------------------------------------------------------------
# Vanitas — shared Blender library.
#
# One source of truth for the brand's 3D mark and look, so every rendered
# asset (backgrounds, banners, app icons) comes from the same geometry and
# the same palette as BRAND.md. Nothing here is imported from a CDN at
# runtime — outputs land in public/images/ and get committed.
#
# Brand refs: BRAND.md §2 (the faceted gem), §3 (colour), §7 (imagery).
# ---------------------------------------------------------------------------

import math

import bmesh
import bpy
from mathutils import Vector

# --- palette (BRAND.md §3) ------------------------------------------------
# Values are scene-linear approximations of the sRGB hex stops; the view
# transform does the final conversion, so these are intentionally close to
# the hex values rather than linearised.
GEM_BODY = (0.490, 0.827, 0.988, 1.0)   # #7dd3fc  body, top
GEM_MID = (0.145, 0.388, 0.922, 1.0)    # #2563eb  body, middle
GEM_DEEP = (0.118, 0.227, 0.541, 1.0)   # #1e3a8a  body, base
FACET_LIGHT = (0.878, 0.949, 0.996, 1.0)  # #e0f2fe  lit facets
SKYLINE = (0.220, 0.741, 0.973, 1.0)    # #38bdf8  outline / rim
AZURE = (0.376, 0.647, 0.980, 1.0)      # #60a5fa  accent
CYAN = (0.133, 0.827, 0.933, 1.0)       # #22d3ee  accent-2
VOID = (0.0196, 0.0275, 0.0549, 1.0)    # #05070e  page background


def reset_scene():
    """Empty file, no default cube/camera/lights — deterministic renders."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
    return bpy.context.scene


def _shade_smooth_off(obj):
    """Flat shading. Every facet must read as a distinct cut plane."""
    for poly in obj.data.polygons:
        poly.use_smooth = False


def make_gem(radius=1.0, name="VanitasGem"):
    """The brand mark: a faceted crystal of cut planes (BRAND.md §2).

    Built with bmesh rather than a primitive so the silhouette is a real
    gem cut — pointed pavilion, hexagonal girdle, beveled crown, flat table.
    Six cut planes read as the six controls around one core.

        table   ── small flat hexagon on top
        crown   ── 6 sloped planes rising from the girdle
        girdle  ── the widest ring
        pavilion── pointed base
    """
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()

    # Ring profiles, bottom to top, as (radius, z). Proportions follow a
    # classic step cut so the crown catches rim light and the pavilion
    # stays dark — that contrast is what makes it read as crystal.
    pavilion_tip = bm.verts.new((0.0, 0.0, -1.55 * radius))
    girdle = []
    crown_mid = []
    table = []
    n = 6
    for i in range(n):
        a = (i / n) * 2.0 * math.pi + math.pi / n
        ca, sa = math.cos(a), math.sin(a)
        girdle.append(bm.verts.new((radius * ca, radius * sa, -0.15 * radius)))
        crown_mid.append(bm.verts.new((0.78 * radius * ca, 0.78 * radius * sa, 0.62 * radius)))
        table.append(bm.verts.new((0.44 * radius * ca, 0.44 * radius * sa, 1.00 * radius)))

    bm.verts.ensure_lookup_table()

    # Pavilion — 6 triangles converging on the tip.
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((pavilion_tip, girdle[j], girdle[i]))

    # Girdle band — the vertical belt.
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((girdle[i], girdle[j], crown_mid[j], crown_mid[i]))

    # Crown — 6 sloped cut planes.
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((crown_mid[i], crown_mid[j], table[j], table[i]))

    # Table — the flat top facet.
    bm.faces.new(tuple(reversed(table)))

    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    _shade_smooth_off(obj)
    return obj


def gem_material(obj, emission=0.0):
    """Glass crystal with a depth gradient — #7dd3fc top → #1e3a8a base.

    Transmission is on, but kept rough so the facets still read on CPU
    renders where caustics would just be noise. `emission` adds a faint
    self-glow so the gem is legible even against a near-black background.
    """
    mat = bpy.data.materials.new("VanitasCrystal")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]

    # Vertical gradient across the mesh drives the base colour.
    node_tree = mat.node_tree
    tex = node_tree.nodes.new("ShaderNodeTexCoord")
    sep = node_tree.nodes.new("ShaderNodeSeparateXYZ")
    ramp = node_tree.nodes.new("ShaderNodeValToRGB")
    node_tree.links.new(tex.outputs["Generated"], sep.inputs["Vector"])
    node_tree.links.new(sep.outputs["Z"], ramp.inputs["Fac"])

    # Three stops: #1e3a8a base → #2563eb mid → #7dd3fc crown. The mid stop
    # sits low (0.42) because Generated Z puts the girdle at ~0.55; leaving
    # it at 0.5 samples the pale stop across the whole crown and the gem
    # renders near-white instead of azure.
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = GEM_DEEP
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = GEM_BODY
    ramp.color_ramp.elements.new(0.42).color = GEM_MID

    node_tree.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])

    # Mostly-solid crystal, not clear glass. Full transmission lets the
    # world show through and washes the base colour out entirely — the gem
    # must read as saturated azure even against #05070e.
    bsdf.inputs["Transmission Weight"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.18
    bsdf.inputs["IOR"].default_value = 1.45
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Emission Color"].default_value = SKYLINE
    bsdf.inputs["Emission Strength"].default_value = emission

    obj.data.materials.append(mat)
    return mat


def add_area(name, location, energy, color, size=6.0, target=(0, 0, 0)):
    """Rectangular key/rim light aimed at the gem."""
    light_data = bpy.data.lights.new(name, type="AREA")
    light_data.energy = energy
    light_data.color = color[:3]
    light_data.size = size

    light = bpy.data.objects.new(name, light_data)
    bpy.context.collection.objects.link(light)
    light.location = Vector(location)

    direction = Vector(target) - light.location
    light.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    return light


def set_void_world(strength=1.0, color=VOID):
    """The page background (#05070e) as the world, so any camera angle
    lands on brand colour instead of a default grey."""
    world = bpy.data.worlds.new("VanitasVoid")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = color
    bg.inputs["Strength"].default_value = strength
    bpy.context.scene.world = world
    return world


def set_gradient_world(strength=1.0, low=VOID, high=(0.06, 0.14, 0.32, 1.0)):
    """Dark #05070e to the camera, a light gradient to everything else.

    Flat-shaded facets only separate if the light *varies* across their
    normals — uniform illumination hits every cut plane with the same value
    and they blur into one shape. But painting that gradient on the
    background would violate BRAND.md §3 (`#05070e` page background). The
    Light Path node resolves both: camera rays see flat void, reflection
    rays see the gradient that makes the six cuts read.
    """
    world = bpy.data.worlds.new("VanitasGradient")
    world.use_nodes = True
    nodes = world.node_tree.nodes
    links = world.node_tree.links

    bg = nodes["Background"]
    bg.inputs["Strength"].default_value = strength

    # --- camera path: flat brand void ---
    void_node = nodes.new("ShaderNodeRGB")
    void_node.outputs["Color"].default_value = VOID

    # --- reflection path: vertical gradient ---
    tex = nodes.new("ShaderNodeTexCoord")
    mapping = nodes.new("ShaderNodeMapping")
    sep = nodes.new("ShaderNodeSeparateXYZ")
    ramp = nodes.new("ShaderNodeValToRGB")

    # World "Generated" is the view direction, so Z spans -1..1. Map it to
    # 0..1 with scale 0.5 / offset 0.5 so the ramp covers floor to sky
    # exactly once (a 1.0 offset would clamp most of the sky to white).
    mapping.inputs["Location"].default_value = (0.0, 0.0, 0.5)
    mapping.inputs["Scale"].default_value = (1.0, 1.0, 0.5)

    links.new(tex.outputs["Generated"], mapping.inputs["Vector"])
    links.new(mapping.outputs["Vector"], sep.inputs["Vector"])
    links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = low
    ramp.color_ramp.elements[1].position = 1.0
    ramp.color_ramp.elements[1].color = high

    # --- branch on ray type ---
    path = nodes.new("ShaderNodeLightPath")
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"

    links.new(path.outputs["Is Camera Ray"], mix.inputs["Factor"])
    links.new(ramp.outputs["Color"], mix.inputs[6])   # A: non-camera rays
    links.new(void_node.outputs["Color"], mix.inputs[7])  # B: camera rays
    links.new(mix.outputs[2], bg.inputs["Color"])

    bpy.context.scene.world = world
    return world


def add_camera(location, target=(0, 0, 0), lens=50):
    cam_data = bpy.data.cameras.new("Camera")
    cam_data.lens = lens
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    cam.location = Vector(location)
    direction = Vector(target) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.camera = cam
    return cam


def configure_cycles(samples=96, denoise=True, transparent=False,
                      view_transform="AgX", look="None"):
    """Headless render settings.

    No discrete GPU is available on this machine (Intel UHD only), so Cycles
    runs on CPU — keep sample counts modest and lean on the denoiser.
    AgX gives the low-contrast, slightly desaturated look BRAND.md §7 asks
    for on backgrounds; pass view_transform="Standard" for icon art where
    the azure must land exactly on hex.
    """
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = samples
    scene.cycles.use_denoising = denoise
    scene.cycles.use_adaptive_sampling = True
    scene.cycles.adaptive_threshold = 0.02
    scene.cycles.max_bounces = 8
    scene.cycles.transmission_bounces = 6

    scene.render.film_transparent = transparent
    scene.view_settings.view_transform = view_transform
    scene.view_settings.look = look
    scene.view_settings.exposure = 0.0

    # Keep noise-free glass edges from aliasing away.
    scene.render.use_border = False
    scene.render.image_settings.color_mode = "RGB"
    return scene
