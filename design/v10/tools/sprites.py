#!/usr/bin/env python3
# v10 sprite edits, on the live painted assets, written to the stage only: Grok (row 1) loses the beanie for slicked-back black hair and big square glasses; brown corgi twin.
import colorsys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ni
LIVE, ST = '/workspace/agent-city/public/office2d/assets/', '/workspace/agent-city/design/v10/stage/public/office2d/assets/'
Z = 4; CW, CH = 220, 232
# per yaw, cell coords. hair: outline; pole: where the combed strands converge; forehead: skin revealed; skin: sample point; lim: beanie never below this y;
# clear: above this y only hair and forehead survive; eyes: boxes left alone by the recolor; brows/glasses: front yaws only
Y = [
 dict(hair=[(60,140),(58,112),(64,90),(82,75),(110,68),(138,74),(156,90),(162,112),(158,140),(152,166),(110,175),(68,166)], pole=(118,8), lim=158, clear=132, eyes=[]),
 dict(hair=[(60,124),(62,98),(77,79),(104,68),(132,72),(150,86),(158,104),(157,119),(148,116),(138,119),(131,126),(120,128),(114,150),(100,168),(84,162),(68,142)], pole=(60,14), lim=150, clear=104, eyes=[], face=(142,150,24,32), arm=[(127,131),(150,127)]),
 dict(hair=[(150,106),(144,90),(124,76),(98,71),(74,80),(60,104),(60,130),(70,152),(90,167),(99,158),(98,142),(102,129),(114,118),(126,122),(128,114),(140,108)], pole=(18,88), lim=145, clear=112, eyes=[(126,126,160,152)], face=(134,146,28,34),
      forehead=[(114,120),(150,100),(160,118),(158,124),(132,125)], skin=(148,150), brows=[[(138,120),(153,119)]], glasses=[(144,137,17,30)], arm=[(136,132),(112,131)]),
 dict(hair=[(66,130),(63,108),(72,85),(94,70),(118,66),(140,72),(152,84),(156,98),(152,104),(136,96),(118,96),(100,102),(90,114),(86,126),(76,124)], pole=(44,18), lim=150, clear=112, eyes=[(99,120,158,148)], face=(120,138,41,35),
      forehead=[(84,126),(92,104),(126,90),(154,96),(160,124),(150,124),(126,123),(96,124)], skin=(128,157), brows=[[(98,120),(126,118)],[(135,118),(155,120)]], glasses=[(112,132,34,29),(146,132,24,29)], arm=[(95,129),(79,126)]),
 dict(hair=[(64,126),(62,108),(70,86),(88,71),(112,65),(134,71),(150,86),(158,108),(156,126),(150,110),(142,100),(126,93),(112,90),(96,93),(80,102),(72,112)], pole=(142,6), lim=160, clear=112, eyes=[(80,124,140,152)], face=(110,138,48,36),
      forehead=[(68,126),(76,98),(110,84),(146,98),(152,126),(132,124),(110,126),(88,124)], skin=(110,158), brows=[[(76,121),(104,121)],[(116,121),(144,121)]], glasses=[(90,137,35,29),(130,137,35,29)], arm=[(72,132),(56,130)], arm2=[(148,132),(164,130)]),
 dict(hair=[(82,124),(76,108),(80,88),(96,73),(120,66),(142,72),(154,86),(158,104),(152,120),(148,104),(136,95),(120,91),(104,95),(92,106),(88,120)], pole=(62,12), lim=150, clear=112, eyes=[(95,126,150,156)], face=(119,140,36,34),
      forehead=[(84,128),(92,102),(120,86),(148,98),(152,126),(120,126)], skin=(120,166), brows=[[(92,123),(116,122)],[(124,122),(146,123)]], glasses=[(103,139,30,28),(137,139,25,28)], arm=[(88,134),(80,132)], arm2=[(150,134),(153,133)]),
]
def smooth(pts, n=10):
    # closed Catmull-Rom through the outline
    P = np.array(pts, float); out = []
    for i in range(len(P)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % len(P)], P[(i + 2) % len(P)]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out
def paint(a, y, T, s):
    # a: float RGBA at working scale; T: cell -> working coords; s: working px per cell px
    H, W = a.shape[:2]; Yy, Xx = np.mgrid[0:H, 0:W].astype(float)
    tp = lambda pts: [T(p) for p in pts]
    def fill(pts, blur=0):
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon(tp(pts), fill=255)
        if blur: m = m.filter(ImageFilter.GaussianBlur(blur * s))
        return np.asarray(m, float) / 255
    hm = fill(smooth(y['hair']), 0.5); fh = fill(y['forehead'], 1.1) if 'forehead' in y else np.zeros((H, W))
    lim, clear = T((0, y['lim']))[1], T((0, y['clear']))[1]
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    red = (R > 2.7 * G) & (R > 2.5 * B) & (G < 96) & (R > 60) & (A > 8) & (Yy < lim)
    red = ni.binary_dilation(red, iterations=int(2.2 * s))
    gone = (red | ((Yy < clear) & (hm < 0.5) & (fh < 0.5))) & (Yy < lim)
    a = a.copy(); a[gone, 3] = 0
    # the old brown hair goes black
    lum = R * .3 + G * .59 + B * .11
    eye = np.zeros((H, W), bool)
    for x0, y0, x1, y1 in y['eyes']: (ax, ay), (bx, by) = T((x0, y0)), T((x1, y1)); eye[int(ay):int(by), int(ax):int(bx)] = True
    dark = np.clip((128 - lum) / 34, 0, 1) * (~eye) * (Yy < T((0, 176))[1]) * (R >= B - 6)
    k = dark[..., None]; bl = lum[..., None] * np.array([.30, .30, .36]) + np.array([7.0, 7, 10])
    a[..., :3] = a[..., :3] * (1 - k) + bl * k
    if 'forehead' in y:
        sx, sy = T(y['skin']); r = int(2 * s); sk = np.median(a[int(sy) - r:int(sy) + r, int(sx) - r:int(sx) + r, :3].reshape(-1, 3), 0) * np.array([1.0, 1.0, 1.0])
        grad = 1 - 0.1 * np.clip((T((0, 124))[1] - Yy) / (34 * s), 0, 1)[..., None] # a touch of shade under the hairline
        k = fh[..., None]; a[..., :3] = a[..., :3] * (1 - k) + sk * grad * k; a[..., 3] = np.maximum(a[..., 3], fh * 255)
    if 'face' in y:
        # what is left of the old fringe outside the new hair: skin on the face, gone past it
        (fx, fy), rx, ry = T(y['face'][:2]), y['face'][2] * s, y['face'][3] * s
        inface = (((Xx - fx) / rx) ** 2 + ((Yy - fy) / ry) ** 2 < 1) | (fh > 0.2)
        old = (dark > 0.25) & (hm < 0.5) & (Yy < T((0, 160))[1]); old = ni.binary_dilation(old, iterations=int(0.8 * s)) & (hm < 0.5) & ~eye
        if 'forehead' in y:
            k = ni.gaussian_filter((old & inface).astype(float), 0.7 * s)[..., None]; a[..., :3] = a[..., :3] * (1 - k) + sk * k
        a[old & ~inface, 3] = 0
    # hair: dark base, strands combed toward the pole, a soft sheen across the crown, darker at the edge like the other painted hair
    px, py = T(y['pole']); th = np.arctan2(Yy - py, Xx - px); rr = np.hypot(Xx - px, Yy - py)
    rs = np.random.RandomState(7); st = sum(np.sin(th * f + rs.rand() * 6.3) * w for f, w in ((23, .3), (47, .4), (83, .35), (131, .3)))
    st = np.clip(st / 1.1, -1, 1)
    inner = ni.gaussian_filter(hm, 7 * s)
    r0 = np.percentile(rr[hm > 0.5], 40); band = np.exp(-((rr - r0) / (13 * s)) ** 2) * np.clip((inner - 0.42) / 0.4, 0, 1)
    c = np.array([16.0, 15, 18])[None, None] * (0.7 + 0.5 * inner[..., None]) + (st[..., None] + 0.2) * np.array([5.0, 5, 6]) + (band * (0.8 + 0.2 * st))[..., None] * np.array([44.0, 45, 54])
    k = hm[..., None]; a[..., :3] = a[..., :3] * (1 - k) + c * k; a[..., 3] = np.maximum(a[..., 3], hm * 255)
    # brows + frames on a layer, then over
    L = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); ink = (14, 14, 18, 255)
    for b in y.get('brows', []): d.line(tp(smooth([b[0], ((b[0][0] + b[1][0]) / 2, b[0][1] - 2), b[1]], 4)[:9]), fill=(20, 18, 20, 255), width=int(3.6 * s), joint='curve')
    for ar in ('arm', 'arm2'):
        if ar in y: d.line(tp(y[ar]), fill=ink, width=int(3 * s))
    gl = y.get('glasses', [])
    for cx, cy, w, h in gl:
        (x0, y0), (x1, y1) = T((cx - w / 2, cy - h / 2)), T((cx + w / 2, cy + h / 2)); r = 5.5 * s
        d.rounded_rectangle((x0, y0, x1, y1), r, fill=(170, 205, 235, 14), outline=ink, width=int(3.4 * s))
        d.polygon([(x0 + .62 * (x1 - x0), y1 - 4 * s), (x0 + .84 * (x1 - x0), y0 + 13 * s), (x0 + .9 * (x1 - x0), y0 + 13 * s), (x0 + .72 * (x1 - x0), y1 - 4 * s)], fill=(235, 245, 255, 30))
        d.line([(x0 + r, y0 + 1.6 * s), (x1 - r, y0 + 1.6 * s)], fill=(92, 96, 112, 255), width=int(1.1 * s))
    if len(gl) == 2:
        (a0, a1), (b0, b1) = T((gl[0][0] + gl[0][2] / 2 - 1, gl[0][1] - 5)), T((gl[1][0] - gl[1][2] / 2 + 1, gl[1][1] - 5)); d.line([(a0, a1), (b0, b1)], fill=ink, width=int(3.2 * s))
    L = np.asarray(L, float); k = L[..., 3:] / 255; a[..., :3] = a[..., :3] * (1 - k) + L[..., :3] * k; a[..., 3] = np.maximum(a[..., 3], L[..., 3])
    return a
def work(im, y, T):
    # im at native size; T in native px
    w, h = im.size; up = np.asarray(im.convert('RGBa').resize((w * Z, h * Z), Image.BICUBIC).convert('RGBA'), float)
    TZ = lambda p: tuple(v * Z for v in T(p)); sc = (T((1, 0))[0] - T((0, 0))[0]) * Z
    out = paint(up, y, TZ, sc)
    return Image.fromarray(np.clip(out, 0, 255).round().astype('uint8'), 'RGBA').convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
def grok():
    h = Image.open(LIVE + 'turn-heads.webp').convert('RGBA')
    for c, y in enumerate(Y):
        cell = h.crop((c * CW, CH, (c + 1) * CW, 2 * CH)); h.paste(work(cell, y, lambda p: p), (c * CW, CH))
    h.save(ST + 'turn-heads.webp', quality=92, method=6)
    # desk-side bust (back) and standing front: the same painter, placed on those sprites
    w = Image.open(LIVE + 'w01.png').convert('RGBA'); s = 0.93
    work(w, Y[0], lambda p: ((p[0] - 110) * s + 62, (p[1] - 172) * s + 127)).save(ST + 'w01.png')
    f = Image.open(LIVE + 'f01.png').convert('RGBA'); s = 0.9
    work(f, Y[4], lambda p: ((p[0] - 110) * s + 67, (p[1] - 137) * s + 117)).save(ST + 'f01.png')
def corgi():
    a = np.asarray(Image.open(LIVE + 'corgi.png').convert('RGBA'), float) / 255
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; mx = a[..., :3].max(-1); mn = a[..., :3].min(-1); sat = (mx - mn) / np.maximum(mx, 1e-4)
    # orange coat -> chocolate; cream socks/chest, nose, tongue and eyes are left alone
    hue = np.vectorize(lambda r, g, b: colorsys.rgb_to_hsv(r, g, b)[0])(r, g, b) * 360
    coat = np.clip((sat - 0.34) / 0.16, 0, 1) * np.clip((hue - 12) / 6, 0, 1) * np.clip((52 - hue) / 8, 0, 1)
    coat = ni.gaussian_filter(coat, 0.8)[..., None]
    lum = (r * .3 + g * .59 + b * .11)[..., None]
    choc = np.array([.60, .39, .25]) * lum * 1.32 + np.array([.05, .03, .02])
    a[..., :3] = a[..., :3] * (1 - coat) + choc * coat
    Image.fromarray((np.clip(a, 0, 1) * 255).round().astype('uint8'), 'RGBA').save(ST + 'corgi-brown.png', optimize=True)
grok(); corgi()
# review sheet
def sheet():
    h = Image.open(ST + 'turn-heads.webp').convert('RGBA'); Sc = 2
    c = Image.new('RGBA', (CW * Sc * 3, 190 * Sc * 2 + 460), (58, 42, 62, 255))
    for i in range(6):
        t = h.crop((i * CW, CH + 10, (i + 1) * CW, CH + 200)).resize((CW * Sc, 190 * Sc), Image.LANCZOS); c.alpha_composite(t, ((i % 3) * CW * Sc, (i // 3) * 190 * Sc))
    x = 0
    for f in ('w01.png', 'f01.png'):
        t = Image.open(ST + f).convert('RGBA').resize((266, 456)); c.alpha_composite(t, (x, 190 * Sc * 2)); x += 280
    t = Image.open(ST + 'corgi-brown.png').crop((0, 0, 696, 310)).resize((560, 250)); c.alpha_composite(t, (x, 190 * Sc * 2))
    c.convert('RGB').save('/tmp/sheet.png')
sheet()
