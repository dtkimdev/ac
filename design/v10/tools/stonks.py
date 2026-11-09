#!/usr/bin/env python3
# v10 addendum, on the live painted assets, written to the stage only: $tonks (row 7) loses the teal cap for soft brown hair and round glasses. Row 7's sweater and scarf are the same teal, so the erase stops at each yaw's lim.
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ni
from scipy.spatial import ConvexHull
LIVE, ST = '/workspace/agent-city/public/office2d/assets/', '/workspace/agent-city/design/v10/stage/public/office2d/assets/'
Z = 4; CW, CH = 220, 232; ROW = 7
# per yaw, cell coords. hair: outline, its lower edge runs through the old fringe; pole: where the strands converge; lim: nothing erased below this y; clear: above this y only hair survives;
# keep: boxes the recolor leaves alone (eyes, mouth); skin: (patch outline, sample point) for forehead the brim hid; lenses: (cx, cy, rx, ry); arms: temple pieces drawn behind the lenses
Y = [
 dict(hair=[(63,136),(60,112),(65,90),(82,72),(108,64),(136,69),(153,86),(160,110),(158,134),(150,146),(128,152),(100,152),(74,148)], pole=(112,6), lim=156, clear=132, keep=[]),
 dict(hair=[(58,128),(56,100),(62,76),(80,57),(106,47),(130,51),(148,65),(156,84),(160,104),(158,122),(151,125),(147,123),(134,128),(114,134),(90,134),(70,131)], pole=(62,6), lim=136, clear=100, keep=[], arms=[[(147,124),(155,122)]]),
 dict(hair=[(62,124),(60,104),(68,88),(88,74),(112,68),(134,71),(148,83),(154,100),(154,116),(152,127),(142,123),(136,131),(127,128),(118,124),(102,126),(86,136),(72,132)], pole=(30,60), lim=136, clear=122, keep=[(136,126,164,160),(150,160,176,176)],
      skin=([(136,128),(155,121),(156,134),(148,134)], (150,152)), lenses=[(150,141,8,16)], arms=[[(146,136),(113,132)]]),
 dict(hair=[(63,122),(60,100),(68,82),(88,68),(112,62),(136,66),(152,78),(158,96),(158,114),(151,120),(140,115),(124,117),(108,117),(94,120),(87,128),(78,127),(69,131)], pole=(40,14), lim=128, clear=112, keep=[(96,116,158,150),(108,154,138,168)],
      lenses=[(112,131,16,17),(144,131,11,16)], arms=[[(97,129),(82,127)]]),
 dict(hair=[(61,134),(57,112),(62,90),(78,72),(110,62),(142,72),(158,90),(163,112),(160,134),(153,127),(145,117),(128,109),(110,106),(92,109),(76,117),(68,127)], pole=(88,6), lim=132, clear=128, keep=[(78,126,144,160),(92,160,128,172)],
      lenses=[(91,144,18,18),(130,144,18,18)], arms=[[(74,141),(62,139)],[(147,141),(159,139)]]),
 dict(hair=[(71,132),(66,110),(72,88),(88,72),(110,64),(132,68),(148,82),(156,100),(156,120),(147,123),(130,120),(112,122),(96,122),(85,127),(79,134)], pole=(70,8), lim=128, clear=118, keep=[(92,122,146,152),(100,152,140,172)],
      lenses=[(105,138,15,16),(134,137,12,15)], arms=[[(91,136),(77,135)],[(145,135),(153,134)]]),
]
# the standing front and desk-side back have their own proportions, so their own outlines
F = dict(hair=[(23,126),(18,108),(24,84),(42,68),(68,61),(94,67),(112,84),(118,108),(113,126),(106,116),(92,105),(68,101),(48,104),(33,114),(28,126)], pole=(50,6), lim=122, clear=120, keep=[(28,118,108,152),(44,150,92,166)],
         lenses=[(48,134,17,17),(88,134,17,17)], arms=[[(32,132),(22,130)],[(104,132),(114,130)]])
W = dict(hair=[(20,84),(17,60),(22,38),(38,18),(64,10),(90,15),(108,34),(114,58),(112,84),(104,96),(80,102),(50,102),(30,96)], pole=(66,-34), lim=101, clear=76, keep=[])
def smooth(pts, n=10):
    # closed Catmull-Rom through the outline
    P = np.array(pts, float); out = []
    for i in range(len(P)):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % len(P)], P[(i + 2) % len(P)]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * (2 * p1 + (p2 - p0) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (3 * p1 - p0 - 3 * p2 + p3) * t ** 3))
    return out
def paint(a, y):
    # a: float RGBA at Z x cell size
    s = Z; H, W_ = a.shape[:2]; Yy, Xx = np.mgrid[0:H, 0:W_].astype(float)
    tp = lambda pts: [(p[0] * s, p[1] * s) for p in pts]
    def fill(pts, blur=0):
        m = Image.new('L', (W_, H), 0); ImageDraw.Draw(m).polygon(tp(pts), fill=255)
        if blur: m = m.filter(ImageFilter.GaussianBlur(blur * s))
        return np.asarray(m, float) / 255
    hm = fill(smooth(y['hair']), 0.5); lim, clear = y['lim'] * s, y['clear'] * s
    R, G, B, A = a[..., 0], a[..., 1], a[..., 2], a[..., 3]
    teal = (B > R + 12) & (G > R + 8) & (A > 8) & (Yy < lim); teal = ni.binary_dilation(teal, iterations=int(1.6 * s)) & (Yy < lim)
    # above clear only the head's hull survives: the old fringe and forehead sit inside it, the brim's overhang outside
    P = np.array(y['hair'], float); hull = fill(P[ConvexHull(P).vertices].tolist()) > 0.5
    a = a.copy(); a[teal, 3] = 0; a[(Yy < clear) & ~hull, 3] = 0
    # the old fringe goes the same brown; eyes and mouth stay dark
    lum = R * .3 + G * .59 + B * .11; keep = np.zeros((H, W_), bool)
    for x0, y0, x1, y1 in y['keep']: keep[y0 * s:y1 * s, x0 * s:x1 * s] = True
    dark = np.clip((112 - lum) / 34, 0, 1) * (~keep) * (Yy < 180 * s) * (R >= B - 8)
    k = ni.gaussian_filter(dark, 0.4 * s)[..., None]; a[..., :3] = a[..., :3] * (1 - k) + (lum[..., None] * np.array([1.62, 1.08, .78]) + np.array([24.0, 13, 6])) * k
    if 'skin' in y:
        pts, (sx, sy) = y['skin']; r = 2 * s; sk = np.median(a[sy * s - r:sy * s + r, sx * s - r:sx * s + r, :3].reshape(-1, 3), 0)
        k = fill(pts, 0.8)[..., None] * (hm < 0.5)[..., None]; a[..., :3] = a[..., :3] * (1 - k) + sk * k; a[..., 3] = np.maximum(a[..., 3], k[..., 0] * 255)
    # hair: warm brown, chunky strands from the pole, a broad sheen on the crown, darker at the edge like the other painted hair
    px, py = y['pole'][0] * s, y['pole'][1] * s; th = np.arctan2(Yy - py, Xx - px); rr = np.hypot(Xx - px, Yy - py)
    rs = np.random.RandomState(11); st = sum(np.sin(th * f + rs.rand() * 6.3) * w for f, w in ((9, .4), (19, .45), (37, .35), (71, .2)))
    st = np.clip(st / 1.1, -1, 1); inner = ni.gaussian_filter(hm, 7 * s)
    r0 = np.percentile(rr[hm > 0.5], 45); band = np.exp(-((rr - r0) / (15 * s)) ** 2) * np.clip((inner - 0.42) / 0.4, 0, 1)
    c = np.array([70.0, 43, 27])[None, None] * (0.72 + 0.5 * inner[..., None]) + (st[..., None] + 0.1) * np.array([11.0, 7, 5]) + (band * (0.75 + 0.25 * st))[..., None] * np.array([58.0, 38, 22])
    # crisp at the silhouette, feathered into the old hair at the lower edge; teal under the edge takes the full hair colour so no rim survives
    k = np.maximum(hm, ni.gaussian_filter(hm, 3.5 * s) * 1.6 * ni.gaussian_filter(dark, 1 * s)); k = np.clip(np.where(teal, 1, k), 0, 1)[..., None]
    a[..., :3] = a[..., :3] * (1 - k) + c * k; a[..., 3] = np.maximum(a[..., 3], hm * 255)
    # temples + round frames on a layer, then over
    L = Image.new('RGBA', (W_, H), (0, 0, 0, 0)); d = ImageDraw.Draw(L); ink = (24, 20, 22, 255)
    for ar in y.get('arms', []): d.line(tp(ar), fill=ink, width=int(3 * s))
    gl = y.get('lenses', [])
    for cx, cy, rx, ry in gl:
        box = ((cx - rx) * s, (cy - ry) * s, (cx + rx) * s, (cy + ry) * s)
        d.ellipse(box, fill=(190, 220, 240, 26)); d.ellipse(box, outline=ink, width=int(3.1 * s))
        d.arc((box[0] + 4 * s, box[1] + 4 * s, box[2] - 4 * s, box[3] - 4 * s), 205, 285, fill=(240, 248, 255, 150), width=int(1.3 * s))
    if len(gl) == 2:
        (c0, y0, r0_, _), (c1, y1, r1_, _) = gl; xa, xb = (c0 + r0_ - 1) * s, (c1 - r1_ + 1) * s; ym = (y0 + y1) / 2 * s
        d.arc((xa, ym - 4 * s, xb, ym + 4 * s), 180, 360, fill=ink, width=int(3 * s)); d.line([(xa, ym), (xb, ym)], fill=ink, width=int(2.6 * s)) if xb - xa < 6 * s else None
    L = np.asarray(L, float); k = L[..., 3:] / 255; a[..., :3] = a[..., :3] * (1 - k) + L[..., :3] * k; a[..., 3] = np.maximum(a[..., 3], L[..., 3])
    return a
def work(im, y):
    w, h = im.size; up = np.asarray(im.convert('RGBa').resize((w * Z, h * Z), Image.BICUBIC).convert('RGBA'), float)
    return Image.fromarray(np.clip(paint(up, y), 0, 255).round().astype('uint8'), 'RGBA').convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
live, h = Image.open(LIVE + 'turn-heads.webp').convert('RGBA'), Image.open(ST + 'turn-heads.webp').convert('RGBA') # the stage atlas keeps Grok's row
for c, y in enumerate(Y):
    box = (c * CW, ROW * CH, (c + 1) * CW, (ROW + 1) * CH); h.paste(work(live.crop(box), y), box[:2])
h.save(ST + 'turn-heads.webp', quality=92, method=6)
work(Image.open(LIVE + 'w07.png').convert('RGBA'), W).save(ST + 'w07.png')
work(Image.open(LIVE + 'f07.png').convert('RGBA'), F).save(ST + 'f07.png')
