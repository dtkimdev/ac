#!/usr/bin/env python3
"""One-shot asset preprocessing for the painted 2.5D office (public/office2d).

  python3 bin/preprocess.py [--debug]

- design/workers-back.jpg (4x3 chibi workers on green) -> public/office2d/assets/w00..w11.png
  (chroma key with soft edges, green despill on the rim only so green hoodies survive, trimmed)
- design/plate-{dusk,night}.jpg (1280x720) -> plate-{dusk,night}.webp (2x Lanczos + light unsharp, q82)
- fg-mask / sky-mask / room-{l,r}-mask .png: alpha masks cut from the plates (window frame + vines, skyline, floor plants)
  so moving FX pass behind the painted foreground; airship*-{dusk,night}.png: the painted airships lifted from the sky.
- layout.json: hand-measured plate coordinates (window, monitors, chairs/seats, lamps, occluders),
  normalised to 0..1 of the plate, plus twinkle points sampled from the night plate.
  Tune numbers in LAYOUT below (plate pixels, 1280x720) and re-run. --debug writes shots/layout-debug.png.
v6 (design/v6/*, solid magenta backgrounds, keyed by key_magenta()): f00..f11.png front sprites on the same canvas as
  w00..w11 (head-width matched, bottom-centred), corgi.png atlas (14 walk frames + sit + sleep, shared bottom anchor),
  the boss desk baked into both plates (old desk inpainted, wood graded per plate, contact shadow, chair re-pasted),
  plate-*-hi.webp (3840x2160), boss-mask.png (occluder), water-mask.png, FG_EXTRA fg-mask fixes, NEON, DOG graph.
Needs Pillow + numpy (pip install --user pillow numpy).
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DES = os.path.join(ROOT, 'design')
OUT = os.path.join(ROOT, 'public', 'office2d', 'assets')
PW, PH = 1280, 720

# ---------------------------------------------------------------- layout (plate px)
# bots = default seating by bot number (seat order); a bot's `desk` field in data/bots.json overrides it.
# Monitor quads are TL, TR, BR, BL of the lit screen area.
# Seats: x = sprite centre, top = head top, h = sprite height, clip = y where the body disappears
# (behind the chair back / desk); chair = plate polygon re-drawn over the worker (painted chair back),
# or 'draw' for a procedural chair back (seats without a chair in the plate).
DESKS = [
    {'id': 'numbers', 'label': 'Numbers', 'theme': 'numbers', 'accent': '#f2b85c', 'bots': [2, 10],
     'monitors': [[[47, 450], [146, 448], [146, 500], [47, 502]], [[153, 448], [236, 449], [236, 501], [153, 500]]],
     'seats': [{'x': 72, 'top': 466, 'h': 122, 'clip': 577, 'visit': [134, 625], 'via': [[252, 622], [292, 600], [300, 568]],
                'chair': [[44, 516], [52, 511], [88, 511], [95, 518], [99, 545], [98, 568], [90, 577], [50, 577], [42, 568], [41, 530]]},
               {'x': 196, 'top': 466, 'h': 120, 'clip': 578, 'chair': 'draw', 'visit': [252, 622], 'via': [[292, 600], [300, 568]]}]},
    {'id': 'video', 'label': 'Video', 'theme': 'video', 'accent': '#e8806e', 'bots': [4, 5],
     'monitors': [[[299, 432], [372, 432], [372, 476], [299, 476]], [[377, 432], [448, 432], [448, 477], [377, 477]]],
     'seats': [{'x': 331, 'top': 446, 'h': 85, 'clip': 535, 'visit': [298, 572],
                'chair': [[311, 486], [316, 480], [343, 480], [349, 486], [351, 525], [345, 535], [316, 535], [310, 525]]},
               {'x': 413, 'top': 446, 'h': 85, 'clip': 535, 'chair': 'draw', 'visit': [448, 572]}]},
    {'id': 'sbp', 'label': 'SB Pallet', 'theme': 'sbp', 'accent': '#a6d67e', 'bots': [6, 9],
     'monitors': [[[573, 432], [642, 432], [642, 476], [573, 476]], [[647, 431], [715, 432], [715, 476], [647, 476]]],
     'seats': [{'x': 604, 'top': 446, 'h': 85, 'clip': 540, 'chair': 'draw', 'visit': [538, 564]},
               {'x': 686, 'top': 446, 'h': 85, 'clip': 540, 'chair': 'draw', 'visit': [754, 564]}]},
    {'id': 'messages', 'label': 'Messages', 'theme': 'messages', 'accent': '#86a6e0', 'bots': [3, 7],
     'monitors': [[[833, 432], [900, 432], [900, 476], [833, 476]], [[906, 431], [977, 432], [977, 477], [906, 477]]],
     'seats': [{'x': 866, 'top': 446, 'h': 85, 'clip': 535, 'chair': 'draw', 'visit': [834, 572]},
               {'x': 940, 'top': 446, 'h': 85, 'clip': 536, 'visit': [972, 572],
                'chair': [[919, 488], [925, 481], [952, 481], [958, 488], [960, 528], [954, 536], [924, 536], [918, 528]]}]},
    {'id': 'housekeeping', 'label': 'Housekeeping', 'theme': 'house', 'accent': '#6fbfd0', 'bots': [0, 8],
     'monitors': [[[1041, 449], [1117, 448], [1117, 500], [1041, 500]], [[1123, 449], [1212, 449], [1212, 502], [1123, 501]]],
     'seats': [{'x': 1080, 'top': 470, 'h': 122, 'clip': 586, 'chair': 'draw', 'visit': [1024, 630], 'via': [[990, 600], [985, 568]]},
               {'x': 1186, 'top': 470, 'h': 124, 'clip': 588, 'visit': [1132, 634], 'via': [[1024, 630], [990, 600], [985, 568]],
                'chair': [[1162, 522], [1172, 515], [1205, 515], [1213, 524], [1216, 560], [1213, 582], [1203, 588], [1165, 588], [1156, 578], [1155, 545]]}]},
    {'id': 'boss', 'label': 'Boss', 'theme': 'boss', 'accent': '#ecc67c', 'bots': [1],
     # v6: the big curved boss desk (design/v6/boss-desk.jpg) is baked into the plates (see boss_desk()); its two
     # outer curved monitors carry the boss screens (router graph / team board), the middle one keeps the painted city
     'monitors': 'BOSS',
     'seats': [{'x': 631, 'top': 506, 'h': 144, 'clip': 656, 'visit': [560, 708], 'via': [[440, 694], [440, 568]],
                'chair': [[603, 578], [612, 569], [650, 569], [659, 578], [663, 630], [658, 652], [645, 658], [612, 658], [602, 650], [600, 620]]},
               {'x': 872, 'top': 520, 'h': 132, 'clip': 652, 'chair': 'draw', 'spare': True, 'visit': [884, 692], 'via': [[884, 568]]}]},
]
# v6 boss desk: source bbox in design/v6/boss-desk.jpg (1280x720) and where it lands on the plate (plate px).
BOSS_SRC_BOX = (201, 103, 1086, 629)
BOSS_W, BOSS_CX, BOSS_BOTTOM = 380, 645, 700
BOSS_S = BOSS_W / (BOSS_SRC_BOX[2] - BOSS_SRC_BOX[0])
BOSS_X0, BOSS_Y0 = BOSS_CX - BOSS_W / 2, BOSS_BOTTOM - (BOSS_SRC_BOX[3] - BOSS_SRC_BOX[1]) * BOSS_S
# measured on the source image (TL, TR, BR, BL of the lit curved screens), the holo city and the desk lamp head
BOSS_MON_SRC = [[[298, 170], [505, 120], [505, 240], [302, 285]], [[512, 115], [755, 115], [755, 240], [512, 238]],
                [[765, 118], [970, 168], [968, 285], [765, 240]]]
BOSS_HOLO_SRC = [515, 245, 755, 345]
BOSS_LAMP_SRC = [985, 280]
# old boss desk + monitors + desk plants/lamp, inpainted away before the new desk goes on (the chair is kept)
OLD_BOSS = [[500, 512], [548, 484], [742, 484], [772, 503], [798, 518], [808, 560], [808, 672], [482, 672], [482, 560], [492, 530]]
BOSS_CHAIR_KEEP = [[603, 578], [612, 569], [650, 569], [659, 578], [663, 630], [658, 652], [645, 660], [646, 704], [612, 704], [612, 658], [602, 650], [600, 620]]


def bsrc(p):  # boss-desk source px -> plate px
    return [round(BOSS_X0 + (p[0] - BOSS_SRC_BOX[0]) * BOSS_S, 1), round(BOSS_Y0 + (p[1] - BOSS_SRC_BOX[1]) * BOSS_S, 1)]


DESKS[-1]['monitors'] = [[bsrc(p) for p in BOSS_MON_SRC[0]], [bsrc(p) for p in BOSS_MON_SRC[2]]]
# boss desk occluder = the desk's own alpha (boss-mask.png); everything with a smaller depth goes behind it.
OCCLUDERS = [{'depth': 545, 'mask': 'boss'}]
BOSS_ZONE = [455, 835, 640]   # x0, x1, y: a walker / the corgi with feet inside this box is behind the boss desk
# extra spots for bots beyond the 12 chairs (standing near the window rail / rugs)
STANDING = [{'x': 505, 'top': 452, 'h': 96}, {'x': 790, 'top': 452, 'h': 96}, {'x': 270, 'top': 540, 'h': 130}, {'x': 1000, 'top': 545, 'h': 130}]
LAMPS = [{'x': 792, 'y': 550, 'r': 70, 'desk': 'boss'}, {'x': 1003, 'y': 585, 'r': 46}, {'x': 12, 'y': 340, 'r': 40}, {'x': 1271, 'y': 378, 'r': 36},
         {'x': 497, 'y': 416, 'r': 30}, {'x': 783, 'y': 408, 'r': 22}]
WINDOW = [[84, 34], [1222, 34], [1222, 428], [84, 428]]          # glass above the monitor line
SKY = [[84, 34], [1222, 34], [1222, 300], [84, 300]]             # airship / star band
SEA = [[452, 352], [790, 352], [830, 426], [420, 426]]            # harbour water
SHAFTS = [[[560, 40], [740, 40], [860, 700], [420, 700]], [[180, 40], [300, 40], [420, 640], [120, 640]], [[960, 40], [1080, 40], [1180, 640], [880, 640]]]

# ---- city FX paths (plate px). Measured on the painted bridges / water / sky; check with --debug.
# Car lanes follow the lit bridge decks (polyline in travel order; 'near' = 0 far .. 1 near scales size/contrast).
LANES = [
    {'id': 'left-bridge', 'pts': [[128, 414], [220, 403], [300, 396], [400, 386], [480, 379], [540, 373], [624, 368]], 'near': [1.0, 0.45], 'water': [430, 624]},
    {'id': 'right-bridge', 'pts': [[712, 373], [800, 374], [880, 377], [960, 383], [1040, 390], [1110, 396]], 'near': [0.5, 0.85], 'water': [712, 900]},
]
# boat lanes on the open harbour: y (waterline), x range; far lanes give small slow boats
BOAT_LANES = [{'y': 361, 'x': [560, 712], 'near': 0.15}, {'y': 387, 'x': [606, 708], 'near': 0.45},
              {'y': 405, 'x': [420, 1000], 'near': 0.7}, {'y': 420, 'x': [380, 1020], 'near': 0.95}]
SKYBAND = [48, 236]          # y range for planes / airships (the skyline mask keeps them behind towers)
WALK_Y = 568                 # walkway (aisle) floor line behind the boss desk / in front of the back-row chairs
WALK_X = [298, 985]
# depth-ordered walker height fit (floor y -> upper-body sprite height), from the measured seats
WALK_H = [[560, 85], [614, 122], [699, 144]]
MULLIONS = [[0, 93], [206, 215], [385, 393], [552, 560], [732, 739], [896, 904], [1062, 1072], [1213, 1280]]
TRANSOM = [245, 255]
# interior things standing in front of the glass that the colour masks miss (lamp post on the sill, floor plants)
FG_EXTRA = [[[486, 384], [508, 384], [510, 428], [484, 428]],
            [[93, 372], [150, 380], [158, 428], [93, 428]],
            [[1140, 396], [1178, 388], [1213, 392], [1213, 428], [1136, 428]]]
# neon signs measured on the night plate (x0, y0, x1, y1, rgb): flicker + occasional buzz-off
NEON = [[171, 330, 186, 366, [255, 90, 200]], [1006, 182, 1031, 220, [255, 96, 210]], [358, 327, 372, 340, [255, 110, 190]],
        [1138, 68, 1151, 80, [255, 120, 210]], [1095, 374, 1107, 385, [255, 100, 220]], [841, 276, 853, 287, [255, 140, 120]]]
# corgi floor graph (plate px): nodes on the open floor / rug / walkway, edges along clear paths (no desk crossing)
DOG_NODES = [[150, 668], [300, 640], [330, 600], [300, 568], [440, 600], [440, 694], [560, 712], [720, 712], [850, 696],
             [884, 610], [884, 568], [640, 568], [985, 580], [1010, 640], [1120, 676], [540, 568], [780, 568], [240, 700]]
DOG_EDGES = [[0, 1], [0, 17], [17, 1], [1, 2], [2, 3], [2, 4], [3, 15], [4, 5], [4, 15], [5, 6], [6, 7], [7, 8], [8, 9],
             [9, 10], [10, 16], [16, 11], [11, 15], [10, 12], [12, 13], [13, 14], [9, 13], [8, 13], [5, 17]]
# rest spots (node index, kind): naps next to desks, sits on the rug
DOG_REST = [[17, 'sleep'], [13, 'sleep'], [2, 'sleep'], [6, 'sit'], [7, 'sit'], [1, 'sit'], [14, 'sit']]


def chroma_workers():
    im = Image.open(os.path.join(DES, 'workers-back.jpg')).convert('RGB')
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    gn = g - np.maximum(r, b)
    # bg greenness ~142, green/lime hoodies <= ~60: ramp in between
    t = np.clip((gn - 72) / (118 - 72), 0, 1)
    alpha = 1 - t * t * (3 - 2 * t)
    alpha[g < 100] = np.maximum(alpha[g < 100], 1.0)
    mask = Image.fromarray((alpha * 255).astype(np.uint8))
    mask = mask.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))  # eat the green fringe, soften
    al = np.asarray(mask).astype(np.float32) / 255
    # despill only near the edge (keeps green hoodies green)
    near = np.asarray(Image.fromarray((al < 0.98).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(7))) > 0
    lim = np.maximum(r, b) + 6
    g2 = np.where(near & (g > lim), lim, g)
    rgba = np.dstack([r, g2, b, al * 255]).clip(0, 255).astype(np.uint8)
    full = Image.fromarray(rgba, 'RGBA')
    cw, ch = im.width // 4, im.height // 3
    os.makedirs(OUT, exist_ok=True)
    sizes = []
    for i in range(12):
        cx, cy = i % 4, i // 4
        cell = full.crop((cx * cw, cy * ch, (cx + 1) * cw, (cy + 1) * ch))
        A = np.asarray(cell)[..., 3]
        ys, xs = np.where(A > 24)
        bb = (max(0, xs.min() - 3), max(0, ys.min() - 3), min(cw, xs.max() + 4), min(ch, ys.max() + 4))
        spr = cell.crop(bb)
        spr.save(os.path.join(OUT, f'w{i:02d}.png'), optimize=True)
        sizes.append([spr.width, spr.height])
    return sizes


# ---------------------------------------------------------------- v6 art (design/v6, solid magenta backgrounds)
def key_magenta(path, hue_below=None):
    """Chroma-key a sheet on a solid magenta background -> RGBA float array. Alpha from a green-weighted colour
    distance to the border median (pink hats sit close to magenta in r/b but not in g), soft edges, and magenta
    despill by un-mixing the background out of the semi-transparent rim (like lift())."""
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    brd = np.concatenate([a[:6].reshape(-1, 3), a[-6:].reshape(-1, 3), a[:, :6].reshape(-1, 3), a[:, -6:].reshape(-1, 3)])
    bg = np.median(brd, 0)
    dd = a - bg
    dist = np.sqrt(dd[..., 0] ** 2 + (2 * dd[..., 1]) ** 2 + dd[..., 2] ** 2)
    t = np.clip((dist - 34) / (78 - 34), 0, 1)
    al = t * t * (3 - 2 * t)
    if hue_below is not None:  # shaded magenta (e.g. the floor seen under a desk) keyed by hue, below row hue_below only
        mag = np.clip((np.minimum(a[..., 0] - a[..., 1] - 40, a[..., 2] - a[..., 1]) - 8) / 22, 0, 1)
        mag[:hue_below] = 0
        al = al * (1 - mag)
    m = Image.fromarray((al * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))
    al = np.asarray(m).astype(np.float32) / 255
    aa = np.maximum(al, 0.25)[..., None]
    col = np.clip((a - (1 - aa) * bg) / aa, 0, 255)
    # residual spill on the rim: magenta = r and b both above g; pull the excess toward neutral where alpha < 1
    rim = (al < 0.995)[..., None]
    ex = np.clip(np.minimum(col[..., 0], col[..., 2]) - col[..., 1] - 30, 0, None)[..., None]
    col = col - rim * ex * np.array([0.6, 0, 0.8], np.float32) * 0.5
    return np.dstack([np.clip(col, 0, 255), al * 255])


def _cells(rgba, cols, rows):
    H, W = rgba.shape[:2]
    for r in range(rows):
        for c in range(cols):
            yield rgba[r * H // rows:(r + 1) * H // rows, c * W // cols:(c + 1) * W // cols]


def _drop_border_blobs(cell):
    """keep only the main sprite: the blob through the most opaque pixel nearest the cell centre (drops bits of
    the neighbouring cells' sprites that poke over the grid lines)."""
    A = cell[..., 3]
    B = Image.fromarray(((A > 16) * 255).astype(np.uint8)).copy()  # .copy(): fromarray images are read-only
    H, W = A.shape
    yy, xx = np.mgrid[:H, :W]
    score = (A > 200) * 1e6 - (yy - H / 2) ** 2 - (xx - W / 2) ** 2
    sy, sx = np.unravel_index(np.argmax(score), score.shape)
    ImageDraw.floodfill(B, (int(sx), int(sy)), 128)
    keep = np.asarray(Image.fromarray(((np.asarray(B) == 128) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5))) > 0
    cell = cell.copy()
    cell[~keep, 3] = 0
    return cell


def _bbox(A, thr=0.25, pad=3):
    ys, xs = np.where(A > thr * 255)
    return max(0, xs.min() - pad), max(0, ys.min() - pad), min(A.shape[1], xs.max() + pad + 1), min(A.shape[0], ys.max() + pad + 1)


def front_workers(sizes):
    """design/v6/workers-front.jpg (4x3, same order as workers-back) -> f00..f11.png on the SAME canvas size as
    w00..w11 so the swivel crossfade lines up: scaled so the head (top 45% of the bust) is as wide as the back
    sprite's head, bottom-centred on the back sprite's bottom edge."""
    rgba = key_magenta(os.path.join(DES, 'v6', 'workers-front.jpg'))
    for i, cell in enumerate(_cells(rgba, 4, 3)):
        cell = _drop_border_blobs(cell)
        x0, y0, x1, y1 = _bbox(cell[..., 3])
        spr = cell[y0:y1, x0:x1]
        bw, bh = sizes[i]
        back = np.asarray(Image.open(os.path.join(OUT, f'w{i:02d}.png')))[..., 3].astype(np.float32)

        def headw(A, frac=0.4):
            rows = A[:max(1, int(A.shape[0] * frac))] > 128
            xs = np.where(rows.any(0))[0]
            return xs.max() - xs.min() + 1 if len(xs) else A.shape[1]
        s = headw(back) / headw(spr[..., 3])
        s = min(s, bh * 0.98 / spr.shape[0], bw * 1.0 / spr.shape[1])
        im = Image.fromarray(spr.astype(np.uint8), 'RGBA')
        im = im.resize((max(1, round(im.width * s)), max(1, round(im.height * s))), Image.LANCZOS)
        out = Image.new('RGBA', (bw, bh), (0, 0, 0, 0))
        out.alpha_composite(im, ((bw - im.width) // 2, bh - im.height))
        out.save(os.path.join(OUT, f'f{i:02d}.png'), optimize=True)


def corgi():
    """design/v6/corgi-sheet.jpg (4x4: 14 walk frames facing right, sit, sleep) -> corgi.png atlas (uniform cells,
    shared bottom anchor: feet on the cell's bottom edge, horizontally centred on the body) + frame metadata."""
    rgba = key_magenta(os.path.join(DES, 'v6', 'corgi-sheet.jpg'))
    frames = []
    for cell in _cells(rgba, 4, 4):
        cell = _drop_border_blobs(cell)
        x0, y0, x1, y1 = _bbox(cell[..., 3], 0.15, 2)
        frames.append(cell[y0:y1, x0:x1])
    S = 0.62
    cw = int(max(f.shape[1] for f in frames) * S) + 4
    ch = int(max(f.shape[0] for f in frames) * S) + 4
    atlas = Image.new('RGBA', (cw * 4, ch * 4), (0, 0, 0, 0))
    meta = []
    for i, f in enumerate(frames):
        im = Image.fromarray(f.astype(np.uint8), 'RGBA')
        im = im.resize((max(1, round(im.width * S)), max(1, round(im.height * S))), Image.LANCZOS)
        cx, cy = (i % 4) * cw, (i // 4) * ch
        atlas.alpha_composite(im, (cx + (cw - im.width) // 2, cy + ch - 2 - im.height))
        meta.append([cx, cy, cw, ch])
    atlas.save(os.path.join(OUT, 'corgi.png'), optimize=True)
    return {'file': 'corgi.png', 'cell': [cw, ch], 'frames': meta, 'walk': list(range(14)), 'sit': 14, 'sleep': 15}


def _plates_f32():
    d = np.asarray(Image.open(os.path.join(DES, 'plate-dusk.jpg')).convert('RGB')).astype(np.float32)
    n = np.asarray(Image.open(os.path.join(DES, 'plate-night.jpg')).convert('RGB')).astype(np.float32)
    return d, n


def _save_alpha(a, name):
    """a: float 0..1 mask -> white LA png whose alpha is the mask (for canvas destination-in)."""
    al = (np.clip(a, 0, 1) * 255).astype(np.uint8)
    Image.fromarray(np.dstack([np.full_like(al, 255), al]), 'LA').save(os.path.join(OUT, name), optimize=True)


def masks():
    """fg-mask.png: window frame, mullions and hanging vines over the glass (window bbox) -> fx are drawn under these
    plate pixels. sky-mask.png: towers/clouds in the sky band (window bbox, rows SKYBAND) -> far planes/airships pass
    behind the skyline. room-{l,r}-mask.png: foreground floor plants redrawn over walkers."""
    d, n = _plates_f32()
    r, g, b = d[..., 0], d[..., 1], d[..., 2]
    gb, gnb = g - b, n[..., 1] - n[..., 2]
    vine = np.clip((gb - 3) / 6, 0, 1) * np.clip((115 - d.mean(2)) / 15, 0, 1) * np.clip((gnb + 1) / 4, 0, 1) * np.clip((70 - n.mean(2)) / 12, 0, 1)
    vine = np.asarray(Image.fromarray((vine * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(3))).astype(np.float32) / 255
    dark = (d.mean(2) < 70) & (n.mean(2) < 40)
    near = np.asarray(Image.fromarray((vine > 0.3).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(3))) > 0
    m = np.maximum(vine, (dark & near).astype(np.float32))
    for x0, x1 in MULLIONS:
        m[:, x0:x1] = 1
    m[TRANSOM[0]:TRANSOM[1], :] = 1
    for poly in FG_EXTRA:
        m = np.maximum(m, _poly_mask(poly, (PW, PH), blur=1.5))
    (wx0, wy0), (wx1, wy1) = WINDOW[0], WINDOW[2]
    m[:wy0 + 2, :] = 1
    m[wy1:, :] = 1
    m = np.asarray(Image.fromarray((m * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))).astype(np.float32) / 255
    _save_alpha(m[wy0:wy1, wx0:wx1], 'fg-mask.png')
    # skyline: darker than the open sky of the same row (sampled in the clear middle pane)
    W = np.array([.3, .55, .15], np.float32)
    ref = np.array([np.median(d[min(y, 286), 565:728], 0) for y in range(PH)], np.float32)
    city = np.clip(((ref @ W)[:, None] - d @ W - 22) / 18, 0, 1)
    city = np.asarray(Image.fromarray((city * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)).filter(ImageFilter.MinFilter(5))
                      .filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    _save_alpha(np.maximum(city, m)[wy0:SKYBAND[1] + 24, wx0:wx1], 'sky-mask.png')
    # foreground floor plants (yellow-green, darker than the wood floor), only low in the room
    plant = ((g >= 0.82 * r) & (g > b + 8)).astype(np.uint8) * 255
    pl = np.asarray(Image.fromarray(plant).filter(ImageFilter.MedianFilter(3)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3))
                    .filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    pl[:590] = 0
    pl[:, 240:780] = 0
    _save_alpha(pl[590:, :240], 'room-l-mask.png')
    _save_alpha(pl[590:, 780:], 'room-r-mask.png')
    # water: inside the SEA quad, close to the sea colour in both plates (not the bridge decks / piers / lamps)
    sea_d, sea_n = np.median(d[380:410, 570:700].reshape(-1, 3), 0), np.median(n[380:410, 570:700].reshape(-1, 3), 0)
    wd = np.sqrt(((d - sea_d) ** 2).sum(2)), np.sqrt(((n - sea_n) ** 2).sum(2))
    wet = np.clip((70 - wd[0]) / 30, 0, 1) * np.clip((80 - wd[1]) / 30, 0, 1)
    wet = np.maximum(wet, (d.mean(2) > sea_d.mean() + 20) * np.clip((80 - wd[1]) / 30, 0, 1))  # sun glitter on the swell
    wet = np.asarray(Image.fromarray((wet * 255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.MinFilter(3))
                     .filter(ImageFilter.GaussianBlur(1.2))).astype(np.float32) / 255
    wet *= _poly_mask(SEA, (PW, PH), blur=2) * (1 - m)
    sx0, sy0, sx1, sy1 = min(p[0] for p in SEA), min(p[1] for p in SEA), max(p[0] for p in SEA), max(p[1] for p in SEA)
    _save_alpha(wet[sy0:sy1, sx0:sx1], 'water-mask.png')
    return {'water': [sx0, sy0, sx1, sy1], 'fg': [wx0, wy0, wx1, wy1], 'sky': [wx0, wy0, wx1, SKYBAND[1] + 24], 'room-l': [0, 590, 240, PH], 'room-r': [780, 590, PW, PH]}


def lift(box, seed, thr=(12, 30)):
    """Cut a painted object out of the sky: alpha by colour distance from the row-wise sky (interpolated between the
    box's left/right borders), largest blob through `seed`, holes filled, feathered; colours de-contaminated from the sky."""
    cs = {}
    for p in ('dusk', 'night'):
        cs[p] = np.asarray(Image.open(os.path.join(DES, f'plate-{p}.jpg')).convert('RGB').crop(box)).astype(np.float32)

    def bgest(c):
        w = c.shape[1]
        t = np.linspace(0, 1, w)[None, :, None]
        return c[:, :3].mean(1)[:, None, :] * (1 - t) + c[:, -3:].mean(1)[:, None, :] * t
    c = cs['dusk']
    a = np.clip((np.sqrt(((c - bgest(c)) ** 2).sum(2)) - thr[0]) / (thr[1] - thr[0]), 0, 1)
    bi = Image.fromarray(((a > 0.4) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.MinFilter(3)).copy()
    ImageDraw.floodfill(bi, seed, 128)
    hb = Image.fromarray(((np.asarray(bi) == 128) * 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(hb, (0, 0), 64)
    inside = (np.asarray(hb) != 64).astype(np.uint8) * 255
    a = np.asarray(Image.fromarray(inside).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))).astype(np.float32) / 255
    out = {}
    for p, c in cs.items():
        bg, aa = bgest(c), np.maximum(a, 0.15)[..., None]
        col = np.clip((c - (1 - aa) * bg) / aa, 0, 255)
        out[p] = Image.fromarray(np.dstack([col, a * 255]).astype(np.uint8), 'RGBA')
    return out


AIRSHIPS = [{'file': 'airship', 'box': (921, 130, 1012, 173), 'seed': (40, 22)},      # right ship (clean gondola)
            {'file': 'airship1', 'box': (774, 114, 870, 164), 'seed': (40, 22)}]     # left ship


def airships():
    res = []
    for a in AIRSHIPS:
        for p, im in lift(a['box'], a['seed']).items():
            im.save(os.path.join(OUT, f"{a['file']}-{p}.png"), optimize=True)
        res.append({'file': a['file'], 'w': a['box'][2] - a['box'][0], 'h': a['box'][3] - a['box'][1],
                    'x': a['box'][0], 'y': a['box'][1]})
    return res


def palette():
    """Colours sampled from the plates so the moving FX share the painting's palette (rgb lists)."""
    d, n = _plates_f32()

    def med(a, x0, y0, x1, y1):
        return [int(v) for v in np.median(a[y0:y1, x0:x1].reshape(-1, 3), 0)]

    def dark(a, x0, y0, x1, y1):  # building body colour: darker half of the region
        px_ = a[y0:y1, x0:x1].reshape(-1, 3)
        l = px_.mean(1)
        return [int(v) for v in np.median(px_[l <= np.median(l)], 0)]
    out = {}
    for name, a in (('dusk', d), ('night', n)):
        out[name] = {'skyTop': med(a, 565, 40, 728, 70), 'sky': med(a, 565, 130, 728, 170), 'horizon': med(a, 565, 270, 728, 286),
                     'sea': med(a, 570, 380, 700, 410), 'seaFar': med(a, 590, 350, 700, 360), 'city': dark(a, 100, 260, 380, 380),
                     'cityFar': dark(a, 760, 280, 880, 340), 'bridge': dark(a, 230, 396, 380, 412)}
    return out


def stars():
    """Painted stars in the night sky (bright dots away from the skyline) -> twinkle points."""
    _, n = _plates_f32()
    l = n @ np.array([.3, .55, .15], np.float32)
    loc = np.asarray(Image.fromarray(l.clip(0, 255).astype(np.uint8)).filter(ImageFilter.BoxBlur(3))).astype(np.float32)
    pts = []
    ys, xs = np.where((l - loc > 28) & (l > 120))
    for x, y in zip(xs, ys):
        if 95 < x < 1210 and 40 < y < 240 and all(abs(x - q[0]) > 3 or abs(y - q[1]) > 3 for q in pts[-30:]):
            pts.append([int(x), int(y)])
    return [norm(p) for p in pts[:140]]



def _poly_mask(poly, size, scale=1.0, blur=0.0):
    m = Image.new('L', size, 0)
    ImageDraw.Draw(m).polygon([(x * scale, y * scale) for x, y in poly], fill=255)
    if blur:
        m = m.filter(ImageFilter.GaussianBlur(blur))
    return np.asarray(m).astype(np.float32) / 255


def inpaint(a, hole):
    """push-pull fill (no OpenCV here): mask-weighted pyramid down, then fill the hole from the coarser levels up."""
    levels = [(a * (~hole)[..., None], (~hole).astype(np.float32))]
    while min(levels[-1][1].shape) > 4:
        c, w = levels[-1]
        H, W = (w.shape[0] // 2) * 2, (w.shape[1] // 2) * 2
        c, w = c[:H, :W], w[:H, :W]
        c2 = c[0::2, 0::2] + c[1::2, 0::2] + c[0::2, 1::2] + c[1::2, 1::2]
        w2 = w[0::2, 0::2] + w[1::2, 0::2] + w[0::2, 1::2] + w[1::2, 1::2]
        levels.append((c2 / 4, w2 / 4))
    c, w = levels[-1]
    col = c / np.maximum(w, 1e-4)[..., None]
    for c, w in reversed(levels[:-1]):
        up = np.asarray(Image.fromarray(np.clip(col, 0, 255).astype(np.uint8)).resize((w.shape[1], w.shape[0]), Image.BILINEAR)).astype(np.float32)
        own = c / np.maximum(w, 1e-4)[..., None]
        ww = np.clip(w * 1.5, 0, 1)[..., None]
        col = own * ww + up * (1 - ww)
    out = a.copy()
    out[hole] = col[:a.shape[0], :a.shape[1]][hole]
    return out


def boss_desk_rgba():
    rgba = key_magenta(os.path.join(DES, 'v6', 'boss-desk.jpg'), hue_below=330)
    return rgba[BOSS_SRC_BOX[1]:BOSS_SRC_BOX[3], BOSS_SRC_BOX[0]:BOSS_SRC_BOX[2]]


def _grade_desk(desk, plate):
    """match the desk's wood to the old boss desk in this plate (per-channel mean/std on the pedestals); the screens,
    holo and lamp keep most of their own light (self-luminous)."""
    ref = np.concatenate([plate[580:660, 492:560].reshape(-1, 3), plate[580:660, 730:798].reshape(-1, 3)])
    al = desk[..., 3]
    H, W = al.shape
    src = np.concatenate([desk[330:500, 20:170, :3][al[330:500, 20:170] > 250], desk[330:500, 720:860, :3][al[330:500, 720:860] > 250]])
    out = desk.copy()
    sm, ss, rm, rs = src.mean(0), src.std(0) + 1e-3, ref.mean(0), ref.std(0)
    graded = (desk[..., :3] - sm) / ss * (rs * 0.9 + ss * 0.1) + rm
    glow = np.zeros((H, W), np.float32)
    for q in BOSS_MON_SRC:
        glow = np.maximum(glow, _poly_mask([(x - BOSS_SRC_BOX[0], y - BOSS_SRC_BOX[1]) for x, y in q], (W, H), blur=2))
    hx0, hy0, hx1, hy1 = BOSS_HOLO_SRC
    bx, by = BOSS_SRC_BOX[:2]
    glow = np.maximum(glow, _poly_mask([(hx0 - bx, hy0 - by - 70), (hx1 - bx, hy0 - by - 70), (hx1 - bx, hy1 - by), (hx0 - bx, hy1 - by)], (W, H), blur=6) * 0.85)
    lx, ly = BOSS_LAMP_SRC[0] - BOSS_SRC_BOX[0], BOSS_LAMP_SRC[1] - BOSS_SRC_BOX[1]
    yy, xx = np.mgrid[:H, :W]
    glow = np.maximum(glow, np.clip(1 - np.hypot(xx - lx, yy - ly) / 60, 0, 1))
    k = (0.25 + 0.6 * glow)[..., None]   # how much of the original light survives
    out[..., :3] = np.clip(graded * (1 - k) + desk[..., :3] * k, 0, 255)
    return out


def boss_desk_on(plate_f, name, scale):
    """plate_f: float RGB plate at `scale` x 1280x720 (already upscaled, old desk inpainted) -> desk composited."""
    desk = boss_desk_rgba()
    small = np.asarray(Image.open(os.path.join(DES, f'plate-{name}.jpg')).convert('RGB')).astype(np.float32)
    desk = _grade_desk(desk, small)
    W, H = round(desk.shape[1] * BOSS_S * scale), round(desk.shape[0] * BOSS_S * scale)
    im = Image.fromarray(desk.astype(np.uint8), 'RGBA').resize((W, H), Image.LANCZOS)
    X, Y = round(BOSS_X0 * scale), round(BOSS_Y0 * scale)
    PHs, PWs = plate_f.shape[:2]
    # contact shadow on the rug (soft ellipse under the footprint + darker knee space)
    sh = Image.new('L', (PWs, PHs), 0)
    dr = ImageDraw.Draw(sh)
    dr.ellipse([(BOSS_CX - 205) * scale, (BOSS_BOTTOM - 22) * scale, (BOSS_CX + 205) * scale, (BOSS_BOTTOM + 14) * scale], fill=150)
    dr.rectangle([(BOSS_CX - 120) * scale, (BOSS_BOTTOM - 70) * scale, (BOSS_CX + 120) * scale, (BOSS_BOTTOM - 4) * scale], fill=120)
    sh = np.asarray(sh.filter(ImageFilter.GaussianBlur(9 * scale))).astype(np.float32)[..., None] / 255
    plate_f = plate_f * (1 - sh * np.array([0.62, 0.66, 0.6], np.float32))
    base = Image.fromarray(np.clip(plate_f, 0, 255).astype(np.uint8)).convert('RGBA')
    base.alpha_composite(im, (X, Y))
    al = np.zeros((PHs, PWs), np.float32)
    al[Y:Y + H, X:X + W] = np.asarray(im)[..., 3].astype(np.float32)[:PHs - Y, :PWs - X] / 255
    return np.asarray(base.convert('RGB')).astype(np.float32), al


def plates():
    """-> plate-{dusk,night}.webp (2560x1440, q82) and plate-{dusk,night}-hi.webp (3840x2160, q85; for big canvases).
    The old boss desk is inpainted away at 1280, the plate is upscaled (Lanczos + mild unsharp), the v6 boss desk is
    composited at full resolution with a contact shadow, then Grok's painted chair is put back on top."""
    hole = (_poly_mask(OLD_BOSS, (PW, PH)) > 0.5) & ~(_poly_mask(BOSS_CHAIR_KEEP, (PW, PH)) > 0.5)
    chair = None
    for n in ('dusk', 'night'):
        orig = Image.open(os.path.join(DES, f'plate-{n}.jpg')).convert('RGB')
        a = inpaint(np.asarray(orig).astype(np.float32), hole)
        S = 3
        up = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8)).resize((PW * S, PH * S), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))
        up_orig = orig.resize((PW * S, PH * S), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=2.2, percent=55, threshold=2))
        hi, desk_al = boss_desk_on(np.asarray(up).astype(np.float32), n, S)
        cm = _poly_mask(BOSS_CHAIR_KEEP, (PW * S, PH * S), S, blur=1.2)[..., None]
        hi = hi * (1 - cm) + np.asarray(up_orig).astype(np.float32) * cm
        him = Image.fromarray(np.clip(hi, 0, 255).astype(np.uint8))
        him.save(os.path.join(OUT, f'plate-{n}-hi.webp'), 'WEBP', quality=85, method=6)
        him.resize((PW * 2, PH * 2), Image.LANCZOS).save(os.path.join(OUT, f'plate-{n}.webp'), 'WEBP', quality=82, method=6)
        if n == 'dusk':
            chair = cm[..., 0]
            # occluder mask: the desk silhouette (incl. the chair overlap, so the chair is redrawn with the desk) at 1x
            bm = Image.fromarray((desk_al * 255).astype(np.uint8)).resize((PW, PH), Image.LANCZOS)
            box = [int(BOSS_X0) - 2, int(BOSS_Y0) - 2, int(BOSS_X0 + BOSS_W) + 3, BOSS_BOTTOM + 3]
            _save_alpha(np.asarray(bm).astype(np.float32)[box[1]:box[3], box[0]:box[2]] / 255, 'boss-mask.png')
            him.resize((PW, PH), Image.LANCZOS).save('/tmp/plate-dusk-v6.png')
    return {'boss': box}


def lights():
    """Lit windows in the night plate's city (bright, warm, small) -> twinkle points."""
    a = np.asarray(Image.open(os.path.join(DES, 'plate-night.jpg')).convert('RGB')).astype(np.float32)
    lum = a @ np.array([0.3, 0.55, 0.15], np.float32)
    # only windows on buildings: the dusk plate around the point must be clearly darker than that row's open sky
    d = np.asarray(Image.open(os.path.join(DES, 'plate-dusk.jpg')).convert('RGB')).astype(np.float32)
    W = np.array([.3, .55, .15], np.float32)
    sky = np.array([np.median(d[min(y, 286), 565:728], 0) @ W for y in range(PH)], np.float32)
    pts, rng = [], np.random.default_rng(7)
    ys, xs = np.where(lum > 175)
    order = rng.permutation(len(xs))
    taken = set()
    for k in order:
        x, y = int(xs[k]), int(ys[k])
        if not (88 < x < 1218 and 40 < y < 420) or (440 < x < 820 and y > 340):
            continue
        if y < 300 and np.median(d[max(0, y - 5):y + 6, max(0, x - 5):x + 6] @ W) > sky[y] - 30:
            continue
        cell = (x // 14, y // 10)
        if cell in taken:
            continue
        taken.add(cell)
        c = a[y, x]
        ring = a[max(0, y - 4):y + 5, max(0, x - 5):x + 6].reshape(-1, 3)
        off = ring[ring.mean(1) <= np.percentile(ring.mean(1), 30)].mean(0)  # surrounding wall colour (window switched off)
        pts.append([round(x / PW, 4), round(y / PH, 4), 1 if c[2] > c[0] else 0, *[int(v) for v in off]])  # 1 = cool/neon, 0 = warm
        if len(pts) >= 260:
            break
    return pts


def norm(p):
    return [round(p[0] / PW, 4), round(p[1] / PH, 4)]


def build_layout(sizes, mask_boxes, ships, dog):
    def seat(s):
        o = {'x': round(s['x'] / PW, 4), 'top': round(s['top'] / PH, 4), 'h': round(s['h'] / PH, 4), 'clip': round(s['clip'] / PH, 4)}
        o['chair'] = s['chair'] if s['chair'] == 'draw' else [norm(p) for p in s['chair']]
        o['visit'] = norm(s['visit'])
        o['via'] = [norm(p) for p in s.get('via', [])]
        if s.get('spare'):
            o['spare'] = True
        return o
    return {
        'ref': [PW, PH], 'note': 'normalised plate coords (0..1); regenerate with bin/preprocess.py',
        'window': [norm(p) for p in WINDOW], 'sky': [norm(p) for p in SKY], 'sea': [norm(p) for p in SEA],
        'shafts': [[norm(p) for p in s] for s in SHAFTS],
        'desks': [{**{k: d[k] for k in ('id', 'label', 'theme', 'accent', 'bots')},
                   'monitors': [[norm(p) for p in m] for m in d['monitors']], 'seats': [seat(s) for s in d['seats']]} for d in DESKS],
        'occluders': [{'depth': round(o['depth'] / PH, 4), 'mask': o['mask']} for o in OCCLUDERS],
        'standing': [{'x': round(s['x'] / PW, 4), 'top': round(s['top'] / PH, 4), 'h': round(s['h'] / PH, 4)} for s in STANDING],
        'lamps': [{**{k: v for k, v in l.items() if k not in 'xyr'}, 'x': round(l['x'] / PW, 4), 'y': round(l['y'] / PH, 4), 'r': round(l['r'] / PW, 4)} for l in LAMPS],
        'sprites': [{'file': f'w{i:02d}.png', 'front': f'f{i:02d}.png', 'w': w, 'h': h} for i, (w, h) in enumerate(sizes)],
        # v6
        'plates': {'lo': [PW * 2, PH * 2], 'hi': [PW * 3, PH * 3]},
        'panes': [[round(MULLIONS[i][1] / PW, 4), round(MULLIONS[i + 1][0] / PW, 4)] for i in range(len(MULLIONS) - 1)],
        'transom': [round(v / PH, 4) for v in TRANSOM],
        'boss': {'monitors': [[norm(bsrc(p)) for p in q] for q in BOSS_MON_SRC],
                 'holo': [*norm(bsrc(BOSS_HOLO_SRC[:2])), *norm(bsrc(BOSS_HOLO_SRC[2:]))],
                 'zone': [round(BOSS_ZONE[0] / PW, 4), round(BOSS_ZONE[1] / PW, 4), round(BOSS_ZONE[2] / PH, 4)]},
        'neon': [[round(n[0] / PW, 4), round(n[1] / PH, 4), round(n[2] / PW, 4), round(n[3] / PH, 4), n[4]] for n in NEON],
        'corgi': dog,
        'dog': {'nodes': [norm(p) for p in DOG_NODES], 'edges': DOG_EDGES, 'rest': DOG_REST},
        'lights': lights(),
        'stars': stars(),
        'palette': palette(),
        'masks': {k: [round(v[0] / PW, 4), round(v[1] / PH, 4), round(v[2] / PW, 4), round(v[3] / PH, 4)] for k, v in mask_boxes.items()},
        'airships': [{**a, 'x': round(a['x'] / PW, 4), 'y': round(a['y'] / PH, 4), 'w': round(a['w'] / PW, 4), 'h': round(a['h'] / PH, 4)} for a in ships],
        'lanes': [{**l, 'pts': [norm(p) for p in l['pts']], 'water': [round(v / PW, 4) for v in l['water']]} for l in LANES],
        'boatLanes': [{'y': round(b['y'] / PH, 4), 'x': [round(v / PW, 4) for v in b['x']], 'near': b['near']} for b in BOAT_LANES],
        'skyBand': [round(v / PH, 4) for v in SKYBAND],
        'walk': {'y': round(WALK_Y / PH, 4), 'x': [round(v / PW, 4) for v in WALK_X], 'h': [[round(f / PH, 4), round(h / PH, 4)] for f, h in WALK_H]},
    }


def debug():
    im = Image.open(os.path.join(OUT, 'plate-dusk.webp')).convert('RGB').resize((PW, PH), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    d.polygon([tuple(p) for p in WINDOW], outline=(0, 255, 255))
    d.polygon([tuple(p) for p in SEA], outline=(0, 128, 255))
    for q in BOSS_MON_SRC:
        d.polygon([tuple(bsrc(p)) for p in q], outline=(0, 255, 120))
    for x0, y0, x1, y1, _ in NEON:
        d.rectangle([x0, y0, x1, y1], outline=(255, 0, 255))
    for poly in FG_EXTRA:
        d.polygon([tuple(p) for p in poly], outline=(255, 255, 255))
    for a, b in DOG_EDGES:
        d.line([tuple(DOG_NODES[a]), tuple(DOG_NODES[b])], fill=(255, 170, 40), width=2)
    for x, y in DOG_NODES:
        d.ellipse([x - 4, y - 4, x + 4, y + 4], fill=(255, 170, 40))
    for dk in DESKS:
        for m in dk['monitors']:
            d.polygon([tuple(p) for p in m], outline=(255, 255, 0))
        for s in dk['seats']:
            d.rectangle([s['x'] - s['h'] * 0.31, s['top'], s['x'] + s['h'] * 0.31, s['clip']], outline=(255, 80, 80))
            if s['chair'] != 'draw':
                d.polygon([tuple(p) for p in s['chair']], outline=(80, 255, 80))
    for l in LAMPS:
        d.ellipse([l['x'] - 4, l['y'] - 4, l['x'] + 4, l['y'] + 4], outline=(255, 160, 0))
    for ln in LANES:
        d.line([tuple(p) for p in ln['pts']], fill=(255, 255, 255), width=1)
    for bl in BOAT_LANES:
        d.line([(bl['x'][0], bl['y']), (bl['x'][1], bl['y'])], fill=(80, 200, 255))
    d.line([(84, SKYBAND[0]), (1222, SKYBAND[0])], fill=(255, 120, 255)); d.line([(84, SKYBAND[1]), (1222, SKYBAND[1])], fill=(255, 120, 255))
    d.line([(WALK_X[0], WALK_Y), (WALK_X[1], WALK_Y)], fill=(255, 60, 200), width=2)
    for dk in DESKS:
        for s in dk['seats']:
            pts = [tuple(s['visit'])] + [tuple(p) for p in s.get('via', [])]
            if len(pts) > 1:
                d.line(pts, fill=(255, 60, 200), width=2)
            vx, vy = s['visit']
            d.ellipse([vx - 5, vy - 3, vx + 5, vy + 3], fill=(255, 60, 200))
    for a in AIRSHIPS:
        d.rectangle(a['box'], outline=(255, 255, 255))
    im.save(os.path.join(ROOT, 'shots', 'layout-debug.png'))


if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    sizes = chroma_workers()
    front_workers(sizes)
    dog = corgi()
    boxes = plates()
    boxes.update(masks())
    ships = airships()
    with open(os.path.join(OUT, 'layout.json'), 'w') as f:
        json.dump(build_layout(sizes, boxes, ships, dog), f, separators=(',', ':'))
    if '--debug' in sys.argv:
        debug()
    tot = sum(os.path.getsize(os.path.join(OUT, n)) for n in os.listdir(OUT))
    print(f'assets -> {OUT} ({len(os.listdir(OUT))} files, {tot / 1e6:.2f} MB)')
