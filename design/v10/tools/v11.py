#!/usr/bin/env python3
# v11 plate and sprite edits, written to the stage only. Plates start from the LIVE plates (plates.py's own monitor removal + portfolio), so the old wall monitors never exist; atlases start from tools/v11-base (the v10 stage).
#   python3 tools/v11.py plates | bamboo | heads | archives   (stage 1 of the plates is cached in /tmp/v11; bamboo re-runs the grove on the plates `plates` left there; archives repaints row 4 in the staged atlas)
import sys, json, os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from scipy import ndimage as ni
HERE = os.path.dirname(os.path.abspath(__file__)); BASE = HERE + '/v11-base/'
LIVE, ST = '/workspace/agent-city/public/office2d/assets/', '/workspace/agent-city/design/v10/stage/public/office2d/assets/'
exec(open(HERE + '/plates.py').read().rsplit('main()', 1)[0].replace("sys.argv", "['']")) # poly_mask, laplace_fill, bbox, detail, remove_third, enlarge_portfolio
L = json.load(open(BASE + 'layout.json'))
OFF = (1400, 1420) # the desk polygons below were read off a crop at this origin
crop = lambda pts: [(x + OFF[0], y + OFF[1]) for x, y in pts]
def over(a, c, k): return a * (1 - k) + c * k
# ---------- boss desk: a straight, flat, matte black table in place of the curved wooden desk, same room perspective as the desks behind it. Monitors, books, mug and lamp stay; the floor under the old desk is rebuilt ----------
SHADE = crop([(862, 262), (872, 235), (900, 215), (912, 200), (935, 205), (940, 225), (938, 250), (925, 280), (915, 298), (880, 300), (862, 285)])
MUG = [(3060, 1750), (3156, 1750), (3156, 1834), (3060, 1834)]; MUGD = (-1052, 22) # the cream mug from the Numbers desk: the old copper one was mostly wood reflection and vanished on black
SEAM = 2058; VP = (1920, 1000); XL, XR, TB, TF, LIP, FOOT, LEG = 1440, 2190, 1690, 1860, 20, 2030, 20 # front left and right of the top, its back and front y, slab depth, foot y, leg width
back = lambda x, y: x + (VP[0] - x) * (TF - y) / (TF - VP[1]) # where a front edge has got to at height y, on its way to the room's vanishing point
TOP = [(back(XL, TB), TB), (back(XR, TB), TB), (XR, TF), (XL, TF)]; BODY = TOP[:2] + [(XR, TF + LIP), (XR, FOOT), (XL, FOOT), (XL, TF + LIP)]
MONS = [[(1559, 1640), (1793, 1640), (1793, 1689), (1561, 1750)], [(1790, 1640), (2060, 1640), (2060, 1690), (1790, 1690)], [(1634, 1722), (1672, 1708), (1672, 1746), (1634, 1750)], [(1911, 1686), (1951, 1686), (1951, 1722), (1911, 1722)],
 [(1610, 1752), (1640, 1745), (1690, 1738), (1712, 1742), (1713, 1752), (1690, 1762), (1655, 1773), (1625, 1769)], [(1866, 1718), (1878, 1706), (1985, 1704), (1994, 1714), (1990, 1724), (1960, 1731), (1880, 1731), (1868, 1726)]]
BOOKS = [(1486, 1760), (1500, 1752), (1586, 1752), (1590, 1775), (1600, 1785), (1601, 1815), (1540, 1836), (1474, 1825), (1474, 1790), (1486, 1782)]; PLANT = [(1496, 1735), (1520, 1696), (1560, 1735), (1555, 1760), (1500, 1762)]; BOOKDX = 30
KEYB = [(1798, 1748), (2052, 1748), (2062, 1802), (1788, 1802)]
CHAIR = [(x + 1380, y + 1500) for x, y in [(450, 270), (475, 248), (540, 242), (600, 250), (635, 275), (645, 358), (680, 365), (678, 395), (650, 405), (660, 440), (640, 470), (590, 495), (565, 500), (565, 530), (665, 570), (665, 600), (560, 610), (558, 642), (530, 642), (528, 608), (425, 600), (425, 570), (530, 530), (530, 498), (470, 490), (440, 455), (432, 405), (412, 395), (418, 365), (445, 358)]]
wood = lambda a: (np.clip(((a[..., 0] - a[..., 2]) / (a[..., 0] + 8) - 0.42) / 0.14, 0, 1) * np.clip((a[..., 0] / (a[..., 1] + 4) - 1.32) / 0.2, 0, 1) * np.clip((a[..., 0] - 44) / 30, 0, 1))[..., None] # how much of a pixel is lit orange desk, on either plate: dark and green paint stays
# the fridge door's neon heart and its glow: the door's own gradient carried across, plus the grain of the clean door beside it
def unheart(a):
    m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).ellipse((88, 1362, 240, 1502), fill=255); hole = np.asarray(m, float) / 255; box, lo = laplace_fill(a, hole, iters=900); x0, y0, x1, y1 = box
    gr = detail(a, (56, 1350, 96, 1500))[:, ::-1]; h, w = gr.shape[:2]; yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]
    tile = lambda v, n: np.where(v % (2 * n) >= n, 2 * n - 1 - v % (2 * n), v % (2 * n)); k = ni.gaussian_filter(hole, 5)[y0:y1, x0:x1, None]
    out = a.copy(); out[y0:y1, x0:x1] = over(out[y0:y1, x0:x1], lo + gr[tile(yy, h), tile(xx, w)] * 0.7, k); return out
# ---------- the lit panels in the original art. Each is filled from the rim of its own surface, sky from sky and facade from facade, so the fills have no copied texture; facades then get a few dim windows on their neighbours' rows ----------
# hole, what must not feed it (the other surface) or None, facade (True) or sky
FILLS = [([(496, 984), (564, 984), (564, 1100), (496, 1100)], None, True), # low left: panel and its purple frame
 ([(1072, 958), (1126, 958), (1126, 1018), (1072, 1018)], None, True), # lit bay on the left terrace
 ([(3014, 610), (3050, 610), (3028, 662), (3014, 662)], [(3050, 610), (3100, 540), (3120, 700), (3028, 662)], False), # upper right: the low panel hangs off the tower, the sky side first
 ([(3050, 600), (3072, 606), (3072, 668), (3024, 668)], [(2990, 590), (3050, 600), (3024, 668), (2990, 668)], True), # then the tower side
 ([(3056, 542), (3096, 542), (3096, 602), (3056, 602)], [(3000, 500), (3058, 500), (3058, 610), (3000, 610)], True), # the high panel, on the tower's edge
 ([(3398, 184), (3463, 184), (3463, 250), (3398, 250)], [(3380, 250), (3480, 250), (3480, 300), (3380, 300)], False)] # rooftop glow: all sky
CROWN = [(3420, 256), (3430, 232), (3448, 232), (3458, 256)] # the plain roof block back on the tower, in the tower's own paint
NEWWIN = [(514, 1014), (538, 1040), (520, 1072), (3070, 568), (3084, 592), (1090, 990)] # a few dim windows, off any grid
def panes(w, h, rs):
    # low-contrast facade: floor bands and mullions with each bay a little different, as the painted towers read at this size
    px_, py_ = 14, 20; cells = rs.uniform(-0.1, 0.08, (h // py_ + 2, w // px_ + 2)); yy, xx = np.mgrid[0:h, 0:w]; yo, xo = (yy + 5 * (xx // 60 % 2)), xx
    t = cells[yo // py_ % cells.shape[0], xo // px_ % cells.shape[1]] - 0.16 * (yo % py_ < 3) - 0.1 * (xo % px_ < 2); return ni.gaussian_filter(t, 0.8)[..., None]
def unpanel(a):
    out = a.copy(); rs = np.random.RandomState(23)
    for pts, ign, facade in FILLS:
        hole = poly_mask(pts); box, lo = laplace_fill(out, hole, ignore=poly_mask(ign) if ign else None, iters=500); x0, y0, x1, y1 = box; k = ni.gaussian_filter(hole, 3 if facade else 1.6)[y0:y1, x0:x1, None]
        if facade: lo = over(lo, lo.mean(-1, keepdims=True), 0.55) * 0.72 * (1 + panes(x1 - x0, y1 - y0, rs)) # the rim still carries the panel's pink
        out[y0:y1, x0:x1] = over(out[y0:y1, x0:x1], lo, k)
    tower = np.median(out[262:284, 3424:3454].reshape(-1, 3), 0); out = over(out, tower, poly_mask(CROWN, 0.9)[..., None])
    w = Image.new('L', (W, H), 0); d = ImageDraw.Draw(w)
    for x, y in NEWWIN: d.rectangle((x, y, x + 4, y + 6), fill=255)
    k = np.asarray(w.filter(ImageFilter.GaussianBlur(1.0)), float)[..., None] / 255; return out + k * np.array([104.0, 70, 34])
def boss_mask():
    m = Image.new('L', (W, H), 0); x0, y0, x1, y1 = [v * s for v, s in zip(L['masks']['boss'], (W, H, W, H))]
    im = Image.open(BASE + 'boss-mask.png').getchannel('A').resize((round(x1 - x0), round(y1 - y0)), Image.BICUBIC); m.paste(im, (round(x0), round(y0))); return np.asarray(m, float) / 255
def floorfill(a, hole, ignore):
    # wood tiles carried on by translation above the rug line, rug below: low frequencies from the hole's rim, real texture from the floor beside the desk
    box, lo = laplace_fill(a, hole, ignore=ignore, iters=2200); x0, y0, x1, y1 = box
    yy, xx = np.mgrid[0:y1 - y0, 0:x1 - x0]; tile = lambda v, n: np.where(v % (2 * n) >= n, 2 * n - 1 - v % (2 * n), v % (2 * n))
    sr = a[1470:1640, 1430:1570, :][:, ::-1]; dw = np.clip(sr - ni.gaussian_filter(sr, (12, 12, 0)), -8, 6) * 0.42; sr = a[1890:2070, 2424:2462]; dr = np.clip(sr - ni.gaussian_filter(sr, (12, 12, 0)), -12, 9)
    wood, rug = dw[(yy + y0) % 170, (xx + x0 - (yy + y0) // 170 * 53) % 140], dr[tile(yy, 180), tile(xx, 38)]
    v = np.clip(((yy + y0) - (1850 + 0.28 * np.maximum(xx + x0 - 2100, 0))) / 16, 0, 1)[..., None]
    k = ni.gaussian_filter(hole, 3)[y0:y1, x0:x1, None]; out = a.copy(); out[y0:y1, x0:x1] = over(out[y0:y1, x0:x1], lo + wood * (1 - v) + rug * v, k); return out
def spline(pts, n=24):
    P = np.array(pts, float); return [tuple(((1 - t) ** 2 * P[0] + 2 * t * (1 - t) * P[1] + t * t * P[2])) for t in np.linspace(0, 1, n)]
def stroke(size, pts, width, blur=0.7):
    m = Image.new('L', size, 0); ImageDraw.Draw(m).line(pts, fill=255, width=width, joint='curve')
    return np.asarray(m.filter(ImageFilter.GaussianBlur(blur)), float)[..., None] / 255
def black_desk(N, M, name):
    night = name == 'night'; yy, xx = np.mgrid[0:H, 0:W].astype('float32'); old = ni.binary_dilation(M > 0.02, iterations=24) | (np.maximum(poly_mask([(1470, 1690), (1580, 1690), (1610, 1850), (1450, 1850)]), poly_mask([(2190, 1790), (2340, 1790), (2340, 1880), (2190, 1880)])) > 0.5); old &= np.arange(H)[:, None] < 2122; on = (yy >= TB) | (xx >= SEAM)
    O = floorfill(N, (old & on).astype(float), (old & ~on).astype(float))
    # under the table: its shadow on the floor, deepest at the back, plus a contact shadow at each foot
    sh = ni.gaussian_filter(poly_mask([(XL + LEG, TF + LIP), (XR - LEG, TF + LIP), (XR - 30, 1985), (XL + 30, 1985)]), 22) * 0.82
    for x in (XL + LEG / 2, XR - LEG / 2): sh = np.maximum(sh, np.exp(-(((xx - x) / 46) ** 2 + ((yy - FOOT) / 9) ** 2)) * 0.7)
    O = O * (1 - sh[..., None]); ink = np.array([20.0, 18, 21]) * (0.8 if night else 1)
    def pool(cx, cy, rx, ry, c): return np.exp(-(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2))[..., None] * np.array(c, 'float32')
    rs = np.random.RandomState(19); soft = ni.zoom(ni.gaussian_filter(rs.randn(H // 12 + 1, W // 12 + 1), 2.2), 12, order=1)[:H, :W, None]; soft = soft / soft.std() * 1.6; fine = ni.gaussian_filter(rs.randn(H, W), 0.8)[..., None]; fine = fine / fine.std() * 0.9
    # legs: a flat front face and the inner face running back into the shadow
    for x0, x1, d in ((XL, XL + LEG, 1), (XR - LEG, XR, -1)):
        ix = x1 if d > 0 else x0; t = (FOOT - TF - LIP) / (FOOT - VP[1]); O = over(O, ink * 0.62 + soft * 0.5, poly_mask([(ix, TF + LIP), (ix, FOOT), (ix + (VP[0] - ix) * t, TF + LIP)], 0.8)[..., None])
        O = over(O, ink * 1.15 + soft * 0.6, poly_mask([(x0, TF + LIP), (x1, TF + LIP), (x1, FOOT), (x0, FOOT)], 0.7)[..., None])
        hl = x0 + 1.5 if d > 0 else x1 - 1.5; O = O + poly_mask([(hl - 1.5, TF + LIP), (hl + 1.5, TF + LIP), (hl + 1.5, FOOT - 4), (hl - 1.5, FOOT - 4)], 0.7)[..., None] * np.array([34.0, 26, 22]) * (0.55 if night else 1)
    # the slab's front, then the top: matte, so light only pools softly: the room from the window side, the two screens, the lamp
    g = 0.6 if night else 1; O = over(O, ink * 1.3 + soft * 0.6 + fine, poly_mask([(XL, TF), (XR, TF), (XR, TF + LIP), (XL, TF + LIP)], 0.7)[..., None])
    sheen = (np.clip((TF - yy) / (TF - TB), 0, 1)[..., None] * np.array([9.0, 7, 7]) * g + pool(1700, 1776, 170, 40, (2, 8, 9)) * (1.4 if night else 1) + pool(1930, 1742, 200, 40, (5, 6, 11)) * (1.4 if night else 1) + pool(2118, 1806, 170 if night else 125, 62, (70, 40, 20)) * (1.1 if night else 0.55))
    top = ink * (1.45 if night else 0.9) + sheen + soft + fine; O = over(O, top, poly_mask(TOP, 0.8)[..., None]) # dusk runs darker: the runtime grade lifts and warms that plate
    rim = np.clip(poly_mask(TOP, 0.8) - poly_mask([(p[0] + (2.5 if i in (0, 3) else -2.5), p[1] + (2 if i < 2 else -2.5)) for i, p in enumerate(TOP)], 0.8), 0, 1)[..., None] # the eased edge catches a little light
    O = O + rim * (np.array([56.0, 44, 38]) * g + sheen * 0.5)
    # things on the table: soft contact shadow first, then the object
    for pts, b, a in ((KEYB, 7, 0.4), (MONS[4], 8, 0.55), (MONS[5], 8, 0.55), ([(x + BOOKDX + 2, y + 5) for x, y in BOOKS], 9, 0.6), ([(2024, 1836), (2096, 1826), (2098, 1850), (2030, 1854)], 6, 0.55)):
        O = O * (1 - ni.gaussian_filter(poly_mask(pts), b)[..., None] * a)
    o = Image.new('RGB', (W, H), 0); d = ImageDraw.Draw(o, 'RGB'); d.polygon(KEYB, fill=(40, 37, 39) if not night else (31, 29, 32)); O = over(O, np.asarray(o, 'float32'), poly_mask(KEYB, 0.8)[..., None])
    key = Image.new('L', (W, H), 0); dk = ImageDraw.Draw(key)
    for r in range(5):
        y0_, y1_ = 1753 + r * 9.8, 1753 + r * 9.8 + 7; lx, rx = 1798 - 2 * r, 2052 + 2 * r
        for c in range(22): dk.rectangle((lx + (rx - lx) * c / 22 + 1, y0_, lx + (rx - lx) * (c + 1) / 22 - 1.5, y1_), fill=255)
    O = O + np.asarray(key.filter(ImageFilter.GaussianBlur(0.7)), 'float32')[..., None] / 255 * np.array([20.0, 19, 20]) * g
    O = over(O, N, np.maximum.reduce([poly_mask(q, 0.7) for q in MONS])[..., None] * (1 - wood(N)))
    Nb = np.roll(N, BOOKDX, 1); O = over(O, Nb, poly_mask([(x + BOOKDX, y) for x, y in PLANT], 0.7)[..., None] * (1 - wood(Nb))); bk = poly_mask([(x + BOOKDX, y) for x, y in BOOKS], 0.7)[..., None]; return over(O, Nb, bk * (1 - wood(Nb) * ni.gaussian_filter((bk[..., 0] - ni.binary_erosion(bk[..., 0] > 0.5, iterations=9)).clip(0, 1), 1)[..., None]))
def desk(A, name):
    # A: plate after plates.py. N: the same plate without Grok's chair (the nochair patch laid in); the desk is edited on N, then the chair goes back on, and N also rebuilds the patch
    ax, ay, w, h, x, y = L['nochair']['b0']; atlas = Image.open(BASE + f'nochair-{name}.webp').convert('RGBA')
    pw, ph = round(w * 1.5), round(h * 1.5); X, Y = round(x * 3), round(y * 3); cell = np.asarray(atlas.crop((ax, ay, ax + w, ay + h)).resize((pw, ph), Image.LANCZOS), float)
    ka = np.zeros((H, W, 1)); ka[Y:Y + ph, X:X + pw, 0] = cell[..., 3] / 255; Nc = A.copy(); Nc[Y:Y + ph, X:X + pw] = cell[..., :3]; N = over(A, Nc, ka)
    chair = ni.binary_fill_holes(ni.binary_closing(np.abs(A - N).sum(-1) > 7, iterations=10)); chair = ni.binary_opening(chair, iterations=3)
    chair = (ni.gaussian_filter(chair.astype(float), 1.2) * (ka[..., 0] > 0.02))[..., None]
    M = boss_mask(); shade = poly_mask(SHADE, 1.0)[..., None]; mug = poly_mask(MUG, 1.0)[..., None]
    O = black_desk(N, M, name)
    # lamp: shade carried over, a thin new arm down to a foot on the new wing end; the mug rides the wing
    def paste(c, k, dx, dy=0): return np.roll(np.roll(c, dx, 1), dy, 0), np.roll(np.roll(k, dx, 1), dy, 0)
    c, k = paste(N, mug, *MUGD); nm, _ = paste(stage1('night'), mug, *MUGD); O = over(O, c, k * ni.grey_opening(1 - wood(nm)[..., 0], size=3)[..., None]) # matted on the night plate, where cream and wood are furthest apart
    foot = (2112, 1796); arm = spline([(2124, 1644), (2172, 1694), foot]); dark = np.array([46.0, 36, 34]) * (1.2 if name == 'dusk' else 0.9)
    e = Image.new('L', (W, H), 0); ImageDraw.Draw(e).ellipse((foot[0] - 30, foot[1] - 9, foot[0] + 30, foot[1] + 9), fill=255); e = np.asarray(e.filter(ImageFilter.GaussianBlur(1)), float)[..., None] / 255
    O = O * (1 - ni.gaussian_filter(np.roll(e, 8, 0), (5, 9, 0)) * 0.5); O = over(O, dark, e); O = over(O, dark, stroke((W, H), arm, 7))
    O = over(O, dark + np.array([74.0, 52, 34]), stroke((W, H), [(p[0] - 1.5, p[1] - 1) for p in arm], 2, 0.5) * 0.7)
    c, k = paste(N, shade, 2062 - 2262); O = over(O, c, k)
    F = over(O, A, chair * poly_mask(CHAIR, 1.0)[..., None] * (1 - wood(A))) # plate = edited, chair back on: its own outline only, the old desk's dark kneehole and slivers stay out
    new = np.asarray(Image.fromarray(np.clip(O[Y:Y + ph, X:X + pw], 0, 255).round().astype('uint8')).resize((w, h), Image.LANCZOS), float)
    out = np.asarray(atlas, float).copy(); out[ay:ay + h, ax:ax + w, :3] = new
    return F, Image.fromarray(out.round().astype('uint8'), 'RGBA')
def boss_mask_new():
    # the monitors from the old mask, the table's whole outline (legs and the gap between them too: nothing walks behind it low enough to show through), the lamp and what stands on the table
    M = boss_mask(); out = M * (np.arange(W) < SEAM)[None, :] * (np.arange(H) < TB)[:, None]; out = np.maximum.reduce([out, poly_mask(BODY, 0.7), poly_mask([(x + BOOKDX, y) for x, y in BOOKS + PLANT], 1), poly_mask(SHADE, 1)])
    x0, y0, x1, y1 = [v * s for v, s in zip(L['masks']['boss'], (W, H, W, H))]; a = Image.fromarray((out * 255).round().astype('uint8')).crop((round(x0), round(y0), round(x1), round(y1))).resize((660, 400), Image.LANCZOS)
    im = Image.merge('LA', (Image.new('L', (660, 400), 255), a)); im.save(ST + 'boss-mask.png')
    return out
def stage1(n):
    f = f'/tmp/v11/stage1-{n}.npy'
    if os.path.exists(f): return np.load(f)
    a = np.asarray(Image.open(f'{LIVE}plate-{n}-hi.webp').convert('RGB'), float); a = enlarge_portfolio(remove_third(a)); np.save(f, a); return a
# ---------- right-wall monitors: stacked, 1.5x wider, same height, hung from the header on two rods, on the wall past the window (they clip at 16:10, on purpose) ----------
WX0, WX1 = 3694, 3820; WH_ = 480; WY = [222, 728] # the top clears the ↻ and the last-update stamp
WQ = [[(WX0, y), (WX1, y), (WX1, y + WH_), (WX0, y + WH_)] for y in WY]
def wall2(a, night):
    x0, y0, x1, y1 = 3620, 0, 3840, 1190; Z = 3; w, h = (x1 - x0) * Z, (y1 - y0) * Z; out = a.copy(); P = lambda pts: [((x - x0) * Z, (y - y0) * Z) for x, y in pts]
    def mask(pts, blur=0, r=0):
        m = Image.new('L', (w, h), 0); ImageDraw.Draw(m).polygon(P(pts), fill=255)
        if r: m = m.filter(ImageFilter.GaussianBlur(r * Z)).point(lambda v: 255 if v > 127 else 0)
        if blur: m = m.filter(ImageFilter.GaussianBlur(blur * Z))
        return np.asarray(m.resize((x1 - x0, y1 - y0), Image.LANCZOS), float)[..., None] / 255
    reg = out[y0:y1, x0:x1]; rod = np.array([24.0, 20, 24]) * (1.0 if night else 1.3)
    for rx in (WX0 + 22, WX1 - 22):
        for y_a, y_b in ((60, WY[0]), (WY[0] + WH_, WY[1])): reg = over(reg, rod, mask([(rx - 3, y_a), (rx + 3, y_a), (rx + 3, y_b), (rx - 3, y_b)], 0.6))
    for q in WQ:
        B = 8; o = [(q[0][0] - B, q[0][1] - B), (q[1][0] + B, q[1][1] - B), (q[2][0] + B, q[2][1] + B), (q[3][0] - B, q[3][1] + B)]
        reg = reg + np.array([92.0, 124, 210]) * mask(o, 34) * (0.14 if night else 0.04) # soft spill on the wall behind
        reg = reg * (1 - mask([(x + 7, y + 9) for x, y in o], 10) * 0.42)
        om, gm = mask(o, 0.4, 3), mask(q, 0.4, 2); hl = np.clip(om - mask([(x + 2, y + 2.5) for x, y in o], 0.4, 3), 0, 1) * np.array([92.0, 78, 70]) * (0.55 if night else 0.8)
        reg = over(reg, np.array([26.0, 22, 26]) * (1.0 if night else 1.3) + hl, om); reg = over(reg, np.array([12.0, 13, 22]), gm)
    out[y0:y1, x0:x1] = reg; return out
# ---------- skyline: Bangkok LEDs on the painted towers. Everything is emissive light on a separate layer, screened in through the building mask, so the paint stays underneath ----------
# x0, x1 of each tower, window tint, LED line colour (or None), both read off the plate
TOWERS = [(300, 520, 'warm', (255, 190, 96), 215), (710, 920, 'cool', (120, 230, 255), 345), (950, 1070, 'warm', None, 575), (1190, 1290, 'pink', (255, 96, 186), 560), (1380, 1480, 'warm', (255, 190, 96), 700), (2420, 2540, 'cool', None, 810),
 (2560, 2670, 'warm', (255, 200, 120), 600), (2810, 2890, 'cool', (190, 130, 255), 660), (3030, 3180, 'pink', (255, 96, 186), 560), (3320, 3500, 'warm', (255, 190, 96), 225)]
TINT = {'warm': (1.0, 0.8, 0.52), 'cool': (0.62, 0.92, 1.0), 'pink': (1.0, 0.6, 0.86)}
def building_mask(night, dusk):
    fg = Image.new('L', (W, H), 0); x0, y0, x1, y1 = [round(v * s) for v, s in zip(L['masks']['fg'], (W, H, W, H))]
    fg.paste(chan(BASE + 'fg-mask.png').resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0)); fg = np.asarray(fg, float) / 255
    # the dusk sky is far brighter than any tower; the mountain and harbour are cut by hand
    lum = ni.gaussian_filter(dusk.sum(-1) / 3, 1.2); skyl = ni.gaussian_filter(dusk.sum(-1) / 3, 60); m = lum < np.minimum(skyl * 0.78, 118); m &= (np.arange(H) < 1125)[:, None]; m &= (np.arange(H) > 100)[:, None]
    m[900:, 1560:2440] = False; m = ni.binary_closing(m, iterations=7); m = ni.binary_opening(m, iterations=3); return ni.gaussian_filter(m.astype(float), 1.0), fg
def tower_edges(bm):
    # LED lines along the painted silhouette, smoothed so they read as a drawn curve; breaks where another tower crosses
    B = Image.new('RGB', (W, H), 0); d = ImageDraw.Draw(B); m = bm > 0.5
    for x0, x1, tint, col, top in TOWERS:
        if not col: continue
        sub = m[:, x0:x1]; ys = np.arange(top + 10, min(top + 640, 1095)); ok = [y for y in ys if sub[y].any()]
        if len(ok) < 80: continue
        for pick, g in ((lambda v: v.max(), 1.0), (lambda v: v.min(), 0.5)):
            xs = ni.median_filter(np.array([x0 + pick(np.where(sub[y])[0]) for y in ok], float), 61); xs = ni.uniform_filter1d(xs, 31); run = []
            for y, x, x_prev in zip(ok, xs, np.r_[xs[0], xs[:-1]]):
                if abs(x - x_prev) > 2.2:
                    if len(run) > 60: d.line(run, fill=tuple(int(c * g) for c in col), width=3)
                    run = []
                run.append((x, y))
            if len(run) > 60: d.line(run, fill=tuple(int(c * g) for c in col), width=3)
        for y in range(top + 70, min(top + 700, 1090), 118):
            xs = np.where(sub[y])[0]
            if len(xs) > 20: d.line([(x0 + xs.min() + 3, y), (x0 + xs.max() - 3, y)], fill=tuple(int(c * 0.36) for c in col), width=2)
    return np.asarray(B, float)
def windows(bm, night):
    # the painted windows themselves, retinted tower by tower and brightened, plus a light scatter of new ones that drift off any grid
    lum = night.sum(-1) / 3; lit = np.clip((lum - 92) / 70, 0, 1) * (bm > 0.5); tint = np.zeros((H, W, 3)) + np.array(TINT['warm'])
    for x0, x1, t, _, _ in TOWERS: tint[:, x0:x1] = TINT[t]
    e = lit[..., None] * tint * 255; rs = np.random.RandomState(16); N = Image.new('RGB', (W, H), 0); d = ImageDraw.Draw(N); er = ni.binary_erosion(bm > 0.5, iterations=8)
    for x0, x1, t, _, top in TOWERS:
        for y in range(top, 1100, 17):
            if rs.rand() < 0.45: continue
            for x in range(x0 + 6, x1 - 6, 13):
                if rs.rand() < 0.16 and er[y, x]:
                    v = 0.32 + 0.4 * rs.rand(); d.rectangle((x, y, x + 4, y + 6), fill=tuple(int(255 * c * v) for c in TINT[t]))
    return e + np.asarray(N.filter(ImageFilter.GaussianBlur(0.8)), float)
def skyline_layer(bm, night):
    e, B = windows(bm, night), tower_edges(bm)
    glow = sum(ni.gaussian_filter(B, (r, r, 0)) * g for r, g in ((1.0, 0.9), (6, 0.7), (20, 0.5))) + ni.gaussian_filter(e, (3, 3, 0)) * 0.7 + ni.gaussian_filter(e, (12, 12, 0)) * 0.5
    return e, glow
def skyline(a, name, bm, fg, lay):
    e, glow = lay; g = 1.0 if name == 'night' else 0.62; inside = (bm * (1 - fg))[..., None]; free = (1 - fg)[..., None]
    emis = np.clip((e * 0.8 * inside + glow * (inside * 0.8 + 0.2) * free) * g, 0, 255); return 255 - (255 - a) * (255 - emis) / 255
# ---------- room plants -> bamboo groves: clumps of varied culms, branches with hanging leaf fans, painted in depth layers. The back layer stays in the plate only, so bots stand in front of it ----------
POTS = {41: [(-20, 2004, 176, 2165), (222, 2120, 372, 2165)]}
# cx, half spread, base y, top y range, culm width range, count
LEFT = [(84, 80, 2010, (1590, 1700), (10, 17), 9), (298, 52, 2126, (1850, 1930), (8, 12), 5)]
RIGHT = [(3772, 68, 2152, (1570, 1700), (11, 18), 10), (3560, 42, 2152, (1830, 1930), (9, 13), 5), (3335, 62, 2152, (1900, 1990), (8, 12), 6)]
# seats and stops the leaves must not bury: anything anchored here goes to the back layer
KEEP = {41: [(130, 1540, 345, 1860)], 73: [(3190, 1460, 3375, 1890), (3530, 1250, 3770, 1890)]}
HOLES = {'room-l': [[(0, 1620), (120, 1630), (290, 1800), (290, 1950), (440, 1950), (440, 2159), (0, 2159)]], 'room-r': [[(3190, 1910), (3440, 1900), (3450, 1790), (3840, 1740), (3840, 2159), (3190, 2159)]]}
ROOM = {'room-l': ((0, 0.5, 0.1432, 1.0), LEFT), 'room-r': ((0.7852, 0.585, 1.0, 0.9986), RIGHT)}
# cx, cy, rx, ry, gain: hidden uplights in the pots, a pool on the floor and a weaker bounce up the plant
GLOW = {'room-l': [(150, 2120, 470, 120, 1.0), (300, 2150, 300, 80, 0.7), (150, 1910, 330, 300, 0.32)], 'room-r': [(3730, 2140, 520, 110, 1.0), (3400, 2140, 300, 80, 0.75), (3730, 1920, 300, 300, 0.3)]}
CONTACT = {'room-l': [(78, 2150, 230, 26), (297, 2152, 120, 16)], 'room-r': [(3772, 2150, 150, 24), (3510, 2150, 90, 14), (3345, 2150, 110, 16)]}
def chan(f):
    im = Image.open(f); return im.getchannel('A') if 'A' in im.getbands() else im.convert('L')
def leaf(d, x, y, ang, ln, wd, lit, dark, S):
    # a narrow blade with its tip dropping, lit half and shaded half either side of the midrib
    c, s = np.cos(ang), np.sin(ang); T = np.linspace(0, 1, 9); U = np.minimum(1, (T / 0.2) ** 0.7) * (1 - T) ** 0.8 * 1.25
    mid = [(x + c * ln * t, y + s * ln * t + 0.34 * ln * t * t) for t in T]; up = [(p[0] - s * wd * u, p[1] + c * wd * u) for p, u in zip(mid, U)]; dn = [(p[0] + s * wd * u, p[1] - c * wd * u) for p, u in zip(mid, U)]
    Q = lambda v: [(a * S, b * S) for a, b in v]
    d.polygon(Q(up + mid[::-1]), fill=lit); d.polygon(Q(dn + mid[::-1]), fill=dark); d.line(Q(mid[:8]), fill=tuple(min(255, v + 26) for v in lit[:3]) + (235,), width=max(1, S // 2))
def culms(spec, rs):
    out = []
    for cx, sp, base, (t0, t1), (w0, w1), n in spec:
        for i in range(n):
            u = (i + 0.5) / n * 2 - 1 + rs.normal(0, 0.14); bx = cx + u * sp; ta = rs.uniform(t0, t1) + abs(u) * (t1 - t0) * 0.35 # tallest in the middle of the clump
            out.append((bx, base + rs.uniform(-5, 5), min(ta, t1 + 40), u * rs.uniform(24, 62) + rs.normal(0, 12), rs.uniform(w0, w1) * (1 - 0.2 * abs(u)), rs.normal(0, 7)))
    return sorted(out, key=lambda c: c[4] + rs.normal(0, 4))
def brush(im, rs, amp, med):
    # paint, not vector: edges wander on a low-frequency field and small flats merge into daubs
    a = np.asarray(im.convert('RGBa'), float); h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w].astype('float32')
    fx, fy = [ni.gaussian_filter(rs.randn(h // 8 + 1, w // 8 + 1), 2.2) for _ in 'xy']; zm = lambda f: ni.zoom(f / f.std(), 8, order=1)[:h, :w]
    fine = [ni.gaussian_filter(rs.randn(h // 2 + 1, w // 2 + 1), 1.2) for _ in 'xy']; zf = lambda f: ni.zoom(f / f.std(), 2, order=1)[:h, :w]
    sy, sx = yy + zm(fy) * amp + zf(fine[1]) * amp * 0.28, xx + zm(fx) * amp + zf(fine[0]) * amp * 0.28
    o = np.stack([ni.map_coordinates(a[..., i], [sy, sx], order=1, mode='constant') for i in range(4)], -1)
    return Image.fromarray(np.clip(o, 0, 255).round().astype('uint8'), 'RGBa').filter(ImageFilter.MedianFilter(med))
def grove(box, spec, seed):
    # returns (RGBA of every layer, mask alpha of the layers bots pass behind), painted at 2x: 0 back haze, 1 culms, 2 main foliage, 3 front sprays, 4 pots (under the culms, kept out of the brush so the rims stay true)
    x0, y0, x1, y1 = box; S = 2; size = ((x1 - x0) * S, (y1 - y0) * S); ly = [Image.new('RGBA', size, (0, 0, 0, 0)) for _ in range(5)]; dr = [ImageDraw.Draw(i) for i in ly]; rs = np.random.RandomState(seed)
    INK = [(44, 74, 34), (58, 90, 38), (76, 102, 42), (36, 64, 36), (92, 110, 46), (48, 82, 46)]; X = lambda v: (v - x0) * S; Y = lambda v: (v - y0) * S; kept = KEEP.get(seed, [])
    for px0, py0, px1, py1 in POTS.get(seed, []):
        Q = lambda v: [(X(a), Y(b)) for a, b in v]; d = dr[4]; d.polygon(Q([(px0, py0), (px1, py0), (px1 - 9, py1), (px0 + 9, py1)]), fill=(150, 72, 46, 255)); d.polygon(Q([(px1 - 44, py0), (px1, py0), (px1 - 9, py1), (px1 - 40, py1)]), fill=(104, 48, 34, 255))
        d.rounded_rectangle(Q([(px0 - 7, py0 - 6), (px1 + 7, py0 + 16)]), 5, fill=(176, 88, 56, 255)); d.ellipse(Q([(px0 + 4, py0 - 12), (px1 - 4, py0 + 8)]), fill=(30, 22, 20, 255))
    floor = max(c[2] for c in spec)
    def fan(lx, ly_, side, n, ln, depth):
        z = depth
        if z and any(a < lx < c and b < ly_ < e for a, b, c, e in kept): z = 0 # stays in the plate, off the mask
        warm = np.clip(1 - (floor - ly_) / 620, 0, 1) ** 2; top = np.clip(1 - (ly_ - 1200) / 600, 0, 1); shade = (0.56, 1.0, 1.08)[min(z, 2)] if z != 3 else 1.2
        for _ in range(n):
            base = np.array(INK[rs.randint(6)], float) * rs.uniform(0.86, 1.14) * (0.62 if z == 0 else 1); base = base * (1 - 0.2 * warm) + np.array([150.0, 104, 44]) * 0.2 * warm + np.array([10.0, 12, 2]) * top
            a0 = (np.pi / 2 - side * rs.uniform(0.25, 1.15)) + rs.normal(0, 0.1); lit = np.clip(base * shade * 1.12, 0, 255); dk = np.clip(base * shade * 0.7, 0, 255)
            leaf(dr[z if z < 3 else 3], X(lx) / S, Y(ly_) / S, a0, ln * rs.uniform(0.72, 1.25), ln * rs.uniform(0.085, 0.125), tuple(int(v) for v in lit) + (255,), tuple(int(v) for v in dk) + (255,), S)
    for bx, base, top, lean, wd, bow in culms(spec, rs):
        h = base - top; n = max(6, int(h / rs.uniform(58, 74))); ys = np.linspace(base, top, n + 1); xs = lambda y: bx + lean * ((base - y) / h) ** 1.7 + bow * np.sin(np.pi * (base - y) / h)
        hue = np.array(((84, 92, 44), (106, 108, 50), (70, 82, 42), (128, 118, 58))[rs.randint(4)], float) * rs.uniform(0.9, 1.1); d = dr[1]
        for i in range(n):
            y_a, y_b = ys[i], ys[i + 1]; w_ = wd * (1 - 0.62 * (i / n) ** 1.4); warm = np.clip(1 - (floor - y_a) / 520, 0, 1) ** 2
            for u in np.linspace(-1, 1, max(5, int(w_ * S))): # round culm: bright on the window side, warm from below
                v = hue * (0.5 + 0.72 * np.clip(0.55 + 0.6 * u - 0.5 * u * u, 0, 1)) + np.array([46.0, 24, 7]) * warm * (1 - 0.3 * u); d.line([(X(xs(y_a)) + u * w_ * S / 2, Y(y_a)), (X(xs(y_b)) + u * w_ * S / 2, Y(y_b))], fill=tuple(int(c) for c in np.clip(v, 0, 255)) + (255,), width=2)
            px, py = X(xs(y_b)), Y(y_b); d.line([(px - w_ * .62 * S, py), (px + w_ * .62 * S, py)], fill=(38, 40, 26, 255), width=int(2.4 * S)); d.line([(px - w_ * .55 * S, py + 3 * S), (px + w_ * .55 * S, py + 3 * S)], fill=tuple(int(c) for c in np.clip(hue * 1.5, 0, 255)) + (190,), width=S)
            if i < n * 0.28 and rs.rand() > 0.3: continue # the lower culm is mostly bare, as a clump shades itself out
            for side in ((1, -1) if rs.rand() < 0.6 or i >= n - 2 else (rs.choice((1, -1)),)):
                bl = rs.uniform(46, 130) * (0.75 + 0.5 * i / n) * min(1, h / 620); ex, ey = xs(y_b) + side * bl, y_b - bl * rs.uniform(0.1, 0.5); mx, my = (xs(y_b) + ex) / 2, min(y_b, ey) - bl * 0.12
                pts = spline([(xs(y_b), y_b), (mx, my), (ex, ey)], 10); dr[2 if rs.rand() < 0.6 else 1].line([(X(a), Y(b)) for a, b in pts], fill=(72, 74, 40, 255), width=int(2.2 * S))
                for p in pts[4::3]: fan(p[0], p[1], side, 2 + rs.randint(3), rs.uniform(52, 98), rs.choice((0, 0, 2, 2, 3)))
        for _ in range(6): # crown: the culm's tip disappears into leaves
            fan(xs(top) + rs.normal(0, 26), top + rs.uniform(-18, 90), rs.choice((1, -1)), 3, rs.uniform(58, 102), rs.choice((0, 2, 2, 3)))
    for cx, sp, base, _, _, n in spec: # undergrowth at the foot of each clump, so no culm just stops
        for _ in range(n * 2): fan(cx + rs.uniform(-1.2, 1.2) * sp, base - rs.uniform(10, 90) - (20 if POTS.get(seed) else 0), rs.choice((1, -1)), 3, rs.uniform(42, 72), rs.choice((0, 2, 3)) if not POTS.get(seed) else 0)
    base = Image.new('RGBa', size, (0, 0, 0, 0)); mask = Image.new('L', size, 0); out = base
    for i in (0, 4, 1, 2, 3):
        p = (ly[i].convert('RGBa') if i == 4 else brush(ly[i], rs, 3.0 if i else 4.5, 5)).filter(ImageFilter.GaussianBlur((4.2, 0.9, 1.2, 0.8, 1.2)[i])); pa = np.asarray(p, float)
        if i == 0: pa = pa * np.array([1, 1, 1, 0.82]) # atmospheric: the plate shows through the far leaves
        o = np.asarray(out, float); out = Image.fromarray(np.clip(pa + o * (1 - pa[..., 3:] / 255), 0, 255).round().astype('uint8'), 'RGBa')
        if i: mask = Image.fromarray(np.clip(255 - (255 - np.asarray(mask, float)) * (255 - pa[..., 3]) / 255, 0, 255).round().astype('uint8'))
    return out.convert('RGBA').resize((x1 - x0, y1 - y0), Image.LANCZOS), mask.resize((x1 - x0, y1 - y0), Image.LANCZOS)
def pool(glows):
    # inverse-square falloff from each source, flattened into the floor plane, faded to nothing at the rim of its reach
    yy, xx = np.mgrid[0:H, 0:W].astype('float32'); f = np.zeros((H, W), 'float32')
    for cx, cy, rx, ry, g in glows:
        d = ((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2; f += g * np.clip(1 - d / 7, 0, 1) ** 2 / (1 + 2.2 * d)
    return f
def underlight(a, key, name):
    f = pool(GLOW[key])[..., None]; rs = np.random.RandomState(7); grain = ni.zoom(ni.gaussian_filter(rs.randn(H // 16 + 1, W // 16 + 1), 2.4), 16, order=1)[:H, :W, None]; grain = 1 + 0.14 * grain / grain.std()
    gain = 0.8 if name == 'dusk' else 2.0; lit = a * (1 + f * gain * grain * np.array([1.05, 0.62, 0.3])) + f * grain * gain * np.array([64.0, 34, 12]) # light lands on what is there, so the floor keeps its texture
    sh = np.zeros((H, W, 1), 'float32')
    for cx, cy, rx, ry in CONTACT[key]:
        sh[..., 0] = np.maximum(sh[..., 0], np.exp(-(((np.arange(W, dtype='float32')[None, :] - cx) / rx) ** 2 + ((np.arange(H, dtype='float32')[:, None] - cy) / ry) ** 2)))
    return lit * (1 - sh * 0.5), f
def bamboo(a, name):
    out = a.copy(); res = {}
    for key, (nb, stalks) in ROOM.items():
        old = np.maximum.reduce([poly_mask(q) for q in HOLES[key]]) # the old masks only hold the bright leaves
        hole = old > 0.5
        box, lo = laplace_fill(out, hole.astype(float), iters=1500 if key == 'room-l' else 2400); x0, y0, x1, y1 = box; k = ni.gaussian_filter(hole.astype(float), 14)[y0:y1, x0:x1, None]
        out[y0:y1, x0:x1] = over(out[y0:y1, x0:x1], lo * 0.8, k)
        out, f = underlight(out, key, name)
        B = [round(v * s) for v, s in zip(nb, (W, H, W, H))]; im, al = grove(tuple(B), stalks, 41 if key == 'room-l' else 73); g = np.asarray(im, float)
        tint = np.array([0.76, 0.86, 0.68]) if name == 'dusk' else np.array([0.56, 0.66, 0.62]); ka = g[..., 3:] / 255; fb = f[B[1]:B[3], B[0]:B[2]]
        c = g[..., :3] * tint * (1 + np.minimum(fb, 1) * np.array([0.62, 0.36, 0.14]) * (1.0 if name == 'dusk' else 1.4)) # the same light on the undersides
        out[B[1]:B[3], B[0]:B[2]] = over(out[B[1]:B[3], B[0]:B[2]], c, ka)
        res[key] = (nb, al)
    return out, res
def save_plate(a, n):
    im = Image.fromarray(np.clip(a, 0, 255).round().astype('uint8')); im.save(f'{ST}plate-{n}-hi.webp', quality=86, method=6); im.resize((2560, 1440), Image.LANCZOS).save(f'{ST}plate-{n}.webp', quality=86, method=6); return im
def grove_pass():
    # bamboo + underlight only, on the plates as they stood before it; `v11.py bamboo` re-runs just this
    for n in ('dusk', 'night'):
        a, masks = bamboo(np.load(f'/tmp/v11/prebamboo-{n}.npy'), n)
        im = save_plate(a, n); im.resize((1920, 1080), Image.LANCZOS).save(f'/tmp/v11/full-{n}.jpg', quality=88)
    for key, (nb, al) in masks.items():
        w, h = al.size; m = Image.merge('LA', (Image.new('L', (w, h), 255), al)).resize((w // 2, h // 2), Image.LANCZOS); m.save(ST + key + '-mask.png')
def plates():
    night = stage1('night'); bm, fg = building_mask(night, stage1('dusk')); lay = skyline_layer(bm, unpanel(night)); masks = None
    for n in ('dusk', 'night'):
        a = unpanel(unheart(stage1(n))); a, atl = desk(a, n); atl.save(f'{ST}nochair-{n}.webp', quality=90, method=6); a = skyline(a, n, bm, fg, lay); a = wall2(a, n == 'night'); np.save(f'/tmp/v11/prebamboo-{n}.npy', a)
    grove_pass(); boss_mask_new()
    f = Image.open(BASE + 'fg-mask.png').convert('RGBA'); fw, fh = f.size; bx = L['masks']['fg']; A_ = f.getchannel('A'); dd = ImageDraw.Draw(A_) # the monitors hang in front of the glass, so the city FX and airships pass behind them
    sx = fw / ((bx[2] - bx[0]) * W); sy = fh / ((bx[3] - bx[1]) * H)
    for y in WY: dd.rounded_rectangle(((WX0 - 8 - bx[0] * W) * sx, (y - 8 - bx[1] * H) * sy, (WX1 + 8 - bx[0] * W) * sx, (y + WH_ + 8 - bx[1] * H) * sy), 3, fill=255)
    f.putalpha(A_); f.save(ST + 'fg-mask.png')
    N = json.load(open(BASE + 'layout.json')); N['neon'] = [] # the panels those glows sat on are gone; so are the window lights sampled off them, which would blink a pink dot back
    N['lights'] = [l for l in N['lights'] if not any(min(x for x, _ in q) - 24 < l[0] * W < max(x for x, _ in q) + 24 and min(y for _, y in q) - 24 < l[1] * H < max(y for _, y in q) + 24 for q, *_ in FILLS)]
    N['wall'] = [{'id': i, 'q': [[round(x / W, 4), round(y / H, 4)] for x, y in q]} for i, q in zip(('grok', 'claude'), WQ)]
    N['boss']['lamp'] = [0.5484, 0.7778]; N['lamps'][0]['x'] = 0.5484; N['occluders'][0]['zone'][1] = round(XR / W, 4)
    for key, (nb, _) in ROOM.items(): N['masks'][key] = list(nb)
    N['steam'] = [{'x': 0.5344, 'y': 0.8285, 's': 0.8, 'ph': 0.1}, {'x': 0.8086, 'y': 0.8145, 's': 0.8, 'ph': 0.45}, {'x': 0.2245, 'y': 0.8435, 's': 0.85, 'ph': 0.7}, {'x': 0.1484, 'y': 0.6, 's': 0.9, 'ph': 0.25}]; N['dash']['mugAt'] = [0.48, 0.455]
    json.dump(N, open(ST + 'layout.json', 'w'), ensure_ascii=False, separators=(',', ':'))
# ---------- hats off: Media (row 8) and LF (row 3). stonks.py's hair painter on these rows, no glasses, each their own colour; the outlines are the same head ----------
def hair_painter(rule, base, sheen):
    src = open(HERE + '/stonks.py').read().split('def work')[0]
    src = src.replace("(Yy < 180 * s)", "(Yy < y.get('rcl', 180) * s)").replace("teal = (B > R + 12) & (G > R + 8) & (A > 8) & (Yy < lim)", "teal = RULE(R, G, B, A, Yy) & (Yy < lim)").replace("np.array([70.0, 43, 27])", f"np.array({base})").replace("np.array([58.0, 38, 22])", f"np.array({sheen})").replace("(lum[..., None] * np.array([1.62, 1.08, .78]) + np.array([24.0, 13, 6]))", f"(lum[..., None] * np.array({[round(b / 43, 2) for b in base]}) + np.array([14.0, 9, 6]))")
    g = {'RULE': rule}; exec(src, g)
    for y in g['Y'] + [g['F'], g['W']]: y.pop('lenses', None); y.pop('arms', None)
    return g
GREEN = lambda R, G, B, A, Yy: (G > R + 14) & (G > B + 18) & (A > 8)
BROWNHAT = lambda R, G, B, A, Yy: (A > 8) & (R > 96) & (R < 196) & (R > G * 1.24) & (G > B * 1.2) & (R - B > 54)
def up_work(g, im, y):
    Z = g['Z']; w, h = im.size; a = np.asarray(im.convert('RGBa').resize((w * Z, h * Z), Image.BICUBIC).convert('RGBA'), float)
    a = g['paint'](a, y); m = a[..., 3] > 128; hole = ni.binary_fill_holes(m) & ~m # the hat's rim can punch through the forehead: close it with the nearest paint
    if hole.any():
        ii = ni.distance_transform_edt(~m, return_distances=False, return_indices=True); a[hole, :3] = a[ii[0][hole], ii[1][hole], :3]; a[hole, 3] = 255
    return Image.fromarray(np.clip(a, 0, 255).round().astype('uint8'), 'RGBA').convert('RGBa').resize((w, h), Image.LANCZOS).convert('RGBA')
def moved(y, dy):
    # the same outline, slid to where this sprite's head sits
    q = lambda v: [(a, b + dy) for a, b in v]; out = dict(y, hair=q(y['hair']), pole=(y['pole'][0], y['pole'][1] + dy), lim=y['lim'] + dy, clear=y['clear'] + dy, keep=[(a, b + dy, c, d + dy) for a, b, c, d in y['keep']], rcl=y['lim'] + dy + 4); return out
# ---------- 3/4 faces: on c3/c5 the head came out about 15% smaller than the front yaw and squat under the hat, chin short, with see-through notches by the hair. The face band (brow to chin) gets its height back, the whole
# head is matched to the front yaw, and the notches close. Hats and hair above the brow only move; the chin stays on the neck, so the draw anchors are untouched ----------
BROW, CHIN, CX, SY, SX = 116.0, 176.0, 120.0, 1.2, 1.1
def fix_face(cell):
    a = np.asarray(cell.convert('RGBa'), float); h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w].astype(float)
    top = CHIN - (CHIN - BROW) * SY # where the brow lands
    sy = np.where(yy >= top, CHIN - (CHIN - yy) / SY, yy + (BROW - top)); sx = CX + (xx - CX) / SX
    o = np.stack([ni.map_coordinates(a[..., i], [sy, sx], order=3, mode='constant') for i in range(4)], -1); o = np.clip(o, 0, 255)
    im = np.asarray(Image.fromarray(o.round().astype('uint8'), 'RGBa').convert('RGBA'), float).copy(); m = im[..., 3] > 128
    hole = ni.binary_fill_holes(ni.binary_closing(m, iterations=5)) & ~m
    if hole.any():
        ii = ni.distance_transform_edt(~(m & (im[..., :3].mean(-1) < 120)), return_distances=False, return_indices=True); k = ni.gaussian_filter(hole.astype(float), 0.7)[..., None] # hair, not skin or hat; c = im[ii[0], ii[1], :3]; im[..., :3] = over(im[..., :3], c, k * (im[..., 3:] < 250)); im[..., 3] = np.maximum(im[..., 3], k[..., 0] * 255)
    return Image.fromarray(np.clip(im, 0, 255).round().astype('uint8'), 'RGBA')
def heads():
    h = Image.open(BASE + 'turn-heads.webp').convert('RGBA'); CW, CH = 220, 232
    for row, rule, base, sheen, sp, df, dw in ((8, BROWNHAT, [38.0, 27, 24], [34.0, 26, 26], '08', -34, 8), (3, GREEN, [86.0, 50, 30], [66.0, 40, 22], '03', -24, 16)):
        g = hair_painter(rule, base, sheen)
        for c, y in enumerate(g['Y']):
            box = (c * CW, row * CH, (c + 1) * CW, (row + 1) * CH); h.paste(up_work(g, h.crop(box), y), box[:2])
        up_work(g, Image.open(LIVE + f'w{sp}.png').convert('RGBA'), moved(g['W'], dw)).save(ST + f'w{sp}.png'); up_work(g, Image.open(LIVE + f'f{sp}.png').convert('RGBA'), moved(g['F'], df)).save(ST + f'f{sp}.png')
    for row in range(12):
        for c in (3, 5):
            box = (c * CW, row * CH, (c + 1) * CW, (row + 1) * CH); cell = fix_face(h.crop(box)); h.paste((0, 0, 0, 0), box); h.paste(cell, box[:2])
    h.save(ST + 'turn-heads.webp', quality=92, method=6)
    bg = Image.new('RGBA', h.size, (60, 60, 70, 255)); bg.alpha_composite(h); s = Image.new('RGB', (1320, 464)); s.paste(bg.crop((0, 232 * 8, 1320, 232 * 9)).convert('RGB'), (0, 0)); s.paste(bg.crop((0, 232 * 3, 1320, 232 * 4)).convert('RGB'), (0, 232)); s.save('/tmp/v11/h2.jpg', quality=88)
    s = Image.new('RGB', (620, 260), (60, 60, 70)); x = 0
    for f in ('w03', 'f03', 'w08', 'f08'):
        i = Image.open(ST + f + '.png').convert('RGBA'); s.paste(i, (x, 0), i); x += 150
    s.save('/tmp/v11/s2.jpg', quality=88)
# ---------- hat off: Archives (row 4). Same painter, her own colour; the pink hoodie is safe under each yaw's lim. Sources are the pre-hat-off cells in tools/v11-base; c3/c5 take the face fix again, the other rows of the staged atlas are left alone ----------
PINK = lambda R, G, B, A, Yy: (A > 8) & (R > G * 1.4) & (B > G * 0.9) & (R > 90)
def archives():
    h, b = Image.open(ST + 'turn-heads.webp').convert('RGBA'), Image.open(BASE + 'turn-heads.webp').convert('RGBA'); CW, CH = 220, 232; g = hair_painter(PINK, [54.0, 33, 19], [26.0, 17, 10]); row = 4
    g['Y'][3]['hair'][6:10] = [(154, 76), (168, 86), (176, 104), (178, 120), (168, 128), (151, 120)]; g['Y'][5]['hair'][6:10] = [(150, 80), (164, 88), (172, 104), (174, 120), (166, 128), (147, 123)] # the crown reaches her far-side strand, which the hat used to meet
    for c, y in enumerate(g['Y']):
        box = (c * CW, row * CH, (c + 1) * CW, (row + 1) * CH); cell = up_work(g, b.crop(box), y); cell = fix_face(cell) if c in (3, 5) else cell; h.paste((0, 0, 0, 0), box); h.paste(cell, box[:2])
    h.save(ST + 'turn-heads.webp', quality=92, method=6)
    up_work(g, Image.open(BASE + 'w04.png').convert('RGBA'), moved(g['W'], 4)).save(ST + 'w04.png'); up_work(g, Image.open(BASE + 'f04.png').convert('RGBA'), moved(g['F'], -34)).save(ST + 'f04.png')
if __name__ == '__main__':
    {'plates': plates, 'bamboo': grove_pass, 'heads': heads, 'archives': archives}[sys.argv[1]]()
