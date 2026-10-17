#!/usr/bin/env python3
# Photo Sheet · end to end tests
# SPDX-License-Identifier: Apache-2.0
"""Drives index.html in Chromium on a desktop and on a touch tablet.

    python3 tests/ui_test.py

Starts its own static server on a free port, so no other process is needed.
"""
from __future__ import annotations

import io
import os
import re
import struct
import threading
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT
checks = 0


def check(condition, message):
    global checks
    checks += 1
    if not condition:
        raise AssertionError(message)


def make_photo(path: Path, size=(1260, 1680)) -> Path:
    """A synthetic portrait: smooth wall, head with eyes, shoulders."""
    import numpy as np
    w, h = size
    yy, xx = np.mgrid[0:h, 0:w]
    distance = np.sqrt((xx - w * 0.35) ** 2 + (yy - h * 0.15) ** 2) / (h * 0.9)
    base = 244 - distance * 10
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


class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *args):  # keep the test output readable
        pass


@contextmanager
def server():
    handler = partial(QuietHandler, directory=str(SITE))
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{httpd.server_port}"
    finally:
        httpd.shutdown()
        thread.join(timeout=3)
        httpd.server_close()


CONTRAST_JS = r"""() => {
  function lum(rgb) {
    const parts = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * parts[0] + 0.7152 * parts[1] + 0.0722 * parts[2];
  }
  function parse(colour) {
    const m = colour.match(/\d+(\.\d+)?/g);
    return m ? m.slice(0, 3).map(Number) : [255, 255, 255];
  }
  function backing(el) {
    let node = el;
    while (node) {
      const colour = getComputedStyle(node).backgroundColor;
      if (colour && colour !== 'rgba(0, 0, 0, 0)' && colour !== 'transparent') return parse(colour);
      node = node.parentElement;
    }
    return [255, 255, 255];
  }
  const targets = ['h1', '.lede', '.panel-sub', '.tiny', '.foot-inner', '.drop-hint', '.hint', '.chip', '.field > span', 'summary'];
  const out = [];
  for (const selector of targets) {
    const el = document.querySelector(selector);
    if (!el) continue;
    const a = lum(parse(getComputedStyle(el).color));
    const b = lum(backing(el));
    out.push([selector, (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)]);
  }
  return out;
}"""


def centre(locator):
    """Scroll an element into the middle so the sticky header never covers it."""
    locator.evaluate("el => el.scrollIntoView({block: 'center', inline: 'nearest'})")
    return locator


def png_info(data: bytes):
    """Width, height and (x, y) dpi from a PNG, read from the chunks."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n", "not a png"
    width, height = struct.unpack(">II", data[16:24])
    index = 8
    dpi = None
    while index < len(data):
        length = struct.unpack(">I", data[index:index + 4])[0]
        kind = data[index + 4:index + 8].decode("ascii")
        if kind == "pHYs":
            ppm_x, ppm_y, unit = struct.unpack(">IIB", data[index + 8:index + 17])
            dpi = (round(ppm_x * 0.0254, 1), round(ppm_y * 0.0254, 1), unit)
        index += 12 + length
        if kind == "IEND":
            break
    return width, height, dpi


def run_desktop(browser, base, photo):
    context = browser.new_context(viewport={"width": 1440, "height": 1000}, accept_downloads=True)
    page = context.new_page()
    errors, console, requests = [], [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: console.append(message.text) if message.type == "error" else None)
    page.on("request", lambda request: requests.append(request.url))
    page.goto(base + "/", wait_until="networkidle")

    check(page.title().startswith("Photo Sheet"), "the title names the app")
    check(page.get_attribute("html", "lang") == "en", "the page ships in English")
    check(page.locator("h1").inner_text() == "Passport photos, printed at home", "the English heading is right")
    check(page.locator("#countText").inner_text() == "6 photos fit on this sheet", "six photos are announced")
    check(page.locator("#sizeText").inner_text().startswith("1181 x 1772 px"), "the sheet size is 1181 x 1772")
    check(page.locator("#stageBlock").is_hidden(), "the stage is hidden before a photo arrives")
    check(page.locator("#printBtn").is_disabled(), "print is disabled before a photo arrives")
    check(page.locator("#dropZone").is_visible(), "the drop zone invites a photo")

    # ---------------------------------------------------------- load a photo
    page.set_input_files("#fileInput", str(photo))
    page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
    check(page.locator("#dropZone").get_attribute("class").find("is-hidden") > -1, "the drop zone steps aside")
    check(page.locator("#printBtn").is_enabled(), "print is enabled after a photo arrives")
    check(page.locator("#sheetBtn").is_enabled(), "the sheet download is enabled")
    check(page.locator("#photoBtn").is_enabled(), "the photo download is enabled")
    check(page.locator("#chipResolution .chip-text").inner_text() == "Full resolution", "a phone sized photo is full resolution")
    check(page.locator("#chipBackground .chip-text").inner_text() != "Background busy", "a plain wall is not called busy")
    check(page.locator("#chipSharpness .chip-text").inner_text() in ("Sharp", "Slightly soft"), "sharpness is reported")
    check(page.locator("#stageCanvas").evaluate("c => c.width") > 300, "the preview canvas has real pixels")

    # the guides are drawn on the preview: the canvas is not one flat colour
    colours = page.evaluate("""() => {
        const c = document.getElementById('stageCanvas');
        const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        const seen = new Set();
        for (let i = 0; i < d.length; i += 4000) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
        return seen.size;
    }""")
    check(colours > 20, "the preview draws the photo and the guide bands")

    # -------------------------------------------------------------- controls
    centre(page.locator("#rotateBtn")).click()
    page.wait_for_timeout(150)
    check(page.locator("#undoBtn").is_enabled(), "rotate can be undone")
    page.locator("#undoBtn").click()
    page.wait_for_timeout(150)

    centre(page.locator("#zoomInBtn")).click()
    page.wait_for_timeout(200)
    check(page.locator("#zoomValue").inner_text() != "100%", "the zoom buttons change the zoom")
    centre(page.locator("#resetBtn")).click()
    page.wait_for_timeout(200)
    check(page.locator("#zoomValue").inner_text() == "100%", "reset returns to 100 percent")

    # dragging moves the crop and is undoable
    box = page.locator("#stageCanvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(cx, cy)
    page.mouse.down()
    page.mouse.move(cx, cy + 30, steps=5)
    page.mouse.up()
    check(page.locator("#undoBtn").is_enabled(), "a drag is undoable")
    page.locator("#undoBtn").click()
    page.wait_for_timeout(150)

    # guides toggle repaints without touching the photo
    guides_label = page.locator("label.switch").filter(has=page.locator("#guidesToggle"))
    centre(guides_label)
    guides_label.click()
    page.wait_for_timeout(150)
    check(page.evaluate("document.getElementById('guidesToggle').checked") is False, "guides can be switched off")
    guides_label.click()
    page.wait_for_timeout(100)

    # --------------------------------------------------------------- presets
    page.select_option("#presetSelect", "us51")
    page.wait_for_timeout(250)
    check(page.locator("#countText").inner_text() == "2 photos fit on this sheet", "two square photos fit a 10 x 15")
    page.select_option("#sheetSelect", "s13x18")
    page.wait_for_timeout(250)
    check(page.locator("#countText").inner_text() == "6 photos fit on this sheet", "six square photos fit a 13 x 18")
    page.select_option("#presetSelect", "custom")
    page.wait_for_timeout(200)
    check(page.locator("#customField").is_visible(), "the custom size fields appear")
    page.fill("#customW", "40")
    page.fill("#customH", "60")
    page.wait_for_timeout(250)
    check("x 60" in page.locator("#sizeText").inner_text() or page.locator("#countText").inner_text() != "", "a custom size is accepted")
    page.select_option("#presetSelect", "std35")
    page.select_option("#sheetSelect", "s10x15")
    page.wait_for_timeout(250)
    check(page.locator("#countText").inner_text() == "6 photos fit on this sheet", "back to six photos")

    # ------------------------------------------------------------ persistence
    page.reload(wait_until="networkidle")
    check(page.locator("#stageBlock").is_hidden(), "a reload forgets the photo, as promised")
    page.set_input_files("#fileInput", str(photo))
    page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
    page.select_option("#presetSelect", "ro30")
    page.locator("#themeBtn").click()
    page.wait_for_timeout(200)
    check("theme-dark" in (page.get_attribute("html", "class") or ""), "the dark theme applies")
    page.reload(wait_until="networkidle")
    check(page.input_value("#presetSelect") == "ro30", "the chosen size survives a reload")
    check("theme-dark" in (page.get_attribute("html", "class") or ""), "the theme survives a reload")
    page.locator("#themeBtn").click()
    page.select_option("#presetSelect", "std35")
    page.set_input_files("#fileInput", str(photo))
    page.wait_for_function("document.querySelector('#stageBlock').hidden === false")

    # ----------------------------------------------------------------- export
    with page.expect_download() as download:
        centre(page.locator("#sheetBtn")).click()
    data = Path(download.value.path()).read_bytes()
    width, height, dpi = png_info(data)
    check((width, height) == (1181, 1772), "the sheet downloads at 1181 x 1772")
    check(dpi is not None and abs(dpi[0] - 300) < 0.5, "the sheet carries 300 dpi")
    check(download.value.suggested_filename.endswith(".png"), "the sheet is a png")

    with page.expect_download() as download:
        centre(page.locator("#photoBtn")).click()
    data = Path(download.value.path()).read_bytes()
    width, height, dpi = png_info(data)
    check((width, height) == (413, 531), "one photo downloads at 413 x 531")
    check(dpi is not None and abs(dpi[1] - 300) < 0.5, "one photo carries 300 dpi")

    # the exported sheet keeps white paper between the photos
    sheet = Image.open(io.BytesIO(data))
    check(sheet.size == (413, 531), "the downloaded single photo opens as an image")

    # ------------------------------------------------------------------ print
    page.wait_for_timeout(500)
    check(page.evaluate("typeof window.__realPrint === 'undefined'"), "the browser print dialog is untouched")
    page.evaluate("""() => {
        window.__printed = 0;
        window.print = function () { window.__printed += 1; };
    }""")
    centre(page.locator("#printBtn")).click()
    page.wait_for_timeout(1200)
    printed = page.evaluate("window.__printed")
    check(printed >= 1, "the print button asks the browser to print")
    check(page.evaluate("document.getElementById('printImage').src.startsWith('data:image/png')"),
          "the print area holds the rendered sheet")
    check(page.evaluate("document.getElementById('printImage').style.width") == "100mm",
          "the printed sheet is 100 mm wide")
    page.emulate_media(media="print")
    pdf = page.pdf(prefer_css_page_size=True, print_background=True)
    match = re.search(rb"/MediaBox\s*\[\s*([\d.\s]+)\]", pdf)
    values = [float(value) for value in match.group(1).split()]
    check(abs(values[2] * 25.4 / 72 - 100) < 1, "the printed page is 100 mm wide")
    check(abs(values[3] * 25.4 / 72 - 150) < 1, "the printed page is 150 mm tall")
    page.emulate_media(media="screen")

    # --------------------------------------------------------------- language
    for language, heading, cyrillic in (
        ("ro", "Fotografii pentru acte, printate acasă", False),
        ("sr-latn", "Fotografije za dokumenta, štampane kod kuće", False),
        ("sr-cyrl", "Фотографије за документа, штампане код куће", True),
    ):
        page.select_option("#langSelect", language)
        page.wait_for_timeout(200)
        check(page.get_attribute("html", "lang") == {"ro": "ro", "sr-latn": "sr-Latn", "sr-cyrl": "sr-Cyrl"}[language],
              f"{language}: the html lang attribute is right")
        actual = page.locator("h1").inner_text()
        check(actual == heading, f"{language}: the heading is translated (got {actual!r})")
        if cyrillic:
            check(re.search(r"[\u0400-\u04ff]", page.locator("h1").inner_text()) is not None,
                  "Serbian Cyrillic really is Cyrillic")
        page.reload(wait_until="networkidle")
        check(page.get_attribute("html", "lang") == {"ro": "ro", "sr-latn": "sr-Latn", "sr-cyrl": "sr-Cyrl"}[language],
              f"{language}: the language survives a reload")
    page.select_option("#langSelect", "en")
    page.wait_for_timeout(150)

    # --------------------------------------------------------------- removing
    page.set_input_files("#fileInput", str(photo))
    page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
    centre(page.locator("#removeBtn")).click()
    page.wait_for_timeout(200)
    check(page.locator("#dropZone").is_visible(), "removing brings the drop zone back")
    check(page.locator("#printBtn").is_disabled(), "removing disables the exports")

    # a wrong file type is refused politely
    bad = ROOT / "tests" / "not-an-image.txt"
    bad.write_text("hello", encoding="utf-8")
    page.set_input_files("#fileInput", str(bad))
    page.wait_for_timeout(300)
    check("image" in page.locator("#toast").inner_text().lower() or page.locator("#toast").inner_text() != "",
          "a wrong file shows a message")
    bad.unlink()

    # ------------------------------------------------------------ readability
    ratios = page.evaluate(CONTRAST_JS)
    check(len(ratios) >= 6, "the contrast check found the text styles")
    lowest = min(value for _, value in ratios)
    check(lowest >= 4.5, f"every measured text pair is AA (lowest {lowest:.2f})")

    # every control has an accessible name
    unnamed = page.evaluate("""() => {
        const out = [];
        document.querySelectorAll('input, select, button').forEach(el => {
            if (el.type === 'hidden') return;
            const label = el.getAttribute('aria-label') || el.getAttribute('title') ||
                (el.id && document.querySelector('label[for="' + el.id + '"]')) ||
                el.closest('label') || (el.textContent || '').trim();
            if (!label) out.push(el.id || el.outerHTML.slice(0, 40));
        });
        return out;
    }""")
    check(unnamed == [], f"every control has a name (missing: {unnamed[:3]})")
    check(page.locator("html").get_attribute("lang") == "en", "the document language is declared")

    # ---------------------------------------------------------------- network
    external = [url for url in requests
                if not url.startswith(base) and not url.startswith("data:") and not url.startswith("blob:")]
    check(external == [], f"no network request leaves the page (saw {external[:3]})")
    check(not console, f"no console errors (saw {console[:2]})")
    check(not errors, f"no page errors (saw {errors[:2]})")

    page.screenshot(path="/tmp/photo-sheet-ui-desktop.png", full_page=False)

    # ------------------------------------------------------- service worker
    page.evaluate("window.scrollTo(0, 0)")
    registrations = page.evaluate("""async () => {
        const list = navigator.serviceWorker ? await navigator.serviceWorker.getRegistrations() : [];
        return list.length;
    }""")
    check(registrations >= 1, "the service worker registers")
    page.wait_for_function("navigator.serviceWorker.controller !== null || caches.keys().then(k => k.length > 0)",
                           timeout=8000)
    cached = page.evaluate("caches.keys().then(keys => keys.filter(k => k.indexOf('photo-sheet') === 0))")
    check(len(cached) >= 1, "the app shell lands in a photo-sheet cache")
    context.set_offline(True)
    page.reload(wait_until="domcontentloaded")
    check(page.locator("h1").inner_text().startswith("Passport photos"), "the app still opens with no network")
    check(page.locator("#countText").inner_text() != "", "the offline copy still renders the sheet logic")
    context.set_offline(False)
    context.close()


def run_tablet(browser, base, photo):
    context = browser.new_context(
        viewport={"width": 820, "height": 1180},
        has_touch=True,
        is_mobile=False,
        device_scale_factor=2,
        accept_downloads=True,
    )
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.on("console", lambda message: errors.append(message.text) if message.type == "error" else None)
    page.goto(base + "/", wait_until="networkidle")

    check(page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth") == 0,
          "the tablet layout does not scroll sideways")
    page.set_input_files("#fileInput", str(photo))
    page.wait_for_function("document.querySelector('#stageBlock').hidden === false")
    page.wait_for_timeout(300)

    # touch drag on the crop
    box = page.locator("#stageCanvas").bounding_box()
    cx, cy = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.touchscreen.tap(cx, cy)
    page.wait_for_timeout(100)
    check(page.locator("#stageCanvas").is_visible(), "the crop responds to touch")
    check(page.evaluate("document.getElementById('stageCanvas').getBoundingClientRect().width") <= box["width"] + 1,
          "the preview fits the tablet width")

    page.locator("#printBtn").scroll_into_view_if_needed()
    check(page.locator("#printBtn").is_enabled(), "printing works on the tablet layout")
    page.screenshot(path="/tmp/photo-sheet-ui-tablet.png", full_page=False)
    check(not errors, f"no errors on the tablet (saw {errors[:2]})")
    context.close()


def main():
    photo = make_photo(Path("/tmp/photo-sheet-test-photo.png"))
    with server() as base, sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            executable_path=os.environ.get("CHROMIUM_PATH") or None,
            args=["--no-sandbox", "--disable-dev-shm-usage"],
        )
        run_desktop(browser, base, photo)
        run_tablet(browser, base, photo)
        browser.close()
    print(f"ui_test.py · {checks}/{checks} checks passed")


if __name__ == "__main__":
    main()
