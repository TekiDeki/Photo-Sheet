#!/usr/bin/env python3
# Photo Sheet · icon generator
# SPDX-License-Identifier: Apache-2.0
"""Draws every icon from code so the repository carries no binary source.

    python3 tools/make_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
TEAL = (23, 97, 111, 255)
TEAL_DARK = (16, 72, 83, 255)
CREAM = (220, 238, 240, 255)
LIGHT = (143, 211, 222, 255)


def icon(size, maskable=False):
    scale = 4
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    if maskable:
        d.rectangle([0, 0, s, s], fill=TEAL)
        pad = s * 0.20
    else:
        d.rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.22), fill=TEAL)
        pad = s * 0.155

    # the photo inside the frame: a light card with a dark silhouette
    frame = [pad, pad, s - pad, s - pad]
    radius = int(s * 0.075)
    d.rounded_rectangle(frame, radius=radius, fill=CREAM)

    layer = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    ld = ImageDraw.Draw(layer)
    cx = s / 2
    head_r = s * 0.125
    head_cy = s * 0.425
    ld.ellipse([cx - head_r, head_cy - head_r, cx + head_r, head_cy + head_r], fill=TEAL_DARK)
    ld.ellipse([cx - s * 0.245, head_cy + head_r * 1.35, cx + s * 0.245, s - pad + s * 0.42], fill=TEAL_DARK)

    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle(frame, radius=radius, fill=255)
    img.paste(layer, (0, 0), mask)

    # crop marks, the same idea as on the printed sheet
    line = max(2, int(s * 0.017))
    arm = s * 0.075
    inset = s * 0.055
    x0, y0 = frame[0] + inset, frame[1] + inset
    x1, y1 = frame[2] - inset, frame[3] - inset
    for x, y, sx, sy in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line([x, y, x + arm * sx, y], fill=LIGHT, width=line)
        d.line([x, y, x, y + arm * sy], fill=LIGHT, width=line)

    return img.resize((size, size), Image.LANCZOS)


def main():
    out = ROOT / "icons"
    out.mkdir(exist_ok=True)
    icon(192).save(out / "icon-192.png")
    icon(512).save(out / "icon-512.png")
    icon(512, maskable=True).save(out / "icon-512-maskable.png")
    icon(180).save(ROOT / "apple-touch-icon.png")
    icon(32).save(ROOT / "favicon-32.png")
    icon(64).save(ROOT / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64)])
    print("icons written")


if __name__ == "__main__":
    main()
