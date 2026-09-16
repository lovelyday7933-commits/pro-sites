/* 배당 계산 칸 — "이 종목으로 다달이 ○○만원 받으려면 몇 주" (2026-09-16)
   ★왜: CTA 개편 뒤 실측(09-16) 방문 24 · 번호 칸을 본 방문 19 · 손댐 0 — 노출이 아니라 "왜 번호를 남기나"가 비어 있었다.
     방문자가 넣은 값이 그대로 상담 이유가 되게 한다(결과 바로 아래 번호 칸의 data-subject 로 붙는다 · CTA 정본 §5).
   ★쓰는 값: 연간 주당배당금 = 본문에 이미 있는 값(section.calc 의 data-dps) · 주가 = **지금 시세**(hook.js 의 pt:price).
   ⛔일봉 종가를 쓰지 않는다(사용자 09-14) — 시세가 없으면 "사는 데 드는 돈"은 '—' 로 둔다(없는 값을 0으로 채우지 않는다).
   ⛔자료 글자는 textContent 로만 넣는다 · 스크립트가 없어도 페이지는 읽힌다(계산 칸은 덧붙임이다). */
(function () {
  'use strict';
  var box = document.querySelector('section.calc');
  if (!box) return;
  var dps = parseFloat(box.getAttribute('data-dps') || '0');
  if (!(dps > 0)) return;
  var name = box.getAttribute('data-name') || '이 종목';
  var goal = box.querySelector('.calc-goal');
  var outSh = box.querySelector('.calc-sh'), outWon = box.querySelector('.calc-won'), outYr = box.querySelector('.calc-yr');
  var note = box.querySelector('.calc-live');
  var price = 0, priceLabel = '';

  function won(v) { return Math.round(v).toLocaleString('ko-KR') + '원'; }
  function manwon(v) {   /* 큰 금액은 "억 3,120만원" 처럼 — 0 이 아홉 개면 읽히지 않는다 */
    var e = Math.floor(v / 1e8), m = Math.round((v - e * 1e8) / 1e4);
    if (e > 0) return e.toLocaleString('ko-KR') + '억 ' + (m > 0 ? m.toLocaleString('ko-KR') + '만원' : '원');
    if (v >= 1e4) return Math.round(v / 1e4).toLocaleString('ko-KR') + '만원';
    return won(v);
  }
  function num() {
    var v = parseFloat((goal.value || '').replace(/[^\d]/g, ''));
    return isFinite(v) && v > 0 ? v : 0;
  }
  function paint() {
    var man = num();
    if (!man) { outSh.textContent = '—'; outWon.textContent = '—'; outYr.textContent = '—'; subject(0, 0); return; }
    var need = Math.ceil(man * 1e4 * 12 / dps);          /* 다달이 받고 싶은 돈 → 한 해 → 주식 수 */
    outSh.textContent = need.toLocaleString('ko-KR') + '주';
    outYr.textContent = manwon(need * dps);
    outWon.textContent = price > 0 ? manwon(need * price) : '—';
    subject(man, need);
  }
  /* 결과를 바로 아래 번호 칸의 "상담 대상"으로 붙인다 — 칸을 늘리지 않고 텔레그램·저장 답에만 간다 */
  function subject(man, need) {
    var s = man ? (name + ' 다달이 ' + man.toLocaleString('ko-KR') + '만원 = ' + need.toLocaleString('ko-KR') + '주'
                   + (price > 0 ? ' · ' + manwon(need * price) : '')) : name;
    document.querySelectorAll('form.qf[data-place="calc"]').forEach(function (f) {
      f.setAttribute('data-subject', s);
      if (f.__st) f.__st.subject = s;
    });
  }
  function livePrice(d) {
    if (!d || !(d.p > 0)) return;
    price = d.p; priceLabel = d.label || '';
    if (note) note.textContent = '사는 데 드는 돈은 ' + priceLabel + ' ' + won(price) + ' 으로 계산했다.';
    paint();
  }

  goal.addEventListener('input', paint);
  box.querySelectorAll('.calc-chips button').forEach(function (b) {
    b.addEventListener('click', function () { goal.value = b.getAttribute('data-v'); paint(); goal.focus(); });
  });
  document.addEventListener('pt:price', function (e) { livePrice(e.detail); });
  if (window.__ptPrice) livePrice(window.__ptPrice);
  else if (note) {
    setTimeout(function () {                       /* 시세가 끝내 안 오면(장 밖·중계 실패) 주식 수만 답한다 */
      if (!(price > 0)) note.textContent = '지금 시세가 오면 사는 데 드는 돈도 같이 계산한다.';
    }, 6000);
  }
  paint();
})();
