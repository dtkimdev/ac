#!/usr/bin/env python3
"""Remove light/white fringe halos from alpha cutouts (straight or white-matted edges)."""
from __future__ import annotations
import sys
from pathlib import Path
import numpy as np
from PIL import Image

try:
    from scipy.ndimage import binary_dilation, distance_transform_edt
except ImportError:
    binary_dilation = None
    distance_transform_edt = None

SKIP_SUBSTR = (
    'plate-dusk', 'plate-night', 'water-mask', 'sky/', 'harbour/',
)
# masks used as clip windows keep their soft edge; bag/desk occluder masks are cutouts and should be cleaned? skip all room/masks to be safe
SKIP_DIR_PARTS = ('room/masks', 'sky')

def should_skip(p: Path) -> bool:
    s = str(p).replace('\\', '/')
    if any(x in s for x in SKIP_SUBSTR):
        return True
    if '/room/masks/' in s or '/sky/' in s or '/harbour/' in s:
        return True
    if p.name.startswith('plate-'):
        return True
    return False

def nearest_opaque_rgb(rgb: np.ndarray, alpha: np.ndarray, thresh: int = 250):
    opaque = alpha >= thresh
    if not opaque.any():
        return rgb
    if distance_transform_edt is None:
        # cheap fallback: box-propagate by max-filter on a label
        return rgb
    inv = ~opaque
    _, inds = distance_transform_edt(inv, return_indices=True)
    return rgb[inds[0], inds[1]]

def defringe_arr(a: np.ndarray) -> tuple[np.ndarray, int]:
    rgb = a[..., :3].astype(np.float32)
    alpha = a[..., 3].astype(np.float32)
    if (alpha < 8).all() or (alpha >= 250).all():
        return a, 0
    near = nearest_opaque_rgb(rgb, alpha)
    lum = rgb.mean(axis=2)
    near_lum = near.mean(axis=2)
    semi = (alpha > 0) & (alpha < 250)
    # 1) semi-transparent pixels take the nearest opaque colour (drops a white/light matte)
    n = 0
    if semi.any():
        rgb[semi] = near[semi]
        n += int(semi.sum())
    # 2) silhouette rim that is lighter than the interior (white, cream or pink fringe on dark art)
    if binary_dilation is not None:
        trans = alpha < 8
        rim = binary_dilation(trans, iterations=2) & (alpha >= 8)
        too_light = rim & (lum > near_lum + 6)
        if too_light.any():
            rgb[too_light] = near[too_light]
            n += int(too_light.sum())
    out = a.copy()
    out[..., :3] = np.clip(rgb, 0, 255).astype(np.uint8)
    return out, n

def process(path: Path, dry=False) -> str:
    im = Image.open(path)
    if im.mode not in ('RGBA', 'LA') and 'transparency' not in im.info:
        # try anyway if webp/png might have alpha
        im2 = im.convert('RGBA')
        if np.array(im2.split()[-1]).min() >= 250:
            return f'SKIP opaque {path}'
        im = im2
    else:
        im = im.convert('RGBA')
    arr = np.array(im)
    new, n = defringe_arr(arr)
    if n == 0:
        return f'OK 0 {path}'
    if not dry:
        Image.fromarray(new, 'RGBA').save(path)
    return f'FIX {n} {path}'

def main(roots, dry=False):
    exts = {'.png', '.webp'}
    files = []
    for root in roots:
        r = Path(root)
        if r.is_file():
            if r.suffix.lower() in exts and not should_skip(r):
                files.append(r)
            continue
        for p in sorted(r.rglob('*')):
            if p.suffix.lower() in exts and p.is_file() and not should_skip(p):
                files.append(p)
    print(f'{len(files)} files', flush=True)
    for p in files:
        try:
            print(process(p, dry=dry), flush=True)
        except Exception as e:
            print(f'ERR {p}: {e}', flush=True)

if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if a != '--dry']
    dry = '--dry' in sys.argv
    main(args or ['/workspace/agent-city/public/office2d/art', '/workspace/agent-city/portable/art/src'], dry=dry)
