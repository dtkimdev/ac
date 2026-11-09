#!/usr/bin/env python3
"""v7 asset pipeline (Pillow + numpy only, idempotent; bin/preprocess.py can no longer run, its sources are gone).
Inputs:  design/v7/*.jpg (AI art on magenta) + design/v7/orig/ (pristine plates, water mask, layout.json, copied before v7).
Outputs: public/office2d/assets/ plate-{dusk,night}{,-hi}.webp, trees-mask.png, water-mask.png, kitchen.png, corgi.png,
         legs.png, layout.json (always rebuilt from orig/layout.json, so every v7 layout change lives in this file).
Usage: bin/preprocess_v7.py [trees] [kitchen] [corgi] [legs]   (no argument = all; layout.json is rewritten each run)."""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
V7, ORIG, BUILD, ASSETS = f'{ROOT}/design/v7/', f'{ROOT}/design/v7/orig/', f'{ROOT}/design/v7/build/', f'{ROOT}/public/office2d/assets/'  # build/: per-step results, so a partial run can rewrite layout.json
PW, PH = 1280, 720  # work resolution of the plate analysis (= layout reference size)


def u8(a): return np.clip(a + 0.5, 0, 255).astype(np.uint8)
def blur(a, r): return np.array(Image.fromarray(u8(a)).filter(ImageFilter.GaussianBlur(r))).astype(float)
def morph(m, f, r): return np.array(Image.fromarray(u8(m * 255.0)).filter(f(2 * r + 1))) > 127
def erode(m, r): return morph(m, ImageFilter.MinFilter, r)
def dilate(m, r): return morph(m, ImageFilter.MaxFilter, r)
def smooth(x, a, b):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def components(m):
    """4-connected labels on a bool array -> (labels, sizes) (plain flood fill; the masks here are small)."""
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


# ---------- trees: foliage of the AI edits -> composited behind the glass of the pristine plates ----------
def glass_mask(L):
    """bool (PH, PW): window glass only, from the pane/transom geometry and the frame + vine mask."""
    wx0, wy0 = L['window'][0]; wy1 = L['window'][2][1]; tr0, tr1 = L['transom']
    g = np.zeros((PH, PW), bool)
    for a, b in L['panes']:
        x0, x1 = int(a * PW) + 2, int(b * PW) - 2
        g[int(wy0 * PH) + 2:int(tr0 * PH) - 2, x0:x1] = True
        g[int(tr1 * PH) + 2:int(wy1 * PH) - 2, x0:x1] = True
    fg = Image.open(ASSETS + 'fg-mask.png').getchannel('A')
    x0, y0, x1, y1 = L['masks']['fg']; box = (int(round(x0 * PW)), int(round(y0 * PH)), int(round(x1 * PW)), int(round(y1 * PH)))
    F = np.full((PH, PW), 255, np.uint8); F[box[1]:box[3], box[0]:box[2]] = np.array(fg.resize((box[2] - box[0], box[3] - box[1]), Image.BILINEAR))
    return g & ~dilate(F > 70, 1)


def foliage(name, glass):
    p = np.array(Image.open(f'{ORIG}plate-{name}.webp').convert('RGB').resize((PW, PH), Image.LANCZOS)).astype(float)
    e = np.array(Image.open(f'{V7}plate-{name}-trees.jpg').convert('RGB').resize((PW, PH), Image.LANCZOS)).astype(float)
    es, ps = blur(e, 1.2), blur(p, 1.2)
    diff = np.abs(es - ps).sum(-1); r, g, b = es[..., 0], es[..., 1], es[..., 2]
    m = (g - b > -2) & (diff > (30 if name == 'dusk' else 26)) & glass & (r - g < 90)  # never blue/purple (sky, towers), never pink (neon)
    if name == 'dusk': m &= (es.max(-1) < 175) | (g - b > (r - b) * 0.75)  # not the orange sky
    m[:int(0.42 * PH), int(0.40 * PW):int(0.64 * PW)] = False  # the moon + changed clouds: no tree stands in the central panes
    m = dilate(erode(m, 1), 1); m = erode(dilate(m, 1), 1)
    # lit tower windows that drifted pass the colour test as specks: keep only what hangs on a solid foliage core
    core = dilate(erode(m, 3), 3)
    lab, sz = components(core)
    core = (sz >= 260)[lab] & core
    m &= dilate(core, 5)
    lab, sz = components(m)
    return ((sz >= 60)[lab] & m), e, p


def stats(a, m): return a[m].mean(0), a[m].std(0) + 1e-3


def trees(L):
    glass = glass_mask(L)
    md, ed, pd = foliage('dusk', glass); mn, en, pn = foliage('night', glass)
    union = erode(dilate(md | mn, 1), 1)
    lab, sz = components(~union); union |= (sz < 24)[lab] & (lab > 0)  # pinholes
    U = blur(erode(union, 1) * 255.0, 1.0) / 255 * glass  # eroded so the edit's own sky halo stays out, then feathered
    U = np.minimum(U, blur(glass * 255.0, 0.7) / 255)
    Ad, An = blur(md * 255.0, 1.0) / 255, blur(mn * 255.0, 1.0) / 255
    # the two edits grew different palms: a pixel only one edit has is filled from the other one, regraded (mean/std on
    # the foliage both share) -> identical silhouette on both plates, so the time-of-day crossfade cannot ghost
    both = erode(md & mn, 1)
    if both.sum() < 2000: both = md & mn
    (dm, ds), (nm, ns) = stats(ed, both), stats(en, both)
    n2d = lambda a: np.clip((a - nm) * np.minimum(ds / ns, 1.2) + dm, 0, 255)
    d2n = lambda a: np.clip((a - dm) * np.minimum(ns / ds, 1.0) + nm, 0, 255)
    print(f'trees: dusk {md.sum()} px, night {mn.sum()}, both {both.sum()}, union {union.sum()} px')
    for suf, size in (('', (2560, 1440)), ('-hi', (3840, 2160))):
        W, H = size
        up = lambda a: np.array(Image.fromarray(u8(a * 255)).resize(size, Image.BICUBIC)).astype(float)[..., None] / 255
        Uu, Adu, Anu = up(U), up(Ad), up(An)
        edit = {n: np.array(Image.open(f'{V7}plate-{n}-trees.jpg').convert('RGB').resize(size, Image.LANCZOS).filter(ImageFilter.UnsharpMask(2.4, 55, 2))).astype(float) for n in ('dusk', 'night')}
        for n in ('dusk', 'night'):
            base = np.array(Image.open(f'{ORIG}plate-{n}{suf}.webp').convert('RGB')).astype(float)
            tree = edit['dusk'] * Adu + n2d(edit['night']) * (1 - Adu) if n == 'dusk' else edit['night'] * Anu + d2n(edit['dusk']) * (1 - Anu)
            Image.fromarray(u8(base * (1 - Uu) + tree * Uu)).save(f'{ASSETS}plate-{n}{suf}.webp', quality=88, method=6)
    ys, xs = np.nonzero(U > 0.01)
    x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    box = (x0, y0, x1, y1)
    A = Image.fromarray(u8(U * 255)).crop(box).resize(((x1 - x0) * 2, (y1 - y0) * 2), Image.BICUBIC)
    Image.merge('LA', (Image.new('L', A.size, 255), A)).save(ASSETS + 'trees-mask.png', optimize=True)
    # water FX must never paint over the trees
    w = Image.open(ORIG + 'water-mask.png'); wa = np.array(w.getchannel('A')).astype(float)
    bx = L['masks']['water']; wb = (bx[0] * PW, bx[1] * PH, bx[2] * PW, bx[3] * PH)
    T = np.array(Image.fromarray(u8(np.maximum(U, blur(dilate(U > 0.3, 1) * 255.0, 1) / 255) * 255)).transform(w.size, Image.EXTENT, wb, Image.BILINEAR)).astype(float) / 255
    Image.merge('LA', (Image.new('L', w.size, 255), Image.fromarray(u8(wa * (1 - T))))).save(ASSETS + 'water-mask.png', optimize=True)
    np.save(BUILD + 'trees-U.npy', U)
    return U


def apply_trees(L, U):
    x, y = np.nonzero(U.T > 0.01); L['masks']['trees'] = [round(x.min() / PW, 4), round(y.min() / PH, 4), round((x.max() + 1) / PW, 4), round((y.max() + 1) / PH, 4)]
    cover = blur(U * 255, 2) / 255  # window lights swallowed by the trees are gone from the list (bloom, toggles, reflections)
    at = lambda p: cover[min(PH - 1, int(p[1] * PH)), min(PW - 1, int(p[0] * PW))]
    n0 = len(L['lights']); L['lights'] = [l for l in L['lights'] if at(l) < 0.35]
    print(f'lights: {n0} -> {len(L["lights"])}')


# ---------- magenta key ----------
def key(rgb, lo=36, hi=84, protect=()):
    """rgb float (H,W,3) -> rgba float: distance from the sheet's own background colour -> soft alpha, pulled in 1 px; rim
    colours are bled in from the solid interior (no magenta fringe). protect = boxes forced opaque (the fridge's neon heart)."""
    b = 24
    bg = np.median(np.concatenate([rgb[:b].reshape(-1, 3), rgb[-b:].reshape(-1, 3), rgb[:, :b].reshape(-1, 3), rgb[:, -b:].reshape(-1, 3)]), 0)
    a = smooth(np.sqrt(((blur(rgb, 0.6) - bg) ** 2).sum(-1)), lo, hi)
    for x0, y0, x1, y1 in protect: a[y0:y1, x0:x1] = 1
    inner = erode(a > 0.97, 2)
    for x0, y0, x1, y1 in protect: inner[y0:y1, x0:x1] = True
    a = np.minimum(a, blur(erode(a > 0.5, 1) * 255.0, 0.7) / 255)
    w8 = blur(inner * 255.0, 2.2) / 255 + 1e-3
    bleed = np.dstack([blur(rgb[..., i] * inner, 2.2) / w8 for i in range(3)])
    out = np.where(inner[..., None], rgb, np.where(w8[..., None] > 0.02, np.clip(bleed, 0, 255), rgb))
    return np.dstack([out, a * 255])


def to_img(rgba): return Image.fromarray(u8(rgba), 'RGBA')
def bbox(a, thr=40):
    ys, xs = np.nonzero(a > thr); return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


# ---------- kitchen ----------
KS, KX, KB = 0.42, 188, 719   # plate px per image px, left edge and floor line of the kitchen (plate px, chosen on a debug render)
BULB_X, BULB_Y, CABLE_TOP = 375, 538, 24  # the pendant hangs from the ceiling beam through the gap between the Video monitors, clear of every worker
def kitchen(L):
    rgb = np.array(Image.open(V7 + 'kitchen.jpg').convert('RGB')).astype(float)
    K = key(rgb, protect=[(355, 292, 478, 402)])
    K[172:262, 620:660, 3] = 0   # the painted steam (a soft live wisp replaces it)
    bulb = to_img(K).crop((608, 78, 674, 172)); cable = to_img(K).crop((634, 34, 648, 80))
    K[:172, 600:680, 3] = 0
    body = to_img(K); x0, y0, x1, y1 = bbox(K[..., 3]); body = body.crop((x0, y0, x1, y1)); w, h = body.size
    H = round((KB - CABLE_TOP) / KS); bx = round((BULB_X - KX) / KS); by = H - round((KB - BULB_Y) / KS)  # bulb centre in image px
    out = Image.new('RGBA', (w, H), (0, 0, 0, 0)); out.alpha_composite(body, (0, H - h))
    top = by - bulb.size[1] // 2
    t = Image.new('RGBA', out.size, (0, 0, 0, 0)); t.paste(cable.resize((cable.size[0], top + 6), Image.BICUBIC), (bx - cable.size[0] // 2 - 1, 0)); out.alpha_composite(t)
    out.alpha_composite(bulb, (bx - bulb.size[0] // 2, top))
    out.save(ASSETS + 'kitchen.png', optimize=True)
    P = lambda ax, ay: [round((KX + ax * KS) / PW, 4), round((KB - (h - ay) * KS) / PH, 4)]   # body image px -> plate
    foot = lambda x, y: [round(x / PW, 4), round(y / PH, 4)]
    return dict(file='kitchen.png', s=KS, x=round(KX / PW, 4), y=round((KB - H * KS) / PH, 4), w=w, h=H, depth=round(690 / PH, 4),
                bulb=[round(BULB_X / PW, 4), round(BULB_Y / PH, 4)], steam=P(288, 168), heart=P(68, 257),
                laneF=round(440 / PW, 4), laneB=round(330 / PW, 4), frontY=round(704 / PH, 4), backY=round(640 / PH, 4),
                spots=[dict(id='stool-l', p=foot(KX + 248 * KS, 716), seat=P(248, 428)[1], front=True), dict(id='stool-r', p=foot(KX + 510 * KS, 711), seat=P(510, 420)[1], front=True),
                       dict(id='coffee', p=foot(340, 662), front=True, back=True), dict(id='counter', p=foot(426, 662), front=True, back=True), dict(id='fridge', p=foot(236, 703), front=False)],
                shadows=[[188, 672, 256, 34], [266, 700, 52, 15], [376, 695, 52, 15], [316, 702, 72, 18]])


# ---------- corgi: 4x3 sheet -> uniform cells, bottom-centre feet anchor, one scale for all frames ----------
CORGI_SCALE = 0.62
CORGI_NAMES = ['walk0', 'walk1', 'walk2', 'walk3', 'walk4', 'walk5', 'sit', 'beg', 'sleep', 'belly', 'happy', 'lie']
def corgi():
    rgb = np.array(Image.open(V7 + 'corgi-sheet.jpg').convert('RGB')).astype(float)
    K = key(rgb); H, W = rgb.shape[:2]; cw, ch = W // 4, H // 3
    # poses overflow the 4x3 grid (noses, ears): each blob goes to the cell of its centroid
    lab, sz = components(K[..., 3] > 128); cells = []
    ys, xs = np.nonzero(lab); cid = lab[ys, xs]
    cxs = np.bincount(cid, xs, len(sz)) / np.maximum(sz, 1); cys = np.bincount(cid, ys, len(sz)) / np.maximum(sz, 1)
    owner = np.zeros(len(sz), int)
    for i in range(1, len(sz)): owner[i] = -1 if sz[i] < 30 else int(cys[i] // ch) * 4 + int(cxs[i] // cw)
    for i in range(12):
        m = dilate((owner == i)[lab] & (lab > 0), 2); C = K.copy(); C[..., 3] *= m
        x0, y0, x1, y1 = bbox(C[..., 3], 90); a = C[..., 3] > 128
        big = np.isin(lab, [j for j in range(1, len(sz)) if owner[j] == i and sz[j] >= 3000])  # the dog, not its hearts
        cells.append((C, x0, y0, x1, y1, (big.sum(0) * np.arange(W)).sum() / big.sum()))
    left = max(c[5] - c[1] for c in cells); right = max(c[3] - c[5] for c in cells); tall = max(c[4] - c[2] for c in cells)
    cellw, cellh = int((left + right + 12) * CORGI_SCALE), int((tall + 8) * CORGI_SCALE)
    sheet = Image.new('RGBA', (cellw * 4, cellh * 3), (0, 0, 0, 0)); frames = {}
    ax = cellw / 2 / CORGI_SCALE
    for i, (C, x0, y0, x1, y1, cx) in enumerate(cells):
        im = to_img(C).crop((x0, y0, x1, y1)); w, h = im.size
        s = im.resize((max(1, round(w * CORGI_SCALE)), max(1, round(h * CORGI_SCALE))), Image.LANCZOS)
        ox = round((left + 6 - (cx - x0)) * CORGI_SCALE); oy = cellh - s.size[1] - 2
        c0, r0 = i % 4 * cellw, i // 4 * cellh
        sheet.alpha_composite(s, (c0 + ox, r0 + oy)); frames[CORGI_NAMES[i]] = [c0, r0, cellw, cellh]
    sheet.save(ASSETS + 'corgi.png', optimize=True)
    walkbody = cells[0][3] - cells[0][1]
    return dict(file='corgi.png', cell=[cellw, cellh], frames=[frames[n] for n in CORGI_NAMES], walk=[0, 1, 2, 3, 4, 5], sit=6, beg=7, sleep=8, belly=9, happy=10, lie=11,
                ax=round((left + 6) * CORGI_SCALE / cellw, 4), bodyW=round(walkbody * CORGI_SCALE / cellw, 4))


# ---------- legs ----------
def paste_leg(cell, leg, pivot_src, hip, deg, sy, shade):
    """leg RGBA (neutral, hip at pivot_src) rotated by deg around the hip, vertically scaled, onto the cell at hip."""
    w, h = leg.size
    l = leg.resize((w, max(1, round(h * sy))), Image.BICUBIC)
    px, py = pivot_src[0], pivot_src[1] * sy
    r = l.rotate(deg, Image.BICUBIC, expand=False, center=(px, py))
    if shade < 1:
        a = np.array(r).astype(float); a[..., :3] *= shade; r = to_img(a)
    t = Image.new('RGBA', cell.size, (0, 0, 0, 0)); t.paste(r, (round(hip[0] - px), round(hip[1] - py))); cell.alpha_composite(t)


def largest(a):
    lab, sz = components(a); sz[0] = 0
    return lab == sz.argmax()


def lower_body(K, box, cut=None):
    """crop a figure's legs: drop green hoodie + skin, keep the biggest blob(s) under the hem; returns rgba crop."""
    x0, y0, x1, y1 = box; C = K[y0:y1, x0:x1].copy(); r, g, b, a = [C[..., i] for i in range(4)]
    hood = (g > r * 1.05) & (g > b * 1.15); skin = (r > g * 1.18) & (r > b * 1.25) & (r > 120)
    keep = (a > 60) & ~dilate(hood, 1) & ~skin & ~((r > g + 40) & (b > g + 40))  # no leftover magenta in the crotch gap
    lab, sz = components(erode(keep, 1)); big = (sz >= 120)[lab] & (lab > 0)
    C[..., 3] *= dilate(big, 2)
    return C


LCW, LCH = 200, 150  # leg cell (px), hip line at y = LHIP
LHIP = 10
def legs(L):
    rgb = np.array(Image.open(V7 + 'legs-sheet.jpg').convert('RGB')).astype(float)
    K = key(rgb)
    # side: one painted leg (row 1, frame 1) swung around the hip -> a real 8-frame stride (the 4 painted frames barely differ)
    C = K[20:235, 40:290]; a = C[..., 3] > 128
    for crotch in range(70, 170, 3):  # first row where the two legs are separate blobs
        lab, sz = components(a[crotch:]); sz[0] = 0
        if (sz >= 400).sum() >= 2: break
    frontid = max(range(1, len(sz)), key=lambda i: sz[i] * ((lab == i).any(0).nonzero()[0].mean() < 110))
    frontm = lab == frontid
    mask = np.zeros(a.shape, bool); mask[:crotch, :int(np.nonzero(frontm[0])[0].max()) + 3] = True; mask[crotch:] = frontm
    Lg = C.copy(); Lg[..., 3] *= dilate(mask, 1)
    pad = Image.new('RGBA', (420, 420), (0, 0, 0, 0)); hip0 = (128, 26); hip_src = (210.0, 60.0)
    pad.paste(to_img(Lg), (int(hip_src[0] - hip0[0]), int(hip_src[1] - hip0[1])))
    neutral = pad.rotate(17, Image.BICUBIC, center=hip_src)  # upright
    nb = bbox(np.array(neutral)[..., 3], 90)
    # chibi proportions: shaft compressed + thickened, the shoe keeps its chunky shape
    na = np.array(neutral); shaft_end = nb[3] - 66; S1, S2, SX = 0.86, 0.94, 1.28
    top = Image.fromarray(na[:shaft_end]); bot = Image.fromarray(na[shaft_end:])
    h1, h2 = round(shaft_end * S1), round((na.shape[0] - shaft_end) * S2); wn = round(na.shape[1] * SX)
    chib = Image.new('RGBA', (wn, h1 + h2), (0, 0, 0, 0)); chib.paste(top.resize((wn, h1), Image.LANCZOS), (0, 0)); chib.paste(bot.resize((wn, h2), Image.LANCZOS), (0, h1))
    pivot = (hip_src[0] * SX, hip_src[1] * S1)
    W2, H2 = LCW * 2, LCH * 2  # supersampled cell
    side = []
    for i in range(8):
        p = i / 8 * 2 * np.pi; c = Image.new('RGBA', (W2, H2), (0, 0, 0, 0))
        for ph, shade in ((p + np.pi, 0.66), (p, 1.0)):
            ang = 25 * np.sin(ph); sy = 1 - 0.16 * max(0.0, np.cos(ph))  # swing-through lifts the knee
            paste_leg(c, chib, pivot, (W2 / 2, LHIP * 2 + 14), -ang, sy, shade)
        ca = np.array(c); ca[:LHIP * 2 - 6, :, 3] = 0; side.append(Image.fromarray(ca))  # flat waist under the hem
    # front walk: painted standing legs, each leg lifted in turn
    F = lower_body(K, (95, 748, 232, 840)); B1 = lower_body(K, (640, 742, 780, 840)); B2 = lower_body(K, (915, 742, 1050, 840)); SIT = lower_body(K, (375, 742, 500, 840))
    def norm(C, target_w):
        x0, y0, x1, y1 = bbox(C[..., 3], 90); im = to_img(C).crop((x0, y0, x1, y1)); s = target_w / (x1 - x0)
        return im.resize((round((x1 - x0) * s), round((y1 - y0) * s)), Image.LANCZOS)
    def centered(im, dy=0):
        c = Image.new('RGBA', (W2, H2), (0, 0, 0, 0)); c.alpha_composite(im, (round(W2 / 2 - im.size[0] / 2), LHIP * 2 + dy))
        # extend the waist upward so it always tucks under the hoodie hem
        a = np.array(c); y = LHIP * 2 + dy + 6; a[:y] = a[y] * (np.arange(y)[:, None, None] >= 0); a[:max(0, y - 22)] = 0; return Image.fromarray(a)
    fw = 168
    f0 = norm(F, fw); w, h = f0.size
    def lift(im, right):
        l = Image.new('RGBA', im.size, (0, 0, 0, 0)); mid = w // 2
        a = (0, 0, mid, h); b = (mid, 0, w, h); keep, up = (a, b) if right else (b, a)
        l.paste(im.crop(keep), keep[:2])
        u = im.crop(up); uh = round(h * 0.92); l.paste(u.resize((u.size[0], uh), Image.LANCZOS), (up[0], 0))
        return l
    front = [centered(f0), centered(lift(f0, True)), centered(f0), centered(lift(f0, False))]
    back = [centered(norm(B1, fw)), centered(norm(B2, fw))]
    sit = [centered(norm(SIT, 176))]
    groups = dict(side=side, front=front, back=back, sit=sit)
    n = sum(len(v) for v in groups.values()); cols = 8; rows = (n + cols - 1) // cols
    sheet = Image.new('RGBA', (LCW * cols, LCH * rows), (0, 0, 0, 0)); meta = dict(file='legs.png', cell=[LCW, LCH], hip=round(LHIP / LCH, 4)); k = 0
    for name, fr in groups.items():
        meta[name] = []; dr = []
        for c in fr:
            s = c.resize((LCW, LCH), Image.LANCZOS); x, y = k % cols * LCW, k // cols * LCH; sheet.alpha_composite(s, (x, y)); meta[name].append([x, y]); k += 1
            dr.append(round(LCH - bbox(np.array(s)[..., 3], 90)[3], 1))
        meta[name + 'Foot'] = [round((LCH - d) / LCH, 4) for d in dr]  # floor line of each frame (fraction of the cell)
    sheet.save(ASSETS + 'legs.png', optimize=True)
    w = np.array(front[0])[..., 3]; wy = LHIP * 2 + 12; xs = np.nonzero(w[wy] > 128)[0]
    meta['waist'] = round((xs.max() - xs.min()) / (LCW * 2), 4)
    return meta


def sprite_hems(L):
    """hem line + width + centre of each half-body sprite (they differ: arm poses, tall sprites) so the legs sit right."""
    for s in L['sprites']:
        for f, key_ in ((s['file'], 'hem'), (s['front'], 'hemF')):
            a = np.array(Image.open(ASSETS + f).convert('RGBA'))[..., 3] > 128; h, w = a.shape
            rows = a.sum(1); y = int(np.nonzero(rows)[0][0])
            while y + 1 < h and rows[y + 1] > 0: y += 1                 # first solid run of rows (stray bits below ignored)
            yb = y - 2
            while yb > 0 and rows[yb] < rows[max(0, y - int(h * 0.10))] * 0.8: yb -= 1   # past the rounded bottom edge
            band = a[max(0, y - int(h * 0.09)):max(1, y - int(h * 0.03))]
            xs = np.nonzero(band.any(0))[0]
            s[key_] = [round(y / h, 4), round((xs.max() - xs.min()) / w, 4), round((xs.max() + xs.min()) / 2 / w, 4)]


if __name__ == '__main__':
    want = set(sys.argv[1:]) or {'trees', 'kitchen', 'corgi', 'legs'}
    L = json.load(open(ORIG + 'layout.json'))
    L['note'] = 'normalised plate coords (0..1); pre-v7 keys from bin/preprocess.py (sources gone), v7 changes from bin/preprocess_v7.py'
    U = trees(L) if 'trees' in want else np.load(BUILD + 'trees-U.npy')
    apply_trees(L, U)
    if 'kitchen' in want: json.dump(kitchen(L), open(BUILD + 'kitchen.json', 'w'))
    L['kitchen'] = json.load(open(BUILD + 'kitchen.json'))
    if 'corgi' in want: json.dump(corgi(), open(BUILD + 'corgi.json', 'w'))
    L['corgi'] = json.load(open(BUILD + 'corgi.json'))
    if 'legs' in want: json.dump(legs(L), open(BUILD + 'legs.json', 'w'))
    L['legs'] = json.load(open(BUILD + 'legs.json'))
    sprite_hems(L)
    # dog graph: nodes around the kitchen, no edge cutting through the counter, rests only where the dog stays in view
    nodes = L['dog']['nodes']; n = len(nodes); nodes += [[0.2734, 0.9861], [0.3672, 0.9833], [0.2578, 0.8889]]  # 18 before the table, 19 right of it, 20 behind the counter
    L['dog']['edges'] = [e for e in L['dog']['edges'] if e not in ([17, 1],)] + [[17, n], [n, n + 1], [n + 1, 5], [n + 1, 6], [1, n + 2], [n + 2, 2]]
    L['dog']['rest'] = [[17, 'sleep'], [13, 'sleep'], [2, 'sleep'], [6, 'lie'], [7, 'lie'], [14, 'lie'], [n + 1, 'lie'], [0, 'sleep']]
    L['dog']['kitchen'] = [n, n + 1, 17]
    json.dump(L, open(ASSETS + 'layout.json', 'w'), separators=(',', ':'))
    print('layout.json written')
