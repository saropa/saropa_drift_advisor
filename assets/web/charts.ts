    /**
     * Chart rendering functions extracted from app.js.
     * All shared state accessed via the S (state) namespace.
     */
    import * as S from './state.ts';
    import { esc } from './utils.ts';

    export function getChartSize() {
      var wrap = document.getElementById('chart-wrapper');
      if (!wrap) return { w: 600, h: 320 };
      var w = wrap.clientWidth || 600;
      var h = Math.max(320, wrap.clientHeight || 320);
      return { w: w, h: h };
    }

    /** Shows chart container, sets optional title/description, and shows export toolbar. Call after rendering SVG into #chart-svg-wrap. */
    export function applyChartUI(title, description) {
      var container = document.getElementById('chart-container');
      if (!container) return;
      var titleEl = document.getElementById('chart-title');
      var descEl = document.getElementById('chart-description');
      var exportBar = document.getElementById('chart-export-toolbar');
      container.style.display = 'block';
      if (titleEl) {
        if (title && title.trim()) {
          titleEl.textContent = title.trim();
          titleEl.style.display = 'block';
        } else {
          titleEl.style.display = 'none';
        }
      }
      if (descEl) {
        if (description && description.trim()) {
          descEl.textContent = description.trim();
          descEl.style.display = 'block';
        } else {
          descEl.style.display = 'none';
        }
      }
      if (exportBar) exportBar.style.display = 'flex';
    }

    export function renderBarChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var barW = Math.max(4, (W - PAD * 2) / data.length - 2);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      data.forEach(function(d, i) {
        var val = Number(d[yKey]) || 0;
        var bh = (val / maxVal) * plotH;
        var x = PAD + i * (barW + 2);
        var by = H - PAD - bh;
        svg += '<rect class="chart-bar" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '">';
        svg += '<title>' + esc(String(d[xKey])) + ': ' + val + '</title></rect>';
        if (data.length <= 20) {
          svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + ',' + (H - PAD + 16) + ')">' + esc(String(d[xKey]).slice(0, 12)) + '</text>';
        }
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Stacked bar: group by xKey, stack segment heights per group. */
    export function renderStackedBarChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var groups = {};
      data.forEach(function(d) {
        var k = String(d[xKey]);
        if (!groups[k]) groups[k] = [];
        groups[k].push(Number(d[yKey]) || 0);
      });
      var labels = Object.keys(groups);
      var sums = labels.map(function(k) {
        return groups[k].reduce(function(a, b) { return a + b; }, 0);
      });
      var maxVal = Math.max.apply(null, sums.concat([1]));
      var barW = Math.max(8, (W - PAD * 2) / labels.length - 4);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (maxVal / 4 * i).toFixed(maxVal > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      labels.forEach(function(label, gi) {
        var segs = groups[label];
        var x = PAD + gi * (barW + 4) + 2;
        var accY = H - PAD;
        segs.forEach(function(val, si) {
          var bh = (val / maxVal) * plotH;
          var by = accY - bh;
          var color = S.CHART_COLORS[si % S.CHART_COLORS.length];
          svg += '<rect class="chart-bar chart-stacked-segment" x="' + x + '" y="' + by + '" width="' + barW + '" height="' + bh + '" fill="' + color + '">';
          svg += '<title>' + esc(label) + ' segment ' + (si + 1) + ': ' + val + '</title></rect>';
          accY = by;
        });
        if (labels.length <= 20) {
          svg += '<text class="chart-label" x="' + (x + barW / 2) + '" y="' + (H - PAD + 16) + '" text-anchor="middle" transform="rotate(-45,' + (x + barW / 2) + ',' + (H - PAD + 16) + ')">' + esc(String(label).slice(0, 10)) + '</text>';
        }
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    export function renderPieChart(container, data, labelKey, valueKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, R = Math.min(130, (Math.min(W, H) / 2) - 60), CX = Math.min(200, W / 2 - 40), CY = H / 2;
      var vals = data.map(function(d) { return Math.max(0, Number(d[valueKey]) || 0); });
      var total = vals.reduce(function(a, b) { return a + b; }, 0) || 1;
      var threshold = total * 0.02;
      var significant = [];
      var otherVal = 0;
      data.forEach(function(d, i) {
        if (vals[i] >= threshold) significant.push({ label: d[labelKey], value: vals[i] });
        else otherVal += vals[i];
      });
      if (otherVal > 0) significant.push({ label: 'Other', value: otherVal });
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      var angle = 0;
      significant.forEach(function(d, i) {
        var sweep = (d.value / total) * 2 * Math.PI;
        var color = S.CHART_COLORS[i % S.CHART_COLORS.length];
        var pct = (d.value / total * 100).toFixed(1);
        var tip = '<title>' + esc(String(d.label)) + ': ' + d.value + ' (' + pct + '%)</title>';
        if (sweep >= 2 * Math.PI - 0.001) {
          svg += '<circle class="chart-slice" cx="' + CX + '" cy="' + CY + '" r="' + R + '" fill="' + color + '">' + tip + '</circle>';
        } else {
          var x1 = CX + R * Math.cos(angle);
          var y1 = CY + R * Math.sin(angle);
          var x2 = CX + R * Math.cos(angle + sweep);
          var y2 = CY + R * Math.sin(angle + sweep);
          var large = sweep > Math.PI ? 1 : 0;
          svg += '<path class="chart-slice" d="M' + CX + ',' + CY + ' L' + x1 + ',' + y1 + ' A' + R + ',' + R + ' 0 ' + large + ' 1 ' + x2 + ',' + y2 + ' Z" fill="' + color + '">' + tip + '</path>';
        }
        angle += sweep;
      });
      var lx = CX + R + 24;
      significant.forEach(function(d, i) {
        var ly = 24 + i * 20;
        var color = S.CHART_COLORS[i % S.CHART_COLORS.length];
        svg += '<rect x="' + lx + '" y="' + (ly - 10) + '" width="12" height="12" fill="' + color + '"/>';
        svg += '<text class="chart-legend" x="' + (lx + 18) + '" y="' + ly + '">' + esc(String(d.label).slice(0, 24)) + ' (' + d.value + ')</text>';
      });
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    export function renderLineChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var minVal = Math.min.apply(null, vals.concat([0]));
      var range = maxVal - minVal || 1;
      var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
      var plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      var points = data.map(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        return x + ',' + y;
      });
      svg += '<polyline class="chart-line" points="' + points.join(' ') + '"/>';
      data.forEach(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y + '" r="4"><title>' + esc(String(d[xKey])) + ': ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Area chart: filled region under the line (no line stroke by default for clarity). */
    export function renderAreaChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var vals = data.map(function(d) { return Number(d[yKey]) || 0; });
      var maxVal = Math.max.apply(null, vals.concat([1]));
      var minVal = Math.min.apply(null, vals.concat([0]));
      var range = maxVal - minVal || 1;
      var stepX = (W - PAD * 2) / Math.max(data.length - 1, 1);
      var plotH = H - PAD * 2;
      var points = data.map(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        return x + ',' + y;
      });
      var areaPoints = PAD + ',' + (H - PAD) + ' ' + points.join(' ') + ' ' + (PAD + (data.length - 1) * stepX) + ',' + (H - PAD);
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var v = (minVal + range * i / 4).toFixed(range > 100 ? 0 : 1);
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(v) + '</text>';
      }
      svg += '<polygon class="chart-area" points="' + areaPoints + '"/>';
      svg += '<polyline class="chart-line" points="' + points.join(' ') + '"/>';
      data.forEach(function(d, i) {
        var x = PAD + i * stepX;
        var y = H - PAD - ((Number(d[yKey]) || 0) - minVal) / range * plotH;
        svg += '<circle class="chart-dot" cx="' + x + '" cy="' + y + '" r="3"><title>' + esc(String(d[xKey])) + ': ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    /** Scatter plot: X and Y must be numeric; two numeric axes with labels. */
    export function renderScatterChart(container, data, xKey, yKey, opts) {
      opts = opts || {};
      var size = getChartSize();
      var W = size.w, H = size.h, PAD = 56;
      var xLabel = opts.xLabel != null ? opts.xLabel : xKey;
      var yLabel = opts.yLabel != null ? opts.yLabel : yKey;
      var xs = data.map(function(d) { return Number(d[xKey]); }).filter(function(v) { return isFinite(v); });
      var ys = data.map(function(d) { return Number(d[yKey]); }).filter(function(v) { return isFinite(v); });
      if (xs.length === 0 || ys.length === 0) {
        container.innerHTML = '<p class="meta">Scatter requires numeric X and Y columns.</p>';
        document.getElementById('chart-container').style.display = 'block';
        var exportBar = document.getElementById('chart-export-toolbar');
        if (exportBar) exportBar.style.display = 'none';
        return;
      }
      var minX = Math.min.apply(null, xs), maxX = Math.max.apply(null, xs), rangeX = maxX - minX || 1;
      var minY = Math.min.apply(null, ys), maxY = Math.max.apply(null, ys), rangeY = maxY - minY || 1;
      var plotW = W - PAD * 2, plotH = H - PAD * 2;
      var svg = '<svg class="chart-svg" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + (H - PAD) + '" x2="' + (W - PAD) + '" y2="' + (H - PAD) + '"/>';
      svg += '<line class="chart-axis" x1="' + PAD + '" y1="' + PAD + '" x2="' + PAD + '" y2="' + (H - PAD) + '"/>';
      for (var i = 0; i <= 4; i++) {
        var vx = (minX + rangeX * i / 4).toFixed(rangeX > 100 ? 0 : 1);
        var vy = (minY + rangeY * i / 4).toFixed(rangeY > 100 ? 0 : 1);
        var x = PAD + (i / 4) * plotW;
        var y = H - PAD - (i / 4) * plotH;
        svg += '<text class="chart-axis-label" x="' + (x + (i === 0 ? -6 : 0)) + '" y="' + (H - PAD + 16) + '" text-anchor="' + (i === 0 ? 'end' : 'middle') + '">' + esc(vx) + '</text>';
        svg += '<text class="chart-axis-label" x="' + (PAD - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + esc(vy) + '</text>';
      }
      data.forEach(function(d, i) {
        var nx = (Number(d[xKey]) - minX) / rangeX;
        var ny = (Number(d[yKey]) - minY) / rangeY;
        if (!isFinite(nx) || !isFinite(ny)) return;
        var x = PAD + nx * plotW;
        var y = H - PAD - ny * plotH;
        var color = S.CHART_COLORS[i % S.CHART_COLORS.length];
        svg += '<circle class="chart-dot chart-scatter-dot" cx="' + x + '" cy="' + y + '" r="5" fill="' + color + '"><title>' + esc(String(d[xKey])) + ', ' + d[yKey] + '</title></circle>';
      });
      svg += '<text class="chart-axis-title chart-axis-y" x="12" y="' + (H / 2) + '" text-anchor="middle" transform="rotate(-90, 12, ' + (H / 2) + ')">' + esc(yLabel) + '</text>';
      svg += '<text class="chart-axis-title chart-axis-x" x="' + (W / 2) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(xLabel) + '</text>';
      svg += '</svg>';
      container.innerHTML = svg;
      applyChartUI(opts.title, opts.description);
    }

    export function renderHistogram(container, data, valueKey, bins, opts) {
      opts = opts || {};
      bins = bins || 10;
      var vals = data.map(function(d) { return Number(d[valueKey]); }).filter(function(v) { return isFinite(v); });
      if (vals.length === 0) {
        container.innerHTML = '<p class="meta">No numeric data.</p>';
        document.getElementById('chart-container').style.display = 'block';
        var exportBar = document.getElementById('chart-export-toolbar');
        if (exportBar) exportBar.style.display = 'none';
        return;
      }
      var min = Math.min.apply(null, vals);
      var max = Math.max.apply(null, vals);
      var binWidth = (max - min) / bins || 1;
      var counts = new Array(bins).fill(0);
      vals.forEach(function(v) {
        var idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
        counts[idx]++;
      });
      var histData = counts.map(function(c, i) {
        return { label: (min + i * binWidth).toFixed(1) + '-' + (min + (i + 1) * binWidth).toFixed(1), value: c };
      });
      renderBarChart(container, histData, 'label', 'value', { title: opts.title, description: opts.description, xLabel: 'Bin', yLabel: 'Count' });
    }

    /** Export chart as PNG: serialize SVG to image, draw to canvas, download. Disables button during async export. */
    export function exportChartPng() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      var btn = document.getElementById('chart-export-png');
      if (!svgEl) return;
      if (btn) btn.disabled = true;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      function done() { if (btn) btn.disabled = false; }
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          URL.revokeObjectURL(url);
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = 'chart.png';
          a.click();
          URL.revokeObjectURL(a.href);
          done();
        }, 'image/png');
      };
      img.onerror = function() { URL.revokeObjectURL(url); done(); };
      img.src = url;
    }

    /** Export chart as SVG file download. */
    export function exportChartSvg() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      if (!svgEl) return;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'chart.svg';
      a.click();
      URL.revokeObjectURL(a.href);
    }

    /** Copy chart image to clipboard (PNG). Disables button during async copy; shows brief "Copied!" feedback. */
    export function exportChartCopy() {
      var wrap = document.getElementById('chart-svg-wrap');
      var svgEl = wrap ? wrap.querySelector('svg') : null;
      var btn = document.getElementById('chart-export-copy');
      if (!svgEl) return;
      if (btn) btn.disabled = true;
      var svgStr = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([svgStr], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(blob);
      var img = new Image();
      function done() { if (btn) btn.disabled = false; }
      img.onload = function() {
        var c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        var ctx = c.getContext('2d');
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--bg') || '#fff';
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0);
        c.toBlob(function(blob) {
          URL.revokeObjectURL(url);
          if (navigator.clipboard && navigator.clipboard.write) {
            var copyBtn = btn;
            navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]).then(function() {
              if (copyBtn) { copyBtn.textContent = 'Copied!'; setTimeout(function() { copyBtn.textContent = 'Copy image'; }, 1500); }
            }).catch(function() {}).finally(done);
          } else { done(); }
        }, 'image/png');
      };
      img.onerror = function() { URL.revokeObjectURL(url); done(); };
      img.src = url;
    }
