#!/usr/bin/env python3
# Photo Sheet · screenshots
# SPDX-License-Identifier: Apache-2.0
"""Captures the screenshots in screenshots/ and composes the social image.

    python3 tools/make_screenshots.py

The photo used here is drawn by the script, so the repository needs no stock
image and no model release.
"""
from __future__ import annotations

import os
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "screenshots"


class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


@contextmanager
def server():
    handler = partial(Quiet, directory=str(ROOT))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=3)
        httpd.server_close()


def portrait(path):
    """A synthetic portrait: smooth wall, head with eyes, shoulders."""
    import numpy as np
    w, h = 1260, 1680
    yy, xx = np.mgrid[0:h, 0:w]
    # smooth wall: a soft radial light from the top left, no banding
    d = np.sqrt((xx - w * 0.35) ** 2 + (yy - h * 0.15) ** 2) / (h * 0.9)
    base = 244 - d * 10
    img = Image.fromarray(np.dstack([base, base + 1, base + 2]).clip(0, 255).astype("uint8"), "RGB")
    d = ImageDraw.Draw(img)
    d.ellipse([w * 0.08, h * 0.72, w * 0.92, h * 1.25], fill=(62, 74, 86))
    d.rectangle([w * 0.42, h * 0.60, w * 0.58, h * 0.80], fill=(214, 170, 140))
    d.ellipse([w * 0.30, h * 0.16, w * 0.70, h * 0.66], fill=(222, 178, 148))
    d.chord([w * 0.29, h * 0.13, w * 0.71, h * 0.50], 180, 360, fill=(58, 44, 36))
    d.ellipse([w * 0.385, h * 0.355, w * 0.425, h * 0.375], fill=(46, 38, 34))
    d.ellipse([w * 0.575, h * 0.355, w * 0.615, h * 0.375], fill=(46, 38, 34))
    d.line([w * 0.375, h * 0.325, w * 0.435, h * 0.318], fill=(70, 52, 40), width=6)
    d.line([w * 0.565, h * 0.318, w * 0.625, h * 0.325], fill=(70, 52, 40), width=6)
    d.line([w * 0.50, h * 0.375, w * 0.495, h * 0.455], fill=(198, 150, 122), width=5)
    d.arc([w * 0.455, h * 0.465, w * 0.545, h * 0.505], 10, 170, fill=(150, 86, 78), width=6)
    img.save(path)
    return path


def compose_og(shot: Path, out: Path) -> None:
    """A social card: title and claims on the left, the app on the right."""
    from PIL import ImageFont

    serif = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
    sans = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
    bold = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

    canvas = Image.new("RGB", (1200, 630), (241, 238, 230))
    draw = ImageDraw.Draw(canvas)
    draw.rectangle([0, 0, 16, 630], fill=(23, 97, 111))

    title = ImageFont.truetype(serif, 56)
    lede = ImageFont.truetype(sans, 24)
    chip = ImageFont.truetype(bold, 16)

    draw.text((64, 92), "Photo Sheet", font=title, fill=(27, 37, 48))
    lines = ["Passport photos,", "printed at home."]
    y = 168
    for line in lines:
        draw.text((64, y), line, font=lede, fill=(77, 91, 102))
        y += 32

    labels = ["No upload", "300 dpi", "Ready to cut"]
    x = 64
    cy = 300
    for label in labels:
        width = draw.textlength(label, font=chip) + 30
        draw.rounded_rectangle([x, cy, x + width, cy + 34], radius=17, fill=(255, 253, 249), outline=(206, 198, 182), width=2)
        draw.ellipse([x + 11, cy + 14, x + 17, cy + 20], fill=(31, 122, 92))
        draw.text((x + 23, cy + 8), label, font=chip, fill=(77, 91, 102))
        x += width + 9

    draw.text((64, 380), "Crop to the millimetre,", font=lede, fill=(77, 91, 102))
    draw.text((64, 412), "print a full sheet.", font=lede, fill=(77, 91, 102))
    draw.text((64, 470), "Everything stays in the browser.", font=lede, fill=(23, 97, 111))

    shot_img = Image.open(shot).convert("RGB")
    width = 660
    crop_h = int(shot_img.width * 0.80)
    shot_img = shot_img.crop((0, 0, shot_img.width, min(crop_h, shot_img.height)))
    height = round(shot_img.height * width / shot_img.width)
    shot_img = shot_img.resize((width, height), Image.LANCZOS)
    left = 1200 - width - 44
    top = (630 - height) // 2
    shadow = Image.new("RGB", (width + 24, height + 24), (228, 223, 213))
    canvas.paste(shadow, (left - 4, top - 2))
    canvas.paste(shot_img, (left, top))
    draw.rectangle([left, top, left + width, top + height], outline=(206, 198, 182), width=2)
    canvas.save(out)


def main() -> None:
    OUT.mkdir(exist_ok=True)
    photo = portrait(Path("/tmp/photo-sheet-shot.png"))

    with server() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH") or None,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )

        # desktop: crop and sheet side by side, scrolled to the top
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = context.new_page()
        page.goto(base + "/", wait_until="networkidle")
        page.set_input_files("#fileInput", str(photo))
        page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
        page.evaluate("""() => {
            const range = document.getElementById('zoomRange');
            range.value = '1.18';
            range.dispatchEvent(new Event('input', { bubbles: true }));
        }""")
        page.wait_for_timeout(2600)  # let the saved toast fade out
        page.evaluate("window.scrollTo(0, 0)")
        page.wait_for_timeout(250)
        page.screenshot(path=str(OUT / "desktop.png"), full_page=False)
        page.screenshot(path=str(OUT / "crop.png"), clip={"x": 120, "y": 250, "width": 700, "height": 720})
        context.close()

        # tablet
        context = browser.new_context(
            viewport={"width": 820, "height": 1180},
            device_scale_factor=2,
            has_touch=True,
            is_mobile=False,
        )
        page = context.new_page()
        page.goto(base + "/", wait_until="networkidle")
        page.set_input_files("#fileInput", str(photo))
        page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
        page.wait_for_timeout(2600)
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=str(OUT / "tablet.png"), full_page=False)
        context.close()

        # dark theme with the Serbian Cyrillic interface
        context = browser.new_context(viewport={"width": 1440, "height": 1000}, device_scale_factor=2)
        page = context.new_page()
        page.goto(base + "/", wait_until="networkidle")
        page.select_option("#langSelect", "sr-cyrl")
        page.locator("#themeBtn").click()
        page.set_input_files("#fileInput", str(photo))
        page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
        page.wait_for_timeout(2600)
        page.evaluate("window.scrollTo(0, 0)")
        page.screenshot(path=str(OUT / "dark-cyrillic.png"), full_page=False)
        context.close()

        # the printed sheet on its own, at print size
        context = browser.new_context(viewport={"width": 900, "height": 1300}, device_scale_factor=2)
        page = context.new_page()
        page.goto(base + "/", wait_until="networkidle")
        page.set_input_files("#fileInput", str(photo))
        page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
        page.evaluate("""() => {
            const range = document.getElementById('zoomRange');
            range.value = '1.12';
            range.dispatchEvent(new Event('input', { bubbles: true }));
        }""")
        page.wait_for_timeout(500)
        page.evaluate("document.getElementById('sheetBtn')")
        page.emulate_media(media="print")
        page.set_viewport_size({"width": 378, "height": 567})
        page.screenshot(path=str(OUT / "sheet.png"))
        context.close()

        browser.close()

    compose_og(OUT / "desktop.png", OUT / "og.png")
    print("screenshots written")


if __name__ == "__main__":
    main()
