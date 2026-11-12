#!/usr/bin/env python3
"""Round-2 sources for portable/art/scene.js (grokbot, 2026-11-12, second pass). Run once from the project root; scene.js only composites
what this writes. Needs numpy, Pillow, scipy (no rembg, no cv2).
  python3 portable/art/props_prep2.py
Inputs (portable/art/src/gen/): kitchen-iso.jpg (fridge, stand with the coffee machine, floor lamp on a green key), bookcase.jpg (the tall
walnut bookcase, empty shelves, snack shelf, cabinet, on a green key); bag-*/table-* layers already in src/ (props_prep.py, first pass);
the turning sheet (the office chair from behind). Night versions: the room's own dusk->night light change at the new place, smoothed.
Outputs (portable/art/src/): kitchen2-dusk|night.png, bookcase-dusk|night.png, chair.png, bag-m-dusk|night.png (retuned), props2.json.
Layers are in 3x plate px (the -hi plates); positions in props2.json are plate px."""
import io, json, os, subprocess
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'portable', 'art', 'src'); S = 3
def git_img(path, rev='8bbf915'):
    return Image.open(io.BytesIO(subprocess.check_output(['git', 'show', f'{rev}:{path}'], cwd=ROOT))).convert('RGB')
OD = np.asarray(git_img('public/office2d/art/room/plate-dusk-hi.webp')).astype(np.float32)
ON = np.asarray(git_img('public/office2d/art/room/plate-night-hi.webp')).astype(np.float32)
def blur(a, r):
    return np.stack([ndimage.gaussian_filter(a[..., c], r) for c in range(3)], -1)
RATIO = np.clip((blur(ON, 24) + 4) / (blur(OD, 24) + 4), 0.25, 1.6)
def night_of(rgba, X0, Y0, keep=None):
    """night version of a dusk layer placed at hi px (X0, Y0); keep: a mask of pixels that stay as they are (a lit lamp shade)"""
    h, w = rgba.shape[:2]; ys = np.clip(np.arange(Y0, Y0 + h), 0, RATIO.shape[0] - 1); xs = np.clip(np.arange(X0, X0 + w), 0, RATIO.shape[1] - 1)
    R = RATIO[ys][:, xs]; out = rgba.astype(np.float32).copy(); out[..., :3] = np.clip(out[..., :3] * R, 0, 255)
    if keep is not None: out[keep, :3] = rgba[keep, :3]
    return out.astype(np.uint8)
def key(rgb, lo=25, hi=70):
    """alpha from a green key: how much green beats red and blue; green spill pulled back on the edges"""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]; d = g - np.maximum(r, b)
    a = np.clip(1 - (d - lo) / (hi - lo), 0, 1)
    out = rgb.copy(); spill = g > np.maximum(r, b); out[..., 1] = np.where(spill, np.maximum(r, b) * 0.95 + 0.05 * g, g)
    return out, a
props = {}

# ---- the kitchen: fridge, stand, coffee machine and its neighbours, floor lamp; 1 gen px = 0.188 plate px, feet on the nook's floor line ----
K = np.asarray(Image.open(os.path.join(SRC, 'gen', 'kitchen-iso.jpg')).convert('RGB')).astype(np.float32)
rgb, a = key(K); a[:145, 520:760] = 0   # the steam above the bowl (the viewer draws its own)
a[:, :170] = 0; a[:, 1060:] = 0; a[645:] = 0
a = ndimage.gaussian_filter(a, 0.6)
ks, KX, KY = 0.188, 97 - 184 * 0.188, 566 - 634 * 0.188
W3, H3 = round(K.shape[1] * ks * S), round(K.shape[0] * ks * S)
im = Image.fromarray(np.dstack([rgb, a * 255]).clip(0, 255).astype(np.uint8), 'RGBA').resize((W3, H3), Image.LANCZOS)
arr = np.asarray(im).copy()
X0, Y0 = round(KX * S), round(KY * S)
# the lamp shade stays lit at night
yy, xx = np.mgrid[0:H3, 0:W3]; gx, gy = xx / S / ks, yy / S / ks
shade = (gx > 905) & (gx < 1092) & (gy > 98) & (gy < 240) & (arr[..., 3] > 0)
Image.fromarray(arr).save(os.path.join(SRC, 'kitchen2-dusk.png'), optimize=True)
Image.fromarray(night_of(arr, X0, Y0, shade)).save(os.path.join(SRC, 'kitchen2-night.png'), optimize=True)
mp = lambda gx, gy: [round(KX + gx * ks, 1), round(KY + gy * ks, 1)]
props['kitchen'] = {'at': [round(KX, 3), round(KY, 3)], 'scale': ks, 'size': [W3, H3], 'note': 'src/gen/kitchen-iso.jpg keyed; fridge 97-141, stand 141-234, lamp 241-259'}
props['kitchenSpots'] = {'spout': mp(640, 327), 'tray': mp(0, 369)[1], 'screen': mp(610, 212) + mp(662, 244), 'steam': mp(615, 150), 'lampShade': mp(909, 102) + mp(1087, 235), 'pole': mp(997, 634),
                         'fridge': mp(300, 634), 'machine': mp(640, 634), 'standTop': mp(421, 392)[1], 'wallX': [round(KX + 170 * ks, 1), round(KX + 1060 * ks, 1)]}

# ---- the bookcase: crown and the snack shelf / cabinet at scale, the five empty compartments stretched to reach under the clock ----
B = np.asarray(Image.open(os.path.join(SRC, 'gen', 'bookcase.jpg')).convert('RGB')).astype(np.float32)
brgb, ba = key(B, 30, 80)
BX0, BX1, BT, BC0, BC1, BB = 215, 504, 86, 124, 775, 1186     # bookcase cols, crown top, compartments top/bottom, bottom (gen px)
PX0, PX1, PT, PB = 2, 94, 120, 567                              # where it goes (plate px)
u = (PX1 - PX0) / (BX1 - BX0); crownH, botH = (BC0 - BT) * u, (BB - BC1) * u; compH = (PB - PT) - crownH - botH; st = compH / ((BC1 - BC0) * u)
full = Image.fromarray(np.dstack([brgb, ba * 255]).clip(0, 255).astype(np.uint8), 'RGBA')
Wb = round((PX1 - PX0) * S)
def piece(y0, y1, h): return full.crop((BX0, y0, BX1, y1)).resize((Wb, round(h * S)), Image.LANCZOS)
p1, p2, p3 = piece(BT, BC0, crownH), piece(BC0, BC1, compH), piece(BC1, BB, botH)
case = Image.new('RGBA', (Wb, p1.height + p2.height + p3.height)); case.paste(p1, (0, 0)); case.paste(p2, (0, p1.height)); case.paste(p3, (0, p1.height + p2.height))
carr = np.asarray(case).copy()
Image.fromarray(carr).save(os.path.join(SRC, 'bookcase-dusk.png'), optimize=True)
Image.fromarray(night_of(carr, PX0 * S, PT * S)).save(os.path.join(SRC, 'bookcase-night.png'), optimize=True)
gy2p = lambda g: round(PT + crownH + (g - BC0) * u * st, 1)
boards = [240, 368, 500, 626, 754]                               # the board each row of books stands on (its top, gen px)
tops = [BC0, 255, 383, 515, 644]                                 # each compartment's ceiling
props['bookcase'] = {'rect': [PX0, PT, PX1, PB], 'inner': [round(PX0 + (237 - BX0) * u, 1), round(PX0 + (481 - BX0) * u, 1)], 'shelves': [[gy2p(t), gy2p(b)] for t, b in zip(tops, boards)], 'stretch': round(st, 3)}

# ---- the office chair from behind, as the turning sheet draws it (the rows agree on the chair; the bodies differ) ----
TB = Image.open(os.path.join(ROOT, 'public', 'office2d', 'art', 'bots', 'turning', 'turn-bodies.webp')).convert('RGBA')
L = json.load(open(os.path.join(ROOT, 'public', 'office2d', 'art', 'layout.json')))
cw, ch = L['turn']['cell']; n = TB.size[1] // ch
stck = np.stack([np.asarray(TB.crop((0, r * ch, cw, (r + 1) * ch))).astype(np.float32) for r in range(n)])
med = np.median(stck, 0); agree = (np.abs(stck[..., :3] - med[None, ..., :3]).mean(-1) < 22).mean(0); solid = (stck[..., 3] > 128).mean(0)
crgb = med[..., :3]; lum = crgb @ [0.3, 0.59, 0.11]; chroma = crgb.max(-1) - crgb.min(-1)
yy, xx = np.mgrid[0:ch, 0:cw]
keep = (agree > 0.7) & (solid > 0.85) & (lum < 110) & (chroma < 40)
keep &= ~((yy > 192) & (yy < 222) & (np.abs(xx - 81) > 7))      # the sitter's trousers and shoes under the seat: only the gas column stays
keep = ndimage.binary_opening(keep, iterations=1)
lab, nl = ndimage.label(keep); sizes = ndimage.sum(keep, lab, range(1, nl + 1)); keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 25])
alpha = ndimage.gaussian_filter(keep.astype(np.float32), 0.5)
chair = np.zeros((ch, cw, 4), np.uint8); chair[..., :3] = crgb.clip(0, 255).astype(np.uint8); chair[..., 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(chair).save(os.path.join(SRC, 'chair.png'), optimize=True)
# the backrest outline (cell px): per row, the run of chair pixels through the backrest's middle, down to the seat
top = int(np.where(keep.any(1))[0][0]); mid = 74
filled = ndimage.binary_fill_holes(ndimage.binary_closing(keep, iterations=2))
left, right = [], []
for y in range(top, top + 96):
    row = filled[y]
    if not row[mid]: continue
    x0 = mid; x1 = mid
    while x0 > 0 and row[x0 - 1]: x0 -= 1
    while x1 < cw - 1 and row[x1 + 1]: x1 += 1
    left.append([x0, y]); right.append([x1 + 1, y])
pts = left[::3] + [left[-1]] + [right[-1]] + right[::-1][::3]
props['chair'] = {'file': 'chair.png', 'cell': [cw, ch], 'cx': L['turn']['cx'], 'floor': L['turn']['floor'], 'chairH': L['turn']['chairH'], 'top': top, 'back': pts}

# ---- the mustard bean bag: a warmer mustard (the first pass read lemon yellow) ----
for k in ['dusk', 'night']:
    p = os.path.join(SRC, f'bag-m-{k}.png'); im = Image.open(p).convert('RGBA'); a4 = np.asarray(im).copy()
    hsv = np.asarray(im.convert('RGB').convert('HSV')).astype(np.float32); body = a4[..., 3] > 0
    if not os.path.exists(p + '.orig'): im.save(p + '.orig', 'PNG')
    hsv0 = np.asarray(Image.open(p + '.orig').convert('RGB').convert('HSV')).astype(np.float32)
    hm = np.median(hsv0[..., 0][body]); h = np.where(body, (hsv0[..., 0] + (21 - hm)) % 256, hsv0[..., 0]); s = np.where(body, np.clip(hsv0[..., 1] * 1.02, 0, 255), hsv0[..., 1]); v = np.where(body, np.clip(hsv0[..., 2] * 0.9, 0, 255), hsv0[..., 2])
    rgbm = np.asarray(Image.merge('HSV', [Image.fromarray(c.astype(np.uint8)) for c in (h, s, v)]).convert('RGB'))
    a4[..., :3] = rgbm; Image.fromarray(a4).save(p, optimize=True)
old = json.load(open(os.path.join(SRC, 'props.json')))
for kk in ['bag-r', 'bag-b', 'bag-m', 'table']: props[kk] = old[kk]
json.dump(props, open(os.path.join(SRC, 'props2.json'), 'w'), indent=1)
print(json.dumps({k: (v if k != 'chair' else {**v, 'back': len(v['back'])}) for k, v in props.items()}))
