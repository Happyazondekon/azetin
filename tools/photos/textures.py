from PIL import Image, ImageDraw, ImageFont, ImageFilter
import random, math, numpy as np, glob
T = '/home/claude/ph/tex/'
def font(size, kind='hand'):
    cands = {'hand': ['/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf'], 'mono': ['/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf'], 'serif': ['/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf']}[kind]
    for f in glob.glob('/usr/share/fonts/**/*.ttf', recursive=True):
        n = f.lower()
        if kind == 'hand' and any(k in n for k in ['comic', 'kalam', 'caveat', 'patrick', 'indie', 'shadows', 'gochi', 'handlee']): cands.insert(0, f)
    for c in cands:
        try: return ImageFont.truetype(c, size)
        except Exception: pass
    return ImageFont.load_default()

def noise(w, h, s=6, seed=0):
    r = np.random.default_rng(seed)
    a = np.zeros((h, w))
    for k in range(5):
        sz = max(2, int(s * 2 ** k))
        n = r.random((h // sz + 2, w // sz + 2))
        a += np.array(Image.fromarray((n * 255).astype('uint8')).resize((w + 2 * sz, h + 2 * sz), Image.BICUBIC))[:h, :w] / 255 / (k + 1)
    a -= a.min(); a /= a.max(); return a

def wax(name, c1, c2, c3, pat=0, n=512):
    im = Image.new('RGB', (n, n), c1); d = ImageDraw.Draw(im)
    for i in range(8):
        for j in range(8):
            x, y = i * n / 8 + (n / 16 if j % 2 else 0), j * n / 8
            if pat == 0:
                d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=c2); d.ellipse([x - 10, y - 10, x + 10, y + 10], fill=c3)
            elif pat == 1:
                d.polygon([(x, y - 28), (x + 20, y), (x, y + 28), (x - 20, y)], fill=c2); d.ellipse([x - 6, y - 6, x + 6, y + 6], fill=c3)
            else:
                d.rectangle([x - 26, y - 4, x + 26, y + 4], fill=c2); d.rectangle([x - 4, y - 26, x + 4, y + 26], fill=c3)
    a = noise(n, n, 4, seed=pat) * 40 - 20
    arr = np.clip(np.array(im).astype(float) + a[..., None], 0, 255).astype('uint8')
    Image.fromarray(arr).save(T + name + '.png')

def ground(name, base, var, seed=1, soot=0.0, n=1024):
    a = noise(n, n, 3, seed)
    b = noise(n, n, 20, seed + 5)
    col = np.array(base, float)[None, None] * (0.75 + 0.5 * a[..., None]) + np.array(var, float)[None, None] * (b[..., None] - 0.5)
    if soot: col *= (1 - soot * (noise(n, n, 40, seed + 9)[..., None] > 0.5) * 0.8)
    Image.fromarray(np.clip(col, 0, 255).astype('uint8')).save(T + name + '.png')

def paper_base(w, h, tone=(226, 214, 186), seed=3, burn=0.0):
    a = noise(w, h, 5, seed)
    arr = np.array(tone, float)[None, None] * (0.9 + 0.12 * a[..., None])
    if burn:
        yy, xx = np.mgrid[0:h, 0:w]
        edge = np.minimum(np.minimum(xx, w - xx) / w, np.minimum(yy, h - yy) / h)
        nb = noise(w, h, 30, seed + 2)
        k = np.clip((burn * (0.6 + 0.8 * nb) - edge) * 14, 0, 1)
        arr = arr * (1 - k[..., None] * 0.92)
    return Image.fromarray(np.clip(arr, 0, 255).astype('uint8'))

def ledger():
    w, h = 1024, 1400
    im = paper_base(w, h, (222, 208, 172), 4, burn=0.06); d = ImageDraw.Draw(im)
    for y in range(140, h - 60, 52): d.line([(60, y), (w - 50, y)], fill=(150, 170, 190), width=2)
    d.line([(150, 80), (150, h - 40)], fill=(190, 80, 70), width=3)
    d.line([(780, 80), (780, h - 40)], fill=(190, 80, 70), width=3)
    f = font(34, 'hand'); fb = font(44, 'hand')
    d.text((180, 70), 'Dettes — H.', font=fb, fill=(60, 30, 20))
    rows = [('Scierie Adjarra', '1 200 000'), ('Transport bois', '850 000'), ('Préfecture', '500 000'), ('Kpayo — Sèmè', '2 400 000'),
            ('Festival (boissons)', '300 000'), ('Dah A. ???', '—'), ('Kpayo — 2e livraison', '1 900 000'), ('Banque Cotonou', '3 000 000'),
            ('Scierie (avance)', '700 000'), ('Le reste…', '?'), ('', ''), ('', ''), ('', ''), ('', ''), ('', '')]
    y = 150
    for i, (a, b) in enumerate(rows):
        if a: d.text((180, y - 4), a, font=f, fill=(170, 26, 22)); d.text((800, y - 4), b, font=f, fill=(170, 26, 22))
        y += 52
    d.text((180, h - 330), 'Payé en totalité —', font=fb, fill=(140, 10, 10))
    d.text((240, h - 270), 'par les fûts.', font=fb, fill=(140, 10, 10))
    d.line([(170, h - 210), (720, h - 215)], fill=(140, 10, 10), width=5)
    d.text((780, h - 200), 'H.', font=font(70, 'hand'), fill=(60, 20, 20))
    im = im.filter(ImageFilter.GaussianBlur(0.6)); im.save(T + 'ledger.png')

def register():
    w, h = 1000, 1300
    im = paper_base(w, h, (214, 206, 182), 6, burn=0.06); d = ImageDraw.Draw(im)
    fm = font(30, 'mono'); fh = font(40, 'serif')
    d.text((60, 50), 'REGISTRE DES FÛTS — STATION AZÉ-TIN', font=font(34, 'serif'), fill=(30, 30, 40))
    d.rectangle([50, 120, w - 50, h - 160], outline=(40, 40, 60), width=3)
    for x in (230, 520, 760): d.line([(x, 120), (x, h - 160)], fill=(40, 40, 60), width=2)
    hdr = ['DATE', 'FÛTS', 'LITRES', 'VISA']
    for i, t in enumerate(hdr): d.text(([70, 250, 540, 780][i], 135), t, font=fm, fill=(30, 30, 50))
    d.line([(50, 180), (w - 50, 180)], fill=(40, 40, 60), width=3)
    y = 200
    rng = random.Random(3); tot = 0
    for i in range(16):
        n = [20, 25, 15, 30, 20, 20, 10, 25, 20, 15, 20, 25, 15, 10, 15, 15][i]; tot += n
        d.text((70, y), f'{12 + i // 3:02d}/03', font=fm, fill=(35, 35, 70))
        d.text((270, y), f'{n}', font=font(32, 'hand'), fill=(30, 40, 110))
        d.text((540, y), f'{n * 200:,}'.replace(',', ' '), font=fm, fill=(35, 35, 70))
        d.text((800, y - 4), 'H.', font=font(34, 'hand'), fill=(30, 40, 110))
        d.line([(50, y + 50), (w - 50, y + 50)], fill=(120, 120, 140), width=1); y += 56
    d.text((70, h - 140), f'TOTAL : {tot} fûts × 200 L', font=fh, fill=(150, 20, 20))
    d.ellipse([620, h - 160, 900, h - 40], outline=(150, 20, 20), width=5)
    d.text((660, h - 125), 'SEMAINE DE\n LA FÊTE', font=font(28, 'serif'), fill=(150, 20, 20))
    im.filter(ImageFilter.GaussianBlur(0.5)).save(T + 'register.png')

def label():
    w, h = 900, 300
    im = paper_base(w, h, (232, 222, 190), 8); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, 40], fill=(200, 60, 40)); d.rectangle([0, h - 40, w, h], fill=(200, 60, 40))
    d.text((40, 70), 'Dah A. — village', font=font(64, 'hand'), fill=(40, 40, 90))
    d.text((40, 170), 'NE PAS EFFACER', font=font(48, 'hand'), fill=(150, 20, 20))
    d.text((620, 60), 'A', font=font(90, 'serif'), fill=(20, 20, 20))
    im.save(T + 'label.png')

def drawing():
    w, h = 1200, 900
    im = paper_base(w, h, (236, 230, 214), 11, burn=0.03); d = ImageDraw.Draw(im)
    rng = random.Random(7)
    def crayon(pts, col, width=10, passes=4):
        for p in range(passes):
            jit = [(x + rng.uniform(-4, 4), y + rng.uniform(-4, 4)) for x, y in pts]
            d.line(jit, fill=col, width=width, joint='curve')
    def scribble(box, col, dens=60):
        x0, y0, x1, y1 = box
        for i in range(dens):
            y = y0 + (y1 - y0) * i / dens
            crayon([(x0 + rng.uniform(0, 10), y), (x1 - rng.uniform(0, 10), y + rng.uniform(-6, 6))], col, 6, 1)
    # ciel, sol
    scribble((0, 0, w, 120), (120, 170, 220), 25)
    scribble((0, 760, w, 900), (90, 150, 60), 25)
    # l'arbre Loko
    scribble((480, 420, 560, 780), (110, 70, 40), 40)
    for r in range(8): d.ellipse([350 + rng.randint(-30, 30), 150 + rng.randint(-20, 20), 700 + rng.randint(-30, 30), 470 + rng.randint(-20, 20)], outline=(50, 140, 50), width=12)
    scribble((380, 190, 670, 430), (60, 150, 60), 50)
    # maisons
    for x, c in [(120, (190, 110, 60)), (860, (200, 120, 70))]:
        scribble((x, 560, x + 190, 760), c, 40); crayon([(x - 20, 570), (x + 95, 470), (x + 210, 570)], (150, 60, 30), 12)
        scribble((x + 70, 660, x + 120, 760), (70, 40, 20), 15)
    # la case du chef, plus grande, avec le hibou noir
    scribble((850, 560, 1050, 760), (130, 70, 140), 40)
    d.ellipse([925, 395, 1035, 505], fill=(15, 15, 15)); d.polygon([(930, 410), (945, 375), (960, 405)], fill=(15, 15, 15)); d.polygon([(1000, 405), (1015, 375), (1030, 410)], fill=(15, 15, 15))
    d.ellipse([948, 425, 972, 449], fill=(250, 200, 40)); d.ellipse([990, 425, 1014, 449], fill=(250, 200, 40))
    d.ellipse([956, 432, 966, 442], fill=(0, 0, 0)); d.ellipse([998, 432, 1008, 442], fill=(0, 0, 0))
    # personnages bâtons
    for x in (300, 700):
        d.ellipse([x - 20, 640, x + 20, 680], outline=(40, 30, 30), width=6); crayon([(x, 680), (x, 740)], (40, 30, 30), 6, 2)
        crayon([(x - 25, 700), (x + 25, 700)], (40, 30, 30), 6, 2); crayon([(x, 740), (x - 18, 770)], (40, 30, 30), 6, 1); crayon([(x, 740), (x + 18, 770)], (40, 30, 30), 6, 1)
    # soleil, signature
    d.ellipse([60, 30, 180, 150], outline=(240, 180, 30), width=14)
    d.text((60, 800), 'AYABA', font=font(70, 'hand'), fill=(200, 40, 60))
    im.filter(ImageFilter.GaussianBlur(0.7)).save(T + 'drawing.png')

def bark():
    n = 512; a = noise(n, n * 2, 3, 21)
    st = np.sin(np.linspace(0, 60, n))[None, :] * 0.25
    col = np.array((92, 68, 48), float)[None, None] * (0.6 + 0.6 * (a[..., None] + st[..., None]))
    Image.fromarray(np.clip(col, 0, 255).astype('uint8')).save(T + 'bark.png')

def rings():
    n = 512; yy, xx = np.mgrid[0:n, 0:n] - n / 2; r = np.sqrt(xx ** 2 + yy ** 2) + noise(n, n, 6, 3) * 18
    v = 0.75 + 0.25 * np.sin(r / 5)
    col = np.array((200, 150, 95), float)[None, None] * v[..., None]
    Image.fromarray(np.clip(col, 0, 255).astype('uint8')).save(T + 'rings.png')

if __name__ == '__main__':
    wax('wax_chief', (106, 26, 90), (200, 160, 48), (42, 14, 36), 0)
    wax('wax_a', (40, 60, 110), (200, 160, 60), (230, 220, 200), 1)
    wax('wax_b', (160, 50, 30), (240, 190, 70), (30, 40, 60), 2)
    wax('wax_c', (50, 110, 70), (230, 220, 200), (180, 60, 30), 0)
    wax('cloth_khaki', (120, 104, 76), (110, 95, 70), (125, 110, 80), 2)
    ground('laterite', (120, 66, 42), (50, 30, 18), 1)
    ground('ash', (52, 46, 42), (30, 26, 22), 2, soot=0.5)
    ground('soot', (28, 24, 22), (20, 16, 14), 3)
    ground('sawdust', (205, 165, 110), (30, 20, 10), 4)
    ledger(); register(); label(); drawing(); bark(); rings()
    print('ok')
