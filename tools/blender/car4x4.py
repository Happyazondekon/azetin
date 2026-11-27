# =============================================================
#  AZETIN — 4×4 de location « v2 » : silhouette de vrai 4×4 (profil extrudé + chanfreins),
#  passages de roues, phares à boîtier, pare-buffle, snorkel, galerie, pneus sculptés, poussière et rouille.
#  python3 tools/blender/car4x4.py     -> work/az-4x4.glb (+ aperçus), puis node tools/blender/pack-model.mjs az-4x4
#  Repère : Z en haut, -Y = avant (= +Z dans le jeu), X = côté. Roue avant gauche à plat (le pneu crevé).
# =============================================================
import sys, os, math
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import azetin as A
from azetin import *  # noqa
import lib
import bmesh
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

L, W = 4.6, 1.82
HALF = W / 2


# ---------------------------------------------------------------- texture de peinture (poussière, éraflures, rouille)
def tex_paint_dirty(name, seed=21):
    r = np.random.RandomState(seed)
    h = w = 1024
    # v = 0 en bas de caisse, 1 en haut ; u le long
    v = np.linspace(1, 0, h)[:, None] * np.ones((1, w))
    base = np.array([172, 166, 153], np.float32)
    img = np.ones((h, w, 3), np.float32) * base
    n1 = A.noise(h, w, 64, seed) ; n2 = A.noise(h, w, 16, seed + 1) ; n3 = A.noise(h, w, 4, seed + 2)
    # poussière rouge de la piste qui monte du bas, striée par la pluie
    dust_h = 0.5 + 0.22 * n1
    d = np.clip((dust_h - v) / 0.3, 0, 1) ** 0.7
    d = np.clip(d * (0.6 + 0.7 * n2), 0, 1)
    dust = np.array([164, 118, 88], np.float32)
    img = img * (1 - d[..., None] * 0.6) + dust * d[..., None] * 0.6
    # traînées verticales de ruissellement sur la caisse
    streak = A.noise(h, w, 2, seed + 3)
    cols = np.clip((A.noise(1, w, 3, seed + 4)[0] - 0.55) * 4, 0, 1)
    img *= (1 - 0.1 * cols[None, :, None] * (v[..., None] > 0.25))
    # patine générale
    img *= (0.9 + 0.2 * n2)[..., None]
    # éclats de peinture et rouille aux arêtes basses
    rust = np.clip((n3 - 0.78) * 6, 0, 1) * np.clip((0.3 - v) / 0.3, 0, 1)
    img = img * (1 - rust[..., None]) + np.array([112, 52, 24], np.float32) * rust[..., None]
    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    dr = ImageDraw.Draw(im)
    for _ in range(36):  # éraflures
        x, y = r.randint(0, w), r.randint(150, h - 40)
        l = r.randint(10, 60)
        a = r.uniform(-0.5, 0.5)
        c = (230, 226, 215) if r.rand() < 0.35 else (88, 64, 48)
        dr.line([x, y, x + l * math.cos(a), y + l * math.sin(a)], fill=c, width=1)
    for _ in range(14):  # petites bosses sombres
        x, y = r.randint(40, w - 40), r.randint(200, h - 60)
        rr = r.randint(6, 18)
        dr.ellipse([x - rr, y - rr, x + rr, y + rr], fill=(176, 170, 158))
    im = im.filter(ImageFilter.GaussianBlur(0.6))
    p = os.path.join(A.TEX, name)
    im.save(p, quality=88)
    return p


def uv_car(ob):
    """UV monde : flancs (y,z) ; faces avant/arrière (x,z) ; dessus dans la zone propre de la texture"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    for p in me.polygons:
        n = p.normal
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) > max(abs(n.x), abs(n.y)):
                u, v = (co.x + 1) / 2, 0.55 + 0.4 * (co.y + 2.4) / 4.8
            elif abs(n.x) >= abs(n.y):
                u, v = (co.y + 2.4) / 4.8, co.z / 2.3
            else:
                u, v = (co.x + 1) / 2, co.z / 2.3
            uv.data[li].uv = (u, v)


# ---------------------------------------------------------------- formes
def arc_tube(name, m, cy, cz, R, r, a0, a1, x, seg=18, rs=6):
    """tube courbe autour de l'axe X (passages de roues, calandres) : de a0 à a1 (rad), centre (x, cy, cz)"""
    bm = bmesh.new()
    rings = []
    for i in range(seg + 1):
        a = a0 + (a1 - a0) * i / seg
        py, pz = cy + R * math.cos(a), cz + R * math.sin(a)
        ring = []
        for j in range(rs):
            b = 2 * math.pi * j / rs
            ry, rz = math.cos(a) * math.cos(b) * r, math.sin(a) * math.cos(b) * r
            ring.append(bm.verts.new((x + math.sin(b) * r, py + ry, pz + rz)))
        rings.append(ring)
    for i in range(seg):
        for j in range(rs):
            bm.faces.new((rings[i][j], rings[i + 1][j], rings[i + 1][(j + 1) % rs], rings[i][(j + 1) % rs]))
    ob = lib.obj_from_bm(bm, name, m)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def profile_body(name, m, pts, width, x=0):
    """extrusion d'un profil latéral (y, z) sur la largeur : silhouette de la caisse"""
    bm = bmesh.new()
    a = [bm.verts.new((-width / 2, y, z)) for y, z in pts]
    b = [bm.verts.new((width / 2, y, z)) for y, z in pts]
    n = len(pts)
    bm.faces.new(a[::-1]); bm.faces.new(b)
    for i in range(n):
        j = (i + 1) % n
        bm.faces.new((a[i], a[j], b[j], b[i]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib.obj_from_bm(bm, name, m)
    ob.location.x = x
    return ob


def smooth(ob):
    for p in ob.data.polygons:
        p.use_smooth = True


def tire(name, m_rub, cx, cy, cz, flat=False, R=0.43, seg=36):
    """pneu à flancs ronds, bande de roulement à crampons : un seul maillage"""
    bm = bmesh.new()
    prof = [(0.17, -0.12), (0.2, -0.13), (R - 0.04, -0.13), (R, -0.1), (R + 0.01, -0.05), (R + 0.01, 0.05), (R, 0.1), (R - 0.04, 0.13), (0.2, 0.13), (0.17, 0.12)]
    rows = []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        row = []
        for rad, w in prof:
            k = 1.0
            row.append(bm.verts.new((w, rad * math.cos(a) * k, rad * math.sin(a) * k)))
        rows.append(row)
    for i in range(seg):
        for j in range(len(prof) - 1):
            bm.faces.new((rows[i][j], rows[(i + 1) % seg][j], rows[(i + 1) % seg][j + 1], rows[i][j + 1]))
    # crampons
    nb = 26
    for i in range(nb):
        a = 2 * math.pi * (i + 0.5) / nb
        ca, sa = math.cos(a), math.sin(a)
        for side in (-1, 1):
            w0, w1 = (0.015, 0.1) if side > 0 else (-0.1, -0.015)
            rr0, rr1 = R + 0.005, R + 0.03
            da = 0.055
            pts = []
            for aa, rr in ((a - da, rr0), (a + da, rr0), (a + da * 0.8, rr1), (a - da * 0.8, rr1)):
                pts.append((aa, rr))
            vs = []
            for w in (w0, w1):
                for aa, rr in pts:
                    vs.append(bm.verts.new((w, rr * math.cos(aa), rr * math.sin(aa))))
            # boîte à partir de 8 sommets
            f = [(0, 1, 2, 3), (7, 6, 5, 4), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
            for q in f:
                try:
                    bm.faces.new([vs[k] for k in q])
                except ValueError:
                    pass
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = lib.obj_from_bm(bm, name, m_rub)
    smooth(ob)
    ob.location = (cx, cy, cz)
    if flat:
        ob.scale = (1.0, 1.1, 0.74)
    return ob


def rim(name, m_rim, m_dark, cx, cy, cz, side, flat=False):
    objs = []
    # jante tôle : disque creusé + moyeu + 8 boulons
    lathe_pts = [(0.0, 0.0), (0.2, 0.0), (0.205, -0.04), (0.17, -0.07 * side), (0.06, -0.05 * side), (0.0, -0.05 * side)]
    ob = cyl(name, m_rim, 0.21, 0.21, 0.04, 0, 0, 0, seg=24, rot=(0, math.pi / 2, 0))
    objs.append(ob)
    hub = cyl(name + '_hub', m_rim, 0.07, 0.07, 0.09, 0, 0, 0, seg=14, rot=(0, math.pi / 2, 0))
    objs.append(hub)
    for k in range(8):
        a = 2 * math.pi * k / 8
        b = cyl(name + f'_b{k}', m_dark, 0.014, 0.014, 0.1, 0, 0.115 * math.cos(a), 0.115 * math.sin(a), seg=6, rot=(0, math.pi / 2, 0))
        objs.append(b)
    for o in objs:
        o.location.x += cx + side * 0.02
        o.location.y += cy
        o.location.z += cz
        if flat:
            o.scale.z = 0.74
    return objs


def car4x4(name='az-4x4'):
    reset(); make_mats()
    TEX = A.TEX
    paint_tex = tex_paint_dirty('az-paint-dirty.jpg')
    lib._mats.pop('az_paint', None)
    bpy.data.materials.remove(bpy.data.materials['az_paint'])
    Mp = mat('az_paint', '#ffffff', 0.68, 0.04, tex=paint_tex)
    A.M['paint'] = Mp
    M = A.M
    chrome = mat('az_chrome', '#b9bcc0', 0.25, 0.9)
    plate = mat('az_plate', '#d9d4c4', 0.6)
    amber = mat('az_amber', '#d98a12', 0.25, emit='#ff9a18', emit_k=0.25)
    steel = mat('az_steel', '#4a4f55', 0.55, 0.7)
    objs = []

    # ---- caisse : profil latéral extrudé, chanfreins adoucis
    prof = [(-2.30, 0.60), (-2.31, 1.12), (-2.20, 1.27), (-1.00, 1.37), (-0.92, 1.42), (-0.50, 2.17), (-0.40, 2.24),
            (2.12, 2.24), (2.24, 2.14), (2.31, 1.35), (2.30, 0.60), (1.7, 0.56), (-1.7, 0.56)]
    body = profile_body('c_body', Mp, prof, W)
    bev(body, 0.05, 3)
    objs.append(body)
    # capot : léger bossage central + prises d'air
    objs.append(box('c_hoodbulge', Mp, 0.9, 1.05, 0.05, 0, -1.6, 1.335, rot=(0.083, 0, 0), bevel=0.02))
    for s in (-1, 1):
        objs.append(box('c_hoodvent' + str(s), M['trim'], 0.3, 0.02, 0.06, s * 0.55, -1.05, 1.395, bevel=0.005))
    # charnières de capot, joints de portes, poignées
    for s in (-1, 1):
        objs.append(box('c_hinge' + str(s), M['trim'], 0.12, 0.08, 0.03, s * 0.6, -0.97, 1.43))
        for y in (-0.5, 0.52, 1.45):
            objs.append(box('c_seam' + str(s) + str(y), M['trim'], 0.012, 0.014, 0.82, s * (HALF + 0.003), y, 1.42))
        objs.append(box('c_seamh' + str(s), M['trim'], 0.01, 3.4, 0.012, s * (HALF + 0.003), 0.7, 1.05))
        for y in (0.28, 1.22):
            objs.append(box('c_handle' + str(s) + str(y), chrome, 0.035, 0.16, 0.035, s * (HALF + 0.015), y, 1.52, bevel=0.01))
    # vitres : plaques de verre sur la caisse, encadrées de joints noirs
    objs.append(box('c_ws', M['glass'], W - 0.16, 0.03, 0.72, 0, -0.69, 1.82, rot=(math.radians(-27), 0, 0)))
    objs.append(box('c_wsf', M['trim'], W - 0.08, 0.04, 0.8, 0, -0.705, 1.82, rot=(math.radians(-27), 0, 0)))
    for s in (-1, 1):
        for (y0, y1) in ((-0.42, 0.45), (0.58, 1.38), (1.5, 2.05)):
            L_ = y1 - y0
            objs.append(box('c_sw' + str(s) + str(y0), M['glass'], 0.02, L_, 0.46, s * (HALF + 0.003), (y0 + y1) / 2, 1.84, bevel=0.01))
            objs.append(box('c_swf' + str(s) + str(y0), M['trim'], 0.014, L_ + 0.06, 0.54, s * (HALF + 0.0), (y0 + y1) / 2, 1.84))
    objs.append(box('c_rw', M['glass'], W - 0.3, 0.02, 0.4, 0, 2.31, 1.85))
    objs.append(box('c_rwf', M['trim'], W - 0.2, 0.016, 0.48, 0, 2.30, 1.85))
    # essuie-glaces
    for s in (-0.3, 0.35):
        objs.append(between('c_wiper' + str(s), M['trim'], (s - 0.28, -0.98, 1.5), (s + 0.34, -0.85, 1.72), 0.009, seg=5))
    # ---- passages de roues : arcs en caoutchouc
    wheels = [(-0.92, -1.42), (0.92, -1.42), (-0.92, 1.42), (0.92, 1.42)]
    for i, (x, y) in enumerate(wheels):
        s = -1 if x < 0 else 1
        objs.append(arc_tube('c_arch' + str(i), M['rubber'], y, 0.64 if i else 0.58, 0.55, 0.05, math.radians(8), math.radians(172), s * (HALF + 0.07), seg=20))
        objs.append(box('c_flarefill' + str(i), M['trim'], 0.12, 1.2, 0.05, s * (HALF + 0.07), y, 1.19, bevel=0.015))
    # ---- phares : boîtier chromé, verre, clignotants
    for s in (-1, 1):
        objs.append(cyl('c_headring' + str(s), chrome, 0.15, 0.15, 0.05, s * 0.68, -2.33, 1.06, seg=24, rot=(math.pi / 2, 0, 0)))
        objs.append(cyl('c_head' + str(s), M['lamp'], 0.125, 0.125, 0.045, s * 0.68, -2.37, 1.06, seg=24, rot=(math.pi / 2, 0, 0)))
        objs.append(box('c_ind' + str(s), amber, 0.14, 0.04, 0.1, s * 0.9, -2.31, 0.96, bevel=0.01))
        objs.append(box('c_fog' + str(s), M['lamp'], 0.1, 0.04, 0.08, s * 0.5, -2.4, 0.66))
        # feux arrière
        objs.append(box('c_tail' + str(s), M['tail'], 0.16, 0.05, 0.4, s * 0.82, 2.33, 1.18, bevel=0.01))
        objs.append(box('c_tailr' + str(s), M['trim'], 0.2, 0.03, 0.46, s * 0.82, 2.325, 1.18))
    # calandre à lamelles
    objs.append(box('c_grill', M['trim'], 0.78, 0.05, 0.36, 0, -2.31, 1.06, bevel=0.01))
    for k in range(5):
        objs.append(box('c_slat' + str(k), steel, 0.74, 0.03, 0.018, 0, -2.345, 0.92 + k * 0.075))
    # pare-chocs avant robuste + crochets de remorquage ; arrière avec marchepied
    objs.append(box('c_bumpF', M['trim'], W + 0.12, 0.22, 0.26, 0, -2.36, 0.62, bevel=0.04))
    for s in (-1, 1):
        objs.append(between('c_tow' + str(s), M['rim'], (s * 0.6, -2.46, 0.6), (s * 0.6, -2.52, 0.6), 0.025, seg=8))
    objs.append(box('c_plate', plate, 0.42, 0.015, 0.14, 0, -2.475, 0.62))
    objs.append(box('c_bumpR', M['trim'], W + 0.12, 0.26, 0.26, 0, 2.38, 0.6, bevel=0.04))
    objs.append(box('c_stepR', steel, 0.6, 0.3, 0.04, 0, 2.5, 0.72, bevel=0.01))
    objs.append(box('c_hitch', steel, 0.1, 0.22, 0.1, 0, 2.55, 0.52))
    # ---- pare-buffle (tubes épais) + feux additionnels
    for s in (-1, 1):
        objs.append(between('c_bbL' + str(s), M['rim'], (s * 0.7, -2.45, 0.55), (s * 0.7, -2.52, 1.28), 0.034, seg=10))
        objs.append(between('c_bbD' + str(s), M['rim'], (s * 0.7, -2.52, 1.28), (s * 0.35, -2.55, 1.32), 0.03, seg=10))
        objs.append(between('c_bbM' + str(s), M['rim'], (s * 0.7, -2.45, 0.55), (s * 0.45, -2.4, 0.5), 0.03, seg=10))
    objs.append(between('c_bbT', M['rim'], (-0.35, -2.55, 1.32), (0.35, -2.55, 1.32), 0.03, seg=10))
    objs.append(between('c_bbC', M['rim'], (-0.7, -2.5, 0.9), (0.7, -2.5, 0.9), 0.028, seg=10))
    # ---- snorkel côté droit (le long du montant), garde-boue, marchepieds latéraux (rock sliders)
    objs.append(between('c_snork1', M['trim'], (HALF + 0.02, -1.55, 0.95), (HALF + 0.02, -1.0, 1.0), 0.05, seg=10))
    objs.append(between('c_snork2', M['trim'], (HALF + 0.02, -0.92, 1.0), (HALF + 0.03, -0.42, 2.26), 0.05, seg=10))
    objs.append(box('c_snorkh', M['trim'], 0.12, 0.14, 0.12, HALF + 0.03, -0.36, 2.34, bevel=0.03))
    for s in (-1, 1):
        objs.append(between('c_slide' + str(s), M['rim'], (s * (HALF + 0.1), -0.7, 0.5), (s * (HALF + 0.1), 1.2, 0.5), 0.04, seg=10))
        objs.append(box('c_step' + str(s), M['trim'], 0.2, 1.8, 0.03, s * (HALF + 0.14), 0.25, 0.52, bevel=0.01))
    # ---- rétroviseur passager ; côté conducteur : support tordu et fil qui pend
    objs.append(box('c_mirror', M['trim'], 0.08, 0.15, 0.2, HALF + 0.2, -0.64, 1.66, bevel=0.025))
    objs.append(box('c_mirrorg', M['glass'], 0.01, 0.11, 0.15, HALF + 0.245, -0.64, 1.66))
    objs.append(between('c_marm', M['trim'], (HALF - 0.02, -0.55, 1.56), (HALF + 0.17, -0.64, 1.64), 0.014, seg=6))
    objs.append(between('c_marmL', M['trim'], (-HALF + 0.02, -0.55, 1.56), (-HALF - 0.1, -0.7, 1.6), 0.014, seg=6))
    objs.append(between('c_wire', M['rubber'], (-HALF - 0.1, -0.7, 1.6), (-HALF - 0.14, -0.74, 1.42), 0.006, seg=4))
    # ---- roues (avant gauche à plat)
    for i, (x, y) in enumerate(wheels):
        flat = (i == 0)
        z = 0.34 if flat else 0.44
        s = -1 if x < 0 else 1
        objs.append(tire('c_tyre' + str(i), M['rubber'], x, y, z, flat=flat))
        objs.extend(rim('c_rim' + str(i), M['rim'], M['trim'], x, y, z, -s * 1, flat))
    # essieux et transmission, vus par-dessous
    objs.append(between('c_axF', M['iron'], (-0.9, -1.42, 0.42), (0.9, -1.42, 0.42), 0.05, seg=8))
    objs.append(between('c_axR', M['iron'], (-0.9, 1.42, 0.44), (0.9, 1.42, 0.44), 0.05, seg=8))
    objs.append(between('c_shaft', M['iron'], (0, -1.4, 0.5), (0, 1.4, 0.5), 0.035, seg=8))
    objs.append(between('c_exh', steel, (0.35, -0.3, 0.48), (0.35, 2.3, 0.5), 0.04, seg=8))
    # ---- roue de secours sur la porte arrière, avec housse
    objs.append(tire('c_spare', M['rubber'], 0, 2.5, 1.2, R=0.42))
    objs[-1].rotation_euler = (0, 0, math.pi / 2)
    cover = cyl('c_sparecov', M['canvas'], 0.4, 0.4, 0.07, 0, 2.43, 1.2, seg=28, rot=(math.pi / 2, 0, 0))
    objs.append(cover)
    # ---- galerie de toit plus fournie
    for s in (-1, 1):
        objs.append(between('c_rail' + str(s), M['iron'], (s * 0.84, -0.55, 2.4), (s * 0.84, 2.1, 2.4), 0.022, seg=6))
        for y in (-0.55, 2.1):
            objs.append(between('c_leg' + str(s) + str(y), M['iron'], (s * 0.84, y, 2.26), (s * 0.84, y, 2.4), 0.02, seg=6))
    for k in range(9):
        y = -0.5 + k * 0.28
        objs.append(between('c_bar' + str(k), M['iron'], (-0.84, y, 2.4), (0.84, y, 2.4), 0.014, seg=5))
    objs.append(between('c_front', M['iron'], (-0.84, -0.55, 2.4), (0.84, -0.55, 2.4), 0.022, seg=6))
    objs.append(B('c_bag1', M['canvas'], 0.95, 0.78, 0.4, -0.28, 0.1, 2.42, bevel=0.06))
    objs.append(B('c_bag2', M['bluetank'], 0.6, 0.55, 0.34, 0.42, 1.2, 2.42, bevel=0.07))
    objs.append(C('c_jerry', M['enamel_red'], 0.13, 0.13, 0.5, 0.5, 0.2, 2.42, seg=12))
    objs.append(box('c_strap', M['rubber'], 0.04, 0.8, 0.012, -0.28, 0.1, 2.83))
    # jerrican arrière + échelle
    objs.append(box('c_jerryR', M['enamel_red'], 0.38, 0.18, 0.5, HALF + 0.0, 2.45, 1.1, bevel=0.03))
    objs.append(between('c_lad1', M['iron'], (-0.85, 2.36, 0.8), (-0.85, 2.36, 2.2), 0.018, seg=6))
    objs.append(between('c_lad2', M['iron'], (-0.65, 2.36, 0.8), (-0.65, 2.36, 2.2), 0.018, seg=6))
    for z in (1.0, 1.35, 1.7, 2.05):
        objs.append(between('c_rung' + str(z), M['iron'], (-0.85, 2.36, z), (-0.65, 2.36, z), 0.014, seg=5))

    uv_car(body)
    for o in objs:
        if o is not body and o.data.materials and o.data.materials[0] == Mp:
            uv_car(o)
    finish(objs, name, dist=1.6, max_edge=0.35, samples=32, prev=dict(target=(0, 0, 1.15), dist=9.5, elev=0.27, az=-0.9))
    for tag, az, el, d in (('b', 2.3, 0.2, 9.5), ('c', -2.2, 0.15, 7.0), ('d', -1.4, 0.08, 5.5)):
        lib.preview(os.path.join(lib.WORK, name + '-' + tag + '.png'), target=(0, 0, 1.1), dist=d, elev=el, az=az)


if __name__ == '__main__':
    A.TEXS = A.textures()
    car4x4()
