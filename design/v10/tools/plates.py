#!/usr/bin/env python3
# v10 plate edits, painted on the live plates and written to the stage only: 3rd boss monitor removed, portfolio monitor enlarged, 2 slim right-wall monitors.
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ni
LIVE, ST = '/workspace/agent-city/public/office2d/assets/', '/workspace/agent-city/design/v10/stage/public/office2d/assets/'
W, H = 3840, 2160
def poly_mask(pts, feather=0, size=(W, H)):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).polygon([tuple(p) for p in pts], fill=255)
    if feather: m = m.filter(ImageFilter.GaussianBlur(feather))
    return np.asarray(m, float) / 255
def laplace_fill(a, hole, ignore=None, iters=1400):
    # low-frequency field through the hole, from its boundary; `ignore` pixels are other material and never feed the solve
    x0, y0, x1, y1 = bbox(hole, 8); sub = a[y0:y1, x0:x1].copy(); h = hole[y0:y1, x0:x1] > 0.5
    v = ~(ignore[y0:y1, x0:x1] > 0.5) if ignore is not None else np.ones_like(h)
    small = 3; lo = sub[::small, ::small].copy(); hs = h[::small, ::small]; vs = v[::small, ::small].astype(float)[..., None]
    lo[hs] = sub[~h & v].mean(0)
    for _ in range(iters):
        num = sum(np.roll(lo * vs, s, ax) for s in (1, -1) for ax in (0, 1)); den = sum(np.roll(vs, s, ax) for s in (1, -1) for ax in (0, 1))
        n = num / np.maximum(den, 1e-3); lo[hs] = n[hs]
    up = np.stack([ni.zoom(lo[..., c], small, order=1) for c in range(3)], -1)[:sub.shape[0], :sub.shape[1]]
    pad = sub.copy(); pad[:up.shape[0], :up.shape[1]] = up; return (x0, y0, x1, y1), pad
def bbox(m, pad=0):
    ys, xs = np.where(m > 0.02); return max(0, xs.min() - pad), max(0, ys.min() - pad), min(W, xs.max() + pad + 1), min(H, ys.max() + pad + 1)
def detail(a, box):
    x0, y0, x1, y1 = box; s = a[y0:y1, x0:x1]; return s - ni.gaussian_filter(s, (14, 14, 0))
LAMP = [(2258, 1700), (2262, 1672), (2284, 1650), (2300, 1642), (2304, 1626), (2314, 1614), (2332, 1618), (2340, 1640), (2340, 1700), (2342, 1726), (2300, 1726)]
def remove_third(a):
    # the monitor stood right on the desk's back edge: the back desk's drawers, then floor down to that arc, wood below it to the foot of the stand
    arc = [(2040, 1688), (2120, 1702), (2200, 1722), (2262, 1742), (2316, 1762)]
    hole = poly_mask([(2060, 1514), (2316, 1566), *arc[::-1]])
    wood = poly_mask([*arc[:4], (2262, 1790), (2128, 1790), (2120, 1762), (2040, 1714)])
    keep = poly_mask(LAMP, 0.8)
    out = a.copy()
    # wood first, fed by wood only
    box, lo = laplace_fill(out, wood, ignore=np.maximum(hole, keep)); x0, y0, x1, y1 = box
    d = detail(a, (2030, 1704, 2122, 1742)); h, w = d.shape[:2]
    yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]; tile = lambda v, n: np.where(v % (2 * n) >= n, 2 * n - 1 - v % (2 * n), v % (2 * n)) # mirrored tiling keeps the texture seamless
    fill = lo + d[tile(yy, h), tile(xx, w)] * 0.7; m = ni.gaussian_filter(wood * (1 - keep), 2)[y0:y1, x0:x1, None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + fill * m
    # the floor seen through the gap
    floor = hole * np.maximum(poly_mask([(2000, 1558), (2400, 1558), (2400, 1800), (2000, 1800)]), poly_mask([(2270, 1480), (2400, 1480), (2400, 1800), (2270, 1800)]))
    box, lo = laplace_fill(out, floor, ignore=np.maximum.reduce([wood, keep, hole - floor, poly_mask([(1900, 1400), (2054, 1400), (2054, 1800), (1900, 1800)])]), iters=2600); x0, y0, x1, y1 = box
    sx0, sy0, sx1, sy1 = 2296, 1490, 2384, 1590; sr = a[sy0:sy1, sx0:sx1]; d = np.clip(sr - ni.gaussian_filter(sr, (12, 12, 0)), -14, 9); h, w = d.shape[:2]
    yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]
    # the real tiles, carried on by translation (mirrored they turn into a kaleidoscope); the floor falls into the desk's shade to the left
    dark = np.clip(0.54 + 0.34 * ((xx + x0 - 2070) / 220), 0.54, 0.88)[..., None]
    lay = lambda sh: d[(yy + ((xx + sh) // w) * 41) % h, (xx + sh) % w]; wt = (np.sin(np.pi * (xx % w) / w) ** 2)[..., None] # two offset layers, cross-faded: no seam at the tile edges
    fill = lo * dark + (lay(0) * wt + lay(w // 2) * (1 - wt)) * 0.9
    m = ni.gaussian_filter(floor * (1 - keep), 1.6)[y0:y1, x0:x1, None]
    # a little contact shade along the desk's back edge
    shade = ni.gaussian_filter(np.maximum(wood, poly_mask([*arc, (2316, 1800), (2040, 1800)])), 9)[y0:y1, x0:x1, None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + fill * (1 - 0.5 * shade) * m
    # the drawers of the desk behind run on down to their plinth: mirror what is above the old bezel
    top = hole * (1 - floor) * (1 - keep); ys, xs = np.where(top > 0.5); y0, y1, x0, x1 = ys.min(), ys.max() + 1, xs.min(), xs.max() + 1
    yy, xx = np.mgrid[y0:y1, x0:x1]; sy = np.clip(2 * 1516 - yy - 4, 0, H - 1); m = ni.gaussian_filter(top, 2.5)[y0:y1, x0:x1, None]
    grad = np.clip((1562 - yy) / 34, 0.5, 1)[..., None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - m) + a[sy, xx] * grad * m
    return out
def enlarge_portfolio(a, S=1.2, A=(2838.0, 1728.0)):
    # the whole monitor (bezel + glass) scaled up around its lower right corner: it grows up and left, the stand stays put
    outer = [(2550, 1565), (2838, 1546), (2839, 1708), (2550, 1741)]
    x0, y0, x1, y1 = 2470, 1480, 2840, 1760
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    sx = A[0] + (xx - A[0]) / S; sy = A[1] + (yy - A[1]) / S
    warped = np.stack([ni.map_coordinates(a[..., c], [sy, sx], order=3, mode='nearest') for c in range(3)], -1)
    m = ni.map_coordinates(poly_mask(outer, 1.2), [sy, sx], order=1)
    plant = poly_mask([(2500, 1800), (2500, 1732), (2532, 1711), (2556, 1714), (2570, 1745), (2564, 1800)], 1.5)[y0:y1, x0:x1]
    m = (m * (1 - plant))[..., None]
    shadow = ni.gaussian_filter(ni.shift(m[..., 0], (5, -3), order=1), 8)[..., None] * 0.42 # soft contact shadow on what is behind it
    out = a.copy(); r = out[y0:y1, x0:x1] * (1 - shadow * (1 - plant[..., None])); out[y0:y1, x0:x1] = r * (1 - m) + warped * m
    return out
VP, XR, TOP, BOT, SK = (1920.0, 1190.0), 3840.0, 200.0, 690.0, 0.38 # right-wall lines converge on VP (measured from the shelves); SK eases the skew so they read as screens, not doors
def wy(x, y): return y + SK * ((VP[1] + (y - VP[1]) * (x - VP[0]) / (XR - VP[0])) - y)
def wall_quad(x0, x1): return [(x0, wy(x0, TOP)), (x1, wy(x1, TOP)), (x1, wy(x1, BOT)), (x0, wy(x0, BOT))]
WALL = [wall_quad(3648, 3732), wall_quad(3752, 3830)]
def wall(a, night):
    x0, y0, x1, y1 = 3590, 140, 3840, 790; Z = 3; w, h = (x1 - x0) * Z, (y1 - y0) * Z
    out = a.copy(); yy, xx = np.mgrid[y0:y1, x0:x1].astype(float)
    leaf = (a[y0:y1, x0:x1, 1] > a[y0:y1, x0:x1, 2] * 1.12) & (a[y0:y1, x0:x1, 1] > a[y0:y1, x0:x1, 0] * 0.92) & (a[y0:y1, x0:x1].sum(-1) > 42) # the vines stay in front
    leaf = ni.binary_opening(leaf, iterations=2)
    for q in WALL:
        B = 7
        o = [(q[0][0] - B, q[0][1] - B), (q[1][0] + B, q[1][1] - B), (q[2][0] + B, q[2][1] + B), (q[3][0] - B, q[3][1] + B)]
        P = lambda pts: [((x - x0) * Z, (y - y0) * Z) for x, y in pts]
        def mask(pts, blur=0, r=0):
            m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon(P(pts), fill=255)
            if r: m = m.filter(ImageFilter.GaussianBlur(r * Z)).point(lambda v: 255 if v > 127 else 0) # rounded corners
            if blur: m = m.filter(ImageFilter.GaussianBlur(blur * Z))
            return np.asarray(m.resize((x1 - x0, y1 - y0), Image.LANCZOS), float)[..., None] / 255
        reg = out[y0:y1, x0:x1]
        sh = mask([(x - 6, y + 8) for x, y in o], 8) * 0.45 # shadow on the wall, the light comes from the room
        glow = mask(o, 30) * (0.16 if night else 0.05) # the screen spills a little on the wall
        reg = reg * (1 - sh) + np.array([92.0, 124, 210]) * glow
        om = mask(o, 0.4, 3); gm = mask(q, 0.4, 2)
        v = ((yy - y0) / (y1 - y0))[..., None]
        bez = np.array([26.0, 22, 26]) * (1.1 - 0.3 * v) * (1.0 if night else 1.3)
        hl = np.clip(om - mask([(x + 2, y + 2.5) for x, y in o], 0.4, 3), 0, 1) * np.array([92.0, 78, 70]) * (0.55 if night else 0.8) # the top left edge catches the lamps
        reg = reg * (1 - om) + (bez + hl) * om
        reg = reg * (1 - gm) + np.array([12.0, 13, 22]) * gm
        out[y0:y1, x0:x1] = reg
    edge = (xx < WALL[0][0][0] + 12) | (yy > WALL[0][3][1] - 26) | (yy < WALL[1][0][1] + 40) | ((xx > WALL[0][1][0] - 2) & (xx < WALL[1][0][0] + 8))
    k = ni.gaussian_filter((leaf & edge).astype(float), 0.8)[..., None]
    out[y0:y1, x0:x1] = out[y0:y1, x0:x1] * (1 - k) + a[y0:y1, x0:x1] * k
    return out
def main():
    res = {}
    for n in ('dusk', 'night'):
        a = np.asarray(Image.open(f'{LIVE}plate-{n}-hi.webp').convert('RGB'), float)
        a = remove_third(a); a = enlarge_portfolio(a); a = wall(a, n == 'night')
        im = Image.fromarray(np.clip(a, 0, 255).round().astype('uint8'))
        im.save(f'{ST}plate-{n}-hi.webp', quality=86, method=6); im.resize((2560, 1440), Image.LANCZOS).save(f'{ST}plate-{n}.webp', quality=86, method=6)
        if len(sys.argv) > 1: im.save(f'/tmp/edited-{n}.png')
main()
