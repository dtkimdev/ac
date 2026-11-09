#!/usr/bin/env python3
"""v8 asset pipeline (Pillow + numpy only, idempotent, no AI).
Inputs:  design/v8/plate-{night,dusk}-3840.png, dash-*.png, ferris-wheel.png, turn/*.png, the bot busts w??/f??.png, and
         design/v8/build/layout-v7.json (the v7 keys that survive: sprites, corgi, legs, airships, shafts ...).
Outputs: public/office2d/assets/ plates, masks, occluder masks, nochair patches, turn atlases, dash sprites, ferris wheel, layout.json.
Usage:   bin/preprocess_v8.py [plates] [city] [room] [turn] [dash] [ferris]   (no argument = all; layout.json is rewritten each run). V8_ASSETS=dir writes to a staging folder.
Every number below is plate px at 1280x720 (the layout reference size) and was checked on debug overlays."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
V8, BUILD = f'{ROOT}/design/v8/', f'{ROOT}/design/v8/build/'
ASSETS = os.environ.get('V8_ASSETS') or f'{ROOT}/public/office2d/assets/'
PW, PH = 1280, 720
# the dusk art is painted about 0.5% taller than the night art (measured by edge correlation across the plate): y_dusk = 1.00493 y_night - 2 (3840 px)
DUSK_Y = (1.00493, -2.0)


def u8(a): return np.clip(a + 0.5, 0, 255).astype(np.uint8)
def blur(a, r): return np.array(Image.fromarray(u8(a)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32)
def morph(m, f, r): return np.array(Image.fromarray(u8(m * 255.0)).filter(f(2 * r + 1))) > 127
def erode(m, r): return morph(m, ImageFilter.MinFilter, r)
def dilate(m, r): return morph(m, ImageFilter.MaxFilter, r)
def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)
def norm(p): return [round(p[0] / PW, 4), round(p[1] / PH, 4)]
def poly_mask(poly, feather=0.0, scale=4):
    im = Image.new('L', (PW * scale, PH * scale), 0); ImageDraw.Draw(im).polygon([(x * scale, y * scale) for x, y in poly], fill=255)
    im = im.resize((PW, PH), Image.BILINEAR)
    if feather: im = im.filter(ImageFilter.GaussianBlur(feather))
    return np.array(im).astype(np.float32) / 255
def save_alpha(a, name, scale=1):
    al = Image.fromarray(u8(np.clip(a, 0, 1) * 255))
    if scale != 1: al = al.resize((al.width * scale, al.height * scale), Image.BICUBIC)
    Image.merge('LA', (Image.new('L', al.size, 255), al)).save(ASSETS + name, optimize=True)
def components(m):
    h, w = m.shape; lab = np.zeros((h, w), np.int32); sizes = [0]; n = 0
    for y0, x0 in zip(*np.nonzero(m)):
        if lab[y0, x0]: continue
        n += 1; lab[y0, x0] = n; st = [(y0, x0)]; c = 0
        while st:
            y, x = st.pop(); c += 1
            for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                if 0 <= yy < h and 0 <= xx < w and m[yy, xx] and not lab[yy, xx]: lab[yy, xx] = n; st.append((yy, xx))
        sizes.append(c)
    return lab, np.array(sizes)


# ---------- plates ----------
FR_BOX = (2470, 1520, 3260, 2160)  # pasted front-right desk (3840 px): its cut-out left a magenta key fringe on the night art
def plate_src(name):
    """3840x2160 RGB float: the dusk art warped onto the night geometry; magenta fringe around the pasted desk neutralised."""
    im = Image.open(f'{V8}plate-{name}-3840.png').convert('RGB')
    if name == 'dusk':
        a, b = DUSK_Y; im = im.transform(im.size, Image.AFFINE, (1, 0, 0, 0, a, b), Image.BICUBIC)
    A = np.array(im).astype(np.float32); x0, y0, x1, y1 = FR_BOX; C = A[y0:y1, x0:x1]
    r, g, b = C[..., 0], C[..., 1], C[..., 2]
    fringe = smooth(np.minimum(r, b * 1.5) - g * 1.25, 8, 26) * (r > g * 1.3)
    fringe = np.maximum(fringe, blur(fringe * 255, 1.4) / 255 * 1.4).clip(0, 1)[..., None]
    wood = np.stack([g * 1.15 + 4, g * 0.86, g * 0.72], -1)  # same luminance, a dark floor tone instead of the key colour
    A[y0:y1, x0:x1] = C * (1 - fringe) + wood * fringe
    return np.clip(A, 0, 255)


def plates():
    for n in ('dusk', 'night'):
        im = Image.fromarray(u8(plate_src(n)))
        im.save(f'{ASSETS}plate-{n}-hi.webp', quality=86, method=6)
        im.resize((2560, 1440), Image.LANCZOS).save(f'{ASSETS}plate-{n}.webp', quality=86, method=6)
        im.resize((PW, PH), Image.LANCZOS).save(f'{BUILD}p-{n}.png')
        print('plate', n)


def plate_f(n): return np.array(Image.open(f'{BUILD}p-{n}.png').convert('RGB')).astype(np.float32)


# ---------- city: masks + measurements (ported from bin/preprocess.py, re-tuned for the v8 plates) ----------
WINDOW = [[84, 34], [1222, 34], [1222, 413], [84, 413]]  # bottom = just above the back-row monitors; the low band below it is interior
SEA = [[448, 352], [706, 352], [760, 413], [392, 413]]
MULLIONS = [[0, 93], [206, 215], [385, 394], [552, 560], [732, 740], [896, 904], [1062, 1072], [1213, 1280]]
TRANSOM = [246, 255]
SKYBAND = [48, 236]
FG_EXTRA = [[[472, 380], [508, 380], [512, 413], [470, 413]],         # lamp post on the sill
            [[84, 330], [150, 372], [210, 413], [84, 413]],           # left plants
            [[1090, 390], [1150, 340], [1222, 300], [1222, 413]]]     # right plants
LANES = [{'id': 'left-bridge', 'pts': [[253, 425], [320, 397], [426, 380], [526, 372], [620, 368]], 'near': [1.0, 0.45], 'water': [430, 620]},
         {'id': 'right-bridge', 'pts': [[723, 369], [768, 371], [832, 376], [896, 382], [960, 389], [1024, 400], [1075, 410]], 'near': [0.5, 0.85], 'water': [723, 900]}]
BOAT_LANES = [{'y': 361, 'x': [600, 712], 'near': 0.15}, {'y': 374, 'x': [612, 706], 'near': 0.4}, {'y': 392, 'x': [520, 760], 'near': 0.7}, {'y': 406, 'x': [470, 800], 'near': 0.95}]
W3 = np.array([.3, .55, .15], np.float32)


def city(L):
    d, n = plate_f('dusk'), plate_f('night')
    r, g, b = d[..., 0], d[..., 1], d[..., 2]; gb, gnb = g - b, n[..., 1] - n[..., 2]
    vine = np.clip((gb - 3) / 6, 0, 1) * np.clip((115 - d.mean(2)) / 15, 0, 1) * np.clip((gnb + 1) / 4, 0, 1) * np.clip((70 - n.mean(2)) / 12, 0, 1)
    vine = np.array(Image.fromarray(u8(vine * 255)).filter(ImageFilter.MedianFilter(3))).astype(np.float32) / 255
    vine[260:413, 300:1100] = 0  # palms on the far shore are part of the city, not of the room
    vine[60:250, 300:840] = 0  # no vine hangs in the middle of the sky panes
    dark = (d.mean(2) < 70) & (n.mean(2) < 40); near = dilate(vine > 0.3, 1)
    m = np.maximum(vine, (dark & near).astype(np.float32))
    for x0, x1 in MULLIONS: m[:, x0:x1] = 1
    m[TRANSOM[0]:TRANSOM[1], :] = 1
    for poly in FG_EXTRA: m = np.maximum(m, poly_mask(poly, 1.5))
    (wx0, wy0), (wx1, wy1) = WINDOW[0], WINDOW[2]
    m[:wy0 + 2, :] = 1; m[wy1:, :] = 1
    m = blur(m * 255, 0.7) / 255
    save_alpha(m[wy0:wy1, wx0:wx1], 'fg-mask.png')
    ref = np.array([np.median(d[min(y, 276), 565:728], 0) for y in range(PH)], np.float32)
    cty = np.clip(((ref @ W3)[:, None] - d @ W3 - 22) / 18, 0, 1)
    cty = np.array(Image.fromarray(u8(cty * 255)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    moon = poly_mask([[634 + 25 * np.cos(a / 16 * np.pi), 127 + 25 * np.sin(a / 16 * np.pi)] for a in range(32)], 1)  # far planes pass behind the painted moon
    save_alpha(np.maximum(np.maximum(cty, m), moon)[wy0:SKYBAND[1] + 24, wx0:wx1], 'sky-mask.png')
    # the far-away sky behind the wheel: everything in front of open sky/mountain haze is redrawn from the plate
    sd, sn = np.median(d[382:408, 590:690].reshape(-1, 3), 0), np.median(n[382:408, 590:690].reshape(-1, 3), 0)
    wd, wn = np.sqrt(((d - sd) ** 2).sum(2)), np.sqrt(((n - sn) ** 2).sum(2))
    wet = np.clip((125 - wd) / 40, 0, 1) * np.clip((95 - wn) / 30, 0, 1) * (n.max(2) < 170)
    wet = np.array(Image.fromarray(u8(wet * 255)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    wet *= poly_mask(SEA, 2) * (1 - m)
    sx0, sy0, sx1, sy1 = 392, 352, 760, 413
    save_alpha(wet[sy0:sy1, sx0:sx1], 'water-mask.png')
    box = lambda x0, y0, x1, y1: [round(x0 / PW, 4), round(y0 / PH, 4), round(x1 / PW, 4), round(y1 / PH, 4)]
    L['window'] = [norm(p) for p in WINDOW]; L['sea'] = [norm(p) for p in SEA]; L['transom'] = [round(v / PH, 4) for v in TRANSOM]
    L['sky'] = [norm(p) for p in [[84, 34], [1222, 34], [1222, 300], [84, 300]]]
    L['panes'] = [[round(MULLIONS[i][1] / PW, 4), round(MULLIONS[i + 1][0] / PW, 4)] for i in range(len(MULLIONS) - 1)]
    L['masks'] = {'water': box(sx0, sy0, sx1, sy1), 'fg': box(wx0, wy0, wx1, wy1), 'sky': box(wx0, wy0, wx1, SKYBAND[1] + 24)}
    L['skyBand'] = [round(v / PH, 4) for v in SKYBAND]
    L['lanes'] = [{**l, 'pts': [norm(p) for p in l['pts']], 'water': [round(v / PW, 4) for v in l['water']]} for l in LANES]
    L['boatLanes'] = [{'y': round(b['y'] / PH, 4), 'x': [round(v / PW, 4) for v in b['x']], 'near': b['near']} for b in BOAT_LANES]
    # palette
    med = lambda a, x0, y0, x1, y1: [int(v) for v in np.median(a[y0:y1, x0:x1].reshape(-1, 3), 0)]
    dk = lambda a, x0, y0, x1, y1: [int(v) for v in np.percentile(a[y0:y1, x0:x1].reshape(-1, 3), 30, 0)]
    L['palette'] = {nm: {'skyTop': med(a, 565, 40, 728, 70), 'sky': med(a, 565, 130, 728, 170), 'horizon': med(a, 565, 262, 728, 276), 'sea': med(a, 590, 382, 690, 408), 'seaFar': med(a, 610, 356, 690, 366),
                         'city': dk(a, 100, 260, 380, 380), 'cityFar': dk(a, 760, 280, 880, 340), 'bridge': dk(a, 330, 392, 430, 405)} for nm, a in (('dusk', d), ('night', n))}
    # stars
    l = n @ W3; loc = np.array(Image.fromarray(u8(l)).filter(ImageFilter.BoxBlur(3))).astype(np.float32); pts = []
    ys, xs = np.nonzero((l - loc > 14) & (l > 70) & (m < 0.3) & (cty < 0.3))
    for x, y in zip(xs, ys):
        if 95 < x < 1210 and 40 < y < 240 and not (600 < x < 660 and 90 < y < 165) and all(abs(x - q[0]) > 3 or abs(y - q[1]) > 3 for q in pts[-30:]): pts.append([int(x), int(y)])
    L['stars'] = [norm(p) for p in pts[:140]]
    # lit windows
    sky = ref @ W3; lum = n @ W3; pts = []; rng = np.random.default_rng(7); ys, xs = np.nonzero(lum > 118); taken = set()
    for k in rng.permutation(len(xs)):
        x, y = int(xs[k]), int(ys[k])
        if not (100 < x < 1180 and 60 < y < 400) or m[y, x] > 0.4 or (520 < x < 740 and y > 330): continue
        if y < 300 and np.median(d[max(0, y - 5):y + 6, max(0, x - 5):x + 6] @ W3) > sky[y] - 30: continue
        cell = (x // 14, y // 10)
        if cell in taken: continue
        taken.add(cell); c = n[y, x]; ring = n[max(0, y - 4):y + 5, max(0, x - 5):x + 6].reshape(-1, 3)
        off = ring[ring.mean(1) <= np.percentile(ring.mean(1), 30)].mean(0)
        pts.append([round(x / PW, 4), round(y / PH, 4), 1 if c[2] > c[0] else 0, *[int(v) for v in off]])
        if len(pts) >= 220: break
    L['lights'] = pts
    # neon signs: saturated pink blobs in the night city
    R, G, B = n[..., 0], n[..., 1], n[..., 2]; pink = erode(dilate((R > 150) & (B > 110) & (G < R * 0.62) & (m < 0.4), 1), 0)
    pink[:, :100] = False; pink[:, 1190:] = False; pink[400:] = False; pink[:50] = False
    lab, sz = components(pink); neon = []
    for i in np.argsort(sz)[::-1][:8]:
        if i == 0 or sz[i] < 10: continue
        yy, xx = np.nonzero(lab == i); c = n[lab == i].mean(0)
        neon.append([round(xx.min() / PW, 4), round(yy.min() / PH, 4), round((xx.max() + 1) / PW, 4), round((yy.max() + 1) / PH, 4), [255, int(np.clip(c[1], 80, 140)), int(np.clip(c[2], 180, 225))]])
    L['neon'] = neon
    print(f'city: {len(L["stars"])} stars, {len(pts)} lights, {len(neon)} neon')


# ---------- room: seats, monitors, chair masks, occluders, lounge ----------
# chairs: id, centre x, top of the backrest, bottom of the wheels (measured on the plates)
CHAIRS = dict(v0=(330.6, 465, 558), v1=(415, 466, 558), s0=(596.6, 465, 558), s1=(688.6, 466, 558), m0=(868.5, 466, 558), m1=(951.7, 467, 558),
              h0=(1095, 510, 627), h1=(1202, 509, 627), b0=(640, 581, 714), n0=(887.6, 598, 712), n1=(988, 599, 712))
MON = dict(v0=[[305.7, 420], [370.3, 420], [370.3, 454.7], [306.3, 455.3]], v1=[[382.7, 420], [450.3, 420], [450.7, 453], [382.7, 451.3]],
           s0=[[575, 417.5], [639, 417.5], [639, 452.8], [575, 456.5]], s1=[[649.3, 417.3], [711, 417.3], [711, 454], [649.3, 450.5]],
           m0=[[830, 417.5], [895, 416], [896, 455], [831, 457.5]], m1=[[906.5, 416], [971, 420.5], [971, 456.3], [907.5, 453]],
           h0=[[1037, 438.5], [1115.5, 438.5], [1115.3, 485], [1040, 489.3]], h1=[[1130, 438.7], [1217.3, 438.7], [1219.3, 489.3], [1131.3, 485.3]],
           b0=[[522.5, 526], [595, 510], [594, 557.5], [525, 582.5]], b1=[[598, 509.3], [687.3, 508.7], [684, 555.3], [601.3, 556]], b2=[[691, 511.5], [766, 526], [764, 584], [693, 556.5]],
           n0=[[858, 527.3], [940, 521.3], [939.3, 566], [856.7, 573.3]], n1=[[954.7, 522.7], [1036.7, 528], [1037.3, 574], [956, 566]])
# layout decision: back row L->R Video, SB Pallet, Messages, far right Housekeeping; the pasted front-right desk is Numbers (the markets desk with the big charts)
DESKS = [dict(id='numbers', label='Numbers', theme='numbers', accent='#f2b85c', bots=[2, 10], mon=['n0', 'n1'], seats=['n0', 'n1']),
         dict(id='video', label='Video', theme='video', accent='#e8806e', bots=[4, 5], mon=['v0', 'v1'], seats=['v0', 'v1']),
         dict(id='sbp', label='SB Pallet', theme='sbp', accent='#a6d67e', bots=[6, 9], mon=['s0', 's1'], seats=['s0', 's1']),
         dict(id='messages', label='Messages', theme='messages', accent='#86a6e0', bots=[3, 7], mon=['m0', 'm1'], seats=['m0', 'm1']),
         dict(id='housekeeping', label='Housekeeping', theme='house', accent='#6fbfd0', bots=[0, 8], mon=['h0', 'h1'], seats=['h0', 'h1']),
         dict(id='boss', label='Boss', theme='boss', accent='#ecc67c', bots=[1], mon=['b0', 'b2'], seats=['b0'])]
BOSS_POLY = [(517, 525), (598, 506), (690, 506), (770, 524), (778, 536), (790, 548), (796, 590), (808, 610), (806, 650), (746, 697), (702, 680), (702, 640), (640, 628), (592, 640), (592, 684), (544, 702), (486, 660), (482, 616), (494, 598), (517, 592)]
FR_POLY = [(848, 520), (946, 510), (1050, 522), (1048, 586), (1000, 592), (1070, 604), (1076, 648), (1070, 692), (1034, 692), (1028, 660), (838, 660), (832, 692), (826, 692), (820, 648), (826, 604), (850, 590)]
TABLE_POLY = [(257, 622), (268, 609), (290, 603), (330, 601), (356, 607), (371, 620), (366, 638), (352, 648), (344, 678), (334, 678), (330, 660), (316, 686), (306, 686), (304, 660), (284, 678), (274, 678), (272, 650), (260, 638)]
OCC = [dict(mask='boss', poly=BOSS_POLY, depth=545, zone=[505, 806, 660], key=541.5),
       dict(mask='desk-fr', poly=FR_POLY, depth=590, zone=[820, 1078, 650], key=586.5)]
BAGS = [dict(id='bag-r', sel=lambda r, g, b: (r > 95) & (r > g * 1.75) & (r > b * 1.7), seed=(150, 610), box=(70, 530, 240, 680), depth=650, sit=(157, 618), visit=(180, 672), tilt=-0.05, under=(155, 612, 71, 52)),
        dict(id='bag-b', sel=lambda r, g, b: (b > r * 0.98) & (b > 55), seed=(270, 570), box=(200, 500, 345, 640), depth=622, sit=(272, 585), visit=(240, 640), tilt=0.0, under=(272, 585, 61, 36)),
        dict(id='bag-m', sel=lambda r, g, b: (r > 85) & (g > r * 0.40) & (b < g * 0.66), seed=(410, 590), box=(335, 505, 485, 640), depth=626, sit=(408, 592), visit=(400, 646), tilt=0.05, under=(412, 595, 62, 36))]
SPOTS = [dict(id='coffee', p=(130, 598), back=True, hang=True), dict(id='fridge', p=(74, 612), face=-1, hang=True), dict(id='rugs', p=(350, 702), hang=True), dict(id='table', p=(392, 672), face=-1, hang=True)]
LOUNGE = dict(steam=(121, 455), heart=(55, 478), lamp=(229, 437), espresso=(121, 500))
# nav graph (plate px): the one floor graph for walkers and the corgi; `seat feet` nodes are appended per chair in room()
NAV = dict(lback=(232, 570), j1=(478, 566), j2=(800, 566), j3=(1016, 586), hgate=(1082, 640), fgate=(1086, 700), mid=(640, 566), lgate=(196, 592), gap=(204, 650),
           coffee=(130, 598), fridge=(74, 612), rugl=(170, 690), rug=(290, 694), rugr=(392, 690), mgate=(478, 640), table=(392, 672), fl=(474, 704), fm=(560, 716), fr=(760, 716),
           bagr=(180, 672), bagb=(240, 640), bagm=(400, 646), rugs=(350, 702))
NAV_E = [('lback', 'lgate'), ('lgate', 'coffee'), ('coffee', 'fridge'), ('lgate', 'gap'), ('gap', 'bagb'), ('gap', 'bagr'), ('bagr', 'rugl'), ('rugl', 'rug'), ('rug', 'rugs'), ('rugs', 'rugr'), ('rugr', 'table'), ('table', 'bagm'), ('table', 'mgate'),
         ('rugr', 'fl'), ('mgate', 'fl'), ('mgate', 'j1'), ('fl', 'fm'), ('fm', 'b0'), ('b0', 'fr'), ('fr', 'n0'), ('n0', 'n1'), ('n1', 'fgate'), ('fgate', 'hgate'), ('hgate', 'h0'), ('h0', 'h1'), ('hgate', 'j3'),
         ('lback', 'v0'), ('v0', 'v1'), ('v1', 'j1'), ('j1', 's0'), ('s0', 'mid'), ('mid', 's1'), ('s1', 'j2'), ('j2', 'm0'), ('m0', 'm1'), ('m1', 'j3'), ('bagb', 'rugl')]
DOG_REST = [('rug', 'sleep'), ('rugl', 'sleep'), ('rugr', 'lie'), ('fm', 'lie'), ('mid', 'lie'), ('hgate', 'sleep'), ('fr', 'lie')]
DOG_BEG = ['fridge', 'coffee', 'rug', 'rugr']


def hires(n): return np.array(Image.open(f'{ASSETS}plate-{n}.webp').convert('RGB')).astype(np.float32)


def chair_seg(D, cid):
    """bool mask at 2x plate res of the dark chair (dusk art), plus its origin."""
    cx, t, b = CHAIRS[cid]; S = 2; w = 62 if b >= 620 else 44
    x0, x1, y0, y1 = int((cx - w) * S), int((cx + w) * S), int((t - 8) * S), int((b + 6) * S)
    c = D[y0:y1, x0:x1]; l = c.max(2); sat = l - c.min(2)
    m = np.array(Image.fromarray(u8(((l < 52) & (sat < 22)) * 255.0)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.MaxFilter(3))) > 127
    lab, sz = components(m); sel = lab == lab[int((t + 25) * S) - y0, int(cx * S) - x0]
    return sel, x0, y0


def backrest(sel, x0, y0, cid):
    """occluder polygon of the backrest from the row extents of the top of the chair (plate px) + the chair's backrest width."""
    cx, t, b = CHAIRS[cid]; S = 2; H = (b - t) * 0.57; xs0, xs1 = [], []; rows = range(int(t * S) - y0, int((t + H) * S) - y0)
    for r in rows:
        xs = np.nonzero(sel[r])[0]
        xs0.append(xs.min() if len(xs) else np.nan); xs1.append(xs.max() + 1 if len(xs) else np.nan)
    xs0, xs1 = np.array(xs0, float), np.array(xs1, float); q = max(4, len(rows) // 3); W = np.nanmedian(xs1[2:q] - xs0[2:q]) * 1.06
    mid = (np.nanmedian(xs0[2:q]) + np.nanmedian(xs1[2:q])) / 2; lim = W * 0.56
    xs0 = np.maximum(np.nan_to_num(xs0, nan=mid), mid - lim); xs1 = np.minimum(np.nan_to_num(xs1, nan=mid), mid + lim)
    for i in range(1, len(rows)):  # the outline only ever widens going down the backrest in this art, spurs are ignored by a slow slew
        xs0[i] = max(xs0[i], xs0[i - 1] - 2); xs1[i] = min(xs1[i], xs1[i - 1] + 2)
    step = max(1, len(rows) // 9); idx = list(range(0, len(rows), step)) + [len(rows) - 1]
    toP = lambda x, r: (round((x + x0) / S, 1), round((r + rows.start + y0) / S, 1))
    poly = [toP(xs0[i], i) for i in idx] + [toP(xs1[i], i) for i in reversed(idx)]
    return poly, float(W / S), float((mid + x0) / S)


def room(L):
    d2 = hires('dusk'); n2 = hires('night'); nc = {}; seat = {}
    for cid, (cx, t, b) in CHAIRS.items():
        sel, x0, y0 = chair_seg(d2, cid); poly, W, mx = backrest(sel, x0, y0, cid)
        seat[cid] = dict(poly=poly, W=W, x=round(mx, 1), t=t, b=b); nc[cid] = (sel, x0, y0)
    # nochair atlas: one rect per chair, chair erased by row-wise interpolation between its left and right surroundings
    S = 2; cells = []; ax = 0
    for cid, (sel, x0, y0) in nc.items():
        s = seat[cid]; H = s['b'] - s['t']; hw = 0.72 * H if s['b'] >= 620 else 0.74 * H; rx0, rx1 = max(0, int((s['x'] - hw) * S)), min(2560, int((s['x'] + hw) * S)); ry0, ry1 = int((s['t'] - 7) * S), min(1439, int((s['b'] + 6) * S))
        m = np.zeros((ry1 - ry0, rx1 - rx0), bool)
        sx0, sy0 = max(x0, rx0), max(y0, ry0); sx1, sy1 = min(x0 + sel.shape[1], rx1), min(y0 + sel.shape[0], ry1)
        m[sy0 - ry0:sy1 - ry0, sx0 - rx0:sx1 - rx0] = sel[sy0 - y0:sy1 - y0, sx0 - x0:sx1 - x0]
        wh = np.array(Image.new('L', (m.shape[1], m.shape[0]))); hh = Image.new('L', (m.shape[1], m.shape[0]), 0); dr = ImageDraw.Draw(hh)
        cxp = (s['x'] * S - rx0); by = ry1 - ry0 - 8
        dr.ellipse([cxp - H * 0.56 * S, by - H * 0.18 * S, cxp + H * 0.56 * S, by + 4], fill=255)  # the wheel star
        dr.rectangle([cxp - H * 0.08 * S, by - H * 0.5 * S, cxp + H * 0.08 * S, by], fill=255)    # the column
        dr.rounded_rectangle([cxp - H * 0.46 * S, (s['t'] + H * 0.34 - ry0 / S) * S, cxp + H * 0.46 * S, (s['t'] + H * 0.62 - ry0 / S) * S], 12, fill=255)  # arms + seat
        m |= np.array(hh) > 127
        m = dilate(m, 3); soft = blur(m * 255.0, 1.6)[..., None] / 255
        out = {}
        for nm, P2 in (('dusk', d2), ('night', n2)):
            C = P2[ry0:ry1, rx0:rx1].copy(); F = C.copy()
            for y in range(C.shape[0]):
                xs = np.nonzero(m[y])[0]
                if not len(xs): continue
                gaps = np.split(xs, np.nonzero(np.diff(xs) > 1)[0] + 1)
                for g_ in gaps:
                    a0, a1 = g_[0], g_[-1]; l = C[y, max(0, a0 - 5):max(1, a0 - 1)].mean(0) if a0 > 2 else None; r = C[y, min(C.shape[1] - 2, a1 + 2):a1 + 6].mean(0) if a1 < C.shape[1] - 3 else None
                    if l is None: l = r
                    if r is None: r = l
                    if l is None: continue
                    t_ = np.linspace(0, 1, len(g_))[:, None]; F[y, g_] = l * (1 - t_) + r * t_
            B = np.dstack([blur(F[..., i], 2.2) for i in range(3)])
            F = F * (1 - soft) + B * soft  # rows smoothed vertically so the erased area has no streaks
            out[nm] = np.dstack([F, soft[..., 0] * 255])
        cells.append((cid, rx0, ry0, out))
    W = sum(c[3]['dusk'].shape[1] for c in cells) + 4 * len(cells); H = max(c[3]['dusk'].shape[0] for c in cells)
    for nm in ('dusk', 'night'):
        A = Image.new('RGBA', (W, H), (0, 0, 0, 0)); x = 0; meta = {}
        for cid, rx0, ry0, out in cells:
            im = Image.fromarray(u8(out[nm]), 'RGBA'); A.paste(im, (x, 0)); meta[cid] = [x, 0, im.width, im.height, round(rx0 / S, 2), round(ry0 / S, 2)]; x += im.width + 4
        A.save(f'{ASSETS}nochair-{nm}.webp', quality=88, method=6, exact=True)
    L['nochair'] = meta  # atlas rect + plate position per chair (2x plate px in the atlas)
    # bags, table, occluders, foreground plants
    D = plate_f('dusk'); N = plate_f('night'); r, g, b = D[..., 0], D[..., 1], D[..., 2]; masks = {}
    for B in BAGS:
        x0, y0, x1, y1 = B['box']; m = np.zeros((PH, PW), bool); m[y0:y1, x0:x1] = B['sel'](r, g, b)[y0:y1, x0:x1]
        m = dilate(erode(m, 1), 1); lab, sz = components(m); sz[0] = 0; sel = lab == sz.argmax()
        sel = erode(dilate(sel, 4), 4); lab2, sz2 = components(~sel); sel |= (sz2 < 2500)[lab2] & (lab2 > 0)
        ex, ey, erx, ery = B['under']  # the dark underside of the bag fails the colour test
        sel = np.maximum(sel, poly_mask([[ex + erx * np.cos(a / 18 * np.pi), ey + ery * np.sin(a / 18 * np.pi)] for a in range(36)]) > 0.5); sel[:, 477:] = False
        masks[B['id']] = blur(sel * 255.0, 0.7) / 255
    for o in OCC: masks[o['mask']] = poly_mask(o['poly'], 0.7)
    masks['table'] = poly_mask(TABLE_POLY, 0.7)
    plant = (g >= 0.74 * r) & (g > b + 5)
    pl = np.array(Image.fromarray(u8(plant * 255.0)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    pl *= smooth(np.arange(PH)[:, None].astype(np.float32), 555, 572)
    box_of = {}
    def add(name, a):
        ys, xs = np.nonzero(a > 0.02); bx = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
        save_alpha(a[bx[1]:bx[3], bx[0]:bx[2]], f'{name}-mask.png', 2); box_of[name] = [round(bx[0] / PW, 4), round(bx[1] / PH, 4), round(bx[2] / PW, 4), round(bx[3] / PH, 4)]
    l_, r_ = pl.copy(), pl.copy(); l_[:, 180:] = 0; r_[:, :1000] = 0; r_[:600] = 0
    # pots of the floor plants are not green: closed by hand
    l_ = np.maximum(l_, poly_mask([(0, 668), (62, 676), (60, 720), (0, 720)], 1)); l_ = np.maximum(l_, poly_mask([(64, 702), (120, 700), (120, 720), (64, 720)], 1))
    add('room-l', l_); add('room-r', r_)
    for k_, v in masks.items(): add(k_, v)
    L['masks'].update(box_of)
    L['occluders'] = [dict(mask=o['mask'], depth=round(o['depth'] / PH, 4), zone=[round(o['zone'][0] / PW, 4), round(o['zone'][1] / PW, 4), round(o['zone'][2] / PH, 4)], key=round(o['key'] / PH, 4)) for o in OCC] + \
                     [dict(mask=B['id'], depth=round(B['depth'] / PH, 4)) for B in BAGS] + [dict(mask='table', depth=round(652 / PH, 4))]
    # seats
    ids = {}; nodes = []
    def node(name, p): ids[name] = len(nodes); nodes.append(norm(p))
    for k_, p in NAV.items(): node(k_, p)
    FY = dict(v=566, s=566, m=566, h=640, b=717, n=716)
    desks = []
    for dk in DESKS:
        sts = []
        for cid in dk['seats']:
            s = seat[cid]; node(cid, (s['x'], FY[cid[0]]))
            sts.append(dict(id=cid, x=round(s['x'] / PW, 4), ctop=round(s['t'] / PH, 4), base=round(s['b'] / PH, 4), W=round(s['W'] / PW, 4), chair=[norm(p) for p in s['poly']], node=ids[cid], feet=norm((s['x'], FY[cid[0]])), nc=cid))
        desks.append(dict(id=dk['id'], label=dk['label'], theme=dk['theme'], accent=dk['accent'], bots=dk['bots'], monitors=[[norm(p) for p in MON[m]] for m in dk['mon']], seats=sts))
    desks.append(dict(id='lounge', label='Lounge', theme='default', accent='#c9a0e8', bots=[14], monitors=[], seats=[]))
    L['desks'] = desks
    L['nav'] = dict(nodes=nodes, edges=[[ids[a], ids[b]] for a, b in NAV_E], name=ids)
    L['boss'] = dict(monitors=[[norm(p) for p in MON[m]] for m in ('b0', 'b1', 'b2')], lamp=norm((770, 560)))
    L['lounge'] = dict(bags=[dict(id=B['id'], sit=norm(B['sit']), visit=norm(B['visit']), node=ids[{'bag-r': 'bagr', 'bag-b': 'bagb', 'bag-m': 'bagm'}[B['id']]], depth=round(B['depth'] / PH, 4), tilt=B['tilt']) for B in BAGS],
                       spots=[dict(id=s['id'], p=norm(s['p']), node=ids[s['id']], back=s.get('back', False), face=s.get('face', 1)) for s in SPOTS], **{k_: norm(v) for k_, v in LOUNGE.items()})
    L['walk'] = dict(y=round(566 / PH, 4), h=[[round(566 / PH, 4), round(84 / PH, 4)], [round(640 / PH, 4), round(106 / PH, 4)], [round(716 / PH, 4), round(122 / PH, 4)]])
    L['dog'] = dict(nodes=nodes, edges=L['nav']['edges'], rest=[[ids[n_], k_] for n_, k_ in DOG_REST], beg=[ids[n_] for n_ in DOG_BEG], start=ids['rug'])
    L['standing'] = [dict(x=round(250 / PW, 4), top=round(560 / PH, 4), h=round(120 / PH, 4))]
    L['lamps'] = [dict(desk='boss', x=round(770 / PW, 4), y=round(555 / PH, 4), r=0.05), dict(x=round(229 / PW, 4), y=round(437 / PH, 4), r=0.06), dict(x=0.3945, y=0.5667, r=0.022)]
    L['shafts'] = L.get('shafts')
    for s in seat.values(): print({k_: v for k_, v in s.items() if k_ != 'poly'})


# ---------- turn art: per-bot composites of design/v8/turn ----------
# frames share one chair; `head` = centre + width of the painted head in frame px, `cut` = last row of that head (above it only the hoodie survives).
TURN = [dict(f='t0-back', head=(90, 62, 134), base=90, cut=128, yaw=180), dict(f='t1-3q-back', head=(92, 65, 140), base=91, cut=128, yaw=135), dict(f='t2-side', head=(82, 70, 140), base=89, cut=132, yaw=90),
        dict(f='t3-3q-front', head=(91, 75, 135), base=89, cut=148, yaw=45), dict(f='t4-front', head=(90, 75, 135), base=91, cut=148, yaw=0), dict(f='chat-right', head=(152, 90, 195), base=141, cut=185, yaw=30, scale=0.64)]
TS = 0.6     # atlas px per frame px
CELL = (190, 266); CX = 82   # cell + the x of the chair base centre inside it
HW, HH = 124, 156            # head cell; a bust head is scaled to 100 px wide
YAWS = [180 - i * 22.5 for i in range(9)]
# hoodie colour per bust (median of the torso, the two striped/scarf busts by hand)
HOOD = {1: (44, 66, 122)}
HEAD_CHIN = [137, 142, 135, 138, 133, 134, 150, 158, 135, 134, 140, 140]  # front busts: chin row, read off a ruler sheet


NECK_B = [112, 120, 108, 112, 124, 115, 122, 104, 106, 124, 110, 105]  # back busts: row where the hair/cap meets the hoodie, read off a contact sheet


def head_frames(i):
    F = np.array(Image.open(f'{ASSETS}f{i:02d}.png').convert('RGBA')).astype(np.float32); B0 = np.array(Image.open(f'{ASSETS}w{i:02d}.png').convert('RGBA')).astype(np.float32)
    chin = HEAD_CHIN[i]; nb = NECK_B[i]; dy = chin - nb; oF, oB = max(0, -dy), max(0, dy); chin += oF; H = max(F.shape[0] + oF, B0.shape[0] + oB) + 4; W = max(F.shape[1], B0.shape[1])
    def place(A, oy):
        o = np.zeros((H, W, 4), np.float32); ox = (W - A.shape[1]) // 2; h_ = min(A.shape[0], H - oy); o[oy:oy + h_, ox:ox + A.shape[1]] = A[:h_]; return o
    F, Bk = place(F, oF), place(B0, oB)  # the two busts registered on the neck line
    fade = smooth(np.arange(H, dtype=np.float32), chin + 8, chin + 1)[:, None]
    for A in (F, Bk): A[..., 3] *= fade
    def axis(A):
        a = A[..., 3] > 90; rows = np.nonzero(a.any(1))[0]; top = rows[0]; c = [(np.nonzero(a[y])[0].min() + np.nonzero(a[y])[0].max()) / 2 for y in rows if y > chin - (chin - top) * 0.62]
        return float(np.median(c)), top, a
    cf, tf, af = axis(F); cb, tb, ab = axis(Bk); top = min(tf, tb)
    def radii(a, c):
        r0 = np.zeros(H); r1 = np.zeros(H)
        for y in range(H):
            x = np.nonzero(a[y])[0]
            if len(x): r0[y] = c - x.min() + 1; r1[y] = x.max() - c + 1
        return r0, r1
    fl, fr = radii(af, cf); bl, br = radii(ab, cb)
    Ro = np.maximum.reduce([fl, fr, bl, br]); Ro = np.maximum(np.convolve(Ro, np.ones(3) / 3, 'same'), 2)
    sc = 100 / float(np.percentile(Ro[chin - (chin - top) // 2:chin - 6] * 2, 70)); xs = np.arange(W, dtype=np.float32) - W / 2; out = []
    pre = lambda A: np.dstack([A[..., :3] * A[..., 3:4] / 255, A[..., 3]]); PF, PB = pre(F), pre(Bk); gx = np.arange(W)
    for yaw in YAWS:
        th = np.radians(yaw); O = np.zeros((H, W, 4), np.float32)
        for y in range(top, chin + 9):
            u = xs / Ro[y]; ok = np.abs(u) <= 1; lon = np.arcsin(np.clip(u, -1, 1)); a1 = lon - th; sn = np.sin(a1); wf = smooth(np.cos(a1), -0.14, 0.14)
            xf = cf + np.where(sn < 0, fl[y], fr[y]) * sn * 0.95; sb = np.sin(a1 - np.pi); xb = cb + np.where(sb < 0, bl[y], br[y]) * sb * 0.95  # each side maps its own silhouette (a touch inside it), so no gap opens at the seam
            s = np.zeros((W, 4), np.float32)
            for ch in range(4): s[:, ch] = np.interp(xf, gx, PF[y, :, ch]) * wf + np.interp(xb, gx, PB[y, :, ch]) * (1 - wf)
            cov = np.maximum(np.interp(xf, gx, PF[y, :, 3]) * (wf > 0.02), np.interp(xb, gx, PB[y, :, 3]) * (wf < 0.98))  # at the seam the opaque side wins, the head stays solid
            s[:, :3] *= (cov / np.maximum(s[:, 3], 1))[:, None]; s[:, 3] = cov
            O[y] = s * ok[:, None]
        al = np.maximum(O[..., 3:4], 1); O[..., :3] = np.clip(O[..., :3] * 255 / al, 0, 255); out.append(Image.fromarray(u8(O), 'RGBA'))
    cells = []
    for im in out:
        s2 = im.resize((max(1, round(W * sc)), max(1, round(H * sc))), Image.LANCZOS); c = Image.new('RGBA', (HW, HH), (0, 0, 0, 0)); c.paste(s2, (round(HW / 2 - W * sc / 2), round(HH - 22 - chin * sc)), s2); cells.append(c)
    return cells, float(sc), (cb - (W - B0.shape[1]) // 2) / B0.shape[1]


def hood_colour(i):
    if i in HOOD: return HOOD[i]
    A = np.array(Image.open(f'{ASSETS}f{i:02d}.png').convert('RGBA')).astype(np.float32); h = A.shape[0]; c = A[int(h * 0.74):int(h * 0.94), 20:-20]
    c = c[c[..., 3] > 200][..., :3]; sat = c.max(1) - c.min(1); return tuple(np.median(c[sat > np.percentile(sat, 40)], 0))


def body_frames():
    """the 6 generic frames normalised to one scale: generic head removed, grey hoodie mask extracted."""
    fr = []
    for T in TURN:
        im = Image.open(f'{V8}turn/{T["f"]}.png').convert('RGBA'); sc = T.get('scale', 1.0) * TS
        A = np.array(im).astype(np.float32); H_, W_ = A.shape[:2]; s3 = A[..., :3]; sat = s3.max(2) - s3.min(2); l = s3.mean(2)
        keep = np.ones((H_, W_), np.float32); yy = np.arange(H_)[:, None]
        grey = (sat < 30) & (l > 75) & (A[..., 3] > 60)
        keep[(yy < T['cut'])[:, 0]] = 0
        keep = np.where((yy < T['cut'] + 16) & ~grey & (yy >= T['cut'] - 16) & (A[..., 0] > A[..., 2] * 1.12), 0, keep)  # neck skin under the removed head
        keep = np.where((yy < T['cut']) & grey & (yy >= T['cut'] - 22), 1, keep)    # hood rim stays
        keep = blur(keep * 255, 0.8) / 255
        hood = ((sat < 30) & (l > 72) & (l < 225)).astype(np.float32)
        ybot = int(T['cut'] + (H_ - T['cut']) * 0.56); hood[ybot:] = 0  # sneakers are grey too
        hood = blur(hood * 255, 0.7) / 255 * (A[..., 3] / 255)
        A[..., 3] *= keep
        G = np.dstack([A, hood * 255]).astype(np.float32)
        ims = [Image.fromarray(u8(G[..., :4]), 'RGBA'), Image.fromarray(u8(G[..., 4]))]
        sz = (round(W_ * sc), round(H_ * sc)); ims = [ims[0].resize(sz, Image.LANCZOS), ims[1].resize(sz, Image.LANCZOS)]
        fr.append((np.array(ims[0]).astype(np.float32), np.array(ims[1]).astype(np.float32) / 255, round(CX - T['base'] * sc), CELL[1] - sz[1] - 2, sc, T))
    return fr


def turn(L):
    n = 12; A = Image.new('RGBA', (CELL[0] * 6, CELL[1] * n), (0, 0, 0, 0)); H_ = Image.new('RGBA', (HW * 9, HH * n), (0, 0, 0, 0)); fr = body_frames(); meta = []
    for i in range(n):
        col = np.array(hood_colour(i), np.float32)
        for j, (rgba, hood, ox, oy, sc, T) in enumerate(fr):
            C = rgba.copy(); lum = C[..., :3].mean(2) / 150  # 150 = the mid grey of the hoodie
            tint = np.clip(col[None, None] * lum[..., None] ** 1.1 * 1.12, 0, 255)
            C[..., :3] = C[..., :3] * (1 - hood[..., None]) + tint * hood[..., None]
            im = Image.fromarray(u8(C), 'RGBA'); cell = Image.new('RGBA', CELL, (0, 0, 0, 0)); cell.paste(im, (ox, oy), im); A.paste(cell, (j * CELL[0], i * CELL[1]))
        cells, sc, ax = head_frames(i)
        for j, c in enumerate(cells): H_.paste(c, (j * HW, i * HH))
        meta.append(dict(sc=round(sc, 4), neck=NECK_B[i], axb=round(ax, 4)))
    A.save(ASSETS + 'turn-bodies.webp', quality=90, method=6, exact=True); H_.save(ASSETS + 'turn-heads.webp', quality=92, method=6, exact=True)
    frames = []
    for rgba, hood, ox, oy, sc, T in fr:
        hx, hy, hw = T['head']; frames.append(dict(head=[round(ox + hx * sc, 1), round(oy + hy * sc, 1), round(hw * sc, 1)], neck=round(oy + T['cut'] * sc, 1)))
    chair_h = 279 * TS  # chair top to wheels, t0 (frame px * TS)
    L['turn'] = dict(bodies='turn-bodies.webp', heads='turn-heads.webp', cell=list(CELL), cx=CX, floor=CELL[1] - 2, chairH=chair_h, head=[HW, HH], headW=100, chinY=HH - 22, yaws=len(YAWS), frames=frames, sprites=meta)
    print('turn atlases', A.size, H_.size)


# ---------- Dashboards (bot14): busts match the f??/w?? format, seated full bodies keep their own scale ----------
def dash(L):
    def alpha_clean(im):
        a = np.array(im).astype(np.float32); r, g, b = a[..., 0], a[..., 1], a[..., 2]; fr = (r > g * 1.25) & (b > g * 1.2) & (a[..., 3] < 250); a[..., 3] = np.where(fr, 0, a[..., 3]); return Image.fromarray(u8(a), 'RGBA')  # magenta key leftovers
    meta = {}
    for f, w in (('dash-front', 138), ('dash-back', 138), ('dash-laptop', 200), ('dash-mug', 212)):
        im = alpha_clean(Image.open(f'{V8}{f}.png').convert('RGBA')); h = round(im.height * w / im.width); s = im.resize((w, h), Image.LANCZOS); s.save(ASSETS + f + '.png', optimize=True); meta[f] = [w, h]
    sp = L['sprites'][:12]
    d = dict(file='dash-back.png', front='dash-front.png', w=138, h=meta['dash-back'][1], dash=True); sp.append(d); L['sprites'] = sp; L['baseSprites'] = 12
    L['dash'] = dict(laptop='dash-laptop.png', mug='dash-mug.png', size=[meta['dash-laptop'], meta['dash-mug']], glow=[0.42, 0.62])
    bot = lambda f: np.nonzero((np.array(Image.open(ASSETS + f))[..., 3] > 128).any(0))[0]
    for s in L['sprites']:
        for f, key_ in ((s['file'], 'hem'), (s['front'], 'hemF')):
            a = np.array(Image.open(ASSETS + f).convert('RGBA'))[..., 3] > 128; h, w = a.shape; rows = a.sum(1); ys = np.nonzero(rows > w * 0.25)[0]; y = int(ys[-1]); band = a[max(0, y - int(h * 0.09)):max(1, y - int(h * 0.03))]; xs = np.nonzero(band.any(0))[0]
            s[key_] = [round(y / h, 4), round((xs.max() - xs.min()) / w, 4), round((xs.max() + xs.min()) / 2 / w, 4)]


# ---------- ferris wheel ----------
def ferris(L):
    im = Image.open(V8 + 'ferris-wheel.png').convert('RGBA'); im.resize((320, 325), Image.LANCZOS).save(ASSETS + 'ferris-wheel.png', optimize=True)
    L['ferris'] = dict(file='ferris-wheel.png', x=0.5453, y=0.4407, d=0.0358, period=90, frames=56)


REMOVE = ['kitchen.png', 'trees-mask.png', 'w12.png', 'f12.png']
if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'plates', 'city', 'room', 'turn', 'dash', 'ferris'}
    orig = BUILD + 'layout-v7.json'
    if not os.path.exists(orig): json.dump(json.load(open(ASSETS + 'layout.json')), open(orig, 'w'))
    if os.path.exists(BUILD + 'layout-v8.json'): L = json.load(open(BUILD + 'layout-v8.json'))
    else: L = json.load(open(orig))
    if 'plates' in want: plates()
    if 'city' in want: city(L)
    if 'room' in want: room(L)
    if 'turn' in want: turn(L)
    if 'dash' in want: dash(L)
    if 'ferris' in want: ferris(L)
    for k in ('kitchen', 'trees'): L.pop(k, None); L['masks'].pop(k, None)
    L['note'] = 'normalised plate coords (0..1) unless noted; rebuilt by bin/preprocess_v8.py'
    json.dump(L, open(BUILD + 'layout-v8.json', 'w'))
    json.dump(L, open(ASSETS + 'layout.json', 'w'), separators=(',', ':'))
    for f in REMOVE:
        if os.path.exists(ASSETS + f): os.remove(ASSETS + f)
    print('layout.json written')
