/* 방문 기록 (2026-09-13) — 체류시간·스크롤·신청 버튼을 봤는지·눌렀는지를 같은 주소 /admin/c 로 보낸다.
   ⛔쿠키를 쓰지 않는다. 방문자 구분은 이 브라우저에 둔 무작위 번호(localStorage)뿐이다. IP 는 워커도 저장하지 않는다.
   ⛔한 페이지에서 보내는 횟수는 최대 12번 — 워커 요청 수를 페이지뷰 × 3 안쪽으로 묶는다(무료 한도 하루 10만).
   받는 쪽 = ops/admin-worker/worker.js · 보는 곳 = /admin/ */
(function () {
  var ls, ss;
  try {
    if (navigator.webdriver || /bot|crawl|spider|slurp|headless|lighthouse|preview|yeti/i.test(navigator.userAgent)) return;
    ls = window.localStorage; ss = window.sessionStorage;
    if (ls.getItem('pt_off') === '1') return;
  } catch (e) { return; }

  function rid() {
    var a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  var isNew = 0, vid, sid, nth = 1;
  try {
    vid = ls.getItem('pt_vid');
    if (!vid) { vid = rid(); ls.setItem('pt_vid', vid); isNew = 1; }
    sid = ss.getItem('pt_sid');
    if (!sid) { sid = rid(); ss.setItem('pt_sid', sid); }
    nth = (parseInt(ss.getItem('pt_n'), 10) || 0) + 1;
    ss.setItem('pt_n', String(nth));
  } catch (e) { vid = vid || rid(); sid = sid || rid(); }

  var pv = rid(), t0 = Date.now();
  window.__pt = { pv: pv };   // leadform.js 가 신청 한 건을 이 방문 줄에 잇는다

  /* 신청 버튼 자리 — 링크의 utm_medium 끝말로 가른다(ctahref.html). 끝말이 없으면 글 끝 책 안내. */
  var FORM = /proreport\.co\.kr\/f\//, kind = '';
  function placeOf(a) {
    var m = /[?&]utm_medium=([^&]+)/.exec(a.href), med = m ? decodeURIComponent(m[1]) : '';
    var parts = med.split('-'), tail = parts[parts.length - 1];
    if (!kind) kind = PLACES.test(tail) ? parts.slice(0, -1).join('-') : med;
    return PLACES.test(tail) ? tail : 'bottom';
  }
  var PLACES = /^(top|float|intro|inline|foot)$/;

  var seen = {}, seenMs = 0, clicks = {}, clickMs = 0, clickSc = 0, scrollMax = 0, active = 0, lastAct = t0;
  var vis = document.visibilityState === 'visible', since = t0, acc = 0, sent = 0, lastSent = 0;
  var hasInline = 0;
  /* 페이지를 네 토막으로 나눠 토막마다 머문 초(과외상담.com 추적기의 z1~z4 와 같은 자). 화면 한가운데가 어느 토막에 있나로 센다. */
  var zone = [0, 0, 0, 0];
  function nowPct() {
    var h = document.documentElement.scrollHeight, y = window.scrollY + window.innerHeight;
    return h > 0 ? Math.min(100, Math.round(y / h * 100)) : 100;
  }

  function dwell() { return Math.min(acc + (vis ? Date.now() - since : 0), 3600000); }
  function keys(o) { var k = Object.keys(o); return k.length ? ',' + k.join(',') + ',' : ''; }

  function send(ev, force) {
    var now = Date.now();
    if (sent >= 12 || (!force && now - lastSent < 3000)) return;
    sent++; lastSent = now;
    var body = JSON.stringify({
      id: pv, v: vid, s: sid, n: nth, nw: isNew, e: ev,
      p: location.pathname, q: location.search.slice(0, 300), t: document.title.slice(0, 140),
      r: (document.referrer || '').slice(0, 600), k: kind, il: hasInline,
      sw: screen.width, sh: screen.height, lg: (navigator.language || '').slice(0, 12),
      d: dwell(), a: Math.min(active, 3600000), sc: scrollMax,
      seen: keys(seen), sms: seenMs, c: keys(clicks), cms: clickMs, csc: clickSc, z: zone.join(',')
    });
    try {
      if (!(navigator.sendBeacon && navigator.sendBeacon('/admin/c', body))) {
        fetch('/admin/c', { method: 'POST', body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
      }
    } catch (e) {}
  }

  function onScroll() {
    var pct = nowPct();
    if (pct > scrollMax) scrollMax = pct;
  }
  function touch() { lastAct = Date.now(); }

  /* 읽는 시간 — 화면이 보이고, 마지막 손짓(스크롤·터치·키·마우스)에서 60초 안쪽인 시간만 센다. */
  setInterval(function () {
    if (document.visibilityState === 'visible' && Date.now() - lastAct < 60000) {
      active += 1000;
      var h = document.documentElement.scrollHeight, mid = window.scrollY + window.innerHeight / 2;
      zone[Math.max(0, Math.min(3, Math.floor(h > 0 ? mid / h * 4 : 0)))] += 1;
    }
  }, 1000);

  function start() {
    var links = document.querySelectorAll('a[href]'), io;
    for (var i = 0; i < links.length; i++) if (FORM.test(links[i].href)) placeOf(links[i]);
    hasInline = document.querySelector('.cta-inline:not(.cta-intro)') ? 1 : 0;
    onScroll();

    if ('IntersectionObserver' in window) {
      var timers = new Map();
      io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          var el = en.target, place = el.getAttribute('data-pt');
          if (en.isIntersecting) {
            if (!timers.has(el)) timers.set(el, setTimeout(function () {
              if (!seen[place]) {
                seen[place] = 1;
                if (!seenMs) seenMs = Date.now() - t0;
                if (place !== 'top' && place !== 'float') send('seen');
              }
              io.unobserve(el);
            }, 1000));
          } else if (timers.has(el)) { clearTimeout(timers.get(el)); timers.delete(el); }
        });
      }, { threshold: 0.5 });
    }
    for (var j = 0; j < links.length; j++) {
      var a = links[j];
      if (!FORM.test(a.href)) continue;
      var place = placeOf(a), box = (place === 'inline' || place === 'intro') ? (a.closest('.cta-inline') || a) : place === 'bottom' ? (a.closest('.cta') || a) : a;
      box.setAttribute('data-pt', place);
      if (io) io.observe(box);
      a.addEventListener('click', (function (pl, link) {
        return function () {
          clicks[pl] = 1;
          if (!clickMs) { clickMs = Date.now() - t0; clickSc = nowPct(); }
          /* 신청 양식이 utm_content 까지 저장한다(124 events.ts) → 신청 한 건이 이 방문 한 줄(pv)로 이어진다. 합계로만 쓴다. */
          try {
            var u = new URL(link.href);
            u.searchParams.set('utm_content', 'v' + pv);
            link.href = u.toString();
          } catch (e) {}
          send('click', true);
        };
      })(place, a));
    }
    send('start', true);
  }

  window.addEventListener('scroll', function () { onScroll(); touch(); }, { passive: true });
  ['pointerdown', 'keydown', 'touchstart', 'mousemove', 'wheel'].forEach(function (n) {
    window.addEventListener(n, touch, { passive: true });
  });
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') { vis = true; since = Date.now(); touch(); }
    else { if (vis) acc += Date.now() - since; vis = false; send('hide', true); }
  });
  window.addEventListener('pagehide', function () { send('leave', true); });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
