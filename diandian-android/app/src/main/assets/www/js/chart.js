/* 点点 — 交互式 SVG 折线图（真实数据；支持双指缩放/左右滑动/点按详情）
   手势：单指/鼠标拖动=平移；双指捏合=缩放；按钮/滚轮=缩放；点按数据点=详情 */
(function () {
  'use strict';

  let uidSeq = 0;

  function niceStep(raw) {
    if (raw <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(raw)));
    const n = raw / p;
    let s = 1;
    if (n > 5) s = 10; else if (n > 2) s = 5; else if (n > 1) s = 2;
    return s * p;
  }
  function smoothPath(pts) {
    if (pts.length < 2) return '';
    let d = 'M' + pts[0].x.toFixed(2) + ',' + pts[0].y.toFixed(2);
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += ' C' + c1x.toFixed(2) + ',' + c1y.toFixed(2) + ' ' + c2x.toFixed(2) + ',' + c2y.toFixed(2) + ' ' + p2.x.toFixed(2) + ',' + p2.y.toFixed(2);
    }
    return d;
  }

  /* ===== 纯函数：缩放/平移数学（供测试） =====
     dom = [t0, t1]；opts = { bounds:[lo,hi], minSpan, maxSpan } */
  function clampDomain(dom, opts) {
    const lo = opts.bounds[0], hi = opts.bounds[1];
    const minSpan = opts.minSpan || (hi - lo) / 40;
    const maxSpan = opts.maxSpan || (hi - lo);
    let a = dom[0], b = dom[1];
    let span = b - a;
    if (!isFinite(span) || span <= 0) span = Math.min(maxSpan, hi - lo);
    if (span < minSpan) span = minSpan;
    if (span > maxSpan) span = maxSpan;
    let c = (a + b) / 2;
    a = c - span / 2; b = c + span / 2;
    if (a < lo) { a = lo; b = a + span; }
    if (b > hi) { b = hi; a = b - span; }
    if (a < lo) { a = lo; b = Math.min(hi, lo + maxSpan); }
    return [a, b];
  }
  // 围绕锚点 t 缩放：factor<1 → 放大（span 变小）；factor>1 → 缩小（span 变大）
  function zoomAround(dom, factor, anchorT, opts) {
    let a = dom[0], b = dom[1];
    const span = (b - a) * factor;
    const f = (anchorT - a) / (b - a || 1);
    a = anchorT - f * span;
    return clampDomain([a, a + span], opts);
  }
  // 平移 deltaMs（正=向右移动窗口，内容向左）
  function panBy(dom, deltaMs, opts) {
    return clampDomain([dom[0] + deltaMs, dom[1] + deltaMs], opts);
  }

  /*
   * opts: {
   *   points: [{ t, v, scenario, foods:[name], delta }],
   *   domain: [t0, t1],          // 初始时间窗口（ms）
   *   bounds: [tmin, tmax],      // 平移/缩放边界
   *   minSpan, maxSpan,
   *   formatX(ts), formatY(v), unit,
   *   emptyText
   * }
   */
  function render(container, opts) {
    const uid = 'c' + (++uidSeq);
    container.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'chart-wrap';
    container.appendChild(wrap);

    const tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.style.opacity = '0';
    wrap.appendChild(tip);

    // 缩放按钮（辅助，主交互是手势）
    const zoom = document.createElement('div');
    zoom.className = 'chart-zoom';
    zoom.innerHTML =
      '<button data-z="in" aria-label="放大">' + DD.icon('zoom_in', 18) + '</button>' +
      '<button data-z="out" aria-label="缩小">' + DD.icon('zoom_out', 18) + '</button>';
    wrap.appendChild(zoom);
    zoom.addEventListener('click', (e) => {
      const btn = e.target.closest('button'); if (!btn) return;
      const factor = btn.dataset.z === 'in' ? 0.6 : 1.7;
      const center = (state.domain[0] + state.domain[1]) / 2;
      state.domain = zoomAround(state.domain, factor, center, opts);
      draw();
    });

    const svgNS = 'http://www.w3.org/2000/svg';
    let svg = null;

    const state = {
      domain: [opts.domain[0], opts.domain[1]],
      selected: null,        // 选中数据点下标
      pointers: new Map(),   // pointerId -> {x,y}
      dragStart: null,       // {x, domainStart}
      pinch: null,           // {dist, span, anchorT}
      moved: false
    };

    function visiblePoints() {
      const [a, b] = state.domain;
      return opts.points.filter(p => p.t >= a && p.t <= b);
    }

    function draw() {
      const w = wrap.clientWidth || 320;
      const h = wrap.clientHeight || 220;
      const mL = 38, mR = 10, mT = 10, mB = 24;
      const pw = w - mL - mR, ph = h - mT - mB;
      const [a, b] = state.domain;
      const pts = visiblePoints();

      // y 域
      let ymin, ymax;
      if (pts.length) {
        const vs = pts.map(p => p.v);
        ymin = Math.min.apply(null, vs); ymax = Math.max.apply(null, vs);
        if (ymax - ymin < 1e-6) { ymin -= 1; ymax += 1; }
        const pad = (ymax - ymin) * 0.15;
        ymin -= pad; ymax += pad;
      } else { ymin = 0; ymax = 1; }

      const x = t => mL + (t - a) / (b - a) * pw;
      const y = v => mT + (1 - (v - ymin) / (ymax - ymin)) * ph;

      let s = '';
      // 网格 + y 标签
      const yStep = niceStep((ymax - ymin) / 4);
      const y0 = Math.ceil(ymin / yStep) * yStep;
      for (let v = y0; v <= ymax + 1e-9; v += yStep) {
        const yy = y(v);
        s += '<line x1="' + mL + '" y1="' + yy + '" x2="' + (w - mR) + '" y2="' + yy + '" stroke="var(--outline-variant)" stroke-opacity="0.35" stroke-width="1"/>';
        s += '<text x="' + (mL - 6) + '" y="' + (yy + 3.5) + '" text-anchor="end" font-size="10" fill="var(--outline)" font-family="var(--font-mono)">' + opts.formatY(v) + '</text>';
      }
      // x 标签
      const spanMs = b - a;
      const xStep = niceStep(spanMs / 4 / 1000) * 1000;
      for (let t = Math.ceil(a / xStep) * xStep; t <= b + 1e-9; t += xStep) {
        const xx = x(t);
        s += '<line x1="' + xx + '" y1="' + mT + '" x2="' + xx + '" y2="' + (h - mB) + '" stroke="var(--outline-variant)" stroke-opacity="0.2" stroke-width="1"/>';
        s += '<text x="' + xx + '" y="' + (h - 8) + '" text-anchor="middle" font-size="10" fill="var(--outline)" font-family="var(--font-mono)">' + opts.formatX(t) + '</text>';
      }

      // 数据线（≥2 点才连线，不造假）
      const shown = pts.map(p => ({ x: x(p.t), y: y(p.v), p }));
      if (shown.length >= 2) {
        s += '<path d="' + smoothPath(shown) + '" fill="none" stroke="var(--primary)" stroke-opacity="0.75" stroke-width="2" stroke-linecap="round"/>';
      }
      // 数据点（统一样式）
      shown.forEach((pt, i) => {
        const isLast = i === shown.length - 1;
        const r = isLast ? 5.5 : 4;
        s += '<circle cx="' + pt.x.toFixed(2) + '" cy="' + pt.y.toFixed(2) + '" r="' + r + '" fill="var(--primary)" stroke="var(--surface)" stroke-width="2"/>';
      });
      // 选中点强调
      if (state.selected != null) {
        const sel = pts[state.selected];
        if (sel) {
          s += '<circle cx="' + x(sel.t).toFixed(2) + '" cy="' + y(sel.v).toFixed(2) + '" r="9" fill="none" stroke="var(--secondary)" stroke-width="2"/>';
        }
      }

      if (svg) svg.remove();
      svg = document.createElementNS(svgNS, 'svg');
      svg.setAttribute('width', w); svg.setAttribute('height', h);
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      svg.innerHTML = s;
      wrap.insertBefore(svg, tip);

      // 空状态
      wrap.querySelectorAll('.chart-empty').forEach(n => n.remove());
      if (!pts.length) {
        const empty = document.createElement('div');
        empty.className = 'chart-empty';
        empty.innerHTML = DD.icon('insights', 40) + '<span>' + (opts.emptyText || '暂无数据') + '</span>';
        wrap.appendChild(empty);
      }
    }

    function showTip(index) {
      const pts = visiblePoints();
      const p = pts[index];
      if (!p) return;
      const w = wrap.clientWidth || 320, h = wrap.clientHeight || 220;
      const mL = 38, mR = 10, mT = 10;
      const pw = w - mL - mR;
      const [a, b] = state.domain;
      const xpx = mL + (p.t - a) / (b - a) * pw;
      tip.style.left = Math.max(60, Math.min(w - 60, xpx)) + 'px';
      tip.style.top = Math.max(8, Math.min(h - 40, mT + 10)) + 'px';
      const foods = (p.foods && p.foods.length) ? p.foods.join('、') : '';
      tip.innerHTML =
        '<div class="ct-v">' + opts.formatY(p.v) + ' ' + opts.unit + '</div>' +
        '<div class="ct-m">' + opts.formatX(p.t) + (p.scenario ? ' · ' + p.scenario : '') + '</div>' +
        (foods ? '<div class="ct-f">' + foods + '</div>' : '');
      tip.style.opacity = '1';
      state.selected = index;
      draw();
    }
    function hideTip() { tip.style.opacity = '0'; state.selected = null; draw(); }

    // ---- 手势：拖动平移 / 双指缩放 / 点按选择 ----
    function pxToMs(dx) {
      const w = wrap.clientWidth || 320;
      const pw = w - 38 - 10;
      return dx / pw * (state.domain[1] - state.domain[0]);
    }
    function tAtClientX(clientX) {
      const w = wrap.clientWidth || 320;
      const pw = w - 38 - 10;
      const mL = 38;
      const rect = wrap.getBoundingClientRect();
      const [a, b] = state.domain;
      return a + (clientX - rect.left - mL) / pw * (b - a);
    }

    function onDown(e) {
      e.preventDefault();
      try { wrap.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.pointers.size === 1) {
        state.dragStart = { x: e.clientX, domainStart: state.domain.slice() };
        state.moved = false;
        hideTip();
      } else if (state.pointers.size === 2) {
        const [p1, p2] = [...state.pointers.values()];
        const dist = Math.max(20, Math.abs(p1.x - p2.x));
        state.pinch = {
          prevDist: dist,                 // 逐帧增量基准，避免累积漂移
          anchorT: tAtClientX((p1.x + p2.x) / 2)
        };
        state.dragStart = null;
      }
    }
    function onMove(e) {
      if (!state.pointers.has(e.pointerId)) return;
      state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (state.pointers.size === 2 && state.pinch) {
        const [p1, p2] = [...state.pointers.values()];
        const dist = Math.max(20, Math.abs(p1.x - p2.x));
        const ratio = dist / state.pinch.prevDist;  // 本帧相对上一帧的增量
        state.pinch.prevDist = dist;
        if (Math.abs(ratio - 1) > 0.015) {
          // 手指分开（ratio>1）→ 放大（span 变小）；手指合拢 → 缩小
          state.pinch.anchorT = tAtClientX((p1.x + p2.x) / 2);
          state.domain = zoomAround(state.domain, 1 / ratio, state.pinch.anchorT, opts);
          draw();
        }
        return;
      }
      if (state.dragStart && state.pointers.size === 1) {
        const dx = e.clientX - state.dragStart.x;
        if (Math.abs(dx) > 3) state.moved = true;
        if (state.moved) {
          // 内容跟手：窗口向拖动反方向移动
          state.domain = panBy(state.dragStart.domainStart, -pxToMs(dx), opts);
          draw();
        }
      }
    }
    function onUp(e) {
      if (state.pointers.has(e.pointerId)) state.pointers.delete(e.pointerId);
      if (state.pointers.size < 2) state.pinch = null;
      if (state.pointers.size === 0 && state.dragStart) {
        if (!state.moved) {
          // 点按：找最近数据点
          const pts = visiblePoints();
          const t = tAtClientX(e.clientX);
          let best = -1, bestD = Infinity;
          for (let i = 0; i < pts.length; i++) {
            const d = Math.abs(pts[i].t - t);
            if (d < bestD) { bestD = d; best = i; }
          }
          const span = state.domain[1] - state.domain[0];
          if (best >= 0 && bestD / span < 0.04) showTip(best); else hideTip();
        }
        state.dragStart = null;
        state.moved = false;
      }
      if (state.pointers.size === 0) state.dragStart = null;
    }
    wrap.addEventListener('pointerdown', onDown);
    wrap.addEventListener('pointermove', onMove);
    wrap.addEventListener('pointerup', onUp);
    wrap.addEventListener('pointercancel', onUp);
    wrap.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 0.8 : 1.25;
      const center = (state.domain[0] + state.domain[1]) / 2;
      state.domain = zoomAround(state.domain, factor, center, opts);
      draw();
    }, { passive: false });
    wrap.addEventListener('dblclick', () => {
      state.domain = [opts.domain[0], opts.domain[1]];
      clampDomain(state.domain, opts);
      draw();
    });
    wrap.addEventListener('contextmenu', e => e.preventDefault());

    const ro = new ResizeObserver(() => draw());
    ro.observe(wrap);

    clampDomain(state.domain, opts);
    draw();

    return {
      destroy() { ro.disconnect(); wrap.remove(); },
      redraw() { draw(); },
      reset() { state.domain = [opts.domain[0], opts.domain[1]]; clampDomain(state.domain, opts); draw(); }
    };
  }

  window.DD = window.DD || {};
  DD.Chart = { render, clampDomain, zoomAround, panBy };
})();
