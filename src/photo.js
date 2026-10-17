/* Photo Sheet · TekiDeki - crop and print maths
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * Pure functions only. No DOM, no storage, no network. The page and the Node
 * test suite load exactly this file, so the numbers the browser prints are the
 * numbers the tests check.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PS = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MM_PER_INCH = 25.4;
  var DPI = 300;
  var MAX_ZOOM = 3;
  var MIN_ZOOM = 1;

  /* Photo standards. Distances in millimetres.
   * head: chin to crown. eye: from the bottom edge. gap: crown to top edge.
   * Ranges come from published ICAO, EU Visa Code and US State Department
   * guidance; the issuing authority always has the last word. */
  var PRESETS = [
    {
      id: 'std35',
      key: 'preset35',
      w: 35,
      h: 45,
      headMin: 32,
      headMax: 36,
      eyeMin: 27,
      eyeMax: 32,
      gapMin: 2,
      gapMax: 5
    },
    {
      id: 'us51',
      key: 'presetUS',
      w: 51,
      h: 51,
      headMin: 25,
      headMax: 35,
      eyeMin: 28,
      eyeMax: 35,
      gapMin: 2,
      gapMax: 6
    },
    {
      id: 'ro30',
      key: 'presetRO',
      w: 30,
      h: 40,
      headMin: 28,
      headMax: 32,
      eyeMin: 24,
      eyeMax: 28,
      gapMin: 2,
      gapMax: 5
    }
  ];

  var SHEETS = [
    { id: 's10x15', key: 'sheet10x15', w: 100, h: 150, short: '10 x 15 cm' },
    { id: 's13x18', key: 'sheet13x18', w: 130, h: 180, short: '13 x 18 cm' },
    { id: 'a4', key: 'sheetA4', w: 210, h: 297, short: 'A4' }
  ];

  function round(value, places) {
    var factor = Math.pow(10, places || 0);
    return Math.round(value * factor) / factor;
  }

  function mmToPx(mm, dpi) {
    return Math.round(mm * (dpi || DPI) / MM_PER_INCH);
  }

  function pxToMm(px, dpi) {
    return px * MM_PER_INCH / (dpi || DPI);
  }

  function clamp(value, low, high) {
    if (value < low) return low;
    if (value > high) return high;
    return value;
  }

  function customPreset(widthMm, heightMm) {
    var w = clamp(Number(widthMm) || 35, 15, 150);
    var h = clamp(Number(heightMm) || 45, 15, 150);
    return {
      id: 'custom',
      key: 'presetCustom',
      w: w,
      h: h,
      headMin: round(h * 0.71, 1),
      headMax: round(h * 0.8, 1),
      eyeMin: round(h * 0.6, 1),
      eyeMax: round(h * 0.71, 1),
      gapMin: round(h * 0.044, 1),
      gapMax: round(h * 0.111, 1)
    };
  }

  function getPreset(id, customW, customH) {
    for (var i = 0; i < PRESETS.length; i++) {
      if (PRESETS[i].id === id) return PRESETS[i];
    }
    return customPreset(customW, customH);
  }

  function getSheet(id) {
    for (var i = 0; i < SHEETS.length; i++) {
      if (SHEETS[i].id === id) return SHEETS[i];
    }
    return SHEETS[0];
  }

  /* Three horizontal guides, in millimetres from the top edge:
   * where the crown, the eyes and the chin should land. */
  function guides(preset) {
    return {
      crown: [preset.gapMin, preset.gapMax],
      eyes: [preset.h - preset.eyeMax, preset.h - preset.eyeMin],
      chin: [preset.gapMin + preset.headMin, preset.gapMax + preset.headMax]
    };
  }

  /* How many photos fit, and where. Margins and gaps in millimetres. */
  function layout(preset, sheet, margin, gap) {
    var m = typeof margin === 'number' ? margin : 4;
    var g = typeof gap === 'number' ? gap : 3;
    var usableW = sheet.w - 2 * m;
    var usableH = sheet.h - 2 * m;
    var cols = Math.floor((usableW + g) / (preset.w + g));
    var rows = Math.floor((usableH + g) / (preset.h + g));
    if (cols < 0) cols = 0;
    if (rows < 0) rows = 0;
    var count = cols * rows;
    var blockW = cols > 0 ? cols * preset.w + (cols - 1) * g : 0;
    var blockH = rows > 0 ? rows * preset.h + (rows - 1) * g : 0;
    var x0 = (sheet.w - blockW) / 2;
    var y0 = (sheet.h - blockH) / 2;
    var cells = [];
    for (var r = 0; r < rows; r++) {
      for (var c = 0; c < cols; c++) {
        cells.push({
          x: round(x0 + c * (preset.w + g), 3),
          y: round(y0 + r * (preset.h + g), 3),
          w: preset.w,
          h: preset.h
        });
      }
    }
    return {
      cols: cols,
      rows: rows,
      count: count,
      blockW: round(blockW, 3),
      blockH: round(blockH, 3),
      x0: round(x0, 3),
      y0: round(y0, 3),
      cells: cells,
      margin: m,
      gap: g
    };
  }

  function rotatedSize(w, h, rot) {
    var turns = ((rot % 360) + 360) % 360;
    if (turns % 180 === 0) return { w: w, h: h };
    return { w: h, h: w };
  }

  /* Scale that makes the photo exactly cover the frame at zoom 1. */
  function coverScale(imgW, imgH, frameW, frameH, rot) {
    var size = rotatedSize(imgW, imgH, rot);
    if (!size.w || !size.h) return 1;
    return Math.max(frameW / size.w, frameH / size.h);
  }

  function clampZoom(zoom) {
    return clamp(Number(zoom) || 1, MIN_ZOOM, MAX_ZOOM);
  }

  function normalizeRot(rot) {
    return ((Number(rot) || 0) % 360 + 360) % 360;
  }

  /* Offsets are stored as a fraction of the frame, so a preview and a 413 px
   * export land on the same part of the photo. */
  function clampOffset(tf, imgW, imgH, frameW, frameH) {
    var zoom = clampZoom(tf.zoom);
    var scale = coverScale(imgW, imgH, frameW, frameH, tf.rot) * zoom;
    var size = rotatedSize(imgW, imgH, tf.rot);
    var slackX = Math.max(0, (size.w * scale - frameW) / 2) / frameW;
    var slackY = Math.max(0, (size.h * scale - frameH) / 2) / frameH;
    var x = clamp(Number(tf.ox) || 0, -slackX, slackX);
    var y = clamp(Number(tf.oy) || 0, -slackY, slackY);
    return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };
  }

  function defaultTransform() {
    return { zoom: 1, ox: 0, oy: 0, rot: 0, flip: false };
  }

  function sanitizeTransform(input, imgW, imgH, frameW, frameH) {
    var tf = input || {};
    var out = {
      zoom: clampZoom(tf.zoom),
      ox: Number(tf.ox) || 0,
      oy: Number(tf.oy) || 0,
      rot: normalizeRot(tf.rot),
      flip: !!tf.flip
    };
    var clamped = clampOffset(out, imgW, imgH, frameW, frameH);
    out.ox = clamped.x === 0 ? 0 : clamped.x;
    out.oy = clamped.y === 0 ? 0 : clamped.y;
    return out;
  }

  /* Draw one cell. The frame is in device pixels and the context origin must
   * already sit at the cell's top left corner. */
  function drawFrame(ctx, image, frameW, frameH, tf) {
    var zoom = clampZoom(tf.zoom);
    var scale = coverScale(image.width, image.height, frameW, frameH, tf.rot) * zoom;
    ctx.save();
    ctx.translate(frameW / 2 + (Number(tf.ox) || 0) * frameW,
                  frameH / 2 + (Number(tf.oy) || 0) * frameH);
    ctx.rotate(normalizeRot(tf.rot) * Math.PI / 180);
    ctx.scale(tf.flip ? -scale : scale, scale);
    ctx.drawImage(image, -image.width / 2, -image.height / 2);
    ctx.restore();
  }

  /* Is there enough source detail for the exported print? */
  function resolution(imgW, imgH, frameW, frameH, zoom, rot) {
    var scale = coverScale(imgW, imgH, frameW, frameH, rot) * clampZoom(zoom);
    /* Source pixels available for every printed pixel. Below one means the
     * printer would be inventing detail. */
    var perOutput = 1 / scale;
    var state = perOutput >= 0.98 ? 'good' : perOutput >= 0.67 ? 'warn' : 'bad';
    return {
      perOutput: round(perOutput, 2),
      state: state,
      megapixels: round(imgW * imgH / 1000000, 1)
    };
  }

  /* ---- small statistics helpers used by the quality checks ---- */

  function stats(values) {
    var n = values.length;
    if (!n) return { mean: 0, sd: 0, min: 0, max: 0 };
    var sum = 0, i;
    for (i = 0; i < n; i++) sum += values[i];
    var mean = sum / n;
    var acc = 0;
    for (i = 0; i < n; i++) {
      var d = values[i] - mean;
      acc += d * d;
    }
    var min = values[0], max = values[0];
    for (i = 1; i < n; i++) {
      if (values[i] < min) min = values[i];
      if (values[i] > max) max = values[i];
    }
    return { mean: mean, sd: Math.sqrt(acc / n), min: min, max: max };
  }

  /* Uniform background test, one sample set per corner of the crop.
   * Comparing the corners is robust: a strand of hair in one corner is normal,
   * while a wall that is bright on one side and grey on the other is not. */
  function background(regions) {
    if (!regions || !regions.length) return { mean: 0, score: 0, spread: 0, state: 'warn', light: false };
    var means = [];
    var worst = 0;
    var all = 0;
    var count = 0;
    for (var r = 0; r < regions.length; r++) {
      var pixels = regions[r] || [];
      if (!pixels.length) continue;
      var lum = [];
      for (var i = 0; i < pixels.length; i++) {
        var p = pixels[i];
        lum.push(0.2126 * p[0] + 0.7152 * p[1] + 0.0722 * p[2]);
      }
      var s = stats(lum);
      means.push(s.mean);
      if (s.sd > worst) worst = s.sd;
      all += s.mean * lum.length;
      count += lum.length;
    }
    if (!means.length) return { mean: 0, score: 0, spread: 0, state: 'warn', light: false };
    var spread = Math.max.apply(null, means) - Math.min.apply(null, means);
    var mean = all / count;
    var state = 'good';
    if (worst > 30 || spread > 42) state = 'bad';
    else if (worst > 18 || spread > 24) state = 'warn';
    return {
      mean: round(mean, 0),
      score: round(worst, 1),
      spread: round(spread, 1),
      state: state,
      light: mean >= 150
    };
  }

  /* Variance of the Laplacian on a greyscale crop, a cheap sharpness hint.
   * gray: flat array of 0..255 values, width and height included. */
  function sharpness(gray, width, height) {
    if (!width || !height || gray.length < width * height) return { score: 0, state: 'warn' };
    var total = 0, total2 = 0, count = 0;
    for (var y = 1; y < height - 1; y++) {
      for (var x = 1; x < width - 1; x++) {
        var i = y * width + x;
        var lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
        total += lap;
        total2 += lap * lap;
        count++;
      }
    }
    if (!count) return { score: 0, state: 'warn' };
    var mean = total / count;
    var variance = total2 / count - mean * mean;
    var state = variance >= 120 ? 'good' : variance >= 45 ? 'warn' : 'bad';
    return { score: round(variance, 1), state: state };
  }

  /* ---- PNG resolution metadata ---- */

  var CRC_TABLE = null;

  function crcTable() {
    if (CRC_TABLE) return CRC_TABLE;
    var table = new Uint32Array(256);
    for (var n = 0; n < 256; n++) {
      var c = n;
      for (var k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    CRC_TABLE = table;
    return table;
  }

  function crc32(bytes) {
    var table = crcTable();
    var crc = 0xFFFFFFFF;
    for (var i = 0; i < bytes.length; i++) {
      crc = table[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  function u32(value) {
    return [value >>> 24 & 255, value >>> 16 & 255, value >>> 8 & 255, value & 255];
  }

  /* Insert a pHYs chunk right after IHDR so viewers and printers know the
   * physical size of the PNG. Without it a 413 x 531 file is just pixels. */
  function pngWithDpi(bytes, dpi) {
    if (!bytes || bytes.length < 33) return bytes;
    var signature = [137, 80, 78, 71, 13, 10, 26, 10];
    for (var i = 0; i < 8; i++) {
      if (bytes[i] !== signature[i]) return bytes;
    }
    var ppm = Math.round((dpi || DPI) / 0.0254);
    var type = [112, 72, 89, 115]; /* pHYs */
    var data = u32(ppm).concat(u32(ppm)).concat([1]);
    var chunk = u32(9).concat(type).concat(data);
    var crc = crc32(new Uint8Array(chunk.slice(4)));
    chunk = chunk.concat(u32(crc));
    var head = Array.prototype.slice.call(bytes, 0, 33);
    var tail = Array.prototype.slice.call(bytes, 33);
    return new Uint8Array(head.concat(chunk, tail));
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return round(bytes / 1024, 0) + ' kB';
    return round(bytes / (1024 * 1024), 1) + ' MB';
  }

  return {
    MM_PER_INCH: MM_PER_INCH,
    DPI: DPI,
    MIN_ZOOM: MIN_ZOOM,
    MAX_ZOOM: MAX_ZOOM,
    PRESETS: PRESETS,
    SHEETS: SHEETS,
    mmToPx: mmToPx,
    pxToMm: pxToMm,
    clamp: clamp,
    round: round,
    getPreset: getPreset,
    getSheet: getSheet,
    customPreset: customPreset,
    guides: guides,
    layout: layout,
    rotatedSize: rotatedSize,
    coverScale: coverScale,
    clampZoom: clampZoom,
    clampOffset: clampOffset,
    normalizeRot: normalizeRot,
    defaultTransform: defaultTransform,
    sanitizeTransform: sanitizeTransform,
    drawFrame: drawFrame,
    resolution: resolution,
    stats: stats,
    background: background,
    sharpness: sharpness,
    crc32: crc32,
    pngWithDpi: pngWithDpi,
    formatBytes: formatBytes
  };
}));
