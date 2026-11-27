# =============================================================
#  AZETIN — touches du clavier et souris en 3D (Blender / Cycles), pour les invites du jeu
#  python3 tools/blender/keys.py   ->  public/ui/keys/<nom>.png (fond transparent)
#  Touche noire usée, lettre blanc cassé gravée, liseré braise sous la touche.
# =============================================================
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa
import lib
import bpy, bmesh
import mathutils as mu

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'ui', 'keys')
os.makedirs(OUT, exist_ok=True)
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'

KEYS = [('E', 1), ('R', 1), ('F', 1), ('M', 1), ('V', 1), ('Q', 1), ('A', 1), ('C', 1), ('W', 1), ('Z', 1), ('S', 1), ('D', 1),
        ('1', 1), ('2', 1), ('3', 1), ('Tab', 1.5), ('Esc', 1.2), ('Shift', 1.9), ('Space', 2.6)]


def scene():
    sc = reset()
    sc.cycles.samples = 48
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.055, 0.08, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    # lumière principale (lune froide) + contre-jour braise
    for name, kind, energy, rot, col, loc in (
        ('key', 'AREA', 260, (0.75, 0, 0.6), (0.85, 0.9, 1.0), (1.5, -2.5, 3.2)),
        ('rim', 'AREA', 180, (-0.9, 0, 3.4), (1.0, 0.45, 0.12), (-1.2, 2.4, 1.0)),
        ('top', 'AREA', 120, (0, 0, 0), (1, 1, 1), (0, 0, 4))):
        l = bpy.data.lights.new(name, kind); l.energy = energy; l.color = col; l.size = 2.5
        o = bpy.data.objects.new(name, l); sc.collection.objects.link(o); o.location = loc
        o.rotation_euler = (o.location * -1).to_track_quat('-Z', 'Y').to_euler() if name != 'top' else (0, 0, 0)
    cam = bpy.data.cameras.new('cam'); cam.type = 'ORTHO'
    co = bpy.data.objects.new('cam', cam); sc.collection.objects.link(co); sc.camera = co
    co.location = (0, -3.2, 4.0)
    co.rotation_euler = (math.radians(38), 0, 0)
    return sc, cam


def plastic():
    m = bpy.data.materials.new('keycap'); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.022, 0.02, 0.019, 1)
    b.inputs['Roughness'].default_value = 0.42
    # usure : bruit qui fait varier la rugosité (zones lustrées par les doigts)
    n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 9
    r = nt.nodes.new('ShaderNodeMapRange'); r.inputs['To Min'].default_value = 0.28; r.inputs['To Max'].default_value = 0.6
    nt.links.new(n.outputs['Fac'], r.inputs['Value']); nt.links.new(r.outputs['Result'], b.inputs['Roughness'])
    bump = nt.nodes.new('ShaderNodeBump'); bump.inputs['Strength'].default_value = 0.08
    n2 = nt.nodes.new('ShaderNodeTexNoise'); n2.inputs['Scale'].default_value = 220
    nt.links.new(n2.outputs['Fac'], bump.inputs['Height']); nt.links.new(bump.outputs['Normal'], b.inputs['Normal'])
    return m


def ink():
    m = bpy.data.materials.new('ink'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.86, 0.82, 0.74, 1)
    b.inputs['Roughness'].default_value = 0.6
    b.inputs['Emission Color'].default_value = (1.0, 0.93, 0.8, 1)
    b.inputs['Emission Strength'].default_value = 0.15
    return m


def ember():
    m = bpy.data.materials.new('ember'); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.5, 0.1, 0.01, 1)
    b.inputs['Emission Color'].default_value = (1.0, 0.28, 0.03, 1)
    b.inputs['Emission Strength'].default_value = 1.2
    return m


def keycap(label, u, M):
    W, D, H = 0.9 * u + 0.1 * (u - 1), 0.9, 0.42
    objs = []
    # socle braise (lueur sous la touche)
    base = box('glow', M['ember'], W + 0.06, D + 0.06, 0.04, 0, 0, 0.02, bevel=0.03)
    objs.append(base)
    # touche : tronc de pyramide arrondi, dessus légèrement creusé
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        top = v.co.z > 0
        s = 0.86 if top else 1.0
        v.co.x *= W * s; v.co.y *= D * s; v.co.z = H if top else 0.05
        if top: v.co.y += 0.03
    cap = obj_from_bm(bm, 'cap', M['plastic'])
    bev(cap, 0.07, 4)
    sub = cap.modifiers.new('sub', 'SUBSURF'); sub.levels = 1; sub.render_levels = 2
    for p in cap.data.polygons: p.use_smooth = True
    objs.append(cap)
    # lettre gravée sur le dessus
    cu = bpy.data.curves.new('t', 'FONT'); cu.body = label
    cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    cu.size = 0.66 if len(label) == 1 else 0.4
    cu.align_x = 'CENTER'; cu.align_y = 'CENTER'; cu.extrude = 0.006
    t = bpy.data.objects.new('txt', cu); bpy.context.scene.collection.objects.link(t)
    t.data.materials.append(M['ink'])
    t.location = (0, 0.03, H + 0.004)
    objs.append(t)
    return objs, W


def mouse(side, M):
    """souris vue de dessus, bouton actif en braise"""
    objs = []
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=20, radius=0.5)
    for v in bm.verts:
        v.co.x *= 0.62 * (1 - 0.12 * max(v.co.y, 0) / 0.5); v.co.y *= 0.95; v.co.z = max(v.co.z, 0) * (0.55 + 0.25 * max(-v.co.y, 0))
    body = obj_from_bm(bm, 'mouse', M['plastic'])
    for p in body.data.polygons: p.use_smooth = True
    objs.append(body)
    # bouton actif : coloré dans la matière selon la position (avant, côté gauche ou droit), bord net
    m = M['plastic'].copy(); m.name = 'mouse_mat'
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    geo = nt.nodes.new('ShaderNodeNewGeometry'); sep = nt.nodes.new('ShaderNodeSeparateXYZ')
    nt.links.new(geo.outputs['Position'], sep.inputs[0])
    gx = nt.nodes.new('ShaderNodeMath'); gx.operation = 'LESS_THAN' if side == 'L' else 'GREATER_THAN'; gx.inputs[1].default_value = -0.018 if side == 'L' else 0.018
    nt.links.new(sep.outputs['X'], gx.inputs[0])
    gy = nt.nodes.new('ShaderNodeMath'); gy.operation = 'GREATER_THAN'; gy.inputs[1].default_value = 0.06
    nt.links.new(sep.outputs['Y'], gy.inputs[0])
    both = nt.nodes.new('ShaderNodeMath'); both.operation = 'MULTIPLY'
    nt.links.new(gx.outputs[0], both.inputs[0]); nt.links.new(gy.outputs[0], both.inputs[1])
    em = nt.nodes.new('ShaderNodeMix'); em.data_type = 'RGBA'
    em.inputs['A'].default_value = (0.022, 0.02, 0.019, 1); em.inputs['B'].default_value = (0.55, 0.12, 0.01, 1)
    nt.links.new(both.outputs[0], em.inputs['Factor']); nt.links.new(em.outputs['Result'], b.inputs['Base Color'])
    b.inputs['Emission Color'].default_value = (1.0, 0.28, 0.03, 1)
    nt.links.new(both.outputs[0], b.inputs['Emission Strength'])
    body.data.materials[0] = m
    objs.append(cyl('wheel', M['plastic'], 0.05, 0.05, 0.06, -0.03, 0.2, 0.25, seg=16, rot=(0, math.pi / 2, 0)))
    return objs


def render(name, width_u):
    sc = bpy.context.scene
    cam = sc.camera.data
    cam.ortho_scale = max(1.25, width_u + 0.3)
    px = 160
    sc.render.resolution_y = px
    sc.render.resolution_x = int(px * cam.ortho_scale / 1.25)
    cam.sensor_fit = 'VERTICAL'
    cam.ortho_scale = 1.25
    sc.render.resolution_x = int(px * max(1.25, width_u + 0.3) / 1.25)
    sc.render.filepath = os.path.join(OUT, name + '.png')
    bpy.ops.render.render(write_still=True)


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else None
    for label, u in KEYS + [('MouseR', 0), ('MouseL', 0)]:
        if only and label not in only:
            continue
        scene()
        M = dict(plastic=plastic(), ink=ink(), ember=ember())
        if label.startswith('Mouse'):
            mouse(label[-1], M)
            co = bpy.context.scene.camera
            co.location = (0, -1.6, 4.2); co.rotation_euler = (math.radians(20), 0, 0)
            render(label.lower(), 1.0)
        else:
            _, W = keycap(label, u, M)
            render(label.lower(), W)


if __name__ == '__main__':
    main()
