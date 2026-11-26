# =============================================================
#  Outils communs aux scripts Blender (repris de Dantokpa Dash, HeyHappy Studio)
#  (modélisation par script, pose des statues, éclairage précalculé, export)
#  Repère Blender : Z en haut, -Y = « devant » (= +Z dans le jeu), X = côté.
# =============================================================
import bpy, bmesh, math, os, random
import mathutils as mu

HERE = os.path.dirname(os.path.abspath(__file__)) if '__file__' in globals() else os.path.join(os.getcwd(), 'tools', 'blender')
WORK = os.path.join(HERE, 'work')
TEX = os.path.join(WORK, 'tex')
os.makedirs(TEX, exist_ok=True)


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    return sc


# ---------------------------------------------------------------- matières
_mats = {}


def hexcol(h):
    h = h.lstrip('#')
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    # sRGB -> linéaire
    return [((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in c] + [1]


def mat(name, color, rough=0.85, metal=0.0, emit=None, tex=None, emit_k=1.0):
    """Matière simple ; `tex` = image (chemin) répétée selon les UV."""
    key = name
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = hexcol(color)
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if emit:
        bsdf.inputs['Emission Color'].default_value = hexcol(emit)
        bsdf.inputs['Emission Strength'].default_value = emit_k
    if tex:
        im = bpy.data.images.load(tex, check_existing=True)
        tn = nt.nodes.new('ShaderNodeTexImage')
        tn.image = im
        nt.links.new(tn.outputs['Color'], bsdf.inputs['Base Color'])
    _mats[key] = m
    return m


# ---------------------------------------------------------------- formes
def obj_from_bm(bm, name, material, coll=None):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.scene.collection).objects.link(ob)
    if material:
        me.materials.append(material)
    return ob


def box(name, material, sx, sy, sz, x=0, y=0, z=0, rot=(0, 0, 0), bevel=0.0):
    """boîte centrée en (x, y, z) ; z = centre vertical"""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    bmesh.ops.scale(bm, vec=(sx, sy, sz), verts=bm.verts)
    ob = obj_from_bm(bm, name, material)
    ob.location = (x, y, z)
    ob.rotation_euler = rot
    if bevel > 0:
        bev(ob, bevel)
    return ob


def cyl(name, material, r1, r2, h, x=0, y=0, z=0, seg=16, rot=(0, 0, 0), bevel=0.0, cap=True):
    """cône tronqué posé sur z (base en z, sommet en z + h)"""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=cap, cap_tris=False, segments=seg, radius1=r1, radius2=r2, depth=h)
    bmesh.ops.translate(bm, vec=(0, 0, h / 2), verts=bm.verts)
    ob = obj_from_bm(bm, name, material)
    ob.location = (x, y, z)
    ob.rotation_euler = rot
    if bevel > 0:
        bev(ob, bevel)
    return ob


def between(name, material, a, b, r1, r2=None, seg=10):
    """cylindre d'un point a à un point b"""
    a, b = mu.Vector(a), mu.Vector(b)
    d = b - a
    ob = cyl(name, material, r1, r2 if r2 is not None else r1, d.length, seg=seg)
    ob.location = a
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = mu.Vector((0, 0, 1)).rotation_difference(d.normalized())
    return ob


def lathe(name, material, pts, seg=24, z0=0, caps=True):
    """profil [(rayon, hauteur)] tourné autour de Z"""
    bm = bmesh.new()
    rings = []
    for r, h in pts:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / seg), r * math.sin(2 * math.pi * i / seg), h)) for i in range(seg)]
        rings.append(ring)
    for k in range(len(rings) - 1):
        for i in range(seg):
            j = (i + 1) % seg
            bm.faces.new((rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i]))
    for ring, flip in ((rings[0], True), (rings[-1], False)):
        if caps and ring[0].co.xy.length > 1e-4:
            f = bm.faces.new(ring[::-1] if flip else ring)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name, material)
    ob.location.z = z0
    return ob


def prism(name, material, poly, h, z=0):
    """polygone (liste de (x, y)) extrudé de h"""
    bm = bmesh.new()
    vs = [bm.verts.new((x, y, 0)) for x, y in poly]
    f = bm.faces.new(vs)
    bmesh.ops.recalc_face_normals(bm, faces=[f])
    if f.normal.z < 0:
        f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    top = [e for e in r['geom'] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, h), verts=top)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj_from_bm(bm, name, material)
    ob.location.z = z
    return ob


def disc(name, material, r, z=0, seg=48, rings=8, r_in=0.0):
    """disque (ou anneau) en grille, assez fin pour recevoir l'ombre précalculée"""
    bm = bmesh.new()
    prev = None
    for k in range(rings + 1):
        rr = r_in + (r - r_in) * k / rings
        ring = [bm.verts.new((rr * math.cos(2 * math.pi * i / seg), rr * math.sin(2 * math.pi * i / seg), 0)) for i in range(seg)] if rr > 1e-4 else None
        if ring is None:
            c = bm.verts.new((0, 0, 0))
        else:
            if prev is None and k > 0:
                pass
            if prev == 'c':
                for i in range(seg):
                    bm.faces.new((c, ring[i], ring[(i + 1) % seg]))
            elif prev is not None:
                for i in range(seg):
                    j = (i + 1) % seg
                    bm.faces.new((prev[i], ring[i], ring[j], prev[j]))
        prev = 'c' if ring is None else ring
    ob = obj_from_bm(bm, name, material)
    ob.location.z = z
    # UV vues du dessus (pour les dallages)
    me = ob.data
    uv = me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (co.x / 4, co.y / 4)
    return ob


def bev(ob, w, seg=1):
    m = ob.modifiers.new('bev', 'BEVEL')
    m.width = w
    m.segments = seg
    m.limit_method = 'ANGLE'


def box_uv(ob, scale=1.0):
    """UV « cube » simples (textures de murs, lattes)"""
    me = ob.data
    if not me.uv_layers:
        me.uv_layers.new(name='UVMap')
    uv = me.uv_layers.active
    sx, sy, sz = ob.scale
    for p in me.polygons:
        n = p.normal
        for li in p.loop_indices:
            co = me.vertices[me.loops[li].vertex_index].co
            if abs(n.z) > max(abs(n.x), abs(n.y)):
                u, v = co.x, co.y
            elif abs(n.x) > abs(n.y):
                u, v = co.y, co.z
            else:
                u, v = co.x, co.z
            uv.data[li].uv = (u * scale, v * scale)


# ---------------------------------------------------------------- statues (corps du jeu posé)
def posed_body(glb, poses, name, material, height=None):
    """
    Importe un corps du jeu (glb décompressé, avec squelette), le pose, fige la pose
    et rend un objet maillage unique. poses = [(os, direction)] : l'os pointe vers la direction
    (repère du squelette, Z haut, -Y devant). Traitées dans l'ordre (parents d'abord).
    """
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=glb)
    new = [o for o in bpy.data.objects if o not in before]
    arm = [o for o in new if o.type == 'ARMATURE'][0]
    arm.animation_data_clear() if arm.animation_data else None
    for pb in arm.pose.bones:
        pb.rotation_mode = 'QUATERNION'
        pb.rotation_quaternion = (1, 0, 0, 0)
    bpy.context.view_layer.update()
    for bone, d in poses:
        if isinstance(d, tuple) and len(d) == 2 and d[0] == 'rot':
            pb = arm.pose.bones[bone]
            pb.rotation_quaternion = d[1] @ pb.rotation_quaternion
        else:
            aim(arm, bone, d)
        bpy.context.view_layer.update()
    marks = {b.name: (arm.matrix_world @ b.head).copy() for b in arm.pose.bones}
    marks.update({b.name + '.tail': (arm.matrix_world @ b.tail).copy() for b in arm.pose.bones})
    meshes = [o for o in new if o.type == 'MESH' and o.name not in ('Icosphere',) and o.data.vertices and o.find_armature() == arm or (o.type == 'MESH' and o.parent == arm)]
    meshes = [o for o in meshes if o.name != 'Icosphere']
    for o in [o for o in new if o.type == 'MESH' and o not in meshes]:
        bpy.data.objects.remove(o)
    out = []
    for o in meshes:
        dg = bpy.context.evaluated_depsgraph_get()
        ev = o.evaluated_get(dg)
        me = bpy.data.meshes.new_from_object(ev)
        ob = bpy.data.objects.new(name + '_' + o.name, me)
        bpy.context.scene.collection.objects.link(ob)
        ob.matrix_world = o.matrix_world
        out.append(ob)
    names = []
    for o in new:
        try:
            names.append(o.name)
        except ReferenceError:
            pass
    for n in names:
        if n in bpy.data.objects:
            bpy.data.objects.remove(bpy.data.objects[n])
    ob = join(out, name)
    ob.data.materials.clear()
    ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.material_index = 0
        p.use_smooth = True
    # pieds au sol, centré
    bb = [ob.matrix_world @ mu.Vector(c) for c in ob.bound_box]
    zmin = min(v.z for v in bb)
    ob.location.z -= zmin
    k = 1.0
    if height:
        hz = max(v.z for v in bb) - zmin
        k = height / hz
        ob.scale = [k] * 3
    bpy.context.view_layer.update()
    apply_tf(ob)
    posed_body.marks = {n: mu.Vector((0, 0, -zmin)) + v * k for n, v in marks.items()}
    return ob


def aim(arm, bone, d):
    pb = arm.pose.bones[bone]
    M = pb.matrix.copy()
    cur = (M.to_3x3() @ mu.Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(mu.Vector(d).normalized())
    R = q.to_matrix().to_4x4()
    head = M.translation.copy()
    newM = mu.Matrix.Translation(head) @ R @ mu.Matrix.Translation(-head) @ M
    pb.matrix = newM


def join(objs, name):
    if len(objs) == 1:
        objs[0].name = name
        return objs[0]
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    o = bpy.context.view_layer.objects.active
    o.name = name
    return o


def apply_tf(ob):
    bpy.ops.object.select_all(action='DESELECT')
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


# ---------------------------------------------------------------- éclairage précalculé
def densify(ob, max_edge):
    """redécoupe les grandes faces : l'ombre douce précalculée a besoin de sommets"""
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    for _ in range(6):
        long = [e for e in bm.edges if e.calc_length() > max_edge]
        if not long:
            break
        bmesh.ops.subdivide_edges(bm, edges=long, cuts=1, use_grid_fill=True)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4])
    bm.to_mesh(ob.data)
    bm.free()


def bake_ao(objs, distance=4.0, samples=48, floor=0.42, gamma=0.8, max_edge=1.2, skip_dense=()):
    """
    Occlusion ambiante (ombres douces de contact, creux, dessous des auvents) calculée par
    Cycles et rangée dans la couleur des sommets (COLOR_0 du glTF). Indépendante de
    l'orientation du monument : le soleil du jeu continue d'éclairer en temps réel.
    """
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.world = sc.world or bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    sc.world.light_settings.distance = distance
    for o in objs:
        for m in list(o.modifiers):
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=m.name)
        if o.name not in skip_dense:
            densify(o, max_edge)
        if 'AO' in o.data.color_attributes:
            o.data.color_attributes.remove(o.data.color_attributes['AO'])
        ca = o.data.color_attributes.new('AO', 'BYTE_COLOR', 'POINT')
        o.data.color_attributes.active_color = ca
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    sc.render.bake.target = 'VERTEX_COLORS'
    bpy.ops.object.bake(type='AO', target='VERTEX_COLORS', margin=0)
    for o in objs:
        ca = o.data.color_attributes['AO']
        for d in ca.data:
            a = d.color[0]  # déjà linéaire
            v = floor + (1 - floor) * (a ** gamma)
            d.color = (v, v, v, 1)
    print('AO précalculée sur', len(objs), 'objets,', sum(len(o.data.vertices) for o in objs), 'sommets')


def export(path, objs=None):
    bpy.ops.object.select_all(action='DESELECT')
    for o in (objs or [o for o in bpy.context.scene.objects if o.type == 'MESH']):
        o.select_set(True)
    kw = dict(filepath=path, export_format='GLB', use_selection=True, export_apply=True,
              export_yup=True, export_animations=False, export_skins=False)
    try:
        bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(export_colors=True, **kw)
    print('EXPORT', path)


def preview(path, target=(0, 0, 8), dist=70, elev=0.32, az=-0.6, res=(900, 600), sun=(0.9, 0.3, 0.8), samples=16):
    """petite image de contrôle (Cycles)"""
    sc = bpy.context.scene
    sc.cycles.samples = samples
    sc.render.resolution_x, sc.render.resolution_y = res
    w = sc.world or bpy.data.worlds.new('w')
    sc.world = w
    w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0.75, 0.82, 0.95, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.9
    if 'prev_sun' not in bpy.data.objects:
        l = bpy.data.lights.new('prev_sun', 'SUN')
        l.energy = 3.2
        l.angle = 0.15
        lo = bpy.data.objects.new('prev_sun', l)
        sc.collection.objects.link(lo)
        lo.rotation_euler = sun
        cam = bpy.data.cameras.new('prev_cam')
        co = bpy.data.objects.new('prev_cam', cam)
        sc.collection.objects.link(co)
        sc.camera = co
        g = bpy.data.meshes.new('prev_ground')
        bm = bmesh.new()
        bmesh.ops.create_grid(bm, x_segments=1, y_segments=1, size=200)
        bm.to_mesh(g)
        go = bpy.data.objects.new('prev_ground', g)
        go.location.z = -0.02
        g.materials.append(mat('prev_asphalt', '#8a8279', 1))
        sc.collection.objects.link(go)
    co = bpy.data.objects['prev_cam']
    t = mu.Vector(target)
    co.location = t + mu.Vector((math.cos(az) * math.cos(elev), math.sin(az) * math.cos(elev), math.sin(elev))) * dist
    co.rotation_euler = (t - co.location).to_track_quat('-Z', 'Y').to_euler()
    co.data.lens = 35
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)


def show_ao(objs):
    """branche la couleur des sommets « AO » dans les matières (aperçu Cycles + export glTF)"""
    done = set()
    for o in objs:
        for m in o.data.materials:
            if not m or m.name in done:
                continue
            done.add(m.name)
            nt = m.node_tree
            bsdf = nt.nodes['Principled BSDF']
            ca = nt.nodes.new('ShaderNodeVertexColor')
            ca.layer_name = 'AO'
            mix = nt.nodes.new('ShaderNodeMix')
            mix.data_type = 'RGBA'
            mix.blend_type = 'MULTIPLY'
            mix.inputs['Factor'].default_value = 1.0
            src = bsdf.inputs['Base Color']
            if src.links:
                nt.links.new(src.links[0].from_socket, mix.inputs['A'])
            else:
                mix.inputs['A'].default_value = src.default_value
            nt.links.new(ca.outputs['Color'], mix.inputs['B'])
            nt.links.new(mix.outputs['Result'], src)
