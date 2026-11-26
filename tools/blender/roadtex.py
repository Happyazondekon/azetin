# =============================================================
#  AZETIN — texture des pistes de latérite (même chaîne procédurale que les modèles)
#    python3 tools/blender/roadtex.py  ->  public/textures/road.png
#  U = travers de la piste (bords transparents, herbe), V = le long (raccord sans couture).
#  Deux ornières tassées par les roues, cailloux, fissures, flaques sombres.
# =============================================================
import os
import numpy as np
from PIL import Image, ImageFilter

W, H = 256, 1024
R = np.random.RandomState(7)
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'public', 'textures')
os.makedirs(OUT, exist_ok=True)


def tile_noise(h, w, cell, seed):
    """bruit lisse qui se raccorde en V (on répète la grille)"""
    r = np.random.RandomState(seed)
    gh, gw = h // cell + 1, w // cell + 2
    g = r.rand(gh, gw)
    g[-1, :] = g[0, :]
    img = Image.fromarray((g * 255).astype(np.uint8)).resize((w + cell * 2, h + cell), Image.BICUBIC)
    a = np.asarray(img, dtype=np.float32)[:h, cell:cell + w] / 255.0
    return a


u = np.linspace(0, 1, W)[None, :].repeat(H, 0)
v = np.linspace(0, 1, H)[:, None].repeat(W, 1)
n1 = tile_noise(H, W, 64, 1)
n2 = tile_noise(H, W, 16, 2)
n3 = tile_noise(H, W, 4, 3)
grain = 0.5 * n1 + 0.3 * n2 + 0.2 * n3

# latérite : rouge-orangé poussiéreux
base = np.stack([150 + 40 * grain, 72 + 26 * grain, 42 + 16 * grain], -1)
# ornières : deux bandes tassées, plus sombres et plus lisses, qui ondulent un peu
wob = (n1 - 0.5) * 0.05
for c in (0.3, 0.7):
    d = np.abs(u - c - wob)
    rut = np.clip(1 - d / 0.075, 0, 1) ** 1.5
    base *= (1 - 0.28 * rut[..., None])
    base += rut[..., None] * np.array([6, 2, 0]) * (n3[..., None] - 0.5) * 4
# bourrelet central plus clair, gravier
crown = np.clip(1 - np.abs(u - 0.5) / 0.12, 0, 1)
base += crown[..., None] * np.array([14, 9, 5]) * n2[..., None]
# cailloux
img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8))
px = img.load()
for _ in range(1600):
    x, y = R.randint(10, W - 10), R.randint(0, H)
    c = R.randint(90, 175)
    s = R.randint(1, 3)
    for dx in range(s):
        for dy in range(s):
            px[(x + dx) % W, (y + dy) % H] = (c + 30, int(c * 0.72), int(c * 0.55))
base = np.asarray(img, dtype=np.float32)
# fissures sèches
cr = tile_noise(H, W, 8, 9)
crack = np.clip(1 - np.abs(cr - 0.5) * 40, 0, 1) * (n1 > 0.55)
base *= (1 - 0.35 * crack[..., None])
# flaques : sombres, presque noires, bords nets (elles refléteront la lune dans le jeu)
pud = tile_noise(H, W, 128, 5)
pmask = np.clip((pud - 0.78) * 12, 0, 1) * np.clip(1 - np.abs(u - 0.5) / 0.38, 0, 1)
base = base * (1 - pmask[..., None]) + np.array([28, 18, 14]) * pmask[..., None]
# bords : herbe sèche qui mange la piste, transparence irrégulière
edge = np.minimum(u, 1 - u)
ragged = edge + (n2 - 0.5) * 0.09 + (n3 - 0.5) * 0.05
alpha = np.clip((ragged - 0.04) / 0.1, 0, 1)
grass = np.clip(1 - (ragged - 0.04) / 0.16, 0, 1) * (n3 > 0.45)
gcol = np.stack([70 + 40 * n2, 72 + 30 * n2, 34 + 10 * n2], -1)
base = base * (1 - 0.8 * grass[..., None]) + gcol * 0.8 * grass[..., None]
rgba = np.dstack([np.clip(base, 0, 255), alpha * 255]).astype(np.uint8)
Image.fromarray(rgba, 'RGBA').save(os.path.join(OUT, 'road.png'), optimize=True)
# la même chose en vignette pour vérifier
prev = Image.fromarray(rgba, 'RGBA').resize((128, 512))
bg = Image.new('RGBA', prev.size, (30, 40, 20, 255)); bg.alpha_composite(prev)
bg.convert('RGB').save('/home/claude/roadtex_prev.png')
print('road.png', os.path.getsize(os.path.join(OUT, 'road.png')) // 1024, 'Ko')
