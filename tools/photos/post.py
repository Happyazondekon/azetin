from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageEnhance
import numpy as np, random
O = '/home/claude/ph/out/'; F = '/home/claude/ph/final/'
import os; os.makedirs(F, exist_ok=True)
HAND = '/usr/share/fonts/truetype/google-fonts/ofl/comicrelief/ComicRelief-Regular.ttf'
rng = np.random.default_rng(4)

def grain(a, k=6):
    return a + rng.normal(0, k, a.shape)

def vignette(w, h, s=0.55, p=2.2):
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2) / 1.41
    return 1 - s * d ** p

def phone(name, warm=1.0, vig=0.5):
    im = Image.open(O + name + '.png').convert('RGB')
    w, h = im.size
    a = np.array(im).astype(float)
    a *= vignette(w, h, vig)[..., None]
    a[..., 0] *= 1.0 + 0.04 * warm; a[..., 2] *= 1.0 - 0.03 * warm
    a = grain(a, 4)
    out = Image.fromarray(np.clip(a, 0, 255).astype('uint8')).filter(ImageFilter.UnsharpMask(1.2, 60, 2))
    out = ImageEnhance.Contrast(out).enhance(1.06)
    return out

def burnt_mask(w, h, seed=2, amount=0.07):
    r = np.random.default_rng(seed)
    n = np.array(Image.fromarray((r.random((h // 24 + 2, w // 24 + 2)) * 255).astype('uint8')).resize((w + 48, h + 48), Image.BICUBIC))[:h, :w] / 255
    yy, xx = np.mgrid[0:h, 0:w]
    edge = np.minimum(np.minimum(xx, w - xx) / w, np.minimum(yy, h - yy) / h)
    # coin bas-droit plus brûlé
    corner = np.clip(1 - np.sqrt(((w - xx) / w) ** 2 + ((h - yy) / h) ** 2) * 4.0, 0, 1) * 0.12
    t = amount * (0.5 + n) + corner
    alpha = np.clip((edge - t) * 60, 0, 1)
    char = np.clip((edge - t) * 18, 0, 1)
    return alpha, char

def vintage_print():
    im = Image.open(O + 'iroko.png').convert('RGB')
    w, h = im.size
    a = np.array(im).astype(float) / 255
    # tirage passé : couleurs délavées, noirs levés, dominante chaude, léger flou
    lum = a.mean(axis=2, keepdims=True)
    a = a * 0.55 + lum * 0.45
    a = 0.1 + a * 0.82
    a[..., 0] = a[..., 0] ** 0.9; a[..., 2] = a[..., 2] ** 1.15
    a = grain(a * 255, 9)
    pic = Image.fromarray(np.clip(a, 0, 255).astype('uint8')).filter(ImageFilter.GaussianBlur(0.9))
    # rayures
    d = ImageDraw.Draw(pic)
    random.seed(5)
    ov = Image.new('L', (w, h), 0); od = ImageDraw.Draw(ov)
    for i in range(5):
        x = random.randint(0, w); y0 = random.randint(0, h // 2); od.line([(x, y0), (x + random.randint(-30, 30), y0 + random.randint(h // 4, h // 2))], fill=70, width=1)
    pic = Image.composite(Image.new('RGB', (w, h), (235, 225, 205)), pic, ov)
    # bord blanc du tirage + légende manuscrite
    B = 44
    pr = Image.new('RGB', (w + 2 * B, h + B + 130), (232, 224, 204))
    pr.paste(pic, (B, B))
    pd = ImageDraw.Draw(pr)
    pd.text((B + 10, h + B + 28), 'Loko — the last day', font=ImageFont.truetype(HAND, 58), fill=(40, 38, 80))
    pd.text((w - 200, h + B + 40), '12/03', font=ImageFont.truetype(HAND, 44), fill=(40, 38, 80))
    pw, ph = pr.size
    alpha, char = burnt_mask(pw, ph, 3, 0.022)
    pa = np.array(pr).astype(float)
    pa *= (0.35 + 0.65 * char)[..., None]
    pa = pa * vignette(pw, ph, 0.25)[..., None]
    pr = Image.fromarray(np.clip(pa, 0, 255).astype('uint8')).convert('RGBA')
    pr.putalpha(Image.fromarray((alpha * 255).astype('uint8')))
    # posé sur la cendre, photographié au flash
    W, H = 1600, 1200
    bg = np.array(Image.open('/home/claude/ph/tex/ash.png').convert('RGB').resize((W, H))).astype(float) * 0.55
    bg = Image.fromarray(bg.astype('uint8'))
    pr = pr.rotate(-4, resample=Image.BICUBIC, expand=True)
    k = 1360 / pr.size[0]; pr = pr.resize((int(pr.size[0] * k), int(pr.size[1] * k)), Image.LANCZOS)
    sh = Image.new('RGBA', pr.size, (0, 0, 0, 0)); sh.putalpha(pr.split()[3].point(lambda v: v * 0.7))
    sh = sh.filter(ImageFilter.GaussianBlur(14))
    x, y = (W - pr.size[0]) // 2, (H - pr.size[1]) // 2
    bg.paste((0, 0, 0), (x + 18, y + 22), sh)
    bg.paste(pr, (x, y), pr)
    a = np.array(bg).astype(float)
    a *= vignette(W, H, 0.75, 1.8)[..., None]
    yy, xx = np.mgrid[0:H, 0:W]
    hot = np.exp(-(((xx - W * 0.5) / (W * 0.32)) ** 2 + ((yy - H * 0.42) / (H * 0.32)) ** 2)) * 0.18  # reflet du flash sur le papier glacé
    a = a * (1 + hot[..., None])
    a = grain(a, 5)
    Image.fromarray(np.clip(a, 0, 255).astype('uint8')).save(F + 'photo.jpg', quality=88)

if __name__ == '__main__':
    vintage_print()
    for src, dst, warm, vig in [('notebook', 'notebook', 1.2, 0.55), ('tape', 'tape', 0.2, 0.5), ('register', 'register', 0.8, 0.45), ('drawing', 'drawing', 0.6, 0.55)]:
        phone(src, warm, vig).resize((1600, 1200), Image.LANCZOS).save(F + dst + '.jpg', quality=88)
    print('ok')
