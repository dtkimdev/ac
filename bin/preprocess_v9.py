#!/usr/bin/env python3
"""v9 asset pipeline (Pillow + numpy + scipy, idempotent, no AI). Writes to the STAGE only; bin/v9-promote.sh copies stage -> live.
Inputs:  design/v8/turn/*.png, the bot busts w??/f??.png, the live layout.json. Outputs under design/v9/stage/public/office2d/assets/.
Usage:   bin/preprocess_v9.py [turn] [boats] [layout]   (no argument = all). Run preprocess_v8.py no more: it would bring the Ferris wheel and the old monitor quads back.
turn: every head in the turn atlas is real painted art, never a warped face: t0 = the bot's back bust, t4 = its front bust, t1/t2/t3/chat = the
painted head of that turn frame with the bot's own hat (cut from its busts), long hair, headphones. Dome and brim of a cap are separate layers, so a
profile gets a true profile brim. Sheets for review land in design/v9/turn/."""
import json, os, sys
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ni

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
STAGE = f'{ROOT}/design/v9/stage/public/office2d/assets/'; TURN8 = f'{ROOT}/design/v8/turn/'; OUT = f'{ROOT}/design/v9/turn/'
N = 12
CS = 0.75                  # head atlas px per frame px
HW, HH, AX, AY = 220, 232, 110, 168  # head cell + neck anchor in it
BS = 1.42                  # frame px per bust px: fits a bust hat onto the painted heads
FINAL = 0.78               # seats draw busts at ts * FINAL * sprite.sc: every head keeps that size
CAN = 460; CX0, CY0 = 230, 340  # working canvas (frame px): the anchor sits at (CX0, CY0)
KIND = {0: 'cap', 1: 'beanie', 2: 'cap', 3: 'beanie', 4: 'beret', 5: 'cap', 6: 'beanie', 7: 'cap', 8: 'beanie', 9: 'cap', 10: 'beanie', 11: 'cap'}
PHONES = {0: ((42, 42, 48), (70, 72, 82)), 9: ((44, 40, 48), (232, 62, 112))}  # shell, ring
LONG = {4, 6, 9}
HEAD_CHIN = [137, 142, 135, 138, 133, 134, 150, 158, 135, 134, 140, 140]  # front busts: chin row (design v8)
NECK_B = [112, 120, 108, 112, 124, 115, 122, 104, 106, 124, 110, 105]     # back busts: row where hair/cap meets the hoodie (design v8)


def rgba(p): return np.array(Image.open(p).convert('RGBA')).astype(np.float32)
def toim(a): return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8), 'RGBA')
def pre(a):
    o = a.copy(); o[..., :3] *= a[..., 3:4] / 255; return o
def un(a):
    o = a.copy(); o[..., :3] = np.clip(a[..., :3] * 255 / np.maximum(a[..., 3:4], 1e-3), 0, 255); return o
def over(dst, src):
    s, d = pre(src), pre(dst); return un(s + d * (1 - s[..., 3:4] / 255))
def blank(): return np.zeros((CAN, CAN, 4), np.float32)
def affine(a, sc, dx, dy, rot=0.0, c=(0, 0), sx=1.0):
    """canvas image of a: dst = R(rot) * scale(sc * sx, sc) * (src - c) + (dx, dy)"""
    p = pre(a); th = np.radians(rot); ca, sa = np.cos(th), np.sin(th); isx, isy = 1 / (sc * sx), 1 / sc
    A, B, D, E = ca * isx, sa * isx, -sa * isy, ca * isy
    m = (A, B, c[0] - A * dx - B * dy, D, E, c[1] - D * dx - E * dy)
    return un(np.clip(np.dstack([np.array(Image.fromarray(p[..., k], 'F').transform((CAN, CAN), Image.AFFINE, m, Image.BICUBIC)) for k in range(4)]), 0, 255))


# ---------- cutting the busts ----------
def skin_hair(F):
    c = F[..., :3]; r, g, b = c[..., 0], c[..., 1], c[..., 2]; lum = c.mean(2)
    skin = (r > 170) & (g > 110) & (b > 70) & (r > g * 1.15) & (g > b * 1.12) & (b > g * 0.52) & (r - b > 60) & (r - b < 150)
    hair = (lum < 80) & (r >= g * 1.06) & (g >= b * 0.98) & (r < 120) & (F[..., 3] > 128)
    return skin, hair
def largest(m):
    lab, n = ni.label(m)
    return lab == (1 + np.argmax(ni.sum(m, lab, range(1, n + 1)))) if n else m
def cut_hat(F, stop, limit, min_area=30, open_end=0):
    """everything above the first hair/skin pixel of each column: the hat (and whatever sits on it)"""
    a = F[..., 3] > 100; M = np.zeros(F.shape[:2], bool)
    for x in range(F.shape[1]):
        idx = np.nonzero(stop[:limit, x])[0]; lim = idx[0] if len(idx) else open_end; M[:lim, x] = a[:lim, x]
    M = ni.binary_opening(M, iterations=1); lab, n = ni.label(M)
    M = np.isin(lab, [j + 1 for j, s in enumerate(ni.sum(M, lab, range(1, n + 1))) if s > min_area])
    return M
def hat_front(i):
    F = rgba(f'{STAGE}f{i:02d}.png'); skin, hair = skin_hair(F)
    if i == 8: hair = hair & (F[..., :3].mean(2) < 62)  # brown beanie: only the real hair stops the scan
    face = largest(ni.binary_opening(skin, iterations=2)); ys, xs = np.nonzero(face); fy0, fy1, fx0, fx1 = ys.min(), ys.max(), xs.min(), xs.max()
    stop = ni.binary_opening(skin | hair, iterations=1); lab, _ = ni.label(stop); stop = lab == lab[(fy0 + fy1) // 2, (fx0 + fx1) // 2]
    M = cut_hat(F, stop, fy1)
    band = None
    if i in PHONES:  # headphones: keep only the hat colour, the band is painted per pose
        sel = F[M]; c = sel[:, :3]; sat = c.max(1) - c.min(1); col = np.median(c[sat >= np.percentile(sat, 70)], 0); cc = F[..., :3]
        d = np.sqrt((((cc / (cc.sum(2, keepdims=True) + 1)) - col / col.sum()) ** 2).sum(2)); M = M & (d < 0.13); M[fy0 + 8:] = False; M = ni.binary_fill_holes(largest(ni.binary_closing(M, iterations=2)))
    H = F.copy(); H[..., 3] = ni.gaussian_filter(M.astype(np.float32), 0.6) * F[..., 3]
    ys, xs = np.nonzero(M); return H, dict(cx=float(np.median(xs)), y1=int(ys.max()), x0=int(xs.min()), x1=int(xs.max()), y0=int(ys.min()), face=(int(fy0), int(fy1), int(fx0), int(fx1)), stop=stop, F=F, hair=hair)
def hat_back(i):
    W = rgba(f'{STAGE}w{i:02d}.png'); _, hair = skin_hair(W)
    if i == 8: hair = hair & (W[..., :3].mean(2) < 62)
    hair = ni.binary_opening(hair, iterations=2); lab, n = ni.label(hair); ids = [j + 1 for j, s in enumerate(ni.sum(hair, lab, range(1, n + 1))) if s > 150]
    big = lab == max(ids, key=lambda j: ni.center_of_mass(lab == j)[0])  # the hair under the hat, not the bun on top
    M = cut_hat(W, big, NECK_B[i] + 4, open_end=NECK_B[i] - 2)
    H = W.copy(); H[..., 3] = ni.gaussian_filter(M.astype(np.float32), 0.6) * W[..., 3]
    ys, xs = np.nonzero(M); return H, dict(cx=float(np.median(xs)), y1=int(ys.max()), W=W, big=big, M=M)
def split_cap(H, info, T=15, phones=False):
    """cap -> solid dome (front hole + brim area repainted from the dome's own colours, flared brim tips trimmed by an ellipse) + brim crescent"""
    a = H[..., 3]; low = np.array([np.nonzero(a[:, x] > 90)[0].max() if (a[:, x] > 90).any() else -1 for x in range(a.shape[1])], np.float32)
    low = ni.gaussian_filter1d(ni.median_filter(low, 7), 2.0); yy = np.arange(a.shape[0], dtype=np.float32)[:, None]
    seam = (low - T)[None, :]; brim_w = np.clip(yy - seam + 0.5, 0, 1); dome_w = 1 - brim_w
    Br = H.copy(); Br[..., 3] = a * brim_w; D = H.copy()
    c = H[..., :3]; lum = c.mean(2); solid = a > 200; ref = np.median(lum[solid & (dome_w > 0.5)])
    hole = ni.binary_dilation(solid & (lum < ref * 0.62) & (dome_w > 0.5), iterations=2) & ni.binary_erosion(solid, iterations=3)
    dark = ni.binary_dilation(solid & (lum < ref * 0.62), iterations=2) & ni.binary_erosion(solid, iterations=4)
    if dark.any():  # the painted hole dips into the brim: the crescent is solid too
        ib = ni.distance_transform_edt(dark, return_distances=False, return_indices=True)
        for k in range(3): Br[..., k] = np.where(dark, ni.gaussian_filter(c[..., k][ib[0], ib[1]], 1.2), c[..., k])
    fill = hole | (brim_w > 0.02) | (a < 200)
    idx = ni.distance_transform_edt(fill, return_distances=False, return_indices=True)
    for k in range(3):
        f = ni.gaussian_filter(c[..., k][idx[0], idx[1]], 2.0); D[..., k] = np.where(fill, f, c[..., k])
    cx = info['cx']; xs = np.arange(a.shape[1], dtype=np.float32)[None, :]; sy = float(low[int(cx)] - T)
    row = int(sy); on = np.nonzero(a[row] > 120)[0]; W = (on.max() - on.min()) / 2 + 1; h = T + 14
    wy = W * np.sqrt(np.clip(1 - (np.maximum(yy - sy, 0) / h) ** 2, 0, 1)); D[..., 3] = a * np.clip(wy - np.abs(xs - cx) + 0.5, 0, 1)
    return D, Br, low
def brim_colours(Br):
    a = Br[..., 3] > 180; c = Br[..., :3][a]; l = c.mean(1)
    return np.median(c[l > np.percentile(l, 70)], 0), np.median(c[(l > np.percentile(l, 25)) & (l < np.percentile(l, 60))], 0), np.median(c[l < np.percentile(l, 15)], 0)


# ---------- painting small parts (4x supersampled) ----------
SS = 4
def layer(draw):
    im = Image.new('RGBA', (CAN * SS, CAN * SS), (0, 0, 0, 0)); draw(ImageDraw.Draw(im), im); return np.array(im.resize((CAN, CAN), Image.LANCZOS)).astype(np.float32)
def bez(p0, p1, p2, n=24): return [((1 - t) ** 2 * p0[0] + 2 * t * (1 - t) * p1[0] + t * t * p2[0], (1 - t) ** 2 * p0[1] + 2 * t * (1 - t) * p1[1] + t * t * p2[1]) for t in np.linspace(0, 1, n)]
def side_brim(root, tip, root2, cols):
    """profile brim: a curved wedge from the cap's forehead to its tip; lit top face, thin shadow edge under it"""
    hi, mid, lo = cols
    top = bez(root, ((root[0] + tip[0]) * 0.52, root[1] - 5), tip); und = bez(tip, ((root2[0] + tip[0]) * 0.54, tip[1] + 7), root2)
    def d(g, im):
        s = lambda P, ox=0, oy=0: [((x + ox) * SS, (y + oy) * SS) for x, y in P]
        g.polygon(s(top + und, 0, 3.2), fill=tuple(int(v) for v in lo) + (255,))
        g.polygon(s(top + und), fill=tuple(int(v) for v in mid) + (255,))
        cres = bez(root, ((root[0] + tip[0]) * 0.52, root[1] - 5), tip) + bez(tip, ((root[0] + tip[0]) * 0.55, root[1] + 2.5), (root[0] + 2, root[1] + 3))
        g.polygon(s(cres), fill=tuple(int(v) for v in hi) + (255,))
    return ni_soft(layer(d))
def three_q_brim(cx, cy, cols):
    """3/4 brim: a crescent swung towards the look direction, lit top face + underside"""
    hi, mid, lo = cols; l, r = (cx - 46, cy + 2), (cx + 68, cy + 12); top = bez(l, (cx + 12, cy - 10), r); und = bez(r, (cx + 20, cy + 27), l)
    def d(g, im):
        s = lambda P, ox=0, oy=0: [((x + ox) * SS, (y + oy) * SS) for x, y in P]
        g.polygon(s(top + und, 0, 3), fill=tuple(int(v) for v in lo) + (255,)); g.polygon(s(top + und), fill=tuple(int(v) for v in mid) + (255,))
        g.polygon(s(top + bez(r, (cx + 14, cy + 9), l)), fill=tuple(int(v) for v in hi) + (255,))
    return ni_soft(layer(d))
def ni_soft(a, r=0.5):
    p = pre(a); return un(np.dstack([ni.gaussian_filter(p[..., k], r) for k in range(4)]))
def phone_layer(cx, cy, rx, ry, shell, ring, band=None, tilt=0, sp=0.62):
    """ear cup with a soft lit edge + cushion; band = bezier (p0, p1, p2) over the hat"""
    def d(g, im):
        B = lambda x0, y0, x1, y1: [x0 * SS, y0 * SS, x1 * SS, y1 * SS]
        if band:
            pts = bez(*band, n=40)
            for w, col in ((7.0, tuple(int(v * 0.55) for v in shell)), (5.2, shell), (1.6, (120, 122, 134))):
                g.line([(x * SS, (y - (0.8 if w < 2 else 0)) * SS) for x, y in pts], fill=tuple(col) + (255,), width=int(w * SS), joint='curve')
        g.ellipse(B(cx - rx - 2, cy - ry - 2, cx + rx + 2, cy + ry + 2), fill=tuple(int(v * 0.6) for v in shell) + (255,))
        g.ellipse(B(cx - rx, cy - ry, cx + rx, cy + ry), fill=tuple(shell) + (255,))
        g.ellipse(B(cx - rx * sp, cy - ry * sp, cx + rx * sp, cy + ry * sp), fill=tuple(ring) + (255,))
        g.ellipse(B(cx - rx * 0.36, cy - ry * 0.36, cx + rx * 0.36, cy + ry * 0.36), fill=tuple(int(v * 0.5) for v in shell) + (255,))
        g.arc(B(cx - rx + 2, cy - ry + 2, cx + rx - 2, cy + ry - 2), 190, 300, fill=(150, 152, 165, 200), width=int(1.6 * SS))
    return ni_soft(layer(d), 0.4)


# ---------- the painted heads of the turn frames ----------
GEN = dict(t1=dict(f='t1-3q-back', sc=1.0, hx=92, neck=128, chin=150), t2=dict(f='t2-side', sc=1.0, hx=82, neck=132, chin=148),
           t3=dict(f='t3-3q-front', sc=1.0, hx=91, neck=148, chin=152, oval=(91, 75, 74, 80)), chat=dict(f='chat-right', sc=0.64, hx=152 * 0.64, neck=185 * 0.64, chin=199 * 0.64, oval=(99, 68, 66, 66)))
def gen_head(k):
    P = GEN[k]; im = Image.open(f'{TURN8}{P["f"]}.png').convert('RGBA')
    if P['sc'] != 1.0: im = im.resize((round(im.width * P['sc']), round(im.height * P['sc'])), Image.LANCZOS)
    G = np.array(im).astype(np.float32); c = G[..., :3]; sat = c.max(2) - c.min(2); l = c.mean(2)
    grey = ni.binary_dilation((sat < 26) & (l > 70), iterations=1); m = (G[..., 3] > 30) & ~grey; m[int(P['chin']):] = False
    m = ni.binary_closing(largest(m), iterations=2)
    if 'oval' in P:  # no chair or hoodie shadow in the head layer
        ox, oy, rx, ry = P['oval']; yy, xx = np.mgrid[:m.shape[0], :m.shape[1]]; m &= ((xx - ox) / rx) ** 2 + ((yy - oy) / ry) ** 2 < 1
    G[..., 3] = np.minimum(G[..., 3], ni.gaussian_filter(m.astype(np.float32), 0.6) * 255)
    return affine(G, 1.0, CX0, CY0, 0, (P['hx'], P['neck']))
GENC = {}
def hat_line_erase(Gc, top_layer, keep=5):
    """the painted hair goes where the hat sits: all rows above the lower edge of the hat"""
    a = top_layer[..., 3] > 60; low = np.array([np.nonzero(a[:, x])[0].max() if a[:, x].any() else -1 for x in range(CAN)], np.float32)
    low = ni.median_filter(low, 7); xs = np.nonzero(low >= 0)[0]; out = Gc.copy(); yy = np.arange(CAN, dtype=np.float32)[:, None]
    # columns outside the hat keep the height of the hat's end, sloped down: hair never pokes out above the brim line
    ll = low.copy(); l0, l1 = xs.min(), xs.max(); ll[:l0] = low[l0] + 4; ll[l1 + 1:] = low[l1] + 4; ll = ni.gaussian_filter1d(ll, 3.0)
    out[..., 3] *= np.clip(yy - (ll - keep)[None, :], 0, 1); return out
def long_hair(i, I, B, pose):
    """hair below the hat from the busts, under the head"""
    if pose in ('t3', 'chat'):
        F = I['F']; m = I['hair'].copy(); fy0, fy1, fx0, fx1 = I['face']; m[:fy0 - 16] = False; yy, xx = np.mgrid[:m.shape[0], :m.shape[1]]
        m &= (xx < fx0 + 6) | (xx > fx1 - 6) | (yy > fy1 - 2); m[fy1 + 40:] = False; A = F.copy()
    else:
        W = B['W']; m = B['big'] & ~B['M']; A = W.copy()
    m = largest(ni.binary_closing(m, iterations=1)) if pose not in ('t3', 'chat') else ni.binary_closing(m, iterations=1)
    A[..., 3] = ni.gaussian_filter(m.astype(np.float32), 0.7) * A[..., 3]; return A


def compose(i, pose, I, B, H, Hb):
    Gc = GENC.setdefault(pose, gen_head(pose)); kind = KIND[i]
    hatc = (I['cx'], I['y1'] - 4); bg = blank()
    # hat placement on each painted head: (x, y of the hat's lower centre, rotation) in canvas px from the anchor
    X = lambda v: CX0 + v; Y = lambda v: CY0 + v
    if pose == 't1':
        hc = (B['cx'], B['y1'] - 3); top = affine(Hb, BS, X(-6), Y(-46), -2, hc)
        G2 = hat_line_erase(Gc, top, 3); out = over(G2, top)
        if i in LONG: out = over(affine(long_hair(i, I, B, pose), BS, X(-16), Y(-46), 0, (B['cx'], B['y1'])), out)
        if i in PHONES: out = over(out, phone_layer(X(40), Y(-30), 17, 24, *PHONES[i]))
        return out
    if pose == 't2':
        if kind == 'cap':
            D, Br, _ = split_cap(H, I, phones=i in PHONES); top = affine(D, BS, X(0), Y(-48), -7, hatc)
            G2 = hat_line_erase(Gc, top, 4); cols = brim_colours(Br)
            brim = side_brim((X(40), Y(-68)), (X(90), Y(-50)), (X(34), Y(-55)), cols)
            out = over(over(G2, top), brim)
        else:
            top = affine(H, BS, X(0), Y(-48), -8, hatc); out = over(hat_line_erase(Gc, top, 4), top)
        if i in LONG: out = over(affine(long_hair(i, I, B, pose), BS, X(-26), Y(-48), 0, (B['cx'], B['y1'])), out)
        if i in PHONES: out = over(out, phone_layer(X(-3), Y(-34), 20, 26, *PHONES[i], band=((X(-3), Y(-58)), (X(-4), Y(-105)), (X(4), Y(-140)))))
        return out
    dx, dy, rot = dict(t3=(8, -74, 1), chat=(2, -66, 2))[pose]
    if kind == 'cap':
        D, Br, _ = split_cap(H, I, phones=i in PHONES); dome = affine(D, BS, X(dx), Y(dy), rot, hatc); brim = three_q_brim(X(dx), Y(dy - 17), brim_colours(Br))
        top = over(dome, brim); G2 = hat_line_erase(Gc, top, 5); out = over(over(G2, dome), brim)
    else:
        top = affine(H, BS, X(dx), Y(dy), rot, hatc); out = over(hat_line_erase(Gc, top, 5), top)
    if i in LONG: out = over(affine(long_hair(i, I, B, pose), BS, X(dx - 4), Y(dy), rot, hatc), out)
    if i in PHONES: out = over(out, phone_layer(X(-48), Y(-40 if pose == 't3' else -36), 13, 25, *PHONES[i], band=((X(-48), Y(-60)), (X(-2), Y(-232)), (X(62), Y(-78)))))
    return out


def exact(i, front, I):
    """t0 / t4: the bust's own head, untouched, neck on the anchor"""
    F = rgba(f'{STAGE}{"f" if front else "w"}{i:02d}.png')
    if front:
        chin = HEAD_CHIN[i]; F[..., 3] *= np.clip((chin + 7 - np.arange(F.shape[0], dtype=np.float32)) / 6, 0, 1)[:, None]; ny = chin
    else:
        ny = NECK_B[i] + 2; F[..., 3] *= np.clip((ny + 6 - np.arange(F.shape[0], dtype=np.float32)) / 5, 0, 1)[:, None]
    a = F[..., 3] > 90; rows = np.nonzero(a.any(1))[0]; ys = rows[(rows > rows[0] + (rows[-1] - rows[0]) * 0.38)]
    cx = float(np.median([(np.nonzero(a[y])[0].min() + np.nonzero(a[y])[0].max()) / 2 for y in ys]))
    return affine(F, BS, CX0, CY0, 0, (cx, ny)), cx, F.shape[1]


def to_cell(o):
    im = toim(o); x0 = CX0 - AX / CS; y0 = CY0 - AY / CS
    return im.resize((HW, HH), Image.LANCZOS, box=(x0, y0, x0 + HW / CS, y0 + HH / CS))


def turn(L):
    Ha = Image.new('RGBA', (HW * 6, HH * N), (0, 0, 0, 0)); meta = []
    for i in range(N):
        H, I = hat_front(i); Hb, B = hat_back(i); cells = []
        o0, cb, wb = exact(i, False, I); o4, cf, _ = exact(i, True, I)
        cells = [o0, compose(i, 't1', I, B, H, Hb), compose(i, 't2', I, B, H, Hb), compose(i, 't3', I, B, H, Hb), o4, compose(i, 'chat', I, B, H, Hb)]
        for j, c in enumerate(cells):
            cl = to_cell(c); Ha.paste(cl, (j * HW, i * HH))
        meta.append(dict(sc=L['turn']['sprites'][i]['sc'], neck=NECK_B[i], axb=L['turn']['sprites'][i]['axb']))
    Ha.save(STAGE + 'turn-heads.webp', quality=92, method=6, exact=True); Ha.save(OUT + 'turn-heads.png', optimize=True)
    T = L['turn']; T.update(head=[HW, HH], anchor=[AX, AY], headScale=FINAL / (BS * CS), yaws=6); T.pop('chinY', None); T.pop('headW', None)
    bg = Image.new('RGBA', Ha.size, (64, 58, 80, 255)); bg.alpha_composite(Ha); bg.convert('RGB').save(OUT + 'heads-sheet.jpg', quality=88)
    print('head atlas', Ha.size)


# ---------- boats: painted in layers (gradients, rims, soft shade), supersampled; a body sheet + an emissive sheet so dusk and night both work ----------
BW, BH, BS4 = 360, 180, 3
class Pen:
    def __init__(s): s.body = Image.new('RGBA', (BW * BS4, BH * BS4), (0, 0, 0, 0)); s.lit = Image.new('RGBA', (BW * BS4, BH * BS4), (0, 0, 0, 0))
    def _m(s, pts):
        m = Image.new('L', s.body.size, 0); ImageDraw.Draw(m).polygon([(x * BS4, y * BS4) for x, y in pts], fill=255); return m
    def grad(s, pts, c0, c1, vertical=True):
        """polygon filled with a vertical (or horizontal) gradient over its own box"""
        xs = [p[0] for p in pts]; ys = [p[1] for p in pts]; W, H = s.body.size; yy, xx = np.mgrid[:H, :W].astype(np.float32)
        t = np.clip(((yy / BS4 - min(ys)) / max(1, max(ys) - min(ys))) if vertical else ((xx / BS4 - min(xs)) / max(1, max(xs) - min(xs))), 0, 1)[..., None]
        col = np.array(c0, np.float32) * (1 - t) + np.array(c1, np.float32) * t; im = Image.fromarray(np.dstack([col, np.full((H, W), 255, np.float32)]).astype(np.uint8), 'RGBA'); s.body.paste(im, (0, 0), s._m(pts))
    def line(s, pts, col, w, lit=False):
        ImageDraw.Draw(s.lit if lit else s.body).line([(x * BS4, y * BS4) for x, y in pts], fill=tuple(col) + (255,), width=max(1, int(w * BS4)), joint='curve')
    def glow_rect(s, x0, y0, x1, y1, col, r=1.0):
        ImageDraw.Draw(s.lit).rounded_rectangle([x0 * BS4, y0 * BS4, x1 * BS4, y1 * BS4], r * BS4, fill=tuple(col) + (255,))
    def dot(s, x, y, r, col, lit=True):
        ImageDraw.Draw(s.lit if lit else s.body).ellipse([(x - r) * BS4, (y - r) * BS4, (x + r) * BS4, (y + r) * BS4], fill=tuple(col) + (255,))
WARM, AMBER, CYAN, ROSE = (255, 214, 150), (255, 170, 90), (150, 215, 255), (255, 120, 170)
def hull(p, stern, bow, deck, keel, c0, c1, stripe=None, sheer=6):
    """a ship's hull: raked bow, curved sheer line, waterline at `keel`"""
    top = bez((stern, deck), ((stern + bow) * 0.55, deck + sheer), (bow, deck - sheer * 1.3)); low = bez((bow - (bow - stern) * 0.1, keel), ((stern + bow) / 2, keel + 1.5), (stern + 7, keel))
    p.grad(top + low + [(stern + 1, deck + (keel - deck) * 0.6)], c0, c1)
    if stripe: p.line(bez((stern + 1, deck + 5), ((stern + bow) * 0.55, deck + sheer + 6), (bow - 6, deck - sheer * 1.3 + 7)), stripe, 2.2)
    p.line(top, tuple(min(255, int(v * 1.5 + 28)) for v in c0), 1.3)  # rim of light along the deck edge
    return top
def longtail(p):
    W0, W1 = (150, 92, 54), (70, 40, 26)
    top = bez((46, 106), (170, 128), (312, 62)); low = bez((298, 74), (262, 136), (120, 138)) + [(62, 134), (46, 106)]
    p.grad(top + low, W0, W1); p.line(bez((50, 112), (170, 133), (304, 72)), (232, 182, 96), 2.4); p.line(top, (214, 160, 110), 1.4)
    for x in (92, 140, 188): p.line([(x, 114 + (x - 90) * 0.05), (x + 4, 130)], (64, 38, 24), 1.2)  # planks
    # prow ribbons + garland, the longtail's own mark
    p.line(bez((312, 62), (320, 74), (308, 88)), (232, 62, 96), 3); p.line(bez((309, 64), (328, 72), (316, 96)), (70, 170, 190), 2.4); p.line(bez((306, 66), (314, 80), (298, 92)), (248, 196, 70), 2.2)
    # canopy on posts
    for x in (112, 162, 212): p.line([(x, 118), (x, 76)], (86, 58, 44), 2.4)
    p.grad([(92, 76), (108, 62), (222, 62), (238, 76)], (196, 70, 60), (120, 36, 44)); p.line([(92, 76), (238, 76)], (240, 150, 96), 1.6)
    for x in (118, 168): p.glow_rect(x, 80, x + 36, 96, AMBER, 2)
    p.dot(226, 84, 4, WARM); p.dot(120, 60, 2, ROSE)
    # engine + the long tail shaft
    p.grad([(44, 96), (70, 92), (74, 112), (46, 114)], (82, 84, 92), (34, 36, 44)); p.line([(48, 110), (6, 136)], (120, 122, 132), 2.6); p.line([(2, 131), (10, 141)], (200, 200, 210), 2.4)
def freighter(p):
    hull(p, 16, 346, 92, 136, (130, 42, 40), (52, 20, 28), None, 3)
    p.grad([(19, 122), (332, 122), (324, 136), (24, 136)], (66, 30, 40), (34, 16, 26))
    C = [(196, 84, 54), (48, 110, 140), (212, 164, 60), (62, 132, 96), (168, 60, 76), (90, 96, 150)]; n = 0
    for row in range(3):
        for col in range(9 if row == 0 else 8 if row == 1 else 6):
            x = 118 + col * 21 + row * 4; y = 76 - row * 15; c = C[(col * 2 + row * 3 + n) % 6]; n += col % 2
            p.grad([(x, y), (x + 20, y), (x + 20, y + 14), (x, y + 14)], tuple(min(255, int(v * 1.12)) for v in c), tuple(int(v * 0.62) for v in c))
            for k in (5, 10, 15): p.line([(x + k, y + 1), (x + k, y + 13)], tuple(int(v * 0.5) for v in c), 0.7)
    # bridge at the stern
    p.grad([(36, 92), (36, 56), (92, 56), (92, 92)], (232, 226, 214), (140, 136, 138)); p.grad([(44, 56), (44, 38), (88, 38), (88, 56)], (240, 234, 222), (170, 164, 164)); p.grad([(40, 38), (92, 38), (92, 34), (40, 34)], (250, 244, 232), (200, 192, 188))
    for y, x0, x1 in ((66, 42, 86), (78, 42, 86)):
        for x in range(x0, x1, 9): p.glow_rect(x, y, x + 6, y + 6, WARM, 0.6)
    for x in range(50, 84, 9): p.glow_rect(x, 42, x + 7, 50, CYAN, 0.6)
    p.grad([(60, 34), (76, 34), (74, 16), (62, 16)], (60, 64, 76), (30, 32, 42)); p.grad([(61, 22), (75, 22), (75, 18), (61, 18)], (214, 90, 60), (160, 56, 44))
    p.line([(106, 92), (106, 26)], (120, 110, 100), 2.2); p.line([(106, 30), (150, 60)], (120, 110, 100), 1.4); p.dot(106, 25, 3, (255, 90, 70)); p.dot(340, 86, 3, (120, 255, 170)); p.dot(24, 88, 3, WARM)
def speedboat(p):
    top = bez((54, 104), (190, 108), (330, 84)); low = bez((318, 96), (240, 132), (120, 134)) + [(66, 132), (54, 104)]
    p.grad(top + low, (240, 238, 234), (112, 116, 128)); p.line(bez((62, 116), (190, 124), (312, 96)), (226, 60, 66), 3.2); p.line(bez((70, 123), (190, 130), (296, 106)), (40, 140, 180), 1.6); p.line(top, (255, 255, 255), 1.6)
    p.grad([(176, 104), (214, 72), (248, 72), (232, 100)], (70, 110, 140), (24, 40, 60)); p.line([(176, 104), (214, 72), (248, 72)], (220, 226, 232), 2)  # raked windscreen
    p.grad([(96, 106), (104, 88), (166, 88), (172, 104)], (60, 48, 50), (30, 24, 30)); p.line([(100, 88), (170, 88)], (210, 150, 90), 2)
    p.grad([(48, 104), (62, 104), (60, 128), (50, 128)], (40, 42, 50), (14, 14, 20)); p.line([(196, 70), (196, 56)], (190, 190, 200), 1.4)
    p.dot(196, 55, 3, WARM); p.dot(322, 90, 3, (255, 90, 70)); p.dot(58, 100, 3, ROSE)
def ferry(p):
    hull(p, 36, 330, 100, 136, (232, 228, 220), (92, 100, 116), (32, 124, 150), 2)
    p.grad([(48, 100), (48, 68), (300, 68), (316, 100)], (244, 238, 226), (150, 152, 158)); p.line([(44, 68), (304, 68)], (250, 246, 236), 2.2)
    p.grad([(70, 68), (70, 44), (262, 44), (278, 68)], (240, 234, 222), (160, 160, 164)); p.line([(66, 44), (266, 44)], (250, 246, 236), 2)
    p.grad([(190, 44), (190, 28), (248, 28), (258, 44)], (236, 232, 222), (170, 168, 170))
    for x in range(58, 296, 15): p.glow_rect(x, 76, x + 10, 90, WARM, 1)
    for x in range(80, 256, 15): p.glow_rect(x, 50, x + 10, 62, AMBER, 1)
    for x in range(198, 246, 12): p.glow_rect(x, 32, x + 9, 40, CYAN, 0.8)
    p.grad([(112, 44), (138, 44), (134, 18), (116, 18)], (32, 124, 150), (20, 72, 100)); p.grad([(115, 26), (135, 26), (135, 21), (115, 21)], (250, 240, 220), (200, 190, 180))
    p.line([(216, 28), (216, 8)], (170, 170, 180), 1.6); p.dot(216, 7, 3, (255, 100, 80)); p.grad([(40, 62), (40, 48), (60, 54)], (226, 70, 80), (150, 40, 60)); p.line([(40, 68), (40, 46)], (170, 170, 180), 1.4)
    p.dot(324, 92, 3, (120, 255, 170))
def sailboat(p):
    hull(p, 96, 298, 118, 138, (246, 240, 228), (120, 116, 124), (40, 70, 120), 3)
    p.line([(190, 118), (190, 8)], (90, 76, 70), 2.6); p.line([(190, 110), (92, 104)], (90, 76, 70), 2)
    p.grad([(186, 12), (186, 104), (98, 100)], (252, 240, 214), (222, 190, 158), False); p.line(bez((186, 12), (140, 60), (98, 100)), (255, 250, 236), 1.4)
    for y in (40, 64, 86): p.line([(186, y), (186 - (y - 12) * 0.98, y + (y - 12) * 0.05 - 2)], (206, 178, 150), 0.9)
    p.grad([(195, 18), (284, 112), (195, 112)], (250, 196, 170), (236, 120, 110), False); p.line([(195, 18), (284, 112)], (255, 232, 210), 1.3)
    p.grad([(150, 118), (156, 106), (216, 106), (226, 118)], (236, 230, 220), (150, 146, 150))
    for x in (162, 180, 198): p.glow_rect(x, 109, x + 12, 116, AMBER, 1)
    p.dot(190, 8, 3, WARM); p.dot(292, 110, 2.6, (120, 255, 170))
def yacht(p):
    hull(p, 40, 340, 104, 136, (244, 242, 238), (104, 112, 128), None, 5)
    p.line(bez((46, 112), (200, 120), (322, 102)), (30, 44, 70), 4)
    p.grad([(66, 104), (78, 74), (252, 74), (300, 104)], (248, 246, 240), (168, 172, 180)); p.grad([(96, 74), (110, 50), (214, 50), (240, 74)], (248, 246, 240), (176, 180, 188)); p.grad([(128, 50), (136, 32), (190, 32), (204, 50)], (246, 244, 238), (186, 188, 194))
    p.grad([(82, 82), (86, 78), (248, 78), (272, 98), (84, 98)], (38, 62, 88), (16, 26, 44)); p.grad([(114, 56), (118, 53), (210, 53), (226, 70), (112, 70)], (38, 62, 88), (16, 26, 44)); p.grad([(142, 36), (186, 36), (194, 47), (138, 47)], (38, 62, 88), (16, 26, 44))
    p.glow_rect(94, 82, 252, 94, AMBER, 1.6); p.glow_rect(122, 57, 208, 67, WARM, 1.4); p.glow_rect(146, 38, 186, 45, CYAN, 1)
    p.line([(160, 32), (160, 12)], (180, 182, 190), 1.8); p.line([(150, 20), (170, 20)], (180, 182, 190), 1.4); p.dot(160, 11, 3, (255, 100, 80))
    for k in range(5): p.dot(70 + k * 50, 103, 1.6, (120, 200, 255))
BOATS = [('longtail', longtail, 0.92, 7.0, 0.8), ('freighter', freighter, 1.5, 2.2, 0.35), ('speedboat', speedboat, 0.72, 15.0, 1.6), ('ferry', ferry, 1.1, 4.5, 0.6), ('sailboat', sailboat, 0.92, 3.0, 0.2), ('yacht', yacht, 1.05, 5.0, 0.7)]  # name, painter, width (relative), speed (plate px/s), wake
def boats(L):
    n = len(BOATS); sh = Image.new('RGBA', (BW * n, BH), (0, 0, 0, 0)); li = Image.new('RGBA', (BW * n, BH), (0, 0, 0, 0)); prev = Image.new('RGBA', (BW * n, BH * 2), (54, 46, 74, 255))
    for j, (name, fn, *_ ) in enumerate(BOATS):
        p = Pen(); fn(p)
        # keel in the water: fade the last rows so the reflection takes over; the painterly softness comes from the resample
        b = np.array(p.body.resize((BW, BH), Image.LANCZOS)).astype(np.float32); l = np.array(p.lit.resize((BW, BH), Image.LANCZOS)).astype(np.float32); b = ni_soft(b, 0.7)
        b[..., :3] = b[..., :3] * (1 - l[..., 3:4] / 255 * 0.82) + np.array((58, 44, 42), np.float32) * (l[..., 3:4] / 255 * 0.82)  # unlit windows: dark glass in the body layer
        bi, li1 = toim(b), toim(ni_soft(l, 0.8)); bi.save(f'{ROOT}/design/v9/boats/{name}.png'); li1.save(f'{ROOT}/design/v9/boats/{name}-lit.png')
        sh.paste(bi, (j * BW, 0)); li.paste(li1, (j * BW, 0)); prev.alpha_composite(bi, (j * BW, 0)); prev.alpha_composite(bi, (j * BW, BH)); prev.alpha_composite(li1, (j * BW, BH))
    sh.save(STAGE + 'boats.webp', quality=92, method=6, exact=True); li.save(STAGE + 'boats-lit.webp', quality=90, method=6, exact=True); prev.convert('RGB').save(f'{ROOT}/design/v9/boats/sheet.jpg', quality=90)
    L['boats'] = dict(file='boats.webp', lit='boats-lit.webp', cell=[BW, BH], water=138, kinds=[dict(id=b[0], w=b[2], v=b[3], wake=b[4]) for b in BOATS])
    print('boats', sh.size)


# ---------- monitors: the glass as measured on the 3840 plates at 7x (plate px, TL TR BR BL), 1 px inside the bezel; `cut` = what stands in front of the glass ----------
GLASS = dict(n0=[[858, 528.5], [940.3, 522.2], [940.3, 566.2], [858, 574.2]], n1=[[955.3, 522.4], [1038.4, 528.7], [1038.2, 574.8], [955.8, 566.4]],
             v0=[[308.5, 419], [372, 418.5], [372, 455.5], [308.5, 456]], v1=[[383, 418.5], [449, 418.5], [449, 454.5], [383, 454.5]],
             s0=[[575, 419.5], [638, 417.8], [638, 455], [575, 457]], s1=[[647, 417], [710, 417], [710, 455], [647, 456.5]],
             m0=[[832, 419.2], [893.7, 418.2], [894.3, 454.2], [833, 455.6]], m1=[[905.4, 418.1], [970.8, 419.5], [970.4, 456.9], [907.4, 454]],
             h0=[[1036.5, 443.2], [1116, 441.8], [1115.7, 488.2], [1036.6, 491]], h1=[[1128, 442.2], [1213.4, 441.8], [1213.9, 491], [1128, 488.2]],
             b0=[[527, 531], [591.2, 515.4], [591.2, 558.6], [527.3, 576]], b2=[[693.4, 515.3], [760.8, 531.7], [759.5, 576], [692.8, 558.6]])
CUTS = dict(b2=[[753, 582], [751, 568], [757, 556], [764, 546], [780, 540], [780, 590]])  # the desk lamp
def nq(q): return [[round(x / 1280, 4), round(y / 720, 4)] for x, y in q]
def layout(L):
    L.pop('ferris', None); L.pop('monitorCuts', None); L['note'] = 'normalised plate coords (0..1) unless noted; v8 keys from bin/preprocess_v8.py, v9 changes from bin/preprocess_v9.py'
    M = dict(numbers=('n0', 'n1'), video=('v0', 'v1'), sbp=('s0', 's1'), messages=('m0', 'm1'), housekeeping=('h0', 'h1'), boss=('b0', 'b2'))
    for d in L['desks']:
        if d['id'] not in M: continue
        ids = M[d['id']]; d['monitors'] = [nq(GLASS[i]) for i in ids]
        c = [nq(CUTS[i]) if i in CUTS else None for i in ids]
        if any(c): d['cuts'] = c
    L['boss']['monitors'][0] = nq(GLASS['b0']); L['boss']['monitors'][2] = nq(GLASS['b2'])
    L['boss']['clip'] = [None, None, nq([[693.4, 515.3], [760.8, 531.7], [760.5, 546], [751, 566], [752, 573], [692.8, 558.6]])]  # the lamp stays in front
    if os.path.exists(STAGE + 'ferris-wheel.png'): os.remove(STAGE + 'ferris-wheel.png')


if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'turn', 'boats', 'layout'}
    L = json.load(open(STAGE + 'layout.json'))
    if 'turn' in want: turn(L)
    if 'boats' in want: boats(L)
    if 'layout' in want: layout(L)
    json.dump(L, open(STAGE + 'layout.json', 'w'), separators=(',', ':'))
