# =============================================================
#  AZETIN — modèles Blender du village d'Azé-tin (même chaîne que Dantokpa Dash)
#  python3 tools/blender/azetin.py [-- 4x4 hut-thatch hut-tin hut-burnt atelier buvette station stump stele sign healer asen]
#    -> tools/blender/work/az-*.glb (+ aperçus az-*.png), puis :
#       node tools/blender/pack-model.mjs az-4x4 az-hut-thatch …   (-> public/models/)
#
#  Village fictif du sud du Bénin, au bord d'une lagune, la nuit :
#   - cases en banco (terre rouge) au toit de paille ou de tôle ondulée rouillée ;
#   - cases brûlées par l'explosion d'il y a dix ans (murs noircis, toits effondrés) ;
#   - l'atelier de Kossi (vulcanisateur : pneus, compresseur, enseigne peinte) ;
#   - la buvette de Mama Dossi (auvent, comptoir, banc, bassines d'akassa) ;
#   - la station de kpayo en ruine (dalle, piliers, auvent de tôle effondré, fûts calcinés) ;
#   - la souche de l'iroko sacré Loko (racines-contreforts, tissu blanc noué) ;
#   - la stèle des morts, le panneau calciné, la maison du guérisseur et l'asen.
#  Tout est modélisé par script et appartient au jeu.
#  Repère : Z en haut, -Y = « devant » (= +Z dans le jeu, vers le sud / la piste), X = côté.
# =============================================================
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *  # noqa: F401,F403
import lib
import numpy as np
from PIL import Image, ImageDraw, ImageFont

R = np.random.RandomState(11)


# ---------------------------------------------------------------- textures (procédurales, légères)
def save(a, name, q=86):
    p = os.path.join(TEX, name)
    Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).save(p, quality=q)
    return p


def noise(h, w, s=8, seed=0):
    r = np.random.RandomState(seed)
    small = r.rand(h // s + 2, w // s + 2)
    img = Image.fromarray((small * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    return np.asarray(img).astype(np.float32) / 255


def font(size):
    for f in ('/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf', 'C:/Windows/Fonts/georgiab.ttf',
              'C:/Windows/Fonts/arialbd.ttf', '/System/Library/Fonts/Supplemental/Georgia Bold.ttf'):
        if os.path.exists(f):
            return ImageFont.truetype(f, size)
    return ImageFont.load_default()


def tex_banco(name, base=(150, 82, 52), seed=1, soot=0.0):
    """mur de terre (banco) : enduit irrégulier, fissures, bas des murs plus sombre"""
    h = w = 256
    n = noise(h, w, 16, seed) * 0.6 + noise(h, w, 4, seed + 1) * 0.4
    a = np.zeros((h, w, 3), np.float32) + np.array(base)
    a *= (0.78 + 0.35 * n)[..., None]
    yy = np.arange(h)[:, None] / h
    a *= (0.7 + 0.3 * np.clip((1 - yy) * 3, 0, 1))[..., None]  # bas (v petit = bas) éclaboussé
    for _ in range(14):  # fissures
        x, y = R.randint(0, w), R.randint(0, h)
        for _ in range(40):
            x = (x + R.randint(-1, 2)) % w
            y = (y + R.randint(0, 2)) % h
            a[y, x] *= 0.45
    if soot:
        s = noise(h, w, 64, seed + 7) * 0.6 + noise(h, w, 16, seed + 8) * 0.4
        streak = noise(4, w, 4, seed + 9)[0]  # traînées verticales (le feu est monté le long des murs)
        k = np.clip((s - 0.3) * 1.4 + streak[None, :] * yy * 0.9, 0, 1) * soot
        a = a * (1 - k[..., None]) + np.array([22, 18, 15]) * k[..., None]
    a += R.normal(0, 4, a.shape)
    return save(a[::-1], name)


def tex_thatch(name, seed=2, tone=(150, 122, 70), soot=0.0):
    h = w = 256
    a = np.zeros((h, w, 3), np.float32) + np.array(tone)
    for _ in range(2600):  # brins de paille
        x, y, L = R.randint(0, w), R.randint(0, h), R.randint(10, 40)
        c = 0.6 + 0.6 * R.rand()
        a[y:y + L, x] *= c
    a *= (0.85 + 0.3 * noise(h, w, 8, seed))[..., None]
    for k in range(0, h, 32):  # rangs de bottes
        a[k:k + 3] *= 0.6
    if soot:
        s = noise(h, w, 20, seed + 3)
        kk = np.clip((s - 0.3) * 2, 0, 1) * soot
        a = a * (1 - kk[..., None]) + np.array([18, 15, 12]) * kk[..., None]
    return save(a, name)


def tex_tin(name, seed=3, rust=0.6, dark=1.0):
    h, w = 128, 256
    a = np.zeros((h, w, 3), np.float32) + np.array([120, 124, 126])
    xx = np.arange(w)[None, :]
    a *= (0.8 + 0.2 * np.sin(xx / 4.0))[..., None]  # ondulations
    r = noise(h, w, 12, seed)
    k = np.clip((r - (1 - rust)) * 3, 0, 1)
    a = a * (1 - k[..., None]) + np.array([118, 58, 24]) * k[..., None]
    a *= dark
    a += R.normal(0, 5, a.shape)
    return save(a, name)


def tex_wood(name, base=(92, 62, 40), seed=5):
    h, w = 128, 256
    a = np.zeros((h, w, 3), np.float32) + np.array(base)
    yy = np.arange(h)[:, None]
    a *= (0.8 + 0.2 * np.sin(yy / 2.3 + noise(h, w, 32, seed) * 6))[..., None]
    a += R.normal(0, 4, a.shape)
    return save(a, name)


def tex_concrete(name, seed=6, soot=0.5):
    h = w = 256
    n = noise(h, w, 8, seed) * 0.5 + noise(h, w, 32, seed + 1) * 0.5
    a = np.zeros((h, w, 3), np.float32) + np.array([120, 116, 108])
    a *= (0.7 + 0.45 * n)[..., None]
    s = noise(h, w, 40, seed + 2)
    k = np.clip((s - 0.2) * 1.8, 0, 1) * soot
    a = a * (1 - k[..., None]) + np.array([14, 12, 11]) * k[..., None]
    return save(a, name)


def tex_rings(name):
    """dessus de la souche coupée : cernes, aubier clair, fente"""
    h = w = 256
    yy, xx = np.mgrid[:h, :w]
    d = np.hypot(xx - w / 2, yy - h / 2) / (w / 2)
    a = np.zeros((h, w, 3), np.float32) + np.array([150, 108, 70])
    a *= (0.82 + 0.18 * np.sin(d * 70 + noise(h, w, 32, 9) * 4))[..., None]
    a[d > 0.9] = np.array([62, 44, 32])
    a *= (0.7 + 0.3 * noise(h, w, 16, 3))[..., None]
    a[(np.abs(xx - w / 2 - (yy - h / 2) * 0.2) < 2) & (d < 0.7)] *= 0.3
    return save(a, name)


def tex_text(name, lines, w, h, bg, fg, size, burn=0.0, engraved=False, seed=8):
    im = Image.new('RGB', (w, h), bg)
    dr = ImageDraw.Draw(im)
    f = font(size)
    total = len(lines) * size * 1.35
    y0 = (h - total) / 2
    for i, t in enumerate(lines):
        tw = dr.textlength(t, font=f)
        x, y = (w - tw) / 2, y0 + i * size * 1.35
        if engraved:
            dr.text((x + 2, y + 2), t, font=f, fill=(200, 196, 188))
        dr.text((x, y), t, font=f, fill=fg)
    a = np.asarray(im).astype(np.float32)
    a *= (0.8 + 0.3 * noise(h, w, 8, seed))[..., None]
    if burn:
        s = noise(h, w, 24, seed + 1)
        k = np.clip((s - 0.35) * 2.5, 0, 1) * burn
        a = a * (1 - k[..., None]) + np.array([12, 10, 9]) * k[..., None]
    return save(a, name)


def tex_cloth():
    h = w = 64
    a = np.zeros((h, w, 3), np.float32) + np.array([226, 220, 204])
    a *= (0.85 + 0.15 * noise(h, w, 8, 4))[..., None]
    return save(a, 'az-cloth.jpg')


def textures():
    return dict(
        banco=tex_banco('az-banco.jpg'),
        banco2=tex_banco('az-banco2.jpg', base=(168, 104, 66), seed=4),
        banco_burnt=tex_banco('az-banco-burnt.jpg', base=(110, 70, 50), seed=9, soot=0.9),
        thatch=tex_thatch('az-thatch.jpg'),
        thatch_burnt=tex_thatch('az-thatch-burnt.jpg', seed=7, tone=(90, 72, 46), soot=0.8),
        tin=tex_tin('az-tin.jpg'),
        tin_burnt=tex_tin('az-tin-burnt.jpg', seed=12, rust=0.75, dark=0.55),
        wood=tex_wood('az-wood.jpg'),
        wood_dark=tex_wood('az-wood-dark.jpg', base=(56, 40, 30), seed=13),
        concrete=tex_concrete('az-concrete.jpg'),
        rings=tex_rings('az-rings.jpg'),
        cloth=tex_cloth(),
        sign_az=tex_text('az-sign.jpg', ['AZÉ-TIN'], 512, 160, (176, 160, 132), (52, 30, 20), 88, burn=0.85),
        sign_vulc=tex_text('az-sign-vulc.jpg', ['VULCANISATEUR', 'KOSSI  ·  PNEUS'], 512, 160, (36, 70, 120), (236, 220, 140), 46, burn=0.15, seed=14),
        sign_dossi=tex_text('az-sign-dossi.jpg', ['CHEZ MAMA DOSSI', 'AKASSA · POISSON'], 512, 160, (190, 64, 40), (250, 236, 200), 44, burn=0.2, seed=15),
        sign_fuel=tex_text('az-sign-fuel.jpg', ['ESSENCE'], 512, 128, (220, 190, 40), (30, 30, 30), 72, burn=0.9, seed=16),
        stele=tex_text('az-stele.jpg', ['À NOS MORTS', '', 'AGOSSOU  ·  DOSSI  ·  HOUNGBO', 'AYABA  ·  TOSSOU  ·  KPÈ', 'SÈNAMI  ·  HOUÉNOU  ·  DAGBO',
                                         'ADJOVI  ·  GBÈNOU  ·  AÏSSI', 'ZINSOU  ·  NOUDÉHOU  ·  ABLA', '…'],
                       400, 640, (92, 92, 88), (24, 22, 20), 26, engraved=True, seed=17),
    )


TEXS = None


def make_mats():
    """matières (à recréer après chaque remise à zéro de la scène)"""
    global M
    lib._mats.clear()
    t = TEXS
    M = dict(
        banco=mat('az_banco', '#ffffff', 0.95, tex=t['banco']),
        banco2=mat('az_banco2', '#ffffff', 0.95, tex=t['banco2']),
        banco_burnt=mat('az_banco_burnt', '#ffffff', 1.0, tex=t['banco_burnt']),
        thatch=mat('az_thatch', '#ffffff', 1.0, tex=t['thatch']),
        thatch_burnt=mat('az_thatch_burnt', '#ffffff', 1.0, tex=t['thatch_burnt']),
        tin=mat('az_tin', '#ffffff', 0.55, 0.35, tex=t['tin']),
        tin_burnt=mat('az_tin_burnt', '#ffffff', 0.8, 0.2, tex=t['tin_burnt']),
        wood=mat('az_wood', '#ffffff', 0.85, tex=t['wood']),
        wood_dark=mat('az_wood_dark', '#ffffff', 0.9, tex=t['wood_dark']),
        concrete=mat('az_concrete', '#ffffff', 0.95, tex=t['concrete']),
        rings=mat('az_rings', '#ffffff', 0.9, tex=t['rings']),
        cloth=mat('az_cloth', '#ffffff', 0.95, tex=t['cloth']),
        bark=mat('az_bark', '#3e3024', 0.95),
        dark=mat('az_dark', '#0c0a09', 1.0),
        char=mat('az_char', '#161210', 1.0),
        iron=mat('az_iron', '#3a3532', 0.6, 0.7),
        rust=mat('az_rust', '#5a2e18', 0.8, 0.4),
        rubber=mat('az_rubber', '#141414', 0.9),
        rim=mat('az_rim', '#8f9296', 0.4, 0.8),
        paint=mat('az_paint', '#c9c3b5', 0.45, 0.2),   # 4×4 : blanc cassé poussiéreux
        trim=mat('az_trim', '#1d1f21', 0.6, 0.3),
        glass=mat('az_glass', '#0c1216', 0.08, 0.9),
        lamp=mat('az_lamp', '#fff3d6', 0.2, emit='#fff3d6', emit_k=2.0),
        tail=mat('az_tail', '#8a0f08', 0.3, emit='#ff2a10', emit_k=0.6),
        orange=mat('az_orange', '#c25a10', 0.4, emit='#ff7a1a', emit_k=0.3),
        enamel=mat('az_enamel', '#e8e2d2', 0.35, 0.1),
        enamel_red=mat('az_enamel_red', '#a8261c', 0.35, 0.1),
        akassa=mat('az_akassa', '#e9e4d4', 0.9),
        canvas=mat('az_canvas', '#6b5a3c', 0.95),
        bluetank=mat('az_bluetank', '#2a4c86', 0.5, 0.3),
        stone=mat('az_stone', '#55534f', 0.95),
        kaolin=mat('az_kaolin', '#efe9dc', 0.9),
        sign_az=mat('az_sign_az', '#ffffff', 0.9, tex=t['sign_az']),
        sign_vulc=mat('az_sign_vulc', '#ffffff', 0.7, tex=t['sign_vulc']),
        sign_dossi=mat('az_sign_dossi', '#ffffff', 0.7, tex=t['sign_dossi']),
        sign_fuel=mat('az_sign_fuel', '#ffffff', 0.7, tex=t['sign_fuel']),
        stele=mat('az_stele', '#ffffff', 0.95, tex=t['stele']),
    )


# ---------------------------------------------------------------- utilitaires
def uv_cyl(ob, sv=1.0):
    """UV cylindriques (troncs, fûts, toits coniques)"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (math.atan2(co.y, co.x) / (2 * math.pi) + 0.5) * 4
            uv.data[li].uv = (u, co.z * sv)


def uv_face(ob):
    """UV d'une plaque : l'image entière sur la face -Y (enseignes, stèle)"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    xs = [v.co.x for v in me.vertices]
    zs = [v.co.z for v in me.vertices]
    x0, x1, z0, z1 = min(xs), max(xs), min(zs), max(zs)
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            u = (co.x - x0) / (x1 - x0 or 1)
            if p.normal.y > 0.5:
                u = 1 - u
            uv.data[li].uv = (u, (co.z - z0) / (z1 - z0 or 1))


def B(name, m, sx, sy, sz, x=0, y=0, z=0, rot=(0, 0, 0), s=0.5, bevel=0.0):
    """boîte posée (z = bas), UV cube"""
    ob = box(name, m, sx, sy, sz, x, y, z + sz / 2, rot, bevel)
    box_uv(ob, s)
    return ob


def C(name, m, r1, r2, h, x=0, y=0, z=0, seg=16, rot=(0, 0, 0), sv=0.5, cap=True):
    ob = cyl(name, m, r1, r2, h, x, y, z, seg=seg, rot=rot, cap=cap)
    uv_cyl(ob, sv)
    return ob


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


def corrugated(name, m, L, W, x, y, z, rot=(0, 0, 0), waves=None, amp=0.025):
    """tôle ondulée : plaque L (le long des ondes) × W, ondulée en travers"""
    n = waves or int(W / 0.08)
    bm = bmesh.new()
    rows = []
    for i in range(n * 2 + 1):
        u = -W / 2 + W * i / (n * 2)
        zz = amp * math.sin(i * math.pi / 2)
        rows.append([bm.verts.new((u, -L / 2, zz)), bm.verts.new((u, L / 2, zz))])
    for i in range(len(rows) - 1):
        bm.faces.new((rows[i][0], rows[i + 1][0], rows[i + 1][1], rows[i][1]))
    ob = obj_from_bm(bm, name, m)
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / W * 2, co.y / L)
    ob.location = (x, y, z)
    ob.rotation_euler = rot
    sol = ob.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.012
    return ob


def hip_roof(name, m, w, d, h, z, over=0.45):
    """toit de paille à quatre pans (pyramide tronquée en haut), débordant"""
    W, D = w / 2 + over, d / 2 + over
    bm = bmesh.new()
    b = [bm.verts.new(v) for v in ((-W, -D, 0), (W, -D, 0), (W, D, 0), (-W, D, 0))]
    t = [bm.verts.new(v) for v in ((-0.12, -0.12, h), (0.12, -0.12, h), (0.12, 0.12, h), (-0.12, 0.12, h))]
    for i in range(4):
        j = (i + 1) % 4
        bm.faces.new((b[i], b[j], t[j], t[i]))
    bm.faces.new(t)
    bm.faces.new(b[::-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name, m)
    ob.location.z = z
    box_uv(ob, 0.6)
    sol = ob.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.12
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def finish(objs, name, ao=True, dist=3.0, max_edge=0.9, samples=24, prev=None):
    """applique les modificateurs, fusionne par matière, précalcule l'ombre douce, exporte"""
    objs = [o for o in objs if o and o.name in bpy.data.objects]
    for o in objs:
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        for mo in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=mo.name)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    by = {}
    for o in objs:
        key = o.data.materials[0].name if o.data.materials else 'none'
        by.setdefault(key, []).append(o)
    merged = [join(v, f'{name}_{k}') for k, v in by.items()]
    if ao:
        bake_ao(merged, distance=dist, samples=samples, floor=0.38, max_edge=max_edge)
        show_ao(merged)
    out = os.path.join(WORK, f'{name}.glb')
    export(out, merged)
    if prev:
        preview(os.path.join(WORK, f'{name}.png'), **prev)
    return merged


# ---------------------------------------------------------------- cases
def walls(prefix, m, w, d, h, door=True, window=True, broken=None):
    """murs de banco avec une porte (face -Y) et une fenêtre ; broken = hauteurs de murs cassés"""
    t = 0.22
    parts = []
    hs = broken or [h, h, h, h]
    # face avant (-Y) : deux trumeaux + linteau autour de la porte
    dw = 0.9
    side = (w - dw) / 2
    parts.append(B(prefix + 'f1', m, side, t, hs[0], -w / 2 + side / 2, -d / 2 + t / 2))
    parts.append(B(prefix + 'f2', m, side, t, hs[0] * (0.8 if broken else 1), w / 2 - side / 2, -d / 2 + t / 2))
    if not broken:
        parts.append(B(prefix + 'f3', m, dw, t, h - 1.95, 0, -d / 2 + t / 2, 1.95))
    parts.append(B(prefix + 'b', m, w, t, hs[1], 0, d / 2 - t / 2))
    parts.append(B(prefix + 'l', m, t, d - 2 * t, hs[2], -w / 2 + t / 2, 0))
    if window and not broken:
        # mur droit en trois morceaux autour d'une fenêtre à volet
        ww, wz = 0.6, 1.0
        seg = (d - 2 * t - ww) / 2
        parts.append(B(prefix + 'r1', m, t, seg, hs[3], w / 2 - t / 2, -d / 2 + t + seg / 2))
        parts.append(B(prefix + 'r2', m, t, seg, hs[3], w / 2 - t / 2, d / 2 - t - seg / 2))
        parts.append(B(prefix + 'r3', m, t, ww, wz, w / 2 - t / 2, 0))
        parts.append(B(prefix + 'r4', m, t, ww, h - wz - 0.6, w / 2 - t / 2, 0, wz + 0.6))
        parts.append(B(prefix + 'shut', M['wood_dark'], 0.04, ww * 0.95, 0.58, w / 2 + 0.02, 0, wz + 0.01, rot=(0, 0, 0)))
    else:
        parts.append(B(prefix + 'r', m, t, d - 2 * t, hs[3], w / 2 - t / 2, 0))
    if door and not broken:
        parts.append(B(prefix + 'door', M['wood_dark'], dw - 0.06, 0.05, 1.9, 0, -d / 2 + 0.04))
        parts.append(B(prefix + 'void', M['dark'], dw - 0.06, 0.02, 1.9, 0, -d / 2 + 0.08))
    # soubassement (bande sombre éclaboussée)
    parts.append(B(prefix + 'plinth', M['banco_burnt'] if broken else M['banco2'], w + 0.08, d + 0.08, 0.28, 0, 0, 0, s=0.8))
    return parts


def hut_thatch(name='az-hut-thatch'):
    reset(); make_mats()
    w, d, h = 4.0, 3.5, 2.4
    objs = walls('ht_', M['banco'], w, d, h)
    objs.append(hip_roof('ht_roof', M['thatch'], w, d, 1.7, h - 0.05))
    # véranda : poteaux de bois et banc
    for x in (-w / 2 - 0.25, w / 2 + 0.25):
        objs.append(C('ht_post' + str(x), M['wood'], 0.07, 0.06, h, x, -d / 2 - 0.35, 0, seg=8))
    objs.append(B('ht_bench', M['wood'], 1.6, 0.35, 0.08, -0.9 - 0.4, -d / 2 - 0.45, 0.42))
    for x in (-1.9, -0.7):
        objs.append(B('ht_bl' + str(x), M['wood'], 0.08, 0.3, 0.42, x, -d / 2 - 0.45))
    objs.append(C('ht_jar', M['enamel_red'], 0.22, 0.28, 0.55, w / 2 - 0.3, -d / 2 - 0.4, 0, seg=14))
    finish(objs, name, prev=dict(target=(0, 0, 1.6), dist=11, elev=0.25, az=-1.2))


def hut_tin(name='az-hut-tin'):
    reset(); make_mats()
    w, d, h = 4.5, 4.0, 2.5
    objs = walls('hn_', M['banco2'], w, d, h)
    # toit de tôle à deux pans, faîtage le long de X, qui déborde sur la façade
    over = 0.5
    half = d / 2 + over
    ang = math.radians(16)
    L = half / math.cos(ang)
    for s in (-1, 1):
        objs.append(corrugated('hn_roof' + str(s), M['tin'], L, w + 0.6, 0, s * half / 2, h + 0.05 + math.tan(ang) * half / 2,
                               rot=(-s * ang, 0, 0)))
    # fermes de bois sous la tôle
    for x in (-w / 2, 0, w / 2):
        objs.append(between('hn_raf' + str(x), M['wood_dark'], (x, -half, h), (x, 0, h + math.tan(ang) * half), 0.05, seg=6))
        objs.append(between('hn_rab' + str(x), M['wood_dark'], (x, half, h), (x, 0, h + math.tan(ang) * half), 0.05, seg=6))
    # cuve bleue et pneu de jardin
    objs.append(C('hn_tank', M['bluetank'], 0.4, 0.4, 0.95, -w / 2 - 0.55, 0.6, 0, seg=16))
    finish(objs, name, prev=dict(target=(0, 0, 1.6), dist=11, elev=0.25, az=-1.2))


def hut_burnt(name='az-hut-burnt'):
    reset(); make_mats()
    w, d, h = 4.0, 3.5, 2.4
    objs = walls('hb_', M['banco_burnt'], w, d, h, window=False, broken=[1.9, 2.4, 1.4, 2.1])
    # poutres calcinées effondrées en travers
    for i, (a, b) in enumerate([((-1.8, -1.2, 1.8), (1.6, 1.4, 0.2)), ((-1.6, 1.5, 2.3), (1.2, -1.0, 0.3)), ((0.4, -1.6, 1.5), (-0.6, 1.6, 0.1))]):
        objs.append(between('hb_beam' + str(i), M['char'], a, b, 0.08, 0.06, seg=7))
    # tas de chaume brûlé au sol
    for i in range(5):
        x, y = R.uniform(-1.2, 1.2), R.uniform(-1, 1)
        objs.append(C('hb_pile' + str(i), M['thatch_burnt'], R.uniform(0.5, 0.9), 0.05, R.uniform(0.25, 0.5), x, y, 0, seg=9))
    # porte arrachée, tombée devant
    objs.append(B('hb_door', M['char'], 0.84, 1.8, 0.05, 0.7, -d / 2 - 1.1, 0.02, rot=(0, 0, 0.3)))
    finish(objs, name, prev=dict(target=(0, 0, 1.2), dist=11, elev=0.35, az=-1.2))


def healer(name='az-healer'):
    """maison de Dah Agossou : plus grande, deux pièces, cour fermée par une palissade de nattes"""
    reset(); make_mats()
    w, d, h = 5.2, 4.2, 2.6
    objs = walls('hl_', M['banco'], w, d, h)
    objs.append(hip_roof('hl_roof', M['thatch'], w, d, 2.0, h - 0.05, over=0.6))
    # signes blancs de kaolin peints autour de la porte
    for i in range(5):
        objs.append(B('hl_mark' + str(i), M['kaolin'], 0.06, 0.02, 0.06, -0.6 + 0.3 * i, -d / 2 - 0.005, 2.1))
    for z in (0.4, 0.8, 1.2, 1.6):
        for x in (-0.62, 0.62):
            objs.append(B(f'hl_dot{z}{x}', M['kaolin'], 0.05, 0.02, 0.05, x, -d / 2 - 0.005, z))
    # palissade de nattes (cour devant)
    for i in range(14):
        x = -w / 2 - 1 + i * (w + 2) / 13
        objs.append(C('hl_pole' + str(i), M['wood_dark'], 0.04, 0.035, 1.6, x, -d / 2 - 3.0, 0, seg=6))
    objs.append(B('hl_fenceA', M['thatch'], (w + 2) * 0.38, 0.05, 1.4, -w / 2 - 1 + (w + 2) * 0.19, -d / 2 - 3.0, 0.1, s=0.8))
    objs.append(B('hl_fenceB', M['thatch'], (w + 2) * 0.38, 0.05, 1.4, w / 2 + 1 - (w + 2) * 0.19, -d / 2 - 3.0, 0.1, s=0.8))
    # canaris (jarres de terre) et calebasses posées
    for i, x in enumerate((-1.8, -1.4, 1.6)):
        objs.append(lathe('hl_jar' + str(i), M['banco2'], [(0.05, 0), (0.22, 0.12), (0.26, 0.3), (0.16, 0.48), (0.12, 0.52)], seg=16, z0=0))
        objs[-1].location = (x, -d / 2 - 0.5, 0)
    finish(objs, name, prev=dict(target=(0, -1.5, 1.4), dist=13, elev=0.3, az=-1.25))


def asen(name='az-asen'):
    """asen : autel des ancêtres en fer forgé (tige plantée, ombrelle de métal et petites figures),
    avec la calebasse du guérisseur et des traces de kaolin. Abstrait et respectueux."""
    reset(); make_mats()
    objs = []
    objs.append(C('as_mound', M['banco2'], 0.7, 0.45, 0.25, 0, 0, 0, seg=20))
    for i, (x, y, hh) in enumerate([(0, 0, 1.25), (-0.28, 0.18, 0.95), (0.3, 0.12, 1.05)]):
        objs.append(C('as_rod' + str(i), M['iron'], 0.018, 0.015, hh, x, y, 0.2, seg=6))
        objs.append(C('as_cone' + str(i), M['iron'], 0.24 - 0.04 * i, 0.02, 0.1, x, y, 0.2 + hh, seg=18))
        for k in range(6):  # pendeloques
            a = k * math.pi / 3
            objs.append(C(f'as_dr{i}{k}', M['iron'], 0.01, 0.01, 0.09, x + math.cos(a) * 0.2, y + math.sin(a) * 0.2, 0.12 + hh, seg=4))
        objs.append(C('as_fig' + str(i), M['iron'], 0.03, 0.02, 0.12, x, y, 0.3 + hh, seg=6))
    # calebasse fendue en deux, posée devant
    cal = lathe('as_cal', M['wood'], [(0.0, 0), (0.12, 0.02), (0.17, 0.08), (0.17, 0.12)], seg=18)
    cal.location = (0.05, -0.45, 0.25)
    objs.append(cal)
    objs.append(C('as_kaolin', M['kaolin'], 0.13, 0.12, 0.03, 0.05, -0.45, 0.33, seg=14))
    finish(objs, name, dist=1.5, max_edge=0.3, prev=dict(target=(0, 0, 0.7), dist=4, elev=0.3, az=-1.3))


# ---------------------------------------------------------------- atelier de Kossi et buvette
def atelier(name='az-atelier'):
    reset(); make_mats()
    objs = []
    w, d = 5.0, 4.0
    # mur de fond en banco, hangar ouvert sur l'avant
    objs.append(B('at_back', M['banco2'], w, 0.22, 2.5, 0, d / 2))
    objs.append(B('at_side', M['banco2'], 0.22, d, 1.2, -w / 2, 0))
    for x in (-w / 2, w / 2):
        objs.append(C('at_post' + str(x), M['wood'], 0.08, 0.07, 2.7, x, -d / 2, 0, seg=8))
    objs.append(corrugated('at_roof', M['tin'], d + 1.0, w + 0.8, 0, -0.2, 2.78, rot=(math.radians(7), 0, 0)))
    # enseigne peinte au-dessus de l'entrée
    sg = box('at_sign', M['sign_vulc'], 3.0, 0.05, 0.9, 0, -d / 2 - 0.06, 3.25)
    uv_face(sg)
    objs.append(sg)
    for x in (-1.3, 1.3):
        objs.append(C('at_sgp' + str(x), M['wood'], 0.04, 0.04, 1.0, x, -d / 2 - 0.02, 2.75, seg=6))
    # établi, compresseur, pneus empilés, jante
    objs.append(B('at_bench', M['wood_dark'], 2.0, 0.7, 0.08, 1.0, d / 2 - 0.6, 0.85))
    for x in (0.15, 1.85):
        objs.append(B('at_bl' + str(x), M['wood_dark'], 0.08, 0.6, 0.85, x, d / 2 - 0.6))
    objs.append(C('at_tank', M['enamel_red'], 0.25, 0.25, 0.9, 0, 0, 0, seg=16, rot=(0, math.pi / 2, 0)))
    objs[-1].location = (-1.7, 0.8, 0.35)
    objs.append(B('at_motor', M['iron'], 0.35, 0.3, 0.3, -1.6, 0.8, 0.6))
    objs.append(B('at_comp_base', M['iron'], 1.0, 0.5, 0.1, -1.6, 0.8, 0.0))
    for i in range(5):
        objs.append(torus('at_tyre' + str(i), M['rubber'], 0.33, 0.12, 2.9, -1.0, 0.12 + i * 0.24))
    for i in range(3):
        objs.append(torus('at_tyreb' + str(i), M['rubber'], 0.36, 0.12, 2.75 - 0.05 * i, -0.2 + 0.02 * i, 0.12 + i * 0.24))
    objs.append(torus('at_lean', M['rubber'], 0.34, 0.11, -2.2, -1.5, 0.45, rot=(math.pi / 2 - 0.25, 0, 0.4)))
    objs.append(C('at_rim', M['rim'], 0.25, 0.25, 0.18, 0.6, -0.4, 0, seg=16))
    objs.append(C('at_bucket', M['bluetank'], 0.18, 0.22, 0.32, 0.2, 1.2, 0, seg=14))  # bassine d'eau pour trouver les fuites
    finish(objs, name, prev=dict(target=(0, 0, 1.4), dist=11, elev=0.22, az=-1.25))


def buvette(name='az-buvette'):
    reset(); make_mats()
    objs = []
    w, d = 4.0, 3.0
    objs.extend(walls('bv_', M['banco'], w, d, 2.3, door=True, window=False))
    objs.append(hip_roof('bv_roof', M['thatch'], w, d, 1.3, 2.25, over=0.35))
    # auvent de tôle sur poteaux devant
    for x in (-w / 2 + 0.1, w / 2 - 0.1):
        objs.append(C('bv_post' + str(x), M['wood'], 0.06, 0.05, 2.3, x, -d / 2 - 2.0, 0, seg=8))
    objs.append(corrugated('bv_awning', M['tin'], 2.3, w + 0.3, 0, -d / 2 - 1.05, 2.33, rot=(math.radians(6), 0, 0)))
    sg = box('bv_sign', M['sign_dossi'], 2.4, 0.05, 0.62, 0, -d / 2 - 2.22, 2.55)
    uv_face(sg)
    objs.append(sg)
    # comptoir, bassines d'akassa, marmite sur trois pierres, banc
    objs.append(B('bv_table', M['wood'], 1.8, 0.8, 0.07, 0, -d / 2 - 1.2, 0.8))
    for x in (-0.8, 0.8):
        for y in (-0.35, 0.35):
            objs.append(B(f'bv_tl{x}{y}', M['wood'], 0.06, 0.06, 0.8, x, -d / 2 - 1.2 + y))
    for i, x in enumerate((-0.55, 0.0, 0.55)):
        b = lathe('bv_bowl' + str(i), M['enamel'] if i != 1 else M['enamel_red'], [(0.1, 0), (0.2, 0.03), (0.26, 0.12), (0.27, 0.13)], seg=18)
        b.location = (x, -d / 2 - 1.2, 0.87)
        objs.append(b)
        for k in range(3):  # boules d'akassa enveloppées dans la feuille
            objs.append(C(f'bv_ak{i}{k}', M['akassa'], 0.07, 0.06, 0.08, x - 0.07 + k * 0.07, -d / 2 - 1.2 + (k % 2) * 0.05, 0.9, seg=8))
    for i, a in enumerate((0, 2.1, 4.2)):
        objs.append(C('bv_stone' + str(i), M['stone'], 0.12, 0.1, 0.22, 1.6 + math.cos(a) * 0.22, -d / 2 - 1.0 + math.sin(a) * 0.22, 0, seg=7))
    pot = lathe('bv_pot', M['char'], [(0.05, 0), (0.24, 0.06), (0.3, 0.22), (0.25, 0.38), (0.26, 0.42)], seg=18)
    pot.location = (1.6, -d / 2 - 1.0, 0.18)
    objs.append(pot)
    objs.append(B('bv_bench', M['wood'], 1.6, 0.32, 0.07, -0.4, -d / 2 - 2.3, 0.42))
    for x in (-1.0, 0.2):
        objs.append(B('bv_bb' + str(x), M['wood'], 0.07, 0.28, 0.42, x, -d / 2 - 2.3))
    finish(objs, name, prev=dict(target=(0, -1.8, 1.2), dist=10, elev=0.25, az=-1.3))


# ---------------------------------------------------------------- station de kpayo en ruine
def station(name='az-station'):
    reset(); make_mats()
    objs = []
    objs.append(B('st_slab', M['concrete'], 14, 10, 0.2, 0, 0, 0, s=0.25))
    # quatre piliers, deux cassés
    for i, (x, y, hh) in enumerate([(-6, -4, 3.2), (6, -4, 1.4), (-6, 4, 2.0), (6, 4, 3.3)]):
        objs.append(B('st_pil' + str(i), M['concrete'], 0.4, 0.4, hh, x, y, 0.2, s=0.6))
    # auvent de tôle effondré d'un côté
    objs.append(corrugated('st_canopyA', M['tin_burnt'], 9.0, 7.0, -3.0, 0, 3.25, rot=(math.radians(-3), math.radians(5), 0)))
    objs.append(corrugated('st_canopyB', M['tin_burnt'], 8.0, 6.0, 3.4, 0.4, 1.25, rot=(math.radians(4), math.radians(24), 0)))
    for i, y in enumerate((-4, 0, 4)):
        objs.append(between('st_girder' + str(i), M['rust'], (-6, y, 3.4), (0.2, y, 3.0), 0.07, seg=6))
    objs.append(between('st_fallen', M['rust'], (0.2, -3.6, 2.6), (6.2, -3.2, 0.25), 0.07, seg=6))
    # cabane de vente calcinée
    hut = walls('st_hut_', M['banco_burnt'], 3.0, 2.5, 2.0, window=False, broken=[1.5, 2.0, 1.1, 1.8])
    for o in hut:
        o.location.x += 3.6
        o.location.y += 2.4
    objs.extend(hut)
    sg = box('st_sign', M['sign_fuel'], 1.6, 0.04, 0.4, 3.6, 1.05, 2.1, rot=(0, 0.35, 0))
    uv_face(sg)
    objs.append(sg)
    # fûts calcinés (debout et renversés)
    for i in range(18):
        x, y = R.uniform(-5, 1.5), R.uniform(-3.5, 3.5)
        fallen = R.rand() > 0.55
        if fallen:
            c = C('st_drum' + str(i), M['rust'], 0.29, 0.29, 0.88, 0, 0, 0, seg=14, rot=(math.pi / 2, 0, R.uniform(0, math.pi)))
            c.location = (x, y, 0.49)
        else:
            c = C('st_drum' + str(i), M['rust'], 0.29, 0.29, 0.88, x, y, 0.2, seg=14)
            if R.rand() > 0.5:  # éclaté
                c.scale = (1.15, 0.85, 0.8)
        objs.append(c)
    # traces noires au sol (taches de brûlé)
    for i in range(6):
        objs.append(C('st_scorch' + str(i), M['char'], R.uniform(1.0, 2.2), R.uniform(0.9, 2.0), 0.01, R.uniform(-5, 5), R.uniform(-4, 4), 0.2, seg=12))
    # arbre mort calciné
    objs.append(between('st_tree', M['char'], (-4.5, 5.6, 0), (-4.1, 5.9, 4.5), 0.25, 0.12, seg=8))
    objs.append(between('st_tb1', M['char'], (-4.2, 5.85, 3.2), (-3.0, 6.3, 4.6), 0.1, 0.04, seg=6))
    objs.append(between('st_tb2', M['char'], (-4.25, 5.8, 2.5), (-5.6, 5.5, 3.6), 0.09, 0.03, seg=6))
    finish(objs, name, dist=3.5, max_edge=1.2, prev=dict(target=(0, 0, 1.4), dist=22, elev=0.35, az=-1.15))


# ---------------------------------------------------------------- souche de l'iroko Loko
def stump(name='az-stump'):
    reset(); make_mats()
    objs = []
    prof = [(2.25, 0.0), (2.0, 0.15), (1.8, 0.5), (1.72, 1.2), (1.68, 2.0), (1.66, 2.2)]
    tr = lathe('lk_trunk', M['bark'], prof, seg=28, caps=False)
    objs.append(tr)
    uv_cyl(tr, 0.6)
    top = disc('lk_top', M['rings'], 1.66, z=2.19, seg=28, rings=3)
    me = top.data
    if me.polygons[0].normal.z < 0:
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.reverse_faces(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    uv = me.uv_layers.active
    for p in me.polygons:  # cernes : image entière sur le disque
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / 3.32 + 0.5, co.y / 3.32 + 0.5)
    objs.append(top)
    # racines-contreforts (comme les grands iroko) qui plongent dans le sol
    for i in range(9):
        a = i * 2 * math.pi / 9 + R.uniform(-0.15, 0.15)
        L = R.uniform(2.2, 3.4)
        objs.append(between('lk_root' + str(i), M['bark'], (math.cos(a) * 1.4, math.sin(a) * 1.4, 0.9),
                            (math.cos(a) * (1.4 + L), math.sin(a) * (1.4 + L), -0.15), 0.38, 0.1, seg=7))
    # pousses mortes et tissu blanc noué (le lieu reste sacré)
    band = C('lk_cloth', M['cloth'], 1.75, 1.75, 0.22, 0, 0, 1.25, seg=28, cap=False)
    sol = band.modifiers.new('sol', 'SOLIDIFY')
    sol.thickness = 0.02
    objs.append(band)
    objs.append(B('lk_knot', M['cloth'], 0.25, 0.1, 0.3, 0, -1.8, 1.1))
    objs.append(between('lk_tail', M['cloth'], (0.05, -1.8, 1.15), (0.2, -1.95, 0.55), 0.05, 0.03, seg=5))
    # petites offrandes de kaolin au pied
    for i in range(3):
        objs.append(C('lk_k' + str(i), M['kaolin'], 0.09, 0.07, 0.07, -0.5 + i * 0.4, -2.3, 0, seg=10))
    finish(objs, name, dist=2.5, max_edge=0.6, prev=dict(target=(0, 0, 1.2), dist=12, elev=0.3, az=-1.2))


# ---------------------------------------------------------------- stèle, panneau, 4×4
def stele(name='az-stele'):
    reset(); make_mats()
    objs = []
    objs.append(B('sl_base', M['stone'], 1.6, 0.8, 0.25, 0, 0, 0))
    sl = box('sl_slab', M['stele'], 1.2, 0.3, 1.9, 0, 0, 0.25 + 0.95)
    uv_face(sl)
    objs.append(sl)
    objs.append(B('sl_cap', M['stone'], 1.32, 0.42, 0.1, 0, 0, 2.15))
    for i in range(4):  # bougies éteintes et fleurs séchées
        objs.append(C('sl_c' + str(i), M['enamel'], 0.03, 0.03, 0.12 + 0.04 * (i % 2), -0.55 + i * 0.36, -0.32, 0.25, seg=8))
    finish(objs, name, dist=1.5, max_edge=0.3, prev=dict(target=(0, 0, 1.1), dist=5, elev=0.15, az=-1.4))


def sign(name='az-sign'):
    reset(); make_mats()
    objs = []
    for x in (-0.85, 0.85):
        objs.append(C('sg_post' + str(x), M['char'], 0.07, 0.06, 2.4, x, 0, 0, seg=7))
    b = box('sg_board', M['sign_az'], 2.0, 0.05, 0.62, 0, -0.07, 1.95, rot=(0, math.radians(-5), 0))
    uv_face(b)
    objs.append(b)
    finish(objs, name, dist=1.2, max_edge=0.3, prev=dict(target=(0, 0, 1.5), dist=5, elev=0.1, az=-1.5))


def car4x4(name='az-4x4'):
    """4×4 de location sans marque : caisse carrée, pare-buffle, galerie chargée, roue de secours
    sur la porte arrière. Le rétroviseur côté conducteur manque (Happy l'a arraché).
    Avant vers -Y (= +Z dans le jeu) ; dans le jeu on le tourne vers le village."""
    reset(); make_mats()
    objs = []
    L, W = 4.6, 1.9
    objs.append(box('c_body', M['paint'], W, L, 0.75, 0, 0, 0.95, bevel=0.06))
    objs.append(box('c_hood', M['paint'], W - 0.04, 1.3, 0.12, 0, -L / 2 + 0.65, 1.38, rot=(math.radians(-3), 0, 0), bevel=0.04))
    objs.append(box('c_cab', M['paint'], W - 0.06, 2.75, 0.85, 0, 0.55, 1.75, bevel=0.07))
    # vitres
    objs.append(box('c_ws', M['glass'], W - 0.2, 0.05, 0.62, 0, -0.84, 1.8, rot=(math.radians(-14), 0, 0)))
    for s in (-1, 1):
        objs.append(box('c_sw' + str(s), M['glass'], 0.04, 2.4, 0.5, s * (W / 2 - 0.02), 0.6, 1.82))
        objs.append(box('c_pil' + str(s), M['paint'], 0.06, 0.06, 0.55, s * (W / 2 - 0.02), -0.05, 1.82))
    objs.append(box('c_rw', M['glass'], W - 0.3, 0.04, 0.5, 0, 1.93, 1.82))
    # pare-chocs, calandre, phares, feux
    objs.append(box('c_bumpF', M['trim'], W + 0.05, 0.2, 0.22, 0, -L / 2 - 0.05, 0.6, bevel=0.03))
    objs.append(box('c_bumpR', M['trim'], W + 0.05, 0.2, 0.22, 0, L / 2 + 0.05, 0.6, bevel=0.03))
    objs.append(box('c_grill', M['trim'], 1.0, 0.04, 0.35, 0, -L / 2 - 0.01, 1.05))
    for s in (-1, 1):
        objs.append(C('c_head' + str(s), M['lamp'], 0.12, 0.12, 0.05, s * 0.72, -L / 2 - 0.01, 1.05, seg=14, rot=(math.pi / 2, 0, 0)))
        objs.append(box('c_tail' + str(s), M['tail'], 0.16, 0.04, 0.28, s * 0.82, L / 2 + 0.01, 1.05))
        objs.append(box('c_flare' + str(s) + 'f', M['trim'], 0.1, 0.95, 0.08, s * (W / 2 + 0.04), -1.38, 0.9))
        objs.append(box('c_flare' + str(s) + 'r', M['trim'], 0.1, 0.95, 0.08, s * (W / 2 + 0.04), 1.38, 0.9))
        objs.append(box('c_step' + str(s), M['trim'], 0.18, 1.6, 0.05, s * (W / 2 + 0.07), 0, 0.42))
    # pare-buffle
    for s in (-1, 1):
        objs.append(between('c_bb' + str(s), M['rim'], (s * 0.6, -L / 2 - 0.15, 0.55), (s * 0.55, -L / 2 - 0.22, 1.25), 0.03, seg=8))
    objs.append(between('c_bbt', M['rim'], (-0.55, -L / 2 - 0.22, 1.25), (0.55, -L / 2 - 0.22, 1.25), 0.03, seg=8))
    objs.append(between('c_bbm', M['rim'], (-0.58, -L / 2 - 0.19, 0.9), (0.58, -L / 2 - 0.19, 0.9), 0.025, seg=8))
    # rétroviseur passager seulement (le conducteur a perdu le sien)
    objs.append(box('c_mirror', M['trim'], 0.06, 0.12, 0.16, W / 2 + 0.12, -0.75, 1.62))
    objs.append(between('c_marm', M['trim'], (W / 2, -0.75, 1.55), (W / 2 + 0.1, -0.75, 1.6), 0.015, seg=5))
    objs.append(between('c_wire', M['rubber'], (-W / 2, -0.75, 1.58), (-W / 2 - 0.05, -0.8, 1.5), 0.006, seg=4))
    # roues (avant gauche à plat)
    for i, (x, y) in enumerate([(-0.92, -1.42), (0.92, -1.42), (-0.92, 1.42), (0.92, 1.42)]):
        flat = (i == 0)
        t = torus('c_tyre' + str(i), M['rubber'], 0.3, 0.14, x, y, 0.32 if flat else 0.44, rot=(0, math.pi / 2, 0), seg=24, rs=10)
        if flat:
            t.scale = (1.0, 1.12, 0.72)
        objs.append(t)
        objs.append(C('c_rim' + str(i), M['rim'], 0.2, 0.2, 0.2, 0, 0, 0, seg=16, rot=(0, math.pi / 2, 0)))
        objs[-1].location = (x - 0.1, y, 0.32 if flat else 0.44)
    # roue de secours sur la porte arrière
    objs.append(torus('c_spare', M['rubber'], 0.29, 0.13, 0, L / 2 + 0.22, 1.15, rot=(math.pi / 2, 0, 0), seg=24, rs=10))
    objs.append(C('c_spare_rim', M['rim'], 0.2, 0.2, 0.18, 0, L / 2 + 0.13, 1.15, seg=16, rot=(math.pi / 2, 0, 0)))
    # galerie de toit et bagages
    for s in (-1, 1):
        objs.append(between('c_rail' + str(s), M['iron'], (s * 0.85, -0.6, 2.24), (s * 0.85, 1.75, 2.24), 0.025, seg=6))
    for y in (-0.5, 0.3, 1.1, 1.7):
        objs.append(between('c_bar' + str(y), M['iron'], (-0.85, y, 2.24), (0.85, y, 2.24), 0.02, seg=6))
    objs.append(B('c_bag1', M['canvas'], 0.9, 0.7, 0.35, -0.3, 0.2, 2.25, bevel=0.05))
    objs.append(B('c_bag2', M['bluetank'], 0.55, 0.5, 0.3, 0.45, 0.95, 2.25, bevel=0.06))
    objs.append(C('c_jerry', M['enamel_red'], 0.13, 0.13, 0.5, 0.45, 0.2, 2.25, seg=10))
    finish(objs, name, dist=2.0, max_edge=0.4, prev=dict(target=(0, 0, 1.1), dist=9, elev=0.25, az=-0.9))


BUILD = {
    '4x4': car4x4, 'hut-thatch': hut_thatch, 'hut-tin': hut_tin, 'hut-burnt': hut_burnt, 'healer': healer,
    'asen': asen, 'atelier': atelier, 'buvette': buvette, 'station': station, 'stump': stump, 'stele': stele, 'sign': sign,
}

if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    TEXS = textures()
    for k in (args or list(BUILD)):
        print('==>', k)
        BUILD[k]()
