import bpy, math, os, random
import mathutils as mu
RAW = '/home/claude/raw'
OUT = '/home/claude/ph/out'
os.makedirs(OUT, exist_ok=True)

def reset(samples=96):
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    try: sc.cycles.denoiser = 'OPENIMAGEDENOISE'
    except Exception: pass
    sc.view_settings.view_transform = 'AgX'
    sc.view_settings.look = 'AgX - Medium High Contrast'
    sc.render.film_transparent = False
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    w.node_tree.nodes['Background'].inputs[0].default_value = (0, 0, 0, 1)
    w.node_tree.nodes['Background'].inputs[1].default_value = 0
    return sc

def lin(h):
    h = h.lstrip('#'); c = [int(h[i:i+2], 16)/255 for i in (0, 2, 4)]
    return [((v+0.055)/1.055)**2.4 if v > 0.04045 else v/12.92 for v in c] + [1]

def mat(name, col, rough=0.8, metal=0.0, tex=None, scale=1.0, bump=0.0, emit=None, emit_k=1.0, alpha_tex=False):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = lin(col) if isinstance(col, str) else col
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if tex:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(tex)
        mp = nt.nodes.new('ShaderNodeMapping'); tc = nt.nodes.new('ShaderNodeTexCoord')
        mp.inputs['Scale'].default_value = (scale, scale, scale)
        nt.links.new(tc.outputs['UV'], mp.inputs['Vector']); nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha_tex: nt.links.new(t.outputs['Alpha'], b.inputs['Alpha'])
        if bump:
            bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
            nt.links.new(t.outputs['Color'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    elif bump:
        n = nt.nodes.new('ShaderNodeTexNoise'); n.inputs['Scale'].default_value = 40
        bp = nt.nodes.new('ShaderNodeBump'); bp.inputs['Strength'].default_value = bump
        nt.links.new(n.outputs['Fac'], bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], b.inputs['Normal'])
    if emit:
        b.inputs['Emission Color'].default_value = lin(emit); b.inputs['Emission Strength'].default_value = emit_k
    return m

def imp(name, loc=(0, 0, 0), rot=0.0, scale=1.0, keepmat=True, material=None):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=f'{RAW}/{name}.glb')
    new = [o for o in bpy.data.objects if o not in before]
    for o in new:
        if o.type == 'MESH' and o.name.startswith('Icosphere'): bpy.data.objects.remove(o)
    new = [o for o in bpy.data.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    holder = bpy.data.objects.new(name + '_h', None); bpy.context.scene.collection.objects.link(holder)
    for r in roots: r.parent = holder
    holder.location = loc; holder.rotation_euler = (0, 0, rot); holder.scale = (scale,)*3
    if material:
        for o in new:
            if o.type == 'MESH':
                o.data.materials.clear(); o.data.materials.append(material)
    return holder, new

def aim(arm, bone, d):
    pb = arm.pose.bones[bone]
    M = pb.matrix.copy()
    cur = (M.to_3x3() @ mu.Vector((0, 1, 0))).normalized()
    q = cur.rotation_difference(mu.Vector(d).normalized())
    head = M.translation.copy()
    pb.matrix = mu.Matrix.Translation(head) @ q.to_matrix().to_4x4() @ mu.Matrix.Translation(-head) @ M
    bpy.context.view_layer.update()

def person(parts, mats, poses=(), loc=(0, 0, 0), rot=0.0, height=1.0, keys=None):
    """parts: noms de glb ; mats: {glb: material or None (garder)} ; poses: [(bone, (x,y,z) dans le repère de l'armature)]"""
    hold = bpy.data.objects.new('person', None); bpy.context.scene.collection.objects.link(hold)
    for p in parts:
        h, new = imp(p, material=mats.get(p))
        h.parent = hold
        arms = [o for o in new if o.type == 'ARMATURE']
        for a in arms:
            for pb in a.pose.bones: pb.rotation_mode = 'QUATERNION'
            bpy.context.view_layer.update()
            for bone, d in poses:
                if bone in a.pose.bones: aim(a, bone, d)
        if keys:
            for o in new:
                if o.type == 'MESH' and o.data.shape_keys:
                    for k, v in keys.items():
                        if k in o.data.shape_keys.key_blocks: o.data.shape_keys.key_blocks[k].value = v
    hold.location = loc; hold.rotation_euler = (0, 0, rot); hold.scale = (height,)*3
    return hold

def skin(col='#4a2e1e'):
    """garde la texture de peau du corps mais la teinte en brun"""
    return None

def cam(loc, target, lens=35, dof=None, fstop=2.8):
    c = bpy.data.cameras.new('cam'); c.lens = lens
    o = bpy.data.objects.new('cam', c); bpy.context.scene.collection.objects.link(o)
    o.location = loc
    d = mu.Vector(target) - mu.Vector(loc)
    o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    if dof:
        c.dof.use_dof = True; c.dof.focus_distance = dof; c.dof.aperture_fstop = fstop
    bpy.context.scene.camera = o
    return o

def light(kind, loc, energy, col='#ffffff', size=0.2, target=None, spot=None):
    l = bpy.data.lights.new('l', kind); l.energy = energy; l.color = lin(col)[:3]
    if kind in ('AREA',): l.size = size
    if kind in ('POINT', 'SPOT'): l.shadow_soft_size = size
    if kind == 'SPOT' and spot: l.spot_size = spot; l.spot_blend = 0.6
    if kind == 'SUN': l.angle = size
    o = bpy.data.objects.new('l', l); bpy.context.scene.collection.objects.link(o); o.location = loc
    if target:
        d = mu.Vector(target) - mu.Vector(loc); o.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    return o

def plane(name, m, sx, sy, loc=(0, 0, 0), rot=(0, 0, 0), sub=0):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=rot)
    o = bpy.context.object; o.name = name; o.scale = (sx, sy, 1)
    o.data.materials.append(m)
    if sub:
        md = o.modifiers.new('s', 'SUBSURF'); md.subdivision_type = 'SIMPLE'; md.levels = sub; md.render_levels = sub
    return o

def render(name, res=(1200, 900)):
    sc = bpy.context.scene
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.image_settings.file_format = 'PNG'
    sc.render.filepath = f'{OUT}/{name}.png'
    bpy.ops.render.render(write_still=True)
