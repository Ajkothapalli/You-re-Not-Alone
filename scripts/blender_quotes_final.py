"""
Blender headless script -- three Cycles passes at 2048x2048
Run via:
  /Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/blender_quotes_final.py
Outputs: renders/quotes_full.png, renders/quotes_fg.png, renders/quotes_mono.png
"""

import bpy, mathutils, os, math

# -- Paths --------------------------------------------------------------------
SCRIPT_DIR  = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR = os.path.dirname(SCRIPT_DIR)
RENDER_DIR  = os.path.join(PROJECT_DIR, "renders")
FONT_PATH   = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"
os.makedirs(RENDER_DIR, exist_ok=True)

# Glyph characters (Unicode escapes -- avoids any encoding corruption)
OPEN_QUOTE  = '“'   # left double quotation mark
CLOSE_QUOTE = '”'   # right double quotation mark

# -- Helpers ------------------------------------------------------------------
def hex_to_linear(h):
    r = int(h[1:3], 16) / 255
    g = int(h[3:5], 16) / 255
    b = int(h[5:7], 16) / 255
    def srgb(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return (srgb(r), srgb(g), srgb(b), 1.0)

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=True)
    for col in list(bpy.data.collections):
        bpy.data.collections.remove(col)

def set_render_settings(res=2048, samples=128):
    sc = bpy.context.scene
    sc.render.engine          = 'CYCLES'
    sc.render.resolution_x   = res
    sc.render.resolution_y   = res
    sc.render.resolution_percentage = 100
    sc.cycles.samples         = samples
    sc.cycles.use_denoising   = True
    sc.cycles.denoiser        = 'OPENIMAGEDENOISE'
    sc.cycles.device          = 'GPU'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode  = 'RGBA'
    sc.render.image_settings.color_depth = '8'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'METAL'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
    except Exception:
        pass

def principled_mat(name, base_rgba, roughness=0.4, subsurface=0.12, coat=0.22):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    bsdf = nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value      = base_rgba
    bsdf.inputs['Roughness'].default_value       = roughness
    try:
        bsdf.inputs['Subsurface Weight'].default_value = subsurface
    except KeyError:
        try:
            bsdf.inputs['Subsurface'].default_value = subsurface
        except KeyError:
            pass
    try:
        bsdf.inputs['Coat Weight'].default_value = coat
    except KeyError:
        try:
            bsdf.inputs['Clearcoat'].default_value = coat
        except KeyError:
            pass
    out = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    return mat

def emission_mat(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    nodes.clear()
    em  = nodes.new('ShaderNodeEmission')
    em.inputs['Color'].default_value    = (1, 1, 1, 1)
    em.inputs['Strength'].default_value = 1.0
    out = nodes.new('ShaderNodeOutputMaterial')
    mat.node_tree.links.new(em.outputs['Emission'], out.inputs['Surface'])
    return mat

def make_quote(glyph, mat, loc_x, tilt_deg):
    bpy.ops.object.text_add(location=(loc_x, 0, 0.30))
    obj = bpy.context.active_object
    obj.data.body          = glyph
    obj.data.size          = 2.6
    obj.data.extrude       = 0.14
    obj.data.bevel_depth   = 0.022
    obj.data.bevel_resolution = 4
    obj.data.align_x       = 'CENTER'
    obj.data.align_y       = 'CENTER'
    try:
        font = bpy.data.fonts.load(FONT_PATH)
        obj.data.font = font
    except Exception:
        pass
    obj.rotation_euler = (math.radians(90), 0, math.radians(tilt_deg))
    if mat:
        obj.data.materials.append(mat)
    return obj

def make_camera():
    bpy.ops.object.camera_add(location=(0, -5.3, 1.45))
    cam = bpy.context.active_object
    target = mathutils.Vector((0, 0, 0.30))
    direction = target - cam.location
    rot = direction.to_track_quat('-Z', 'Y')
    cam.rotation_euler = rot.to_euler()
    cam.data.lens = 72
    bpy.context.scene.camera = cam
    return cam

def add_lights():
    bpy.ops.object.light_add(type='AREA', location=(2.5, -2.0, 4.0))
    key = bpy.context.active_object
    key.data.energy = 900
    key.data.color  = (1.0, 0.78, 0.55)
    key.data.size   = 2.0
    key.rotation_euler = (math.radians(-30), math.radians(20), 0)

    bpy.ops.object.light_add(type='AREA', location=(-3.0, 1.5, 2.5))
    rim = bpy.context.active_object
    rim.data.energy = 420
    rim.data.color  = (0.61, 0.55, 0.96)
    rim.data.size   = 1.5
    rim.rotation_euler = (math.radians(40), math.radians(-30), 0)

    bpy.ops.object.light_add(type='AREA', location=(0, -3.0, -0.5))
    fill = bpy.context.active_object
    fill.data.energy = 160
    fill.data.color  = (0.9, 0.9, 1.0)
    fill.data.size   = 3.0

def add_floor(mat):
    bpy.ops.mesh.primitive_plane_add(size=14, location=(0, 0, -1.2))
    floor = bpy.context.active_object
    floor.data.materials.append(mat)
    return floor

def render(filepath):
    bpy.context.scene.render.filepath = filepath
    bpy.ops.render.render(write_still=True)
    print("[blender_quotes] wrote " + filepath)

# -----------------------------------------------------------------------------
# PASS 1 -- full (opaque ink floor, 128 samples)
# -----------------------------------------------------------------------------
clear_scene()
set_render_settings(2048, 128)

mat_warm  = principled_mat("warm", hex_to_linear("#F5996E"))
mat_cool  = principled_mat("cool", hex_to_linear("#9C8BF6"))
mat_floor = bpy.data.materials.new("floor")
mat_floor.use_nodes = True
nodes = mat_floor.node_tree.nodes
nodes.clear()
bsdf = nodes.new('ShaderNodeBsdfPrincipled')
bsdf.inputs['Base Color'].default_value = hex_to_linear("#14111B")
bsdf.inputs['Roughness'].default_value  = 0.24
out = nodes.new('ShaderNodeOutputMaterial')
mat_floor.node_tree.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])

make_quote(OPEN_QUOTE,  mat_warm, -0.85,  7)
make_quote(CLOSE_QUOTE, mat_cool,  0.50, -7)
make_camera()
add_lights()
add_floor(mat_floor)

bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Color'].default_value   = hex_to_linear("#0E0C13")
    bg.inputs['Strength'].default_value = 0.0

bpy.context.scene.render.film_transparent = False
render(os.path.join(RENDER_DIR, "quotes_full.png"))

# -----------------------------------------------------------------------------
# PASS 2 -- fg (transparent film, no floor, 128 samples)
# -----------------------------------------------------------------------------
clear_scene()
set_render_settings(2048, 128)

mat_warm = principled_mat("warm", hex_to_linear("#F5996E"))
mat_cool = principled_mat("cool", hex_to_linear("#9C8BF6"))

make_quote(OPEN_QUOTE,  mat_warm, -0.85,  7)
make_quote(CLOSE_QUOTE, mat_cool,  0.50, -7)
make_camera()
add_lights()

bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Strength'].default_value = 0.0

bpy.context.scene.render.film_transparent = True
render(os.path.join(RENDER_DIR, "quotes_fg.png"))

# -----------------------------------------------------------------------------
# PASS 3 -- mono (transparent film, pure white emission, 32 samples)
# -----------------------------------------------------------------------------
clear_scene()
set_render_settings(2048, 32)

mat_mono = emission_mat("mono")

make_quote(OPEN_QUOTE,  mat_mono, -0.85,  7)
make_quote(CLOSE_QUOTE, mat_mono,  0.50, -7)
make_camera()

bpy.context.scene.world.use_nodes = True
bg = bpy.context.scene.world.node_tree.nodes.get('Background')
if bg:
    bg.inputs['Strength'].default_value = 0.0

bpy.context.scene.render.film_transparent = True
render(os.path.join(RENDER_DIR, "quotes_mono.png"))

print("[blender_quotes] all three passes complete")
