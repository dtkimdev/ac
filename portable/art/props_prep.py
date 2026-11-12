#!/usr/bin/env python3
"""Round-2 sources for portable/art/scene.js (grokbot, 2026-11-12). Run once; scene.js only composites what this writes.
  python3 portable/art/props_prep.py            (needs numpy, Pillow, rembg; run from the project root)
Inputs: portable/art/src/gen/kitchen.jpg (a generated redraw of the kitchen corner, 1024 px = plate 300 px),
        portable/art/src/gen/lounge.jpg (generated bean bags + coffee table on grey), the turning sheet (for the office chair),
        and the dusk/night plates of commit 8bbf915 (only for the night light: night = dusk x blur(old night)/blur(old dusk)).
Outputs (portable/art/src/): kitchen-dusk.png, kitchen-night.png, bag-r|bag-b|bag-m|table-dusk|night.png, chair.png, props.json.
All layers are in 3x plate px (the -hi plates), placed by props.json rects (plate px)."""
import io, json, os, subprocess
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SRC = os.path.join(ROOT, 'portable', 'art', 'src'); S = 3
def git_img(path, rev='8bbf915'):
    return Image.open(io.BytesIO(subprocess.check_output(['git', 'show', f'{rev}:{path}'], cwd=ROOT))).convert('RGB')
OD = np.asarray(git_img('public/office2d/art/room/plate-dusk-hi.webp')).astype(np.float32)
ON = np.asarray(git_img('public/office2d/art/room/plate-night-hi.webp')).astype(np.float32)
def blur(a, r):
    return np.stack([np.asarray(Image.fromarray(np.clip(a[..., c], 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(r))).astype(np.float32) for c in range(3)], -1)
def night_of(rgba, x0, y0):
    """night version of a dusk layer placed at hi px (x0, y0): the old plates' own dusk->night light change, smoothed"""
    h, w = rgba.shape[:2]; X0, Y0 = max(0, x0), max(0, y0)
    d = np.zeros((h, w, 3), np.float32); n = np.zeros((h, w, 3), np.float32)
    hh = min(h - (Y0 - y0), OD.shape[0] - Y0); ww = min(w - (X0 - x0), OD.shape[1] - X0)
    d[Y0 - y0:Y0 - y0 + hh, X0 - x0:X0 - x0 + ww] = OD[Y0:Y0 + hh, X0:X0 + ww]; n[Y0 - y0:Y0 - y0 + hh, X0 - x0:X0 - x0 + ww] = ON[Y0:Y0 + hh, X0:X0 + ww]
    for a in (d, n):  # columns off the picture: copy the nearest one
        if X0 > x0: a[:, :X0 - x0] = a[:, X0 - x0:X0 - x0 + 1]
    R = np.clip((blur(n, 20) + 4) / (blur(d, 20) + 4), 0.25, 1.6)
    out = rgba.copy().astype(np.float32); out[..., :3] = np.clip(out[..., :3] * R, 0, 255)
    return out.astype(np.uint8)
props = {}

# ---- kitchen corner: generated redraw, 1024 px = 300 plate px, placed at plate (-8, 290) so its window mullion meets the painted one ----
K = Image.open(os.path.join(SRC, 'gen', 'kitchen.jpg')).convert('RGB'); G = K.size[0]; sc = 300 / G; KX, KY = -8, 290
m = Image.new('L', K.size, 0); d = ImageDraw.Draw(m)
d.polygon([(0, 0), (372, 0), (372, 330), (754, 330), (754, 942), (318, 942), (318, 967), (0, 967)], fill=255)  # wall + shelf + fridge + stand (window glass above y 330 stays painted)
d.polygon([(754, 660), (783, 660), (797, 700), (797, 942), (754, 942)], fill=255)                            # the stand's right end, in front of the mullion
d.polygon([(742, 436), (852, 436), (883, 567), (711, 567)], fill=255); d.ellipse((711, 559, 883, 575), fill=255); d.ellipse((742, 430, 852, 443), fill=255)  # lamp shade
d.rectangle((794, 566, 806, 884), fill=255); d.ellipse((779, 870, 847, 916), fill=255)                         # lamp pole and foot
m = m.filter(ImageFilter.GaussianBlur(1.6))
top = Image.new('L', K.size, 255); td = ImageDraw.Draw(top)
for y in range(0, 40): td.line((0, y, G, y), fill=int(255 * y / 40))                                          # soft top edge into the painted wall
for y in range(330, 372): td.line((372, y, 754, y), fill=int(255 * (y - 330) / 42))                          # and into the painted plant behind the machine
td.rectangle((372, 0, G, 329), fill=0)
m = Image.fromarray((np.asarray(m, np.float32) * np.asarray(top, np.float32) / 255).astype(np.uint8))
W3 = round(G * sc * S); kd = Image.merge('RGBA', (*K.split(), m)).resize((W3, W3), Image.LANCZOS)
a = np.asarray(kd); x0, y0 = KX * S, KY * S
Image.fromarray(a).save(os.path.join(SRC, 'kitchen-dusk.png'), optimize=True)
Image.fromarray(night_of(a, x0, y0)).save(os.path.join(SRC, 'kitchen-night.png'), optimize=True)
props['kitchen'] = {'rect': [KX, KY, KX + 300, KY + 300], 'note': 'generated redraw of the kitchen corner (src/gen/kitchen.jpg), masked to the wall, shelf, fridge, stand and lamp'}
mp = lambda gx, gy: [round(gx * sc + KX, 1), round(gy * sc + KY, 1)]
props['kitchenSpots'] = {'spout': mp(510, 620), 'tray': mp(0, 660)[1], 'screen': mp(497, 503) + mp(540, 540), 'steam': mp(463, 425), 'lamp': mp(797, 503), 'lampShade': mp(711, 436) + mp(883, 575), 'pole': mp(800, 893)}

# ---- lounge: the generated bean bags and table cut out, fitted into the boxes of the painted ones (their masks keep their rects) ----
from rembg import remove, new_session
Lg = Image.open(os.path.join(SRC, 'gen', 'lounge.jpg')).convert('RGB')
cut = np.asarray(remove(Lg, session=new_session('isnet-general-use')))
al = cut[..., 3] > 40
cols = np.where(al.any(0))[0]; groups = np.split(cols, np.where(np.diff(cols) > 6)[0] + 1)
boxes = []
for gcol in groups:
    xs0, xs1 = gcol[0], gcol[-1] + 1; rows = np.where(al[:, xs0:xs1].any(1))[0]; boxes.append((xs0, rows[0], xs1, rows[-1] + 1))
assert len(boxes) == 4, boxes
L = json.load(open(os.path.join(ROOT, 'public', 'office2d', 'art', 'layout.json')))
def lab_shift(rgb, mask, hue_to=None, sat=1.0, light=1.0):
    from PIL import ImageCms
    im = Image.fromarray(rgb).convert('HSV'); h, s, v = [np.asarray(c).astype(np.float32) for c in im.split()]
    if hue_to is not None:
        hm = np.median(h[mask]); h = np.where(mask, (h + (hue_to - hm)) % 256, h)
    s = np.where(mask, np.clip(s * sat, 0, 255), s); v = np.where(mask, np.clip(v * light, 0, 255), v)
    return np.asarray(Image.merge('HSV', [Image.fromarray(c.astype(np.uint8)) for c in (h, s, v)]).convert('RGB'))
tune = {'bag-r': dict(), 'bag-b': dict(hue_to=158, sat=1.25, light=1.18), 'bag-m': dict(hue_to=30, sat=0.97, light=1.02), 'table': dict()}
for name, (bx0, by0, bx1, by1) in zip(['bag-r', 'bag-b', 'bag-m', 'table'], boxes):
    r = L['masks'][name]; px0, py0, px1, py1 = r[0] * 1280, r[1] * 720, r[2] * 1280, r[3] * 720
    piece = cut[by0:by1, bx0:bx1].copy(); body = piece[..., 3] > 128
    if tune[name]: piece[..., :3] = lab_shift(piece[..., :3], body, **tune[name])
    if name == 'bag-r': piece = piece[:, ::-1].copy()                                                     # leans the other way, like the painted one
    W, H = round((px1 - px0) * S), round((py1 - py0) * S)
    im = Image.fromarray(piece).resize((W, H), Image.LANCZOS); a = np.asarray(im).copy()
    a[..., 3] = np.where(a[..., 3] > 200, 255, a[..., 3])
    X0, Y0 = round(px0 * S), round(py0 * S)
    Image.fromarray(a).save(os.path.join(SRC, f'{name}-dusk.png'), optimize=True)
    Image.fromarray(night_of(a, X0, Y0)).save(os.path.join(SRC, f'{name}-night.png'), optimize=True)
    props[name] = {'rect': [round(px0, 2), round(py0, 2), round(px1, 2), round(py1, 2)]}
gx = lambda name, fx, fy: [round(props[name]['rect'][0] + fx * (props[name]['rect'][2] - props[name]['rect'][0]), 1), round(props[name]['rect'][1] + fy * (props[name]['rect'][3] - props[name]['rect'][1]), 1)]

# ---- the office chair from behind, exactly as the turning sheet draws it (same pixels in every row: the median of the rows' back cells) ----
from scipy import ndimage
TB = Image.open(os.path.join(ROOT, 'public', 'office2d', 'art', 'bots', 'turning', 'turn-bodies.webp')).convert('RGBA')
cw, ch = L['turn']['cell']; n = TB.size[1] // ch
st = np.stack([np.asarray(TB.crop((0, r * ch, cw, (r + 1) * ch))).astype(np.float32) for r in range(n)])
med = np.median(st, 0); agree = (np.abs(st[..., :3] - med[None, ..., :3]).mean(-1) < 18).mean(0); solid = (st[..., 3] > 128).mean(0)
rgb = med[..., :3]; lum = rgb @ [0.3, 0.59, 0.11]; chroma = rgb.max(-1) - rgb.min(-1)
yy, xx = np.mgrid[0:ch, 0:cw]
keep = (agree > 0.8) & (solid > 0.9) & (lum < 62) & (chroma < 26)
keep &= ~((yy > 192) & (yy < 219) & (np.abs(xx - 81) > 6))  # the sitter's trousers and shoes under the seat: only the gas column stays
keep = ndimage.binary_opening(keep, iterations=1)
lab, nl = ndimage.label(keep); sizes = ndimage.sum(keep, lab, range(1, nl + 1)); keep = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 25])
chair = np.zeros((ch, cw, 4), np.uint8); chair[..., :3] = rgb.astype(np.uint8); chair[..., 3] = np.where(keep, med[..., 3], 0).astype(np.uint8)
Image.fromarray(chair).save(os.path.join(SRC, 'chair.png'), optimize=True)
# the backrest outline (cell px): what covers the sitting bot from behind
ys = np.where(keep.any(1))[0]; top = ys[0]
back = keep.copy(); back[top + 112:] = False
import cv2
cs, _ = cv2.findContours(ndimage.binary_closing(back, iterations=2).astype(np.uint8), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
c = max(cs, key=cv2.contourArea); c = cv2.approxPolyDP(c, 1.2, True)[:, 0]
props['chair'] = {'file': 'chair.png', 'cell': [cw, ch], 'cx': L['turn']['cx'], 'floor': L['turn']['floor'], 'chairH': L['turn']['chairH'], 'top': int(top), 'back': c.tolist()}
json.dump(props, open(os.path.join(SRC, 'props.json'), 'w'), indent=1)
print(json.dumps({k: (v if k != 'chair' else {**v, 'back': len(v['back'])}) for k, v in props.items()}))
