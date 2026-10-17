#!/usr/bin/env node
/* Photo Sheet · logic tests
 * SPDX-License-Identifier: Apache-2.0
 *
 * node tests/logic_test.cjs
 * Pure engine only: no browser, no network.
 */
'use strict';

const assert = require('node:assert');
const zlib = require('node:zlib');
const path = require('node:path');

const PS = require(path.join(__dirname, '..', 'src', 'photo.js'));

let checks = 0;
function ok(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}
function eq(actual, expected, message) {
  checks += 1;
  assert.strictEqual(actual, expected, message + ' (got ' + actual + ', wanted ' + expected + ')');
}
function near(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance,
    message + ' (got ' + actual + ', wanted ' + expected + ' +/- ' + tolerance + ')');
}

/* ---------------------------------------------------------------- millimetres */

eq(PS.mmToPx(35), 413, '35 mm at 300 dpi');
eq(PS.mmToPx(45), 531, '45 mm at 300 dpi');
eq(PS.mmToPx(51), 602, '51 mm at 300 dpi');
eq(PS.mmToPx(30), 354, '30 mm at 300 dpi');
eq(PS.mmToPx(40), 472, '40 mm at 300 dpi');
eq(PS.mmToPx(100), 1181, '10 cm sheet width');
eq(PS.mmToPx(150), 1772, '15 cm sheet height');
eq(PS.mmToPx(130), 1535, '13 cm sheet width');
eq(PS.mmToPx(180), 2126, '18 cm sheet height');
eq(PS.mmToPx(210), 2480, 'A4 width');
eq(PS.mmToPx(297), 3508, 'A4 height');
eq(PS.mmToPx(25.4), 300, 'one inch is 300 pixels');
near(PS.pxToMm(413), 34.97, 0.02, '413 px is 35 mm');
near(PS.pxToMm(1181), 99.99, 0.02, '1181 px is 10 cm');
eq(PS.mmToPx(45, 600), 1063, '45 mm at 600 dpi');
eq(PS.mmToPx(45, 150), 266, '45 mm at 150 dpi');

/* -------------------------------------------------------------------- presets */

eq(PS.PRESETS.length, 3, 'three built in sizes');
const std = PS.getPreset('std35');
eq(std.w, 35, 'standard is 35 mm wide');
eq(std.h, 45, 'standard is 45 mm tall');
eq(std.headMin, 32, 'standard head minimum');
eq(std.headMax, 36, 'standard head maximum');
ok(std.headMax <= std.h, 'head fits the frame');
eq(PS.getPreset('us51').w, 51, 'US size is 51 mm wide');
eq(PS.getPreset('us51').h, 51, 'US size is square');
eq(PS.getPreset('ro30').w, 30, 'Romanian ID is 30 mm wide');
eq(PS.getPreset('unknown').id, 'custom', 'unknown id falls back to custom');
const custom = PS.customPreset(40, 60);
eq(custom.w, 40, 'custom width kept');
eq(custom.h, 60, 'custom height kept');
near(custom.headMin, 42.6, 0.1, 'custom head minimum is 71 percent');
near(custom.headMax, 48, 0.1, 'custom head maximum is 80 percent');
eq(PS.customPreset(5, 500).w, 15, 'custom width is clamped low');
eq(PS.customPreset(5, 500).h, 150, 'custom height is clamped high');
eq(PS.customPreset('x', 'y').w, 35, 'garbage width falls back to 35');
eq(PS.customPreset('x', 'y').h, 45, 'garbage height falls back to 45');

/* -------------------------------------------------------------------- guides */

const g = PS.guides(std);
eq(g.crown[0], 2, 'crown band starts 2 mm from the top');
eq(g.crown[1], 5, 'crown band ends 5 mm from the top');
eq(g.eyes[0], 13, 'eyes band starts 13 mm from the top');
eq(g.eyes[1], 18, 'eyes band ends 18 mm from the top');
eq(g.chin[0], 34, 'chin band starts 34 mm from the top');
eq(g.chin[1], 41, 'chin band ends 41 mm from the top');
ok(g.crown[1] < g.eyes[0], 'crown sits above the eyes');
ok(g.eyes[1] < g.chin[0], 'eyes sit above the chin');
ok(g.chin[1] < std.h, 'chin band stays inside the frame');
eq(PS.guides(std).eyes[0], 45 - std.eyeMax, 'eye band is measured from the bottom');
const gu = PS.guides(PS.getPreset('us51'));
ok(gu.crown[1] < gu.eyes[0] && gu.eyes[1] < gu.chin[0], 'US bands stay ordered');
ok(gu.chin[1] <= 51, 'US chin band fits the square');

/* -------------------------------------------------------------------- layout */

const sheet1 = PS.getSheet('s10x15');
const sheet2 = PS.getSheet('s13x18');
const sheetA4 = PS.getSheet('a4');
eq(sheet1.w, 100, '10 x 15 width');
eq(sheet1.h, 150, '10 x 15 height');
eq(sheetA4.w, 210, 'A4 width');
eq(PS.getSheet('nope').id, 's10x15', 'unknown sheet falls back to 10 x 15');

const l1 = PS.layout(std, sheet1, 4, 3);
eq(l1.cols, 2, 'two columns of 35 mm on 10 x 15');
eq(l1.rows, 3, 'three rows of 45 mm on 10 x 15');
eq(l1.count, 6, 'six photos on a 10 x 15 sheet');
eq(l1.cells.length, 6, 'one cell per photo');
near(l1.blockW, 73, 0.001, 'block width is 2 * 35 + 3');
near(l1.blockH, 141, 0.001, 'block height is 3 * 45 + 2 * 3');
near(l1.x0, 13.5, 0.001, 'block is centred horizontally');
near(l1.y0, 4.5, 0.001, 'block is centred vertically');
near(l1.x0 * 2 + l1.blockW, 100, 0.001, 'equal margins left and right');
near(l1.y0 * 2 + l1.blockH, 150, 0.001, 'equal margins top and bottom');

const c0 = l1.cells[0];
const c5 = l1.cells[5];
near(c0.x, 13.5, 0.001, 'first cell x');
near(c0.y, 4.5, 0.001, 'first cell y');
near(c5.x, 51.5, 0.001, 'last cell x');
near(c5.y, 100.5, 0.001, 'last cell y');
near(c5.x + c5.w, 86.5, 0.001, 'last cell right edge');

let inside = true;
let overlap = false;
l1.cells.forEach(function (cell, i) {
  if (cell.x < l1.margin - 0.001 || cell.y < l1.margin - 0.001) inside = false;
  if (cell.x + cell.w > 100 - l1.margin + 0.001) inside = false;
  if (cell.y + cell.h > 150 - l1.margin + 0.001) inside = false;
  l1.cells.forEach(function (other, j) {
    if (j <= i) return;
    const apart = cell.x + cell.w <= other.x + 0.001 || other.x + other.w <= cell.x + 0.001 ||
      cell.y + cell.h <= other.y + 0.001 || other.y + other.h <= cell.y + 0.001;
    if (!apart) overlap = true;
  });
});
ok(inside, 'every cell stays inside the margins');
ok(!overlap, 'no cells overlap');

eq(PS.layout(std, sheet2, 4, 3).count, 9, 'nine photos on 13 x 18');
eq(PS.layout(std, sheet2, 4, 3).cols, 3, 'three columns on 13 x 18');
eq(PS.layout(std, sheetA4, 4, 3).count, 30, 'thirty photos on A4');
eq(PS.layout(PS.getPreset('us51'), sheet1, 4, 3).count, 2, 'two square photos on 10 x 15');
eq(PS.layout(PS.getPreset('us51'), sheet2, 4, 3).count, 6, 'six square photos on 13 x 18');
eq(PS.layout(PS.getPreset('ro30'), sheet1, 4, 3).count, 6, 'six small photos on 10 x 15');
eq(PS.layout(PS.customPreset(200, 200), sheet1, 4, 3).count, 0, 'nothing fits when the photo is bigger than the paper');
eq(PS.layout(std, sheet1, 0, 3).count, 6, 'no margin still gives six photos');
eq(PS.layout(std, sheet1, 4, 10).count, 4, 'a wide gap reduces the count');
eq(PS.layout(std, sheet1).gap, 3, 'default gap is 3 mm');
eq(PS.layout(std, sheet1).margin, 4, 'default margin is 4 mm');

/* ----------------------------------------------------------------- rotation */

const r0 = PS.rotatedSize(1000, 500, 0);
eq(r0.w, 1000, 'no rotation keeps width');
eq(r0.h, 500, 'no rotation keeps height');
const r90 = PS.rotatedSize(1000, 500, 90);
eq(r90.w, 500, '90 degrees swaps width');
eq(r90.h, 1000, '90 degrees swaps height');
eq(PS.rotatedSize(1000, 500, 180).w, 1000, '180 degrees keeps width');
eq(PS.rotatedSize(1000, 500, 270).h, 1000, '270 degrees swaps height');
eq(PS.rotatedSize(1000, 500, -90).w, 500, 'negative angles are normalised');
eq(PS.normalizeRot(-90), 270, 'minus 90 becomes 270');
eq(PS.normalizeRot(450), 90, '450 becomes 90');

/* --------------------------------------------------------------- cover scale */

near(PS.coverScale(1000, 1000, 413, 531, 0), 0.531, 0.001, 'square photo fills a tall frame by height');
near(PS.coverScale(1000, 1000, 413, 531, 90), 0.531, 0.001, 'rotation keeps a square square');
near(PS.coverScale(1600, 900, 413, 531, 0), 0.59, 0.001, 'landscape photo fills by height');
near(PS.coverScale(1600, 900, 413, 531, 90), 0.459, 0.001, 'rotated landscape fills by width');
near(PS.coverScale(413, 531, 413, 531, 0), 1, 0.001, 'an exact photo needs no scaling');
near(PS.coverScale(826, 1062, 413, 531, 0), 0.5, 0.001, 'a 600 dpi photo scales down');
near(PS.coverScale(350, 450, 413, 531, 0), 1.18, 0.001, 'a small photo scales up');
near(PS.coverScale(0, 0, 413, 531, 0), 1, 0.001, 'empty photo does not divide by zero');

/* ------------------------------------------------------------------- offsets */

const sq = { width: 413, height: 531 };
const t1 = PS.clampOffset({ zoom: 1, ox: 0.4, oy: -0.4, rot: 0 }, 413, 531, 413, 531);
eq(t1.x, 0, 'exact fit has no horizontal slack at zoom 1');
eq(t1.y, 0, 'exact fit has no vertical slack at zoom 1');
const t2 = PS.clampOffset({ zoom: 2, ox: 5, oy: -5, rot: 0 }, 413, 531, 413, 531);
near(t2.x, 0.5, 0.0001, 'zoom 2 allows half a frame of slack');
near(t2.y, -0.5, 0.0001, 'negative slack is symmetrical');
const t3 = PS.clampOffset({ zoom: 1, ox: 5, oy: 0, rot: 0 }, 1000, 531, 413, 531);
near(t3.x, 0.7104, 0.001, 'a wide source allows sideways movement');
eq(PS.clampZoom(0.2), 1, 'zoom is never below one');
eq(PS.clampZoom(9), 3, 'zoom is never above three');
eq(PS.clampZoom('x'), 1, 'garbage zoom becomes one');
const st = PS.sanitizeTransform({ zoom: 2.5, ox: 9, oy: 9, rot: -90, flip: true }, 1000, 1000, 413, 531);
eq(st.zoom, 2.5, 'zoom survives sanitising');
eq(st.rot, 270, 'rotation is normalised by sanitising');
eq(st.flip, true, 'flip survives sanitising');
const expectClamp = PS.clampOffset({ zoom: 2.5, ox: 9, oy: 9, rot: 270 }, 1000, 1000, 413, 531);
near(st.ox, expectClamp.x, 0.0001, 'sanitised x matches the clamp');
near(st.oy, expectClamp.y, 0.0001, 'sanitised y matches the clamp');
ok(Math.abs(st.ox) <= 1.2, 'sanitised offset stays within the frame slack');
const d = PS.defaultTransform();
eq(d.zoom, 1, 'default zoom');
eq(d.rot, 0, 'default rotation');
eq(d.flip, false, 'default is not flipped');

/* --------------------------------------------------------------- resolution */

eq(PS.resolution(3000, 4000, 413, 531, 1, 0).state, 'good', 'a phone photo is good at zoom 1');
eq(PS.resolution(413, 531, 413, 531, 1, 0).state, 'good', 'an exact photo is good');
eq(PS.resolution(300, 400, 413, 531, 1, 0).state, 'warn', 'a small photo warns');
eq(PS.resolution(200, 250, 413, 531, 1, 0).state, 'bad', 'a tiny photo is refused by the quality chip');
eq(PS.resolution(800, 1062, 413, 531, 2, 0).state, 'warn', 'zooming in costs resolution');
eq(PS.resolution(3000, 4000, 413, 531, 1, 0).megapixels, 12, 'megapixels are reported');

/* ------------------------------------------------------------------ quality */

const uniform = [];
for (let i = 0; i < 50; i++) uniform.push([240, 240, 238]);
const plain = [uniform, uniform, uniform, uniform];
const bg1 = PS.background(plain);
eq(bg1.state, 'good', 'a plain wall passes the background check');
eq(bg1.light, true, 'a plain wall is light');
eq(bg1.spread, 0, 'a plain wall has no spread between corners');
const busy = [];
for (let i = 0; i < 50; i++) busy.push(i % 2 ? [20, 20, 20] : [250, 250, 250]);
const bg2 = PS.background([busy, busy, busy, busy]);
eq(bg2.state, 'bad', 'a busy background fails');
eq(bg2.light, false, 'a busy dark background is not light');
const dark = [];
for (let i = 0; i < 50; i++) dark.push([40, 44, 42]);
eq(PS.background([dark, dark, dark, dark]).light, false, 'a dark background is reported as dark');
const bright = [];
for (let i = 0; i < 50; i++) bright.push([236, 236, 236]);
const uneven = PS.background([bright, bright, dark, dark]);
eq(uneven.state, 'bad', 'a lit on one side, dark on the other wall is called uneven');
eq(uneven.spread > 40, true, 'the spread between corners is reported');
const oneCorner = PS.background([bright, bright, bright, dark]);
ok(oneCorner.state !== 'good', 'one dark corner is noticed');
eq(PS.background([]).state, 'warn', 'no samples does not crash');

function gradient(size) {
  const gray = [];
  for (let i = 0; i < size * size; i++) gray.push(128);
  return gray;
}
function checker(size) {
  const gray = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) gray.push((x + y) % 2 ? 0 : 255);
  }
  return gray;
}
eq(PS.sharpness(gradient(32), 32, 32).state, 'bad', 'a flat image is not sharp');
eq(PS.sharpness(checker(32), 32, 32).state, 'good', 'a busy image reads as sharp');
eq(PS.sharpness([], 0, 0).state, 'warn', 'empty data does not crash');
ok(PS.sharpness(checker(16), 16, 16).score > PS.sharpness(gradient(16), 16, 16).score,
  'sharpness compares in the right direction');

const s1 = PS.stats([2, 4, 4, 4, 5, 5, 7, 9]);
eq(s1.mean, 5, 'stats mean');
near(s1.sd, 2, 0.001, 'stats standard deviation');
eq(s1.min, 2, 'stats min');
eq(s1.max, 9, 'stats max');
eq(PS.stats([]).mean, 0, 'empty stats are zeroed');

/* ----------------------------------------------------------------------- png */

const CRC = PS.crc32(new TextEncoder().encode('123456789'));
eq(CRC, 0xCBF43926, 'crc32 matches the reference vector');

function chunk(type, data) {
  const typeBytes = Buffer.from(type, 'ascii');
  const body = Buffer.concat([typeBytes, Buffer.from(data)]);
  const out = Buffer.alloc(4);
  out.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(PS.crc32(new Uint8Array(body)), 0);
  return Buffer.concat([out, body, crc]);
}

function tinyPng() {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(2, 0);
  ihdr.writeUInt32BE(2, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.from([0, 255, 0, 0, 0, 255, 0, 0, 255, 0, 255, 255, 255]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

const original = tinyPng();
const tagged = Buffer.from(PS.pngWithDpi(new Uint8Array(original), 300));
ok(tagged.length > original.length, 'a pHYs chunk was added');
eq(tagged.slice(0, 8).toString('hex'), original.slice(0, 8).toString('hex'), 'the png signature survives');
eq(tagged.slice(0, 33).toString('hex'), original.slice(0, 33).toString('hex'), 'IHDR is untouched');
eq(tagged.slice(33, 37).readUInt32BE(0), 9, 'pHYs data length is 9');
eq(tagged.slice(37, 41).toString('ascii'), 'pHYs', 'the chunk is pHYs');
const ppm = tagged.readUInt32BE(41);
eq(ppm, 11811, '300 dpi is 11811 pixels per metre');
eq(tagged.readUInt32BE(45), 11811, 'both axes carry the density');
eq(tagged[49], 1, 'the unit is the metre');
const stored = tagged.readUInt32BE(50);
eq(stored, PS.crc32(new Uint8Array(tagged.slice(37, 50))), 'the pHYs crc is valid');
eq(tagged.slice(54).toString('hex'), original.slice(33).toString('hex'), 'the rest of the file survives');
eq(Buffer.from(PS.pngWithDpi(new Uint8Array([1, 2, 3]), 300)).toString('hex'), '010203', 'garbage is returned unchanged');
const sixHundred = Buffer.from(PS.pngWithDpi(new Uint8Array(original), 600));
eq(sixHundred.readUInt32BE(41), 23622, '600 dpi is 23622 pixels per metre');

/* --------------------------------------------------------------------- misc */

eq(PS.formatBytes(512), '512 B', 'bytes below a kilobyte');
eq(PS.formatBytes(2048), '2 kB', 'kilobytes');
eq(PS.formatBytes(3 * 1024 * 1024), '3 MB', 'megabytes');
eq(PS.DPI, 300, 'the working resolution is 300 dpi');
eq(PS.MIN_ZOOM, 1, 'minimum zoom is one');
eq(PS.MAX_ZOOM, 3, 'maximum zoom is three');
eq(PS.clamp(5, 0, 3), 3, 'clamp high');
eq(PS.clamp(-5, 0, 3), 0, 'clamp low');
eq(PS.round(2.345, 2), 2.35, 'rounding to two places');

/* the sheet pixel size is what the exporter will produce */
eq(PS.mmToPx(PS.getSheet('s10x15').w), 1181, 'sheet export width');
eq(PS.mmToPx(PS.getSheet('s10x15').h), 1772, 'sheet export height');
eq(PS.mmToPx(PS.getPreset('std35').w), 413, 'single photo export width');
eq(PS.mmToPx(PS.getPreset('std35').h), 531, 'single photo export height');
eq(PS.mmToPx(PS.getPreset('us51').w), 602, 'us square export');
eq(PS.mmToPx(PS.getPreset('ro30').h), 472, 'romanian id export height');

console.log('logic_test.cjs · ' + checks + ' checks passed');
