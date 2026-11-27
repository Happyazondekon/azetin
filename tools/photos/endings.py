import sys, math, random
sys.path.insert(0, '/home/claude/ph')
from scenes import *
R2 = random.Random(9)

def sky(top, bottom, k=1.0):
    w = bpy.context.scene.world; nt = w.node_tree
    bg = nt.nodes['Background']
    tc = nt.nodes.new('ShaderNodeTexCoord'); sep = nt.nodes.new('ShaderNodeSeparateXYZ'); ramp = nt.nodes.new('ShaderNodeValToRGB')
    nt.links.new(tc.outputs['Generated'], sep.inputs[0]); nt.links.new(sep.outputs['Z'], ramp.inputs[0])
    ramp.color_ramp.elements[0].position = 0.5; ramp.color_ramp.elements[0].color = lin(bottom)
    ramp.color_ramp.elements[1].position = 0.75; ramp.color_ramp.elements[1].color = lin(top)
    nt.links.new(ramp.outputs['Color'], bg.inputs[0]); bg.inputs[1].default_value = k

def ember_mat(name='ember', glow=3.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin('#1a1614'); b.inputs['Roughness'].default_value = 0.95
    n = nt.nodes.new('ShaderNodeTexVoronoi'); n.inputs['Scale'].default_value = 18; n.feature = 'DISTANCE_TO_EDGE'
    r = nt.nodes.new('ShaderNodeValToRGB'); r.color_ramp.elements[0].position = 0.0; r.color_ramp.elements[0].color = (1, 0.25, 0.03, 1)
    r.color_ramp.elements[1].position = 0.06; r.color_ramp.elements[1].color = (0, 0, 0, 1)
    nt.links.new(n.outputs['Distance'], r.inputs[0]); nt.links.new(r.outputs['Color'], b.inputs['Emission Color'])
    b.inputs['Emission Strength'].default_value = glow
    return m

def soul_mat():
    return mat('soul', '#fff4dc', 0.5, emit='#fff1d0', emit_k=6)

def sitting(seat_h=0.45):
    return [('thigh_l', (0.05, -1, 0.05)), ('thigh_r', (-0.05, -1, 0.05)), ('calf_l', (0, -0.15, -1)), ('calf_r', (0, -0.15, -1)),
            ('upperarm_l', (0.25, -0.35, -0.9)), ('upperarm_r', (-0.25, -0.35, -0.9)), ('lowerarm_l', (-0.3, -1, -0.25)), ('lowerarm_r', (0.3, -1, -0.25)),
            ('Head', (0, -0.35, 1))]

# ---------------------------------------------------------------- I. le survivant : le 4×4 part vers l'aube, un hibou sur la banquette
def survivor():
    reset(96)
    sky('#3a4a78', '#ff9a50', 1.4)
    ground_plane('laterite', 80, 14, 0.4)
    plane('road', mat('road', '#ffffff', 0.9, tex=TX + 'sawdust.png', scale=6), 4.5, 80, (0, 30, 0.01))
    car, _ = imp('az-4x4', (0, 4, 0), math.pi, 1)
    # le hibou, sur la banquette arrière, dans la lunette
    dark = mat('owl', '#1c140e', 0.9); eye = mat('eye', '#ffd23a', 0.3, emit='#ffcf30', emit_k=25)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.2, location=(0.0, 1.22, 1.78)); bpy.context.object.scale = (1, 0.9, 1.25); bpy.context.object.data.materials.append(dark)
    for x in (-0.07, 0.07):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.035, location=(x, 1.04, 1.9)); bpy.context.object.data.materials.append(eye)
    for x in (-0.08, 0.08):
        bpy.ops.mesh.primitive_cone_add(radius1=0.05, depth=0.11, location=(x, 1.17, 2.06)); bpy.context.object.data.materials.append(dark)
    for x in (-0.22, 0.22):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.12, location=(x, 1.27, 1.73)); bpy.context.object.scale = (0.5, 1, 1.3); bpy.context.object.data.materials.append(dark)
    # feux arrière
    tl = mat('tl', '#ff2010', 0.4, emit='#ff2010', emit_k=12)
    for x in (-0.82, 0.82): box('tail', tl, (0.12, 0.04, 0.18), (x, 1.33, 0.95))
    for i in range(22):
        side = -1 if i % 2 else 1
        imp(R2.choice(['tr-coco', 'tr-neem', 'tr-mango', 'tr-bush']), (side * R2.uniform(5, 14), R2.uniform(8, 70), 0), R2.uniform(0, 6), R2.uniform(0.9, 1.6))
    light('SUN', (0, 60, 6), 3.5, '#ffb070', size=0.03, target=(0, 0, 0))
    light('AREA', (0, -6, 4), 80, '#8090c0', size=6, target=(0, 4, 1))
    cam((1.0, -5.5, 1.5), (0.2, 8, 1.9), lens=35)
    return 'end-survivor'

# ---------------------------------------------------------------- II. l'Azévi : Happy, assis devant une case, devenu cendre
def azevi():
    reset(96)
    sky('#0a0e1c', '#2a1a24', 1.2)
    ground_plane('ash', 30, 8, 0.6)
    imp('az-hut-burnt', (0, 2.6, 0), 0, 1)
    em = ember_mat('em1', 4)
    P = person(['body-m', 'top-chemise-m', 'bot-pagne-m', 'hair-short04-m'], {p: em for p in ['body-m', 'top-chemise-m', 'bot-pagne-m', 'hair-short04-m']}, sitting(), (0, 0, 0), 0, 1)
    P.location.z = -0.42
    cyl('stool', mat('wood', '#3a2618', 0.8), 0.18, 0.4, (0, 0.12, 0.2), seg=16)
    bowl = mat('bowl', '#d8d0c0', 0.3)
    cyl('bowl', bowl, 0.12, 0.07, (0.05, -0.55, 0.035), seg=24)
    cyl('akassa', mat('ak', '#efe6d0', 0.6), 0.09, 0.05, (0.05, -0.55, 0.07), seg=24)
    imp('az-lamp', (-0.7, -0.4, 0), 0, 1.4)
    light('POINT', (-0.7, -0.4, 0.35), 60, '#ffa040', size=0.05)
    em2 = ember_mat('em2', 2)
    for x, y, r in [(-2.2, 1.6, 0.5), (2.0, 1.2, -0.4), (-1.0, 4.5, 0.1)]:
        person(['body-f' if x < 0 else 'body-m', 'top-robe-f' if x < 0 else 'top-bomba-m'], {k: em2 for k in ['body-f', 'body-m', 'top-robe-f', 'top-bomba-m']}, DOWN, (x, y, 0), r, 1)
    light('AREA', (2, -4, 3), 160, '#6070c0', size=4, target=(0, 0, 1))
    light('AREA', (-3, 5, 4), 120, '#4050a0', size=4, target=(0, 1, 1))
    cam((0.9, -4.2, 1.3), (0, 0.8, 1.0), lens=32, dof=4.1, fstop=4)
    return 'end-azevi'

# ---------------------------------------------------------------- III. les cendres : au matin, un nom de plus sur la stèle
def ashes():
    reset(96)
    sky('#9aa4b0', '#d8c8b0', 1.0)
    ground_plane('laterite', 40, 10, 0.5)
    imp('az-stele', (0, 0, 0), 0, 1)
    from PIL import Image, ImageDraw
    im = Image.new('RGBA', (512, 128), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    from textures import font
    d.text((256, 64), 'HAPPY', font=font(92, 'serif'), fill=(26, 18, 12, 235), anchor='mm')
    im.save(TX + 'happy_name.png')
    nm = mat('name', '#ffffff', 0.9, tex=TX + 'happy_name.png', alpha_tex=True)
    plane('happy', nm, 0.62, 0.155, (0, -0.152, 0.62), (math.pi / 2, 0, 0))
    # la fumée de la maison brûlée, au loin
    bpy.ops.mesh.primitive_cube_add(size=1, location=(4, 30, 8)); sm = bpy.context.object; sm.scale = (6, 6, 16)
    vm = bpy.data.materials.new('smoke'); vm.use_nodes = True; nt = vm.node_tree
    nt.nodes.remove(nt.nodes['Principled BSDF'])
    pv = nt.nodes.new('ShaderNodeVolumePrincipled'); pv.inputs['Color'].default_value = (0.25, 0.24, 0.23, 1)
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = 1.2
    rp = nt.nodes.new('ShaderNodeValToRGB'); rp.color_ramp.elements[0].position = 0.45; rp.color_ramp.elements[1].position = 0.7
    nt.links.new(nz.outputs['Fac'], rp.inputs[0]); nt.links.new(rp.outputs['Color'], pv.inputs['Density'])
    nt.links.new(pv.outputs['Volume'], nt.nodes['Material Output'].inputs['Volume'])
    sm.data.materials.append(vm)
    for i in range(16):
        imp(R2.choice(['tr-coco', 'tr-neem', 'tr-bush']), (R2.uniform(-25, 25), R2.uniform(12, 40), 0), R2.uniform(0, 6), R2.uniform(1, 1.6))
    imp('az-hut-burnt', (-6, 14, 0), 0.3, 1); imp('az-hut-burnt', (7, 18, 0), -0.4, 1)
    light('SUN', (-10, -10, 8), 3, '#ffe8d0', size=0.1, target=(0, 0, 0))
    cam((0.9, -2.6, 0.9), (0, 0, 0.85), lens=38, dof=2.75, fstop=4)
    return 'end-ashes'

# ---------------------------------------------------------------- IV. le dernier guérisseur : l'aube, la pousse d'iroko, les âmes qui montent
def healer():
    reset(96)
    sky('#5a78b8', '#ffc070', 1.6)
    ground_plane('laterite', 60, 12, 0.4)
    water = mat('water', '#405870', 0.03, metal=0.2)
    plane('lagoon', water, 120, 40, (0, 34, 0.02))
    imp('az-stump', (0, 0, 0), 0.4, 1.25)
    leaf = mat('leaf', '#5aa83a', 0.5, emit='#7ad04a', emit_k=2.5); trunk = mat('sprt', '#4a3a20', 0.8)
    cyl('sprout', trunk, 0.05, 1.4, (0.1, 0, 2.6 + 0.7), seg=8)
    for i in range(9):
        bpy.ops.mesh.primitive_circle_add(vertices=12, radius=0.24, fill_type='NGON', location=(0.1 + math.cos(i * 1.3) * 0.22, math.sin(i * 1.3) * 0.22, 3.3 + i * 0.09), rotation=(1.0, 0, i * 1.3))
        bpy.context.object.data.materials.append(leaf)
    light('POINT', (0.1, -0.5, 3.4), 80, '#c8ff90', size=0.3)
    sm = soul_mat()
    for i in range(9):
        x, y, z = R2.uniform(-7, 7), R2.uniform(4, 16), R2.uniform(1.5, 9)
        person(['body-f' if i % 2 else 'body-m'], {'body-f': sm, 'body-m': sm}, [('upperarm_l', (0.6, 0, 0.8)), ('upperarm_r', (-0.6, 0, 0.8))] if i % 3 == 0 else DOWN, (x, y, z), R2.uniform(-0.5, 0.5), 1)
    for i in range(14):
        imp(R2.choice(['tr-coco', 'tr-neem', 'tr-mango']), (R2.uniform(-30, 30) or 9, R2.uniform(14, 26), 0), R2.uniform(0, 6), R2.uniform(1.1, 1.8))
    light('SUN', (0, 60, 3), 4, '#ffb060', size=0.03, target=(0, 0, 0))
    light('AREA', (0, -8, 5), 150, '#a0b8ff', size=8, target=(0, 0, 2))
    cam((2.5, -11, 4.2), (0, 4, 4.0), lens=30)
    return 'end-healer'

if __name__ == '__main__':
    which = [a for a in sys.argv[sys.argv.index('--') + 1:] if not a.startswith('--')] if '--' in sys.argv else ['survivor', 'azevi', 'ashes', 'healer']
    which = which or ['survivor', 'azevi', 'ashes', 'healer']
    fast = '--fast' in sys.argv
    for k in which:
        n = globals()[k]()
        if fast: bpy.context.scene.cycles.samples = 20
        render(n, (640, 480) if fast else (1200, 900))
        print('done', n)
