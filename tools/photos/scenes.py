import sys, math, random
sys.path.insert(0, '/home/claude/ph')
from common import *
TX = '/home/claude/ph/tex/'
R = random.Random(5)

def tint_body(objs, skin='#5a3a26'):
    for o in objs:
        if o.type != 'MESH': continue
        for s in o.material_slots:
            m = s.material
            if not m: continue
            nt = m.node_tree; b = nt.nodes.get('Principled BSDF')
            if not b: continue
            n = m.name.lower()
            if 'superhero' in n or 'body' in n:
                tex = [l.from_node for l in nt.links if l.to_socket == b.inputs['Base Color']]
                mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
                mix.inputs['B'].default_value = [min(1, v * 2.2) for v in lin(skin)[:3]] + [1]
                if tex: nt.links.new(tex[0].outputs['Color'], mix.inputs['A'])
                nt.links.new(mix.outputs['Result'], b.inputs['Base Color'])
                b.inputs['Roughness'].default_value = 0.55
                try: b.inputs['Subsurface Weight'].default_value = 0.08
                except Exception: pass
            elif 'hair' in n or 'brow' in n or 'beard' in n:
                for l in list(nt.links):
                    if l.to_socket == b.inputs['Base Color']: nt.links.remove(l)
                b.inputs['Base Color'].default_value = lin('#0c0806'); b.inputs['Roughness'].default_value = 0.75

def man(parts, cloth, poses, loc, rot=0, h=1.0, keys=None, skin='#4e3020'):
    mats = {p: cloth.get(p) for p in parts}
    before = set(bpy.data.objects)
    P = person(parts, mats, poses, loc, rot, h, keys)
    tint_body([o for o in bpy.data.objects if o not in before], skin)
    return P

DOWN = [('upperarm_l', (0.22, 0.02, -1)), ('upperarm_r', (-0.22, 0.02, -1)), ('lowerarm_l', (0.1, -0.25, -1)), ('lowerarm_r', (-0.1, -0.25, -1))]
HOLD = [('upperarm_l', (0.18, -0.45, -0.88)), ('upperarm_r', (-0.18, -0.45, -0.88)), ('lowerarm_l', (-0.25, -1, -0.15)), ('lowerarm_r', (0.25, -1, -0.15))]
PROUD = [('upperarm_l', (0.5, 0.15, -0.85)), ('upperarm_r', (-0.5, 0.15, -0.85)), ('lowerarm_l', (-0.6, -0.4, 0.3)), ('lowerarm_r', (0.6, -0.4, 0.3))]

def cyl(name, m, r, h, loc, rot=(0, 0, 0), seg=32):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, location=loc, rotation=rot, vertices=seg)
    o = bpy.context.object; o.name = name; o.data.materials.append(m)
    bpy.ops.object.shade_smooth(); return o

def box(name, m, s, loc, rot=(0, 0, 0), bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = s; o.data.materials.append(m)
    if bevel:
        bpy.ops.object.transform_apply(scale=True); md = o.modifiers.new('b', 'BEVEL'); md.width = bevel; md.segments = 3
    return o

def chainsaw(loc, rot):
    hold = bpy.data.objects.new('saw', None); bpy.context.scene.collection.objects.link(hold)
    orange = mat('saw_o', '#e06a1a', 0.45); grey = mat('saw_g', '#8a8a8a', 0.3, 0.9); blk = mat('saw_k', '#151515', 0.6)
    for o in [box('sb', orange, (0.22, 0.34, 0.2), (0, 0, 0), bevel=0.03), box('bar', grey, (0.05, 0.62, 0.012), (0, -0.48, -0.02)),
              box('hd', blk, (0.04, 0.05, 0.16), (0, 0.16, 0.12)), cyl('hdl', blk, 0.015, 0.26, (0, -0.05, 0.16), (0, math.pi / 2, 0), 8)]:
        o.parent = hold
    hold.location = loc; hold.rotation_euler = (0, 0, rot)
    return hold

def scatter(n, area, make):
    for i in range(n):
        make(R.uniform(area[0], area[1]), R.uniform(area[2], area[3]), i)

def debris(area, n=26, m=None, k=1.0):
    m = m or mat('char', '#100c0a', 0.9, bump=0.3)
    def mk(x, y, i):
        r = R.uniform(0.004, 0.012) * k
        o = cyl(f'stick{i}', m, r, R.uniform(0.04, 0.2) * k, (x, y, r * 0.6), (math.pi / 2, 0, R.uniform(0, 6.3)), 8)
    scatter(n, area, mk)
    st = mat('stone', '#3a3430', 0.9, bump=0.4)
    def pb(x, y, i):
        bpy.ops.mesh.primitive_ico_sphere_add(radius=R.uniform(0.004, 0.018) * k, subdivisions=2, location=(x, y, 0.002))
        o = bpy.context.object; o.scale = (1, R.uniform(0.6, 1.2), R.uniform(0.4, 0.7)); o.data.materials.append(st)
    scatter(n, area, pb)

def ground_plane(tex, size=6, scale=3, bump=0.4, disp=True):
    m = mat('gr', '#ffffff', 0.95, tex=TX + tex + '.png', scale=scale, bump=bump)
    o = plane('ground', m, size, size, sub=0)
    return o

def flash(cam_loc, target, energy=40, warm=False):
    # le flash du téléphone, juste au-dessus de l'objectif
    l = light('SPOT', (cam_loc[0] + 0.02, cam_loc[1], cam_loc[2] + 0.03), energy, '#f4f1ff', size=0.01, target=target, spot=math.radians(80))
    return l

def paper(name, tex, w, h, loc, rot=(0, 0, 0), crumple=0.006, seed=1):
    m = mat(name + 'm', '#ffffff', 0.85, tex=TX + tex)
    bpy.ops.mesh.primitive_grid_add(x_subdivisions=60, y_subdivisions=60, size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (w, h, 1); o.data.materials.append(m)
    bpy.ops.object.transform_apply(scale=True)
    tx = bpy.data.textures.new(name + 't', 'CLOUDS'); tx.noise_scale = 0.08
    md = o.modifiers.new('d', 'DISPLACE'); md.texture = tx; md.strength = crumple; md.mid_level = 0.5
    sol = o.modifiers.new('s', 'SOLIDIFY'); sol.thickness = 0.0008
    bpy.ops.object.shade_smooth()
    return o

# ================================================================ 1. la photo du iroko abattu (jour, il y a dix ans)
def iroko():
    reset(96)
    sc = bpy.context.scene
    w = sc.world.node_tree.nodes['Background']; w.inputs[0].default_value = (0.5, 0.62, 0.85, 1); w.inputs[1].default_value = 1.0
    ground_plane('laterite', 60, 10, 0.3)
    barkm = mat('bark', '#ffffff', 0.9, tex=TX + 'bark.png', scale=1, bump=0.8)
    ringm = mat('rings', '#ffffff', 0.8, tex=TX + 'rings.png')
    # le tronc couché, énorme, derrière eux
    t = cyl('trunk', barkm, 1.25, 17, (2.5, 4.2, 1.2), (0, math.pi / 2, 0.06), 48)
    end = cyl('cut', ringm, 1.24, 0.02, (2.5 - 8.5, 4.2 - 0.52, 1.2), (0, math.pi / 2, 0.06), 48)
    for i, (x, a) in enumerate([(5, 0.7), (8, -0.6), (10.5, 0.9)]):
        cyl(f'br{i}', barkm, 0.28, 4, (x, 4.2 + math.sin(a) * 1.8, 2.4 + i * 0.3), (a, math.pi / 3, 0), 16)
    # la souche de Loko, à gauche
    h, _ = imp('az-stump', (-5.0, 3.0, 0), 0.4, 1.25)
    # fond : arbres, cases
    for i, (n, x, y, s) in enumerate([('tr-coco', -14, 16, 1.4), ('tr-neem', 12, 18, 1.6), ('tr-mango', 4, 22, 1.5), ('tr-coco', 18, 12, 1.3), ('tr-neem', -6, 24, 1.8), ('az-hut-thatch', -12, 12, 1.0), ('az-hut-tin', 14, 10, 1.0), ('tr-bush', 7, 9, 1.2), ('tr-bush', -3, 9.5, 1.0)]):
        imp(n, (x, y, 0), R.uniform(0, 6), s)
    shirt = lambda t: mat('w' + t, '#ffffff', 0.85, tex=TX + t + '.png', scale=2)
    chief = mat('wchief', '#ffffff', 0.7, tex=TX + 'wax_chief.png', scale=2)
    # les hommes : deux avec leurs tronçonneuses, le chef au milieu, souriant
    man(['body-m', 'top-chemise-m', 'bot-pagne-m', 'hair-short04-m'], {'top-chemise-m': shirt('cloth_khaki'), 'bot-pagne-m': shirt('wax_b')}, HOLD, (-2.3, 0.3, 0), 0.25, 1.0, skin='#3e2618')
    chainsaw((-2.3 + 0.12, 0.3 - 0.55, 1.05), 0.25 + 0.9)
    man(['body-m', 'top-chemise-m', 'bot-pagne-m', 'hair-afro01-m'], {'top-chemise-m': shirt('wax_a'), 'bot-pagne-m': shirt('cloth_khaki')}, DOWN, (-1.1, 0.9, 0), 0.1, 0.98, skin='#4a2c1c')
    man(['body-m', 'top-robe-m', 'hair-short02-m', 'hair-beard'], {'top-robe-m': chief}, PROUD, (0.15, 0.0, 0), 0.0, 1.07, keys={'smile': 0.9}, skin='#4a3224')
    cap = cyl('cap', chief, 0.11, 0.12, (0.15, 0.0, 1.98 * 1.0), (0, 0, 0), 24)
    man(['body-m', 'top-bomba-m', 'bot-pagne-m', 'hair-short04-m'], {'top-bomba-m': shirt('wax_c'), 'bot-pagne-m': shirt('cloth_khaki')}, DOWN, (1.4, 0.8, 0), -0.12, 1.0, skin='#3a2416')
    man(['body-m', 'top-chemise-m', 'bot-pagne-m', 'hair-short02-m'], {'top-chemise-m': shirt('cloth_khaki'), 'bot-pagne-m': shirt('wax_a')}, HOLD, (2.6, 0.2, 0), -0.3, 1.0, skin='#45291a')
    chainsaw((2.6 - 0.2, 0.2 - 0.5, 1.05), -0.3 - 0.9)
    light('SUN', (-6, -8, 10), 4.2, '#ffe6c0', size=0.04, target=(0, 0, 0))
    cam((0.2, -4.9, 1.45), (0.2, 2.0, 1.45), lens=30, dof=5.0, fstop=5.6)
    return 'iroko'

# ================================================================ 2. le carnet du chef (devant sa case, à la lampe)
def notebook():
    reset(128)
    ground_plane('laterite', 4, 2, 1.2)
    debris((-0.5, 0.5, -0.4, 0.5), 22, mat('twig', '#2a1c12', 0.9), k=0.8)
    cover = mat('cover', '#4a0e0c', 0.6, bump=0.15)
    box('coverL', cover, (0.2, 0.28, 0.008), (-0.1, 0, 0.004), (0, 0, 0))
    box('coverR', cover, (0.2, 0.28, 0.008), (0.1, 0, 0.004))
    paper('pageR', 'ledger.png', 0.19, 0.27, (0.1, 0, 0.012), (0, -0.05, 0), 0.002)
    paper('pageL', 'register.png', 0.19, 0.27, (-0.1, 0, 0.012), (0, 0.05, 0), 0.002)
    for i in range(5):
        paper(f'pg{i}', 'ledger.png', 0.19, 0.27, (-0.1, 0, 0.009 - i * 0.001), (0, 0.05, 0), 0.001)
    h, _ = imp('az-lamp', (0.3, 0.22, 0), 0, 1.4)
    light('POINT', (0.3, 0.22, 0.2), 5, '#ffa040', size=0.02)
    c = (0.0, -0.46, 0.4)
    cam(c, (0.04, 0.0, 0.0), lens=34, dof=0.6, fstop=3.5)
    flash(c, (0, 0, 0), 9)
    return 'notebook'

# ================================================================ 3. la cassette du guérisseur (dans les cendres)
def tape():
    reset(128)
    ground_plane('ash', 3, 2.5, 0.8)
    debris((-0.3, 0.3, -0.2, 0.35), 45, k=0.35)
    blk = mat('cas', '#141414', 0.35); win = mat('win', '#202428', 0.05)
    hub = mat('hub', '#e8e4dc', 0.4); tapec = mat('tape', '#3a2414', 0.3)
    hold = bpy.data.objects.new('cas', None); bpy.context.scene.collection.objects.link(hold)
    parts = [box('body', blk, (0.1, 0.064, 0.012), (0, 0, 0.006), bevel=0.002),
             plane('label', mat('lab', '#ffffff', 0.7, tex=TX + 'label.png'), 0.088, 0.03, (0, 0.012, 0.0122)),
             plane('window', win, 0.05, 0.014, (0, -0.012, 0.0122))]
    for x in (-0.021, 0.021):
        parts.append(cyl('reel' + str(x), tapec, 0.011 if x < 0 else 0.007, 0.004, (x, -0.012, 0.0115)))
        parts.append(cyl('hub' + str(x), hub, 0.004, 0.002, (x, -0.012, 0.0128), seg=6))
    for p in parts: p.parent = hold
    hold.location = (0, 0, 0.003); hold.rotation_euler = (0.04, -0.03, 0.35)
    # un bout de bande sorti, en boucles
    tm = mat('tl', '#2a1a10', 0.25)
    pts = [(0.03, -0.03, 0.004)] + [(0.05 + i * 0.012, -0.05 + math.sin(i) * 0.02, 0.003) for i in range(12)]
    cu = bpy.data.curves.new('band', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0; cu.extrude = 0.0019
    sp = cu.splines.new('BEZIER'); sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts): bp.co = p; bp.handle_left_type = bp.handle_right_type = 'AUTO'
    ob = bpy.data.objects.new('band', cu); ob.data.materials.append(tm); bpy.context.scene.collection.objects.link(ob)
    h, _ = imp('jerrycan', (0.22, 0.25, 0), 0.6, 0.9)
    light('POINT', (-0.35, 0.3, 0.05), 1.5, '#ff5a18', size=0.03)
    c = (-0.01, -0.13, 0.17)
    cam(c, (0.0, 0.0, 0.0), lens=38, dof=0.21, fstop=2.8)
    flash(c, (0, 0, 0), 3.5)
    return 'tape'

# ================================================================ 4. le registre des fûts (sur un fût, dans la station)
def register():
    reset(128)
    ground_plane('soot', 6, 3, 0.6)
    debris((-1, 1, -0.6, 1), 50)
    rust = mat('rust', '#5a2a14', 0.7, metal=0.5, bump=0.6)
    cyl('drum', rust, 0.29, 0.88, (0, 0, 0.44), seg=48)
    cyl('lid', mat('lid', '#3a1c10', 0.6, metal=0.6, bump=0.4), 0.285, 0.01, (0, 0, 0.885), seg=48)
    paper('sheet', 'register.png', 0.21, 0.28, (0.0, 0.0, 0.895), (0, 0, 0.18), 0.003)
    for x, y in [(-0.75, 0.6), (0.7, 0.5), (0.1, 1.1)]:
        cyl('d', rust, 0.29, 0.88, (x, y, 0.44), seg=40)
    h, _ = imp('jerrycan', (0.55, -0.15, 0), -0.4, 1)
    light('POINT', (0.9, 1.2, 0.4), 4, '#ff6020', size=0.05)
    c = (0.05, -0.5, 1.4)
    cam(c, (0.0, 0.05, 0.85), lens=32, dof=0.75, fstop=3.2)
    flash(c, (0, 0, 0.88), 26)
    return 'register'

# ================================================================ 5. le dessin d'Ayaba (au pied de la stèle)
def drawing():
    reset(128)
    ground_plane('laterite', 4, 3, 0.6)
    debris((-0.6, 0.6, 0.15, 0.6), 18, mat('twig2', '#3a2618', 0.9), k=0.6)
    debris((-0.6, -0.2, -0.4, 0.1), 8, mat('twig3', '#3a2618', 0.9), k=0.6)
    for i in range(14):
        imp('tr-grass', (R.uniform(-0.7, 0.7), R.uniform(0.35, 0.9), 0), R.uniform(0, 6), R.uniform(0.25, 0.45))
    paper('dr', 'drawing.png', 0.297, 0.21, (0, 0, 0.004), (0, 0, -0.12), 0.006)
    # une petite pierre posée sur le coin pour qu'il ne s'envole pas
    bpy.ops.mesh.primitive_ico_sphere_add(radius=0.035, subdivisions=3, location=(0.13, 0.07, 0.02))
    o = bpy.context.object; o.scale = (1.2, 0.9, 0.6); o.data.materials.append(mat('peb', '#6a5a4a', 0.8, bump=0.3))
    for i, (x, y) in enumerate([(-0.22, 0.12), (0.2, -0.14), (-0.1, -0.2)]):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=0.012, location=(x, y, 0.01)); bpy.context.object.data.materials.append(mat(f'k{i}', '#c8b088', 0.6))
    c = (0.0, -0.36, 0.42)
    cam(c, (0.0, 0.04, 0.0), lens=30, dof=0.55, fstop=3.5)
    flash(c, (0, 0, 0), 7)
    light('POINT', (0.4, 0.5, 0.3), 1.2, '#7090ff', size=0.2)  # la lune, froide
    return 'drawing'

if __name__ == '__main__':
    which = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['iroko', 'notebook', 'tape', 'register', 'drawing']
    res = (1000, 750) if '--hi' not in sys.argv else (1600, 1200)
    if '--fast' in sys.argv: res = (640, 480)
    for k in which:
        if k.startswith('--'): continue
        n = globals()[k]()
        if '--fast' in sys.argv: bpy.context.scene.cycles.samples = 24
        render(n, res)
        print('done', n)
