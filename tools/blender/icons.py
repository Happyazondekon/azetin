# =============================================================
#  AZETIN — icônes du téléphone et du HUD, modélisées et rendues dans Blender
#  (aucun pictogramme ni emoji standard : chaque icône est un objet du village)
#    python3 tools/blender/icons.py [-- map notes …]   ->  public/ui/icon-*.png
#  Plaquette de bois brûlé + objet ; lumière de lampe tempête (chaude) et contre-jour froid.
# =============================================================
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: F401,F403
import lib
import bpy

def torus(name, m, R0, r, x=0, y=0, z=0, rot=(0, 0, 0), seg=20, rs=8):
    bm = bmesh.new()
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(rs):
            b = 2 * math.pi * j / rs
            bm.verts.new(((R0 + r * math.cos(b)) * math.cos(a), (R0 + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(seg):
        for j in range(rs):
            a0, a1 = i * rs + j, ((i + 1) % seg) * rs + j
            b0, b1 = i * rs + (j + 1) % rs, ((i + 1) % seg) * rs + (j + 1) % rs
            bm.faces.new((bm.verts[a0], bm.verts[a1], bm.verts[b1], bm.verts[b0]))
    ob = obj_from_bm(bm, name, m)
    ob.location = (x, y, z)
    ob.rotation_euler = rot
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob



OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'ui')
os.makedirs(OUT, exist_ok=True)


def M():
    lib._mats.clear()
    return dict(
        plate=mat('i_plate', '#2a1c14', 0.75),
        plate_rim=mat('i_rim', '#4a3020', 0.6),
        paper=mat('i_paper', '#d8c8a2', 0.95),
        paper2=mat('i_paper2', '#bfae88', 0.95),
        red=mat('i_red', '#a32418', 0.6),
        ink=mat('i_ink', '#2a1a10', 0.8),
        white=mat('i_white', '#efe9dc', 0.9),
        black=mat('i_black', '#141210', 0.5),
        leather=mat('i_leather', '#6a3a1e', 0.7),
        wood=mat('i_wood', '#8a5a32', 0.7),
        iron=mat('i_iron', '#5a5450', 0.45, 0.8),
        brass=mat('i_brass', '#b08a3a', 0.35, 0.9),
        glass=mat('i_glass', '#101820', 0.05, 0.6),
        amber=mat('i_amber', '#ffb020', 0.3, emit='#ff9a10', emit_k=6.0),
        ember=mat('i_ember', '#2a0a04', 0.9, emit='#ff4a08', emit_k=1.4),
        kaolin=mat('i_kaolin', '#f2ede2', 1.0),
        green=mat('i_green', '#3a6a2a', 0.8),
        yellow=mat('i_yellow', '#d8a830', 0.6),
    )


def plate(m, objs, s=1.0):
    p = box('plate', m['plate'], 2.0 * s, 2.0 * s, 0.16, 0, 0, -0.08)
    bev(p, 0.32 * s, 4)
    objs.append(p)
    r = box('rim', m['plate_rim'], 1.9 * s, 1.9 * s, 0.02, 0, 0, 0.0)
    bev(r, 0.28 * s, 4)
    objs.append(r)


def render(name, elev=55, scale=2.4, res=256, light=1.0):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 48
    sc.render.film_transparent = True
    sc.render.resolution_x = sc.render.resolution_y = res
    sc.view_settings.view_transform = 'Standard'
    w = sc.world or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.05, 0.05, 0.07, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.6
    cam = bpy.data.cameras.new('ic_cam')
    cam.type = 'ORTHO'
    cam.ortho_scale = scale
    co = bpy.data.objects.new('ic_cam', cam)
    sc.collection.objects.link(co)
    e = math.radians(elev)
    co.location = (0, -6 * math.cos(e), 6 * math.sin(e) + 0.1)
    co.rotation_euler = (math.pi / 2 - e, 0, 0)
    sc.camera = co
    for nm, kind, en, col, loc in [('key', 'AREA', 260 * light, (1.0, 0.72, 0.42), (-2.5, -2.5, 4)), ('rim', 'AREA', 140 * light, (0.55, 0.7, 1.0), (2.5, 3, 2.5)), ('fill', 'AREA', 40 * light, (1, 0.9, 0.8), (3, -3, 1.5))]:
        l = bpy.data.lights.new(nm, kind)
        l.energy = en
        l.color = col
        l.size = 2.5
        lo = bpy.data.objects.new(nm, l)
        sc.collection.objects.link(lo)
        lo.location = loc
        d = mu.Vector((0, 0, 0)) - mu.Vector(loc)
        lo.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    sc.render.filepath = os.path.join(OUT, f'icon-{name}.png')
    bpy.ops.render.render(write_still=True)
    print('ICON', name)


def i_map():
    reset(); m = M(); objs = []; plate(m, objs)
    pap = box('pap', m['paper'], 1.35, 1.05, 0.03, 0, 0, 0.03, rot=(0, 0, 0.12))
    objs.append(pap)
    for x in (-0.22, 0.24):
        objs.append(box('fold' + str(x), m['paper2'], 0.04, 1.0, 0.032, x, 0, 0.035, rot=(0, 0, 0.12)))
    pts = [(-0.5, -0.3), (-0.2, -0.1), (0.05, -0.25), (0.3, 0.05), (0.42, 0.28)]
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        objs.append(between('road' + str(i), m['red'], (a[0], a[1], 0.055), (b[0], b[1], 0.055), 0.022))
    objs.append(cyl('pin', m['red'], 0.02, 0.02, 0.35, 0.42, 0.28, 0.05, seg=8))
    s = bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(0.42, 0.28, 0.45))
    bpy.context.object.data.materials.append(m['red'])
    render('map')


def i_notes():
    reset(); m = M(); objs = []; plate(m, objs)
    cov = box('cov', m['red'], 1.0, 1.3, 0.08, 0, 0, 0.05, rot=(0, 0, -0.1))
    bev(cov, 0.03, 2)
    pg = box('pg', m['paper'], 0.92, 1.22, 0.02, 0.02, 0.01, 0.1, rot=(0, 0, -0.1))
    for i in range(6):
        y = 0.45 - i * 0.17
        x0, x1 = -0.32, 0.3
        c, s = math.cos(-0.1), math.sin(-0.1)
        between('ln' + str(i), m['ink'], (x0 * c - y * s, x0 * s + y * c, 0.115), (x1 * c - y * s, x1 * s + y * c, 0.115), 0.008)
    between('pencil', m['yellow'], (-0.55, -0.55, 0.2), (0.45, 0.5, 0.2), 0.05)
    between('tip', m['wood'], (0.45, 0.5, 0.2), (0.58, 0.64, 0.2), 0.05, 0.005)
    render('notes')


def i_photos():
    reset(); m = M(); objs = []; plate(m, objs)
    for i, (x, y, r) in enumerate([(-0.15, 0.08, 0.22), (0.12, -0.08, -0.12)]):
        f = box('pol' + str(i), m['white'], 0.95, 1.1, 0.025, x, y, 0.03 + i * 0.03, rot=(0, 0, r))
        c, s = math.cos(r), math.sin(r)
        ph = box('img' + str(i), m['ink'] if i else m['wood'], 0.8, 0.78, 0.01, x - 0.0 * c + 0.1 * s, y + 0.1 * c, 0.045 + i * 0.03, rot=(0, 0, r))
    # l'iroko, dessiné sur la photo du dessus
    cyl('tree', m['green'], 0.18, 0.18, 0.01, 0.16, 0.06, 0.1, seg=16)
    render('photos')


def i_memos():
    reset(); m = M(); objs = []; plate(m, objs)
    b = box('cas', m['black'], 1.4, 0.9, 0.14, 0, 0, 0.08)
    bev(b, 0.04, 2)
    box('lab', m['paper'], 1.15, 0.42, 0.01, 0, 0.12, 0.155)
    box('labr', m['red'], 1.15, 0.06, 0.012, 0, 0.3, 0.156)
    for x in (-0.3, 0.3):
        cyl('reel' + str(x), m['white'], 0.12, 0.12, 0.02, x, -0.2, 0.15, seg=18)
        cyl('hub' + str(x), m['black'], 0.05, 0.05, 0.03, x, -0.2, 0.155, seg=12)
    render('memos')


def i_messages():
    reset(); m = M(); objs = []; plate(m, objs)
    env = box('env', m['paper'], 1.35, 0.95, 0.05, 0, 0, 0.05, rot=(0, 0, 0.06))
    flap = prism('flap', m['paper2'], [(-0.66, 0.44), (0.66, 0.44), (0, -0.08)], 0.02, z=0.08)
    flap.rotation_euler = (0, 0, 0.06)
    cyl('seal', m['red'], 0.13, 0.13, 0.04, 0.0, -0.06, 0.1, seg=20)
    render('messages')


def i_phone():
    reset(); m = M(); objs = []; plate(m, objs)
    between('handle', m['black'], (-0.45, -0.35, 0.3), (0.45, 0.35, 0.3), 0.16)
    for (x, y) in ((-0.5, -0.4), (0.5, 0.4)):
        cyl('cup' + str(x), m['black'], 0.3, 0.24, 0.26, x, y, 0.06, seg=24)
        cyl('grill' + str(x), m['iron'], 0.18, 0.18, 0.01, x, y, 0.325, seg=16)
    render('phone')


def i_camera():
    reset(); m = M(); objs = []; plate(m, objs)
    b = box('body', m['black'], 1.3, 0.55, 0.75, 0, 0.05, 0.4)
    bev(b, 0.05, 2)
    box('top', m['iron'], 0.4, 0.4, 0.15, -0.35, 0.05, 0.84)
    cyl('lens', m['iron'], 0.3, 0.3, 0.35, 0.05, -0.38, 0.4, seg=24, rot=(math.pi / 2, 0, 0))
    cyl('glass', m['glass'], 0.22, 0.22, 0.02, 0.05, -0.565, 0.4, seg=24, rot=(math.pi / 2, 0, 0))
    render('camera', elev=42, scale=2.7)


def i_bag():
    reset(); m = M(); objs = []; plate(m, objs)
    bag = lathe('bag', m['leather'], [(0.0, 0.0), (0.5, 0.02), (0.6, 0.3), (0.5, 0.7), (0.3, 0.85), (0.32, 0.92)], seg=24)
    bag.scale = (1, 0.7, 1)
    torus('cord', m['paper2'], 0.3, 0.03, 0, 0, 0.84, seg=20, rs=6)
    render('bag', elev=40)


def i_owl():
    reset(); m = M(); objs = []; plate(m, objs)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.62, location=(0, 0, 0.45))
    h = bpy.context.object
    h.scale = (1, 0.8, 0.9)
    h.data.materials.append(m['plate_rim'])
    bpy.ops.object.shade_smooth()
    for sx in (-1, 1):
        between('tuft' + str(sx), m['plate_rim'], (sx * 0.38, 0, 0.85), (sx * 0.58, 0, 1.25), 0.12, 0.01)
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(sx * 0.24, -0.42, 0.55))
        d = bpy.context.object
        d.scale = (1, 0.5, 1)
        d.data.materials.append(m['black'])
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(sx * 0.24, -0.5, 0.55))
        e = bpy.context.object
        e.data.materials.append(m['amber'])
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.05, location=(sx * 0.24, -0.6, 0.55))
        bpy.context.object.data.materials.append(m['black'])
    between('beak', m['wood'], (0, -0.48, 0.42), (0, -0.6, 0.25), 0.06, 0.005)
    render('endings', elev=25)


def i_gear():
    reset(); m = M(); objs = []; plate(m, objs)
    cyl('ring', m['iron'], 0.5, 0.5, 0.18, 0, 0, 0.1, seg=32)
    for i in range(10):
        a = i * math.pi / 5
        box('tooth' + str(i), m['iron'], 0.18, 0.2, 0.18, math.cos(a) * 0.58, math.sin(a) * 0.58, 0.1, rot=(0, 0, a))
    cyl('hole', m['plate'], 0.2, 0.2, 0.2, 0, 0, 0.11, seg=24)
    cyl('hub', m['brass'], 0.12, 0.12, 0.22, 0, 0, 0.11, seg=16)
    render('settings')


def i_kaolin():
    reset(); m = M()
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.7, subdivisions=4, location=(0, 0, 0.5))
    k = bpy.context.object
    k.scale = (1, 1, 0.8)
    k.data.materials.append(m['kaolin'])
    md = k.modifiers.new('d', 'DISPLACE')
    tx = bpy.data.textures.new('kt', 'CLOUDS')
    tx.noise_scale = 0.4
    md.texture = tx
    md.strength = 0.12
    render('kaolin', elev=35, scale=1.8, res=96)


def i_ember():
    reset(); m = M()
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.6, subdivisions=3, location=(0, 0, 0.4))
    k = bpy.context.object
    k.scale = (1, 1, 0.7)
    k.data.materials.append(m['ember'])
    md = k.modifiers.new('d', 'DISPLACE')
    tx = bpy.data.textures.new('et', 'VORONOI')
    md.texture = tx
    md.strength = 0.35
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.5, subdivisions=2, location=(0.25, -0.2, 0.55))
    c = bpy.context.object
    c.data.materials.append(m['black'])
    c.scale = (0.8, 0.8, 0.5)
    render('ember', elev=35, scale=1.8, res=96)


def i_arrow():
    reset(); m = M(); objs = []
    p = box('tile', m['wood'], 1.8, 1.8, 0.2, 0, 0, -0.1)
    bev(p, 0.25, 3)
    prism('arr', m['kaolin'], [(0, 0.7), (0.55, 0.05), (0.2, 0.05), (0.2, -0.7), (-0.2, -0.7), (-0.2, 0.05), (-0.55, 0.05)], 0.06, z=0.0)
    render('arrow', elev=70, scale=2.1, res=128)


ICONS = {'map': i_map, 'notes': i_notes, 'photos': i_photos, 'memos': i_memos, 'messages': i_messages, 'phone': i_phone, 'camera': i_camera,
         'bag': i_bag, 'endings': i_owl, 'settings': i_gear, 'kaolin': i_kaolin, 'ember': i_ember, 'arrow': i_arrow}

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for k in (args or list(ICONS)):
        ICONS[k]()
