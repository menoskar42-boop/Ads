/* OncoScan browser DICOM viewer — dependency-free.
   Parses uncompressed monochrome CT/MRI (Implicit/Explicit VR Little Endian),
   applies rescale slope/intercept + windowing, and renders to a canvas. All
   pixel work happens in the browser so the server stays light.
   Compressed transfer syntaxes (JPEG/JPEG2000) are detected and reported as
   unsupported rather than mis-rendered. */
(function () {
  'use strict';

  var COMPRESSED = { // transfer syntaxes we cannot decode without a codec
    '1.2.840.10008.1.2.4.50': 1, '1.2.840.10008.1.2.4.51': 1, '1.2.840.10008.1.2.4.57': 1,
    '1.2.840.10008.1.2.4.70': 1, '1.2.840.10008.1.2.4.80': 1, '1.2.840.10008.1.2.4.81': 1,
    '1.2.840.10008.1.2.4.90': 1, '1.2.840.10008.1.2.4.91': 1, '1.2.840.10008.1.2.5': 1
  };

  function readStr(view, off, len) {
    var s = '';
    for (var i = 0; i < len; i++) { var c = view.getUint8(off + i); if (c) s += String.fromCharCode(c); }
    return s.replace(/\0+$/, '').trim();
  }

  // Parse enough of a DICOM file to render one uncompressed monochrome frame.
  function parseDicom(buffer) {
    var view = new DataView(buffer);
    if (buffer.byteLength < 132 || readStr(view, 128, 4) !== 'DICM') {
      return { error: 'مش ملف DICOM صالح.' };
    }
    var pos = 132;
    // --- File Meta group (always Explicit VR Little Endian) → find transfer syntax
    var transferSyntax = '1.2.840.10008.1.2.1';
    while (pos + 8 <= buffer.byteLength) {
      var group = view.getUint16(pos, true), elem = view.getUint16(pos + 2, true);
      if (group !== 0x0002) break; // end of meta group
      var vr = readStr(view, pos + 4, 2), len, hdr;
      if (['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].indexOf(vr) >= 0) { len = view.getUint32(pos + 8, true); hdr = 12; }
      else { len = view.getUint16(pos + 6, true); hdr = 8; }
      if (group === 0x0002 && elem === 0x0010) transferSyntax = readStr(view, pos + hdr, len);
      pos += hdr + len;
    }
    if (COMPRESSED[transferSyntax]) return { error: 'الصورة مضغوطة (JPEG/JPEG2000) — العارض الحالي بيدعم غير المضغوط بس.' };
    var implicit = (transferSyntax === '1.2.840.10008.1.2');
    var little = (transferSyntax !== '1.2.840.10008.1.2.2');

    var d = { rows: 0, cols: 0, bits: 16, signed: 0, slope: 1, intercept: 0, wc: null, ww: null, mono1: false, pixelOff: 0, pixelLen: 0, little: little };
    // --- Dataset
    while (pos + 8 <= buffer.byteLength) {
      var g = view.getUint16(pos, little), e = view.getUint16(pos + 2, little), L, h, VR = '';
      if (implicit) { L = view.getUint32(pos + 4, little); h = 8; }
      else {
        VR = readStr(view, pos + 4, 2);
        if (['OB', 'OW', 'OF', 'SQ', 'UT', 'UN'].indexOf(VR) >= 0) { L = view.getUint32(pos + 8, little); h = 12; }
        else { L = view.getUint16(pos + 6, little); h = 8; }
      }
      var val = pos + h;
      if (g === 0x0028) {
        if (e === 0x0010) d.rows = view.getUint16(val, little);
        else if (e === 0x0011) d.cols = view.getUint16(val, little);
        else if (e === 0x0100) d.bits = view.getUint16(val, little);
        else if (e === 0x0103) d.signed = view.getUint16(val, little);
        else if (e === 0x0004) d.mono1 = /MONOCHROME1/.test(readStr(view, val, L));
        else if (e === 0x1052) d.intercept = parseFloat(readStr(view, val, L)) || 0;
        else if (e === 0x1053) d.slope = parseFloat(readStr(view, val, L)) || 1;
        else if (e === 0x1050) d.wc = parseFloat((readStr(view, val, L).split('\\')[0])) || d.wc;
        else if (e === 0x1051) d.ww = parseFloat((readStr(view, val, L).split('\\')[0])) || d.ww;
      } else if (g === 0x7fe0 && e === 0x0010) { d.pixelOff = val; d.pixelLen = (L === 0xffffffff ? buffer.byteLength - val : L); break; }
      if (L === 0xffffffff) break; // undefined length (shouldn't happen for the tags we read)
      pos = val + L;
    }
    if (!d.rows || !d.cols || !d.pixelOff) return { error: 'تعذّر قراءة بيانات الصورة.' };
    d.buffer = buffer;
    // Sensible default window if none in the header (auto from data at render time).
    return d;
  }

  // Turn raw pixels into HU/intensity Int32Array (applies slope/intercept).
  function toValues(d) {
    var view = new DataView(d.buffer, d.pixelOff, d.pixelLen);
    var n = d.rows * d.cols, out = new Float32Array(n), i, raw;
    if (d.bits <= 8) {
      for (i = 0; i < n; i++) { raw = d.signed ? view.getInt8(i) : view.getUint8(i); out[i] = raw * d.slope + d.intercept; }
    } else {
      for (i = 0; i < n; i++) { raw = d.signed ? view.getInt16(i * 2, d.little) : view.getUint16(i * 2, d.little); out[i] = raw * d.slope + d.intercept; }
    }
    return out;
  }

  function autoWindow(values) {
    var mn = Infinity, mx = -Infinity;
    for (var i = 0; i < values.length; i += 7) { var v = values[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    return { wc: (mn + mx) / 2, ww: Math.max(1, mx - mn) };
  }

  function render(canvas, d, values, wc, ww) {
    var n = d.rows * d.cols, img = new Uint8ClampedArray(n * 4);
    var lo = wc - 0.5 - (ww - 1) / 2, scale = 255 / (ww - 1);
    for (var i = 0; i < n; i++) {
      var g = (values[i] - lo) * scale;
      g = g < 0 ? 0 : (g > 255 ? 255 : g);
      if (d.mono1) g = 255 - g;
      var o = i * 4; img[o] = img[o + 1] = img[o + 2] = g; img[o + 3] = 255;
    }
    canvas.width = d.cols; canvas.height = d.rows;
    canvas.getContext('2d').putImageData(new ImageData(img, d.cols, d.rows), 0, 0);
  }

  // Presets (center/width) — HU-based for CT; MRI uses auto.
  var PRESETS = {
    'تلقائي': null,
    'مخ': [40, 80], 'رئة': [-600, 1500], 'عظم': [400, 1800],
    'بطن': [40, 350], 'أنسجة رخوة': [50, 400], 'كبد': [60, 160]
  };

  window.OncoViewer = function (opts) {
    var studyId = opts.studyId, count = opts.count, root = opts.root;
    var idx = 0, cache = {}, cur = null, curValues = null, wc = 0, ww = 1, zoom = 1;

    var canvas = root.querySelector('[data-canvas]');
    var slider = root.querySelector('[data-slider]');
    var label = root.querySelector('[data-label]');
    var wlLabel = root.querySelector('[data-wl]');
    var msg = root.querySelector('[data-msg]');
    slider.max = count - 1;

    function draw() { if (cur && curValues) render(canvas, cur, curValues, wc, ww); wlLabel.textContent = 'W ' + Math.round(ww) + ' / L ' + Math.round(wc); canvas.style.transform = 'scale(' + zoom + ')'; }

    function loadSlice(i) {
      label.textContent = (i + 1) + ' / ' + count;
      if (cache[i]) { apply(cache[i]); return; }
      msg.textContent = 'جاري تحميل الشريحة…'; msg.style.display = '';
      fetch('/radiology/study/' + studyId + '/slice/' + i).then(function (r) { return r.arrayBuffer(); }).then(function (buf) {
        var d = parseDicom(buf);
        cache[i] = d; apply(d);
      }).catch(function () { msg.textContent = 'تعذّر تحميل الشريحة.'; });
    }
    function apply(d) {
      if (d.error) { msg.textContent = d.error; msg.style.display = ''; cur = null; return; }
      msg.style.display = 'none';
      cur = d; curValues = toValues(d);
      if (wc === 0 && ww === 1) { // first slice → set window from header or auto
        if (d.wc != null && d.ww != null) { wc = d.wc; ww = d.ww; }
        else { var a = autoWindow(curValues); wc = a.wc; ww = a.ww; }
      }
      draw();
    }

    slider.addEventListener('input', function () { idx = +slider.value; loadSlice(idx); });
    root.querySelector('[data-prev]').addEventListener('click', function () { if (idx > 0) { idx--; slider.value = idx; loadSlice(idx); } });
    root.querySelector('[data-next]').addEventListener('click', function () { if (idx < count - 1) { idx++; slider.value = idx; loadSlice(idx); } });
    root.querySelector('[data-zin]').addEventListener('click', function () { zoom = Math.min(5, zoom + 0.25); draw(); });
    root.querySelector('[data-zout]').addEventListener('click', function () { zoom = Math.max(1, zoom - 0.25); draw(); });

    // Windowing presets
    var presetWrap = root.querySelector('[data-presets]');
    Object.keys(PRESETS).forEach(function (name) {
      var b = document.createElement('button');
      b.textContent = name; b.className = 'rad-preset';
      b.onclick = function () { var p = PRESETS[name]; if (p) { wc = p[0]; ww = p[1]; } else if (curValues) { var a = autoWindow(curValues); wc = a.wc; ww = a.ww; } draw(); };
      presetWrap.appendChild(b);
    });

    // Drag to adjust W/L (like a real viewer): x=width, y=center.
    var dragging = false, sx = 0, sy = 0, sw = 0, sc = 0;
    canvas.addEventListener('mousedown', function (e) { dragging = true; sx = e.clientX; sy = e.clientY; sw = ww; sc = wc; });
    window.addEventListener('mouseup', function () { dragging = false; });
    window.addEventListener('mousemove', function (e) { if (!dragging) return; ww = Math.max(1, sw + (e.clientX - sx) * 2); wc = sc + (e.clientY - sy) * 2; draw(); });

    loadSlice(0);
  };
})();
