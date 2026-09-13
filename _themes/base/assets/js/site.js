/* 144 공용 스크립트 — 2026-09-13 3판
   ① 종목 찾기 창(/ · Ctrl+K · 머리 버튼 · 홈 찾기 칸) ② 홈 점그림 풀이 ③ 셀 주가 차트 풀이
   ⛔자료 글자는 전부 textContent 로 넣는다(innerHTML 금지). ⛔스크립트가 없어도 페이지는 읽힌다 —
     찾기 칸은 /종목/?q= 로 제출되고, 값은 전부 표로도 있다. 풀이는 덧붙임이지 유일한 통로가 아니다. */
(function () {
  'use strict';
  var d = document;
  var pal = d.getElementById('pal');

  // ── 목록 한 번만 받기 ───────────────────────────────
  var CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
  function cho(s) {
    var o = '';
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      o += (c >= 0xAC00 && c <= 0xD7A3) ? CHO[Math.floor((c - 0xAC00) / 588)] : s[i].toLowerCase();
    }
    return o;
  }
  var dataP = null;
  function data() {
    if (!dataP) {
      var src = pal ? pal.getAttribute('data-src') : '/search.json';
      dataP = fetch(src).then(function (r) { return r.json(); }).then(function (j) {
        var by = {};
        j.stocks.forEach(function (s) {
          s.l = s.n.toLowerCase();
          s.h = cho(s.n);
          by[s.c] = s;
        });
        j.by = by;
        return j;
      });
    }
    return dataP;
  }

  function el(tag, cls, text) {
    var e = d.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function sgn(v, digits, unit) {
    return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(digits) + unit;
  }

  // ── ① 종목 찾기 창 ─────────────────────────────────
  if (pal) {
    var input = pal.querySelector('input');
    var list = pal.querySelector('ul');
    var sel = 0;
    var isJamo = /^[ㄱ-ㅎ]+$/;
    var thing = pal.getAttribute('data-thing') || '종목';     // 주식 = 종목 · 코인 = 코인

    function render() {
      data().then(function (j) {
        var q = input.value.trim().toLowerCase();
        var rows = [];
        if (!q) {
          j.signals.forEach(function (s) { rows.push({ t: s.n, s: '신호 · ' + thing + ' ' + s.m + '개', u: s.u }); });
        } else {
          var hit = [];
          j.stocks.forEach(function (o) {
            var score = -1;
            if (o.l.indexOf(q) === 0) score = 0;
            else if (o.l.indexOf(q) > 0) score = 1;
            else if (isJamo.test(q) && o.h.indexOf(q) > -1) score = 2;
            else if (o.c.toLowerCase().indexOf(q) === 0) score = 3;     // 코인은 btc·xrp 로 찾는 사람이 많다
            if (score > -1) hit.push([score, o]);
          });
          hit.sort(function (a, b) { return a[0] - b[0] || a[1].n.length - b[1].n.length || (a[1].n < b[1].n ? -1 : 1); });
          j.signals.forEach(function (s) {
            if (s.n.toLowerCase().indexOf(q) > -1) rows.push({ t: s.n, s: '신호 · ' + thing + ' ' + s.m + '개', u: s.u });
          });
          hit.slice(0, 30).forEach(function (h) {
            rows.push({ t: h[1].n, s: h[1].c + (h[1].k ? ' · 신호 ' + h[1].k + '가지' : ' · ' + (h[1].x || '')), u: h[1].u });
          });
        }
        list.textContent = '';
        if (!rows.length) {
          list.appendChild(el('li', 'empty', '"' + input.value.trim() + '" 에 맞는 ' + thing + '이 없습니다. 지금은 ' +
            j.stocks.length + '개 ' + thing + '을 찾을 수 있습니다.'));
          return;
        }
        sel = Math.min(sel, rows.length - 1);
        rows.forEach(function (r, i) {
          var li = el('li'), a = el('a');
          a.href = r.u;
          a.setAttribute('role', 'option');
          a.setAttribute('aria-selected', i === sel ? 'true' : 'false');
          a.appendChild(el('b', '', r.t));
          a.appendChild(el('span', '', r.s));
          a.addEventListener('mousemove', function () { move(i - sel); });
          li.appendChild(a);
          list.appendChild(li);
        });
      });
    }
    function move(step) {
      var opts = list.querySelectorAll('a');
      if (!opts.length) return;
      sel = (sel + step + opts.length) % opts.length;
      opts.forEach(function (a, i) { a.setAttribute('aria-selected', i === sel ? 'true' : 'false'); });
      if (step) opts[sel].scrollIntoView({ block: 'nearest' });
    }
    function open(q) {
      if (pal.open) return;
      input.value = q || '';
      sel = 0;
      render();
      pal.showModal();
      input.focus();
    }
    input.addEventListener('input', function () { sel = 0; render(); });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
      else if (e.key === 'Enter') {
        e.preventDefault();
        var a = list.querySelectorAll('a')[sel];
        if (a) location.href = a.href;
      }
    });
    pal.addEventListener('click', function (e) { if (e.target === pal) pal.close(); });
    d.querySelectorAll('[data-pal]').forEach(function (b) { b.addEventListener('click', function () { open(''); }); });
    d.querySelectorAll('[data-pal-input]').forEach(function (i) {
      i.addEventListener('focus', function () { var v = i.value; i.blur(); open(v); });
    });
    d.addEventListener('keydown', function (e) {
      var t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        open('');
      }
    });
  }

  // ── 공용: 가까운 점 찾기 + 풀이 상자 ─────────────────
  // pts = [[x, y, …]] (좌표계 0..W × 0..H) · 화면 거리로 잰다(가로로 늘어난 SVG 라서)
  // 세로 거리는 절반만 친다 — 점그림은 세로 흩뿌림이 값이 아니라서, 가로가 가까운 점을 잡는 게 맞다
  function nearest(pts, W, H, rect, cx, cy, max) {
    var best = -1, bd = max * max;
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i][0] / W * rect.width - cx, dy = (pts[i][1] / H * rect.height - cy) * .5, dd = dx * dx + dy * dy;
      if (dd < bd) { bd = dd; best = i; }
    }
    return best;
  }
  function hover(box, opt) {
    var tip = el('div', 'tip');
    tip.hidden = true;
    box.appendChild(tip);
    var hl = box.querySelector('path.hl');
    var cur = -1, armed = -1;
    function show(i) {
      cur = i;
      if (i < 0) { tip.hidden = true; if (hl) hl.setAttribute('d', ''); return; }
      var p = opt.pts[i], r = box.getBoundingClientRect();
      if (hl) hl.setAttribute('d', 'M' + p[0] + ' ' + p[1] + 'h0');
      tip.textContent = '';
      opt.fill(tip, p);
      tip.hidden = false;
      var x = p[0] / opt.W * r.width, y = p[1] / opt.H * r.height;
      var half = tip.offsetWidth / 2;
      tip.style.left = Math.max(half - 8, Math.min(r.width - half + 8, x)) + 'px';
      tip.style.top = y + 'px';
    }
    box.addEventListener('pointermove', function (e) {
      var r = box.getBoundingClientRect();
      show(nearest(opt.pts, opt.W, opt.H, r, e.clientX - r.left, e.clientY - r.top, opt.max));
    });
    box.addEventListener('pointerleave', function () { show(-1); armed = -1; });
    box.addEventListener('click', function (e) {
      if (!opt.go || cur < 0) return;
      // 손가락은 첫 탭에 풀이만, 같은 점을 한 번 더 누르면 간다
      if (e.pointerType && e.pointerType !== 'mouse' && armed !== cur) { armed = cur; return; }
      var u = opt.go(opt.pts[cur]);
      if (u) location.href = u;
    });
  }

  // ── ② 홈 점그림 ───────────────────────────────────
  // 이름 목록을 미리 받는다 — 첫 풀이에 이름 대신 코드가 뜨던 것(2026-09-13 캡처)
  var names = null, strips = d.querySelectorAll('.splot[data-pts]');
  if (strips.length) data().then(function (j) { names = j.by; });
  strips.forEach(function (box) {
    var pts = JSON.parse(box.getAttribute('data-pts'));
    var slug = box.getAttribute('data-slug'), label = box.getAttribute('data-label');
    var H = +box.getAttribute('data-h');
    hover(box, {
      pts: pts, W: 1000, H: H, max: 24,
      fill: function (tip, p) {
        var o = names && names[p[2]];
        tip.appendChild(el('b', p[3] > 0 ? 'up' : p[3] < 0 ? 'dn' : '', sgn(p[3], 2, '%p')));
        tip.appendChild(el('div', '', (o ? o.n : p[2]) + ' · ' + label));
        tip.appendChild(el('div', '', (p[3] > 0 ? '평소보다 나았다' : p[3] < 0 ? '평소보다 못했다' : '평소와 같았다') +
          (p[4] ? ' · 누르면 자세히' : ' · 누르면 ' + (box.getAttribute('data-thing') || '종목') + ' 전체')));
      },
      go: function (p) {
        var o = names && names[p[2]];
        if (!o) return '';
        return p[4] ? o.u + slug + '/' : o.u;
      }
    });
  });

  // ── ③ 셀 주가 차트 ─────────────────────────────────
  d.querySelectorAll('.pc-plot[data-ev]').forEach(function (box) {
    var pts = JSON.parse(box.getAttribute('data-ev'));
    var label = box.getAttribute('data-label');
    var day = box.getAttribute('data-day') || '거래일';          // 코인은 "일"
    hover(box, {
      pts: pts, W: 1000, H: 300, max: 26,
      fill: function (tip, p) {
        var ds = p[3].slice(0, 4) + '.' + p[3].slice(4, 6) + '.' + p[3].slice(6, 8);
        if (p[2] == null) tip.appendChild(el('b', '', '20' + day + '이 아직 안 지남'));
        else tip.appendChild(el('b', p[2] > 0 ? 'up' : p[2] < 0 ? 'dn' : '', '20' + day + ' 뒤 ' + sgn(p[2], 1, '%')));
        tip.appendChild(el('div', '', ds + ' ' + label + ' 신호'));
        tip.appendChild(el('div', '', '그날 종가 ' + p[4].toLocaleString('ko-KR', { maximumFractionDigits: 4 }) + '원'));
      }
    });
  });
})();
