/* Photo Sheet · TekiDeki - interface
 * SPDX-License-Identifier: Apache-2.0
 * Copyright 2026 Kristian Mario Miskovic (TekiDeki)
 *
 * No framework, no network, no cookies. The photo never leaves this tab: it is
 * decoded from a local file into an Image object and drawn on canvas. Settings
 * only are kept in localStorage.
 */
(function () {
  'use strict';

  var PS = window.PS;
  var LOCALES = window.TD_LOCALES || {};
  var LANGS = ['en', 'ro', 'sr-latn', 'sr-cyrl'];
  var HTML_LANG = { en: 'en', ro: 'ro', 'sr-latn': 'sr-Latn', 'sr-cyrl': 'sr-Cyrl' };
  var STORAGE_KEY = 'photo-sheet.v1';
  var MAX_BYTES = 25 * 1024 * 1024;
  var DPR = Math.min(window.devicePixelRatio || 1, 2.5);

  var state = {
    language: 'en',
    theme: 'light',
    preset: 'std35',
    sheet: 's10x15',
    customW: 35,
    customH: 45,
    guides: true,
    cutMarks: true,
    tf: PS.defaultTransform(),
    image: null,
    imageName: '',
    history: [],
    toastTimer: null,
    qualityTimer: null,
    resizeTimer: null,
    storageOk: true,
    drag: null
  };

  var el = {};

  /* -------------------------------------------------------------- utilities */

  function $(id) { return document.getElementById(id); }

  function t(key, vars) {
    var pack = LOCALES[state.language] || LOCALES.en || {};
    var text = pack[key];
    if (text === undefined) text = (LOCALES.en || {})[key];
    if (text === undefined) return key;
    if (vars) {
      Object.keys(vars).forEach(function (name) {
        text = text.split('{' + name + '}').join(String(vars[name]));
      });
    }
    return text;
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function currentPreset() {
    return PS.getPreset(state.preset, state.customW, state.customH);
  }

  function currentSheet() {
    return PS.getSheet(state.sheet);
  }

  function presetLabel(preset) {
    return t(preset.key);
  }

  function toast(message) {
    if (!el.toast) return;
    el.toast.textContent = message;
    el.toast.classList.add('is-on');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(function () { el.toast.classList.remove('is-on'); }, 2200);
  }

  /* --------------------------------------------------------------- settings */

  function save() {
    if (!state.storageOk) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        v: 1,
        language: state.language,
        theme: state.theme,
        preset: state.preset,
        sheet: state.sheet,
        customW: state.customW,
        customH: state.customH,
        guides: state.guides,
        cutMarks: state.cutMarks
      }));
    } catch (error) {
      state.storageOk = false;
    }
  }

  function loadSettings() {
    var stored = null;
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) stored = JSON.parse(raw);
    } catch (error) {
      stored = null;
    }
    if (stored && typeof stored === 'object') {
      if (LANGS.indexOf(stored.language) > -1) state.language = stored.language;
      if (stored.theme === 'dark' || stored.theme === 'light') state.theme = stored.theme;
      var ids = PS.PRESETS.map(function (item) { return item.id; }).concat(['custom']);
      if (ids.indexOf(stored.preset) > -1) state.preset = stored.preset;
      var sheets = PS.SHEETS.map(function (item) { return item.id; });
      if (sheets.indexOf(stored.sheet) > -1) state.sheet = stored.sheet;
      if (typeof stored.customW === 'number') state.customW = PS.clamp(stored.customW, 15, 150);
      if (typeof stored.customH === 'number') state.customH = PS.clamp(stored.customH, 15, 150);
      if (typeof stored.guides === 'boolean') state.guides = stored.guides;
      if (typeof stored.cutMarks === 'boolean') state.cutMarks = stored.cutMarks;
      return true;
    }
    var nav = (navigator.language || 'en').toLowerCase();
    if (nav.indexOf('ro') === 0) state.language = 'ro';
    else if (nav.indexOf('sr') === 0) state.language = nav.indexOf('cyrl') > -1 || nav.indexOf('cyrillic') > -1 ? 'sr-cyrl' : 'sr-latn';
    else state.language = 'en';
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) state.theme = 'dark';
    return false;
  }

  /* -------------------------------------------------------------- language */

  function applyLanguage() {
    document.documentElement.lang = HTML_LANG[state.language] || 'en';
    var nodes = document.querySelectorAll('[data-i18n]');
    for (var i = 0; i < nodes.length; i++) {
      nodes[i].textContent = t(nodes[i].getAttribute('data-i18n'));
    }
    var titled = document.querySelectorAll('[data-i18n-title]');
    for (var j = 0; j < titled.length; j++) {
      titled[j].setAttribute('title', t(titled[j].getAttribute('data-i18n-title')));
    }
    var labelled = document.querySelectorAll('[data-i18n-aria-label]');
    for (var k = 0; k < labelled.length; k++) {
      labelled[k].setAttribute('aria-label', t(labelled[k].getAttribute('data-i18n-aria-label')));
    }
    if (el.langSelect) el.langSelect.value = state.language;
    buildSelects();
    updatePresetNote();
    updateCount();
    updateSizeText();
    updateQualityText();
    drawStage();
    drawSheet();
  }

  function setLanguage(language) {
    if (LANGS.indexOf(language) < 0) return;
    state.language = language;
    save();
    applyLanguage();
  }

  function setTheme(theme) {
    state.theme = theme === 'dark' ? 'dark' : 'light';
    document.documentElement.classList.toggle('theme-dark', state.theme === 'dark');
    save();
  }

  /* ----------------------------------------------------------------- selects */

  function buildSelects() {
    if (!el.presetSelect) return;
    var preset = currentPreset();
    el.presetSelect.innerHTML = '';
    PS.PRESETS.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = t(item.key);
      el.presetSelect.appendChild(option);
    });
    var custom = document.createElement('option');
    custom.value = 'custom';
    custom.textContent = t('presetCustom');
    el.presetSelect.appendChild(custom);
    el.presetSelect.value = state.preset;

    el.sheetSelect.innerHTML = '';
    PS.SHEETS.forEach(function (item) {
      var option = document.createElement('option');
      option.value = item.id;
      option.textContent = t(item.key);
      el.sheetSelect.appendChild(option);
    });
    el.sheetSelect.value = state.sheet;
    if (el.customField) el.customField.hidden = state.preset !== 'custom';
    if (el.customW) el.customW.value = state.customW;
    if (el.customH) el.customH.value = state.customH;
    if (el.guidesToggle) el.guidesToggle.checked = state.guides;
    if (el.cutMarksToggle) el.cutMarksToggle.checked = state.cutMarks;
    void preset;
  }

  function updatePresetNote() {
    if (!el.presetNote) return;
    var preset = currentPreset();
    var key = preset.key + 'Note';
    el.presetNote.textContent = t(key);
  }

  function updateCount() {
    if (!el.countText) return;
    var layout = PS.layout(currentPreset(), currentSheet(), 4, 3);
    var text;
    if (layout.count === 0) text = t('countNone');
    else if (layout.count === 1) text = t('countOne');
    else text = t('countMany', { count: layout.count });
    el.countText.textContent = text;
  }

  function updateSizeText() {
    if (!el.sizeText) return;
    var sheet = currentSheet();
    el.sizeText.textContent = t('sizeText', {
      w: PS.mmToPx(sheet.w),
      h: PS.mmToPx(sheet.h),
      sheet: sheet.short
    });
  }

  /* ------------------------------------------------------------------ stage */

  function stageMetrics() {
    var preset = currentPreset();
    var box = el.stage ? el.stage.clientWidth - 28 : 320;
    var availW = Math.max(180, Math.min(box, 380));
    var availH = Math.max(220, Math.round(window.innerHeight * 0.44));
    var width = availW;
    var height = width * preset.h / preset.w;
    if (height > availH) {
      height = availH;
      width = height * preset.w / preset.h;
    }
    return { w: Math.round(width), h: Math.round(height) };
  }

  function sizeCanvas(canvas, cssW, cssH) {
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * DPR);
    canvas.height = Math.round(cssH * DPR);
  }

  function drawStage() {
    if (!el.stageCanvas) return;
    var metrics = stageMetrics();
    sizeCanvas(el.stageCanvas, metrics.w, metrics.h);
    var ctx = el.stageCanvas.getContext('2d');
    var w = el.stageCanvas.width;
    var h = el.stageCanvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#3b444c';
    ctx.fillRect(0, 0, w, h);

    if (state.image) {
      try {
        PS.drawFrame(ctx, state.image, w, h, state.tf);
      } catch (error) {
        ctx.fillStyle = '#3b444c';
        ctx.fillRect(0, 0, w, h);
      }
    }

    if (state.guides) drawGuides(ctx, w, h, currentPreset());
  }

  function drawGuides(ctx, w, h, preset) {
    var perMm = h / preset.h;
    var bands = PS.guides(preset);
    var list = [
      { band: bands.crown, label: t('guideCrown'), tone: 'rgba(108, 199, 212, 0.30)' },
      { band: bands.eyes, label: t('guideEyes'), tone: 'rgba(255, 214, 138, 0.30)' },
      { band: bands.chin, label: t('guideChin'), tone: 'rgba(108, 199, 212, 0.30)' }
    ];

    ctx.save();
    list.forEach(function (item) {
      var y1 = item.band[0] * perMm;
      var y2 = item.band[1] * perMm;
      ctx.fillStyle = item.tone;
      ctx.fillRect(0, y1, w, y2 - y1);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
      ctx.lineWidth = Math.max(1, DPR);
      ctx.setLineDash([6 * DPR, 5 * DPR]);
      ctx.beginPath();
      ctx.moveTo(0, y1);
      ctx.lineTo(w, y1);
      ctx.moveTo(0, y2);
      ctx.lineTo(w, y2);
      ctx.stroke();
      ctx.setLineDash([]);

      var label = item.label + ' ' + item.band[0] + '-' + item.band[1];
      ctx.font = '600 ' + Math.round(10.5 * DPR) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      var textWidth = ctx.measureText(label).width;
      var padX = 5 * DPR;
      var boxW = textWidth + padX * 2;
      var boxH = 17 * DPR;
      var bx = w - boxW - 6 * DPR;
      var by = Math.min(Math.max((y1 + y2) / 2 - boxH / 2, 2 * DPR), h - boxH - 2 * DPR);
      ctx.fillStyle = 'rgba(12, 20, 26, 0.72)';
      roundRect(ctx, bx, by, boxW, boxH, 5 * DPR);
      ctx.fill();
      ctx.fillStyle = '#f3f7f8';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, bx + padX, by + boxH / 2 + 0.5 * DPR);
    });

    /* centre line */
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.28)';
    ctx.lineWidth = Math.max(1, DPR);
    ctx.setLineDash([4 * DPR, 6 * DPR]);
    ctx.beginPath();
    ctx.moveTo(w / 2, 0);
    ctx.lineTo(w / 2, h);
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ------------------------------------------------------------------ sheet */

  function sheetMetrics() {
    var box = el.sheetStage ? el.sheetStage.clientWidth - 32 : 360;
    var availW = Math.max(220, Math.min(box, 460));
    var sheet = currentSheet();
    var width = availW;
    var height = width * sheet.h / sheet.w;
    /* keep the whole sheet on screen next to the crop */
    var maxH = Math.max(240, Math.round(window.innerHeight * 0.42));
    if (height > maxH) {
      height = maxH;
      width = height * sheet.w / sheet.h;
    }
    return { w: Math.round(width), h: Math.round(height) };
  }

  function drawSheet() {
    if (!el.sheetCanvas) return;
    var metrics = sheetMetrics();
    sizeCanvas(el.sheetCanvas, metrics.w, metrics.h);
    var ctx = el.sheetCanvas.getContext('2d');
    var sheet = currentSheet();
    var pxPerMm = el.sheetCanvas.width / sheet.w;
    drawSheetContent(ctx, pxPerMm, el.sheetCanvas.width, el.sheetCanvas.height, false);
  }

  function drawSheetContent(ctx, pxPerMm, widthPx, heightPx, forExport) {
    var sheet = currentSheet();
    var preset = currentPreset();
    var layout = PS.layout(preset, sheet, 4, 3);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthPx, heightPx);

    layout.cells.forEach(function (cell) {
      var x = cell.x * pxPerMm;
      var y = cell.y * pxPerMm;
      var w = cell.w * pxPerMm;
      var h = cell.h * pxPerMm;

      ctx.save();
      /* Each cell is its own window: a zoomed crop must never bleed into the
       * paper between the photos. */
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.translate(x, y);
      if (state.image) {
        PS.drawFrame(ctx, state.image, w, h, state.tf);
      } else {
        ctx.fillStyle = '#f4f5f6';
        ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#c9ced3';
        ctx.lineWidth = Math.max(1, pxPerMm * 0.25);
        ctx.setLineDash([pxPerMm * 1.4, pxPerMm * 1.2]);
        ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, w - ctx.lineWidth, h - ctx.lineWidth);
        ctx.setLineDash([]);
        if (!forExport || !state.image) {
          ctx.fillStyle = '#9aa2a9';
          ctx.font = '600 ' + Math.round(Math.max(8, Math.min(w, h) * 0.075)) + 'px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(t('emptyCell'), w / 2, h / 2);
        }
      }
      ctx.restore();
    });

    if (state.cutMarks) {
      ctx.strokeStyle = '#aab2b9';
      ctx.lineWidth = Math.max(0.6, pxPerMm * 0.22);
      ctx.lineCap = 'square';
      var tick = Math.min(2.4, Math.max(1.2, layout.gap * 0.6));
      var gapOut = Math.min(1.1, layout.gap * 0.35);
      layout.cells.forEach(function (cell) {
        var left = cell.x * pxPerMm;
        var top = cell.y * pxPerMm;
        var right = (cell.x + cell.w) * pxPerMm;
        var bottom = (cell.y + cell.h) * pxPerMm;
        var out = gapOut * pxPerMm;
        var len = tick * pxPerMm;
        [[left, top, -1, -1], [right, top, 1, -1], [left, bottom, -1, 1], [right, bottom, 1, 1]].forEach(function (corner) {
          var cx = corner[0];
          var cy = corner[1];
          var sx = corner[2];
          var sy = corner[3];
          ctx.beginPath();
          ctx.moveTo(cx + sx * out, cy);
          ctx.lineTo(cx + sx * (out + len), cy);
          ctx.moveTo(cx, cy + sy * out);
          ctx.lineTo(cx, cy + sy * (out + len));
          ctx.stroke();
        });
      });
    }

    ctx.restore();
  }

  function exportSheetCanvas() {
    var sheet = currentSheet();
    var canvas = document.createElement('canvas');
    canvas.width = PS.mmToPx(sheet.w);
    canvas.height = PS.mmToPx(sheet.h);
    var ctx = canvas.getContext('2d');
    var pxPerMm = canvas.width / sheet.w;
    drawSheetContent(ctx, pxPerMm, canvas.width, canvas.height, true);
    return canvas;
  }

  function exportPhotoCanvas() {
    var preset = currentPreset();
    var canvas = document.createElement('canvas');
    canvas.width = PS.mmToPx(preset.w);
    canvas.height = PS.mmToPx(preset.h);
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    ctx.rect(0, 0, canvas.width, canvas.height);
    ctx.clip();
    PS.drawFrame(ctx, state.image, canvas.width, canvas.height, state.tf);
    return canvas;
  }

  /* ---------------------------------------------------------------- quality */

  function scheduleQuality() {
    clearTimeout(state.qualityTimer);
    state.qualityTimer = setTimeout(analyze, 180);
  }

  function analyze() {
    if (!state.image) {
      setChip(el.chipResolution, 'good', 'resGood', 'resTipGood');
      setChip(el.chipBackground, 'good', 'bgGood', 'bgTipGood');
      setChip(el.chipSharpness, 'good', 'sharpGood', 'sharpTipGood');
      return;
    }
    var preset = currentPreset();
    var outW = PS.mmToPx(preset.w);
    var outH = PS.mmToPx(preset.h);
    var res = PS.resolution(state.image.width, state.image.height, outW, outH, state.tf.zoom, state.tf.rot);
    var key = res.state === 'good' ? 'resGood' : res.state === 'warn' ? 'resWarn' : 'resBad';
    var tip = res.state === 'good' ? 'resTipGood' : res.state === 'warn' ? 'resTipWarn' : 'resTipBad';
    setChip(el.chipResolution, res.state, key, tip);

    var width = 160;
    var height = Math.max(40, Math.round(width * outH / outW));
    var canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    var ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    try {
      PS.drawFrame(ctx, state.image, width, height, state.tf);
    } catch (error) {
      return;
    }
    var data;
    try {
      data = ctx.getImageData(0, 0, width, height).data;
    } catch (error) {
      return;
    }

    /* Background is judged above and beside the head only. Shoulders and
     * clothing near the bottom are normal in every accepted photo, so a full
     * ring would call good photos busy. */
    /* Background is judged in the top two corners only. Every accepted
     * portrait has shoulders in the bottom corners and hair in the middle, so
     * measuring those would call a good photo busy. The top corners are wall
     * until the face is framed far too tight, which is itself worth a warning. */
    var cornerW = Math.round(width * 0.24);
    var cornerH = Math.round(height * 0.20);
    var corners = [[], []];
    var gray = new Float64Array(width * height);
    for (var y = 0; y < height; y++) {
      for (var x = 0; x < width; x++) {
        var i = (y * width + x) * 4;
        gray[y * width + x] = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        if (y >= cornerH || (x + y) % 2) continue;
        if (x < cornerW) corners[0].push([data[i], data[i + 1], data[i + 2]]);
        else if (x >= width - cornerW) corners[1].push([data[i], data[i + 1], data[i + 2]]);
      }
    }
    var bg = PS.background(corners);
    var bgState = bg.state;
    var bgKey = bg.state === 'good' ? 'bgGood' : bg.state === 'warn' ? 'bgWarn' : 'bgBad';
    if (bgState === 'good' && !bg.light) {
      bgState = 'warn';
      bgKey = 'bgDark';
    }
    setChip(el.chipBackground, bgState, bgKey, bgState === 'good' ? 'bgTipGood' : 'bgTipBad');

    var sharp = PS.sharpness(Array.prototype.slice.call(gray), width, height);
    var sharpKey = sharp.state === 'good' ? 'sharpGood' : sharp.state === 'warn' ? 'sharpWarn' : 'sharpBad';
    setChip(el.chipSharpness, sharp.state, sharpKey, sharp.state === 'good' ? 'sharpTipGood' : 'sharpTipBad');
  }

  function setChip(node, chipState, textKey, tipKey) {
    if (!node) return;
    node.setAttribute('data-state', chipState);
    var label = node.querySelector('.chip-text');
    if (label) label.textContent = t(textKey);
    node.setAttribute('title', t(tipKey));
  }

  function updateQualityText() {
    analyze();
  }

  /* ---------------------------------------------------------------- history */

  function pushHistory() {
    if (!state.image) return;
    state.history.push(clone(state.tf));
    if (state.history.length > 40) state.history.shift();
    updateUndo();
  }

  function undo() {
    if (!state.history.length) {
      toast(t('nothingToUndo'));
      return;
    }
    state.tf = state.history.pop();
    updateUndo();
    drawStage();
    drawSheet();
    scheduleQuality();
    toast(t('toastUndo'));
  }

  function updateUndo() {
    if (el.undoBtn) el.undoBtn.disabled = state.history.length === 0;
  }

  /* ------------------------------------------------------------- file input */

  function loadFile(file) {
    if (!file) return;
    if (file.type && file.type.indexOf('image/') !== 0) {
      toast(t('errType'));
      return;
    }
    if (file.size > MAX_BYTES) {
      toast(t('errSize'));
      return;
    }
    var url = URL.createObjectURL(file);
    var img = new Image();
    img.onload = function () {
      URL.revokeObjectURL(url);
      if (!img.width || !img.height) {
        toast(t('errLoad'));
        return;
      }
      state.image = img;
      state.imageName = file.name || 'photo';
      state.tf = PS.defaultTransform();
      state.history = [];
      state.drag = null;
      showStage(true);
      updateUndo();
      refreshAll();
      toast(t('toastReady'));
    };
    img.onerror = function () {
      URL.revokeObjectURL(url);
      toast(t('errLoad'));
    };
    img.src = url;
  }

  function showStage(on) {
    if (el.dropZone) el.dropZone.classList.toggle('is-hidden', on);
    if (el.stageBlock) el.stageBlock.hidden = !on;
    [el.printBtn, el.sheetBtn, el.photoBtn].forEach(function (node) {
      if (node) node.disabled = !on;
    });
  }

  function removePhoto() {
    state.image = null;
    state.imageName = '';
    state.tf = PS.defaultTransform();
    state.history = [];
    state.drag = null;
    showStage(false);
    updateUndo();
    drawSheet();
    analyze();
    toast(t('toastRemoved'));
  }

  function refreshAll() {
    drawStage();
    drawSheet();
    updateCount();
    updateSizeText();
    scheduleQuality();
    if (el.zoomRange) el.zoomRange.value = state.tf.zoom;
    if (el.zoomValue) el.zoomValue.textContent = Math.round(state.tf.zoom * 100) + '%';
  }

  /* ------------------------------------------------------------------ drag */

  function bindStage() {
    var canvas = el.stageCanvas;
    if (!canvas) return;

    canvas.addEventListener('pointerdown', function (event) {
      if (!state.image) return;
      pushHistory();
      state.drag = {
        x: event.clientX,
        y: event.clientY,
        ox: state.tf.ox,
        oy: state.tf.oy
      };
      if (canvas.setPointerCapture) {
        try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* ignore */ }
      }
      event.preventDefault();
    });

    canvas.addEventListener('pointermove', function (event) {
      if (!state.drag || !state.image) return;
      var rect = canvas.getBoundingClientRect();
      var dx = (event.clientX - state.drag.x) / Math.max(1, rect.width);
      var dy = (event.clientY - state.drag.y) / Math.max(1, rect.height);
      state.tf.ox = state.drag.ox + dx;
      state.tf.oy = state.drag.oy + dy;
      state.tf = PS.sanitizeTransform(state.tf, state.image.width, state.image.height, canvas.width, canvas.height);
      drawStage();
      drawSheet();
      scheduleQuality();
    });

    function endDrag() { state.drag = null; }
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('lostpointercapture', endDrag);

    canvas.addEventListener('wheel', function (event) {
      if (!state.image) return;
      event.preventDefault();
      pushHistory();
      var step = event.deltaY > 0 ? -0.05 : 0.05;
      setZoom(state.tf.zoom + step);
    }, { passive: false });

    canvas.addEventListener('keydown', function (event) {
      if (!state.image) return;
      var step = event.shiftKey ? 0.04 : 0.008;
      var moved = true;
      if (event.key === 'ArrowLeft') state.tf.ox -= step;
      else if (event.key === 'ArrowRight') state.tf.ox += step;
      else if (event.key === 'ArrowUp') state.tf.oy -= step;
      else if (event.key === 'ArrowDown') state.tf.oy += step;
      else if (event.key === '+' || event.key === '=') { pushHistory(); setZoom(state.tf.zoom + 0.08); return; }
      else if (event.key === '-') { pushHistory(); setZoom(state.tf.zoom - 0.08); return; }
      else moved = false;
      if (!moved) return;
      event.preventDefault();
      pushHistory();
      state.tf = PS.sanitizeTransform(state.tf, state.image.width, state.image.height, el.stageCanvas.width, el.stageCanvas.height);
      drawStage();
      drawSheet();
      scheduleQuality();
    });
  }

  function setZoom(value) {
    if (!state.image) return;
    state.tf.zoom = PS.clampZoom(value);
    state.tf = PS.sanitizeTransform(state.tf, state.image.width, state.image.height, el.stageCanvas.width, el.stageCanvas.height);
    if (el.zoomRange) el.zoomRange.value = state.tf.zoom;
    if (el.zoomValue) el.zoomValue.textContent = Math.round(state.tf.zoom * 100) + '%';
    drawStage();
    drawSheet();
    scheduleQuality();
  }

  /* --------------------------------------------------------------- exports */

  function download(blob, name) {
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function withDpi(canvas, callback) {
    canvas.toBlob(function (blob) {
      if (!blob) return;
      if (blob.arrayBuffer) {
        blob.arrayBuffer().then(function (buffer) {
          var bytes = PS.pngWithDpi(new Uint8Array(buffer), PS.DPI);
          callback(new Blob([bytes], { type: 'image/png' }));
        }).catch(function () { callback(blob); });
      } else {
        callback(blob);
      }
    }, 'image/png');
  }

  function downloadSheet() {
    if (!state.image) return;
    var sheet = currentSheet();
    var canvas = exportSheetCanvas();
    withDpi(canvas, function (blob) {
      download(blob, 'photo-sheet-' + sheet.w + 'x' + sheet.h + 'cm-300dpi.png');
      toast(t('toastSheet'));
    });
  }

  function downloadPhoto() {
    if (!state.image) return;
    var preset = currentPreset();
    var canvas = exportPhotoCanvas();
    withDpi(canvas, function (blob) {
      download(blob, 'photo-' + preset.w + 'x' + preset.h + 'mm-300dpi.png');
      toast(t('toastPhoto'));
    });
  }

  function preparePrint() {
    if (!state.image) return false;
    var sheet = currentSheet();
    var canvas = exportSheetCanvas();
    el.printImage.src = canvas.toDataURL('image/png');
    el.printImage.style.width = sheet.w + 'mm';
    el.printImage.style.height = sheet.h + 'mm';
    if (el.pageStyle) {
      el.pageStyle.textContent = '@page { size: ' + sheet.w + 'mm ' + sheet.h + 'mm; margin: 0; }';
    }
    return true;
  }

  function print() {
    if (!state.image) return;
    preparePrint();
    toast(t('toastPrint'));
    var go = function () { window.print(); };
    if (el.printImage.decode) {
      el.printImage.decode().then(go).catch(go);
    } else if (el.printImage.complete) {
      setTimeout(go, 60);
    } else {
      el.printImage.onload = go;
    }
  }

  /* ------------------------------------------------------------------ bind */

  function bind() {
    bindStage();

    if (el.pickBtn) el.pickBtn.addEventListener('click', function () { el.fileInput.click(); });
    if (el.replaceBtn) el.replaceBtn.addEventListener('click', function () { el.fileInput.click(); });
    if (el.fileInput) el.fileInput.addEventListener('change', function (event) {
      var file = event.target.files && event.target.files[0];
      loadFile(file);
      event.target.value = '';
    });

    ['dragenter', 'dragover'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (!event.dataTransfer) return;
        event.preventDefault();
        if (el.dropZone && !state.image) el.dropZone.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach(function (name) {
      document.addEventListener(name, function (event) {
        if (!event.dataTransfer) return;
        event.preventDefault();
        if (el.dropZone) el.dropZone.classList.remove('dragover');
      });
    });
    document.addEventListener('drop', function (event) {
      if (!event.dataTransfer) return;
      var file = event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) loadFile(file);
    });

    if (el.removeBtn) el.removeBtn.addEventListener('click', removePhoto);

    if (el.rotateBtn) el.rotateBtn.addEventListener('click', function () {
      if (!state.image) return;
      pushHistory();
      state.tf.rot = PS.normalizeRot(state.tf.rot + 90);
      state.tf = PS.sanitizeTransform(state.tf, state.image.width, state.image.height, el.stageCanvas.width, el.stageCanvas.height);
      refreshAll();
    });

    if (el.flipBtn) el.flipBtn.addEventListener('click', function () {
      if (!state.image) return;
      pushHistory();
      state.tf.flip = !state.tf.flip;
      refreshAll();
    });

    if (el.resetBtn) el.resetBtn.addEventListener('click', function () {
      if (!state.image) return;
      pushHistory();
      state.tf = PS.defaultTransform();
      refreshAll();
    });

    if (el.zoomRange) {
      el.zoomRange.min = PS.MIN_ZOOM;
      el.zoomRange.max = PS.MAX_ZOOM;
      el.zoomRange.addEventListener('pointerdown', pushHistory);
      el.zoomRange.addEventListener('keydown', pushHistory);
      el.zoomRange.addEventListener('input', function () { setZoom(Number(el.zoomRange.value)); });
    }
    if (el.zoomOutBtn) el.zoomOutBtn.addEventListener('click', function () { pushHistory(); setZoom(state.tf.zoom - 0.1); });
    if (el.zoomInBtn) el.zoomInBtn.addEventListener('click', function () { pushHistory(); setZoom(state.tf.zoom + 0.1); });

    if (el.guidesToggle) el.guidesToggle.addEventListener('change', function () {
      state.guides = el.guidesToggle.checked;
      save();
      drawStage();
    });

    if (el.cutMarksToggle) el.cutMarksToggle.addEventListener('change', function () {
      state.cutMarks = el.cutMarksToggle.checked;
      save();
      drawSheet();
    });

    if (el.presetSelect) el.presetSelect.addEventListener('change', function () {
      state.preset = el.presetSelect.value;
      if (state.preset === 'custom') {
        state.customW = Number(el.customW.value) || 35;
        state.customH = Number(el.customH.value) || 45;
      }
      save();
      buildSelects();
      updatePresetNote();
      updateCount();
      updateSizeText();
      drawStage();
      drawSheet();
      scheduleQuality();
    });

    ['customW', 'customH'].forEach(function (id) {
      var node = el[id];
      if (!node) return;
      node.addEventListener('input', function () {
        state.customW = PS.clamp(Number(el.customW.value) || 35, 15, 150);
        state.customH = PS.clamp(Number(el.customH.value) || 45, 15, 150);
        state.preset = 'custom';
        save();
        updateCount();
        updateSizeText();
        drawStage();
        drawSheet();
        scheduleQuality();
      });
    });

    if (el.sheetSelect) el.sheetSelect.addEventListener('change', function () {
      state.sheet = el.sheetSelect.value;
      save();
      updateCount();
      updateSizeText();
      drawSheet();
    });

    if (el.sheetBtn) el.sheetBtn.addEventListener('click', downloadSheet);
    if (el.photoBtn) el.photoBtn.addEventListener('click', downloadPhoto);
    if (el.printBtn) el.printBtn.addEventListener('click', print);

    if (el.undoBtn) el.undoBtn.addEventListener('click', undo);

    if (el.themeBtn) el.themeBtn.addEventListener('click', function () {
      setTheme(state.theme === 'dark' ? 'light' : 'dark');
    });

    if (el.langSelect) el.langSelect.addEventListener('change', function () {
      setLanguage(el.langSelect.value);
    });

    document.addEventListener('keydown', function (event) {
      var mod = event.ctrlKey || event.metaKey;
      if (mod && (event.key === 'z' || event.key === 'Z') && !event.shiftKey && !event.target.matches('input, select, textarea')) {
        event.preventDefault();
        undo();
      }
    });

    window.addEventListener('beforeprint', preparePrint);

    window.addEventListener('resize', function () {
      clearTimeout(state.resizeTimer);
      state.resizeTimer = setTimeout(function () {
        drawStage();
        drawSheet();
      }, 140);
    });
  }

  /* ------------------------------------------------------------------- init */

  function registerWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(window.location.protocol)) return;
    try {
      navigator.serviceWorker.register('sw.js').catch(function () { /* offline is optional */ });
    } catch (error) { /* older browsers */ }
  }

  function init() {
    [
      'dropZone', 'stageBlock', 'stage', 'stageCanvas', 'fileInput', 'pickBtn', 'replaceBtn', 'removeBtn',
      'rotateBtn', 'flipBtn', 'resetBtn', 'zoomRange', 'zoomOutBtn', 'zoomInBtn', 'zoomValue',
      'chipResolution', 'chipBackground', 'chipSharpness', 'presetSelect', 'presetNote', 'customField',
      'customW', 'customH', 'sheetSelect', 'sheetCanvas', 'sheetStage', 'countText', 'guidesToggle',
      'cutMarksToggle', 'printBtn', 'sheetBtn', 'photoBtn', 'sizeText', 'printImage', 'toast',
      'undoBtn', 'themeBtn', 'langSelect', 'versionText'
    ].forEach(function (id) { el[id] = $(id); });
    el.pageStyle = $('pageStyle');

    loadSettings();
    document.documentElement.classList.toggle('theme-dark', state.theme === 'dark');
    buildSelects();
    applyLanguage();
    bind();
    showStage(false);
    updateUndo();

    if (el.versionText) {
      var version = document.documentElement.getAttribute('data-version') || '1';
      el.versionText.textContent = t('versionText', { version: version });
    }

    drawSheet();
    updateCount();
    updateSizeText();
    registerWorker();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
}());
