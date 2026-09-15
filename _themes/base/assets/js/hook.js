/* 첫 화면 후킹 부품의 움직임 (2026-09-14 CTA 개편 · partials/cta/hook.html)
   레퍼런스 릴스 5편의 공통 문법 = "숫자가 살아 움직인다" · "추론 과정이 눈에 보인다"(후킹.md §3-3).
   ① 공증 수익률·승률이 0 에서 올라간다(처음 보일 때 한 번 · 움직임 줄이기 설정이면 건너뜀)
   ② 기록이 여러 개면(코인 ①②④) 4.5초마다 돌린다 · 점을 누르면 그 기록
   ③ "확인서 보기" = 이름·인장을 가린 확인서 이미지 창(열 때 불러온다 — 페이지 무게를 늘리지 않는다)
   ④ 지금 시세 — 코인 = 업비트 공개 시세(안 되면 빗썸) 브라우저에서 바로 · 주식 = 관리 워커 중계 /admin/q(네이버 증권 · 60초 기억)
      ⛔로봇·자동화 브라우저는 부르지 않는다(무료 한도) · 실패하면 페이지에 적힌 기준일 종가 그대로. */
(function () {
  var box = document.querySelector('.hook');
  if (!box) return;
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var bot = navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview|yeti/i.test(navigator.userAgent);

  function fmt(v, dec) {
    return v.toLocaleString('ko-KR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }
  function count(rec) {
    if (reduce || rec.__done) return;
    rec.__done = true;
    rec.querySelectorAll('[data-count]').forEach(function (el) {
      var end = parseFloat(el.getAttribute('data-count')), dec = parseInt(el.getAttribute('data-dec'), 10) || 0, t0 = null;
      if (!isFinite(end)) return;
      function step(t) {
        if (t0 === null) t0 = t;
        var k = Math.min(1, (t - t0) / 1100), e = 1 - Math.pow(1 - k, 3);
        el.textContent = fmt(end * e, dec);
        if (k < 1) requestAnimationFrame(step); else el.textContent = fmt(end, dec);
      }
      requestAnimationFrame(step);
    });
  }

  /* ①② 공증 기록 */
  var proof = box.querySelector('.hk-proof'), recs = proof ? proof.querySelectorAll('.hk-rec') : [], cur = 0, timer = null, seen = false;
  var dots = proof ? proof.querySelectorAll('.hk-dots button') : [];
  function show(i) {
    if (!recs.length) return;
    cur = (i + recs.length) % recs.length;
    recs.forEach(function (r, j) { r.hidden = j !== cur; });
    dots.forEach(function (d, j) { if (j === cur) d.setAttribute('aria-selected', 'true'); else d.removeAttribute('aria-selected'); });
    if (seen) count(recs[cur]);
  }
  function start() {
    if (recs.length < 2 || reduce || timer) return;
    timer = setInterval(function () { if (document.visibilityState === 'visible') show(cur + 1); }, 4500);
  }
  dots.forEach(function (d, j) { d.addEventListener('click', function () { clearInterval(timer); timer = null; show(j); }); });
  if (proof) {
    proof.addEventListener('pointerenter', function () { clearInterval(timer); timer = null; });
    proof.addEventListener('pointerleave', start);
  }
  if ('IntersectionObserver' in window && proof) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) { seen = true; count(recs[cur]); start(); io.disconnect(); }
      });
    }, { threshold: 0.4 });
    io.observe(proof);
  }

  /* ③ 확인서 창 */
  var dlg = box.querySelector('.hk-dlg');
  if (dlg && typeof dlg.showModal === 'function') {
    var body = dlg.querySelector('.hk-dlg-body'), cap = dlg.querySelector('.hk-dlg-top p'), img = document.createElement('img');
    img.alt = body.getAttribute('data-alt') || ''; img.decoding = 'async';   // 주소 없는 img 를 HTML 에 두지 않는다 — 열 때 만든다
    body.appendChild(img);
    document.querySelectorAll('.hk-doc').forEach(function (b) {   // 09-15 본문 끝 카드의 확인서 그림(.cta-doc)도 같은 창으로
      b.addEventListener('click', function () {
        img.src = b.getAttribute('data-img');
        cap.textContent = b.getAttribute('data-label') || '';
        document.documentElement.classList.add('lf-open');
        dlg.showModal();
      });
    });
    dlg.querySelector('.lf-x').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () { document.documentElement.classList.remove('lf-open'); });
  } else {
    document.querySelectorAll('.hk-doc').forEach(function (b) { b.addEventListener('click', function () { window.open(b.getAttribute('data-img'), '_blank', 'noopener'); }); });
  }

  /* 09-15 떠 있는 버튼(.fab)은 화면 아래 신청 띠(.qbar · leadform.js)로 바뀌었다 */

  /* ④ 지금 시세 */
  var live = box.querySelector('[data-live]');
  if (!live || bot || !window.fetch) return;
  var parts = live.getAttribute('data-live').split(':'), kind = parts[0], code = parts[1];
  function won(v) {
    if (v >= 100) return Math.round(v).toLocaleString('ko-KR') + '원';
    if (v >= 1) return v.toLocaleString('ko-KR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '원';
    return String(+v.toFixed(6)) + '원';
  }
  function paint(p, r, label) {
    if (!(p > 0)) return;
    live.querySelector('.hk-live-p').textContent = won(p);
    var rr = live.querySelector('.hk-live-r');
    if (isFinite(r)) {
      rr.textContent = (r > 0 ? '▲' : r < 0 ? '▼' : '') + Math.abs(r).toFixed(2) + '%';
      rr.className = 'hk-live-r ' + (r > 0 ? 'up' : r < 0 ? 'dn' : '');
    }
    live.querySelector('.hk-live-t').textContent = label;
    live.hidden = false;
    live.classList.add('on');
    /* 계단의 "현재와 +88.2%"(목표주가) · "지금은 -62.6%"(코인 최고가)는 기준일 종가로 구운 값 — 지금 시세가 뜨면 같은 시세로 다시 잰다
       (09-14 회의론자 심사: 같은 박스의 지금 시세와 계산이 안 맞았다) */
    function num(li) { var b = li && li.querySelector('b'); return b ? parseFloat(b.textContent.replace(/[^\d.]/g, '')) : NaN; }
    function pct(li, v) { var b = li && li.querySelector('b'); if (b && isFinite(v)) b.textContent = (v > 0 ? '+' : v < 0 ? '-' : '') + Math.abs(v).toFixed(1) + '%'; }
    var st = box.querySelector('.hk-steps');
    if (st) {
      var tgt = st.querySelector('li[data-slot="tgt"]'), gap = st.querySelector('li[data-slot="gap"]');
      if (tgt && gap && num(tgt) > 0) pct(gap, (num(tgt) / p - 1) * 100);
      var ath = st.querySelector('li[data-slot="ath"]'), below = st.querySelector('li[data-slot="below"]');
      if (ath && below && num(ath) > 0) pct(below, (p / num(ath) - 1) * 100);
    }
  }
  function hm() { var d = new Date(); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function get(u) {
    return fetch(u, { credentials: 'omit' }).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); });
  }
  function run() {
    if (kind === 'coin') {
      get('https://api.upbit.com/v1/ticker?markets=KRW-' + encodeURIComponent(code)).then(function (j) {
        var t = j && j[0];
        if (!t || !(t.trade_price > 0)) throw new Error('upbit');
        paint(t.trade_price, t.signed_change_rate * 100, '지금 · 업비트 원화마켓 ' + hm());
      }).catch(function () {
        return get('https://api.bithumb.com/public/ticker/' + encodeURIComponent(code) + '_KRW').then(function (j) {
          var d = j && j.status === '0000' && j.data;
          if (!d) return;
          paint(parseFloat(d.closing_price), parseFloat(d.fluctate_rate_24H), '지금 · 빗썸 원화마켓 ' + hm());
        });
      }).catch(function () {});
    } else {
      get('/admin/q?c=' + encodeURIComponent(code)).then(function (j) {
        if (!j || !j.ok) return;
        var at = (j.at || '').slice(11, 16);
        paint(j.p, j.r, (j.s === 'open' ? '지금 ' : '마지막 체결 ') + (at || hm()));
      }).catch(function () {});
    }
  }
  if (document.visibilityState === 'visible') run();
  else document.addEventListener('visibilitychange', function once() { if (document.visibilityState === 'visible') { document.removeEventListener('visibilitychange', once); run(); } });
})();
