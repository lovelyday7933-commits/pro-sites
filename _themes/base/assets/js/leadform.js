/* 페이지 안 신청 창 (2026-09-13) — 신청 버튼을 누르면 새 탭 대신 이 페이지 위에 신청 창을 띄운다.
   사용자: "폼빌더처럼 이 페이지 내부 집계 형태를 만들어서 붙이면 되잖아" · "CTA 발생 시 기존 텔레그램 채널로 내용 보내 주면 됨".
   · 질문은 신청 양식 서버(proreport = 124 폼빌더)의 발행 폼을 그대로 읽는다(/admin/f/<슬러그> — 워커가 중계·5분 캐시).
   · 제출은 /admin/lead → 워커가 검사 → proreport 에 그대로 저장(텔레그램·중복 판정·월간 성적표 그대로) + 운영 텔레그램 알림.
   · 단계 기록은 /admin/fe → 방문 상세의 "신청 완료까지". ⛔이 사이트 기록에는 이름·연락처를 남기지 않는다.
   · 어떤 이유로든 창을 못 띄우면 원래 링크(새 탭)로 간다 — 신청을 잃지 않는 것이 먼저다. */
(function () {
  if (!window.fetch || !window.JSON || typeof document.createElement('dialog').showModal !== 'function') return;
  var FORM = /proreport\.co\.kr\/f\/([a-z0-9]+)/i;
  var defs = {};
  var dlg, cur = null;

  function rid() {
    var a = new Uint8Array(8); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (attrs[k] === null || attrs[k] === undefined) continue;
      if (k === 'text') n.textContent = attrs[k];
      else if (k === 'class') n.className = attrs[k];
      else n.setAttribute(k, attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function fmtPhone(s) {
    var d = String(s || '').replace(/\D/g, '').slice(0, 11);
    if (d.length <= 3) return d;
    if (d.length <= 7) return d.slice(0, 3) + '-' + d.slice(3);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  var norm = function (s) { return String(s || '').replace(/제\s*(\d)/g, '$1').replace(/[^0-9a-z가-힣]/gi, '').replace(/권$/, '').toLowerCase(); };
  /* ★09-15 단순 신청 창(관리 워커 정의 form.simple = {book:'무료 책 받기', talk:'무료 1:1 상담'}) — 사용자 "책 받기 상담받기 두개로 줄이고 번호 입력 이름입력 심플하게"
     누른 버튼의 약속(utm_campaign)이 책 이름이면 "무료 책 받기", 그 밖(상담·옛 제안 이름·없음)이면 "무료 1:1 상담"을 미리 체크한다.
     책 이름은 창에 늘어놓지 않는다 — 누른 책 버튼의 책, 아니면 이 페이지의 첫 책 버튼의 책을 book 으로 보낸다(텔레그램·proreport 저장 답에만). */
  var OLD_OFFERS = ['지금 선별된 종목과 근거', '내 코인 확인하기'];
  function campOf(href) {
    try { return decodeURIComponent((/[?&]utm_campaign=([^&]+)/.exec(href) || [])[1] || '').replace(/-/g, ' '); } catch (e) { return ''; }
  }
  function isTalk(camp, S) {
    return !camp || norm(camp) === norm(S.talk) || OLD_OFFERS.some(function (x) { return norm(x) === norm(camp); });
  }
  function isBookName(camp, S) { return !!camp && !isTalk(camp, S) && norm(camp) !== norm(S.book); }
  function pageBook(link, S) {
    var c = campOf(link.href);
    if (isBookName(c, S)) return c;
    var all = document.querySelectorAll('a[href*="proreport.co.kr/f/"]');
    for (var i = 0; i < all.length; i++) { var x = campOf(all[i].href); if (isBookName(x, S)) return x; }
    return '';
  }

  function beacon(path, obj) {
    var body = JSON.stringify(obj);
    try { if (navigator.sendBeacon && navigator.sendBeacon(path, body)) return; } catch (e) {}
    fetch(path, { method: 'POST', body: body, keepalive: true, credentials: 'omit' }).catch(function () {});
  }
  function ev(name, extra) {
    if (!cur) return;
    var o = { pv: cur.pv, slug: cur.slug, fsid: cur.fsid, e: name, place: cur.place, p: location.pathname, utm: cur.utm, step: cur.step };
    for (var k in extra || {}) o[k] = extra[k];
    beacon('/admin/fe', o);
  }

  function validate(q, v) {
    var empty = v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (q.type === 'consent' && v !== true);
    if (q.type === 'statement') return null;
    if (empty) return q.required ? (q.type === 'consent' ? '동의가 필요합니다' : '답변을 입력해 주세요') : null;
    if (q.type === 'phone' && !/^01[016789]-\d{3,4}-\d{4}$/.test(String(v))) return '휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)';
    if (q.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v))) return '이메일 주소를 확인해 주세요';
    return null;
  }

  function build(def, link) {
    var f = def.form, answers = {}, touched = false, answered = {};
    var qs = (f.questions || []).filter(function (q) { return q.type !== 'statement' || q.title; });
    /* 누른 버튼의 약속 = utm_campaign(제안 선택지 또는 책 이름 · ctahref.html) → 첫 선택 칸 미리 체크 */
    var book = campOf(link.href), S = f.simple || null;
    var want = S ? (cur.talk ? S.talk : S.book) : '';
    var coinName = link.getAttribute('data-coin') || '';   // 코인 페이지에서 누르면 "들고 있거나 보는 코인" 칸에 그 코인을 미리 적는다(고칠 수 있다)

    var form = el('form', { class: 'lf-form', novalidate: '' });
    var hp = el('input', { type: 'text', name: 'website', tabindex: '-1', autocomplete: 'off', class: 'lf-hp', 'aria-hidden': 'true' });
    form.appendChild(hp);

    var presets = [];   // 페이지 책으로 미리 고른 칸 — 입력을 시작하면 그 칸도 "채움"으로 센다(양식 서버 질문별 통계가 1번 칸에서 끊기지 않게)
    function mark(i, q) {
      if (!touched) {
        touched = true; ev('start');
        presets.forEach(function (x) { if (x[0] !== i) mark(x[0], x[1]); });
      }
      var ok = !validate(q, answers[q.id]) && !(answers[q.id] === undefined || answers[q.id] === '' || (Array.isArray(answers[q.id]) && !answers[q.id].length));
      if (ok) {
        if (i + 1 > cur.step) cur.step = i + 1;
        if (!answered[q.id]) { answered[q.id] = 1; ev('answer', { qi: i, qid: q.id }); }
      }
    }

    qs.forEach(function (q, i) {
      var id = 'lf-' + q.id, box = el('div', { class: 'lf-q lf-type-' + q.type });
      var head = el(q.type === 'multi_choice' || q.type === 'choice' || q.type === 'consent' ? 'p' : 'label', { class: 'lf-t', text: q.title + (q.required ? '' : ' (선택)') });
      if (head.tagName === 'LABEL') head.setAttribute('for', id);
      box.appendChild(head);
      var err = el('p', { class: 'lf-err', id: id + '-err', role: 'alert' });
      if (q.type === 'multi_choice' || q.type === 'choice') {
        if (q.description) box.appendChild(el('p', { class: 'lf-d', text: q.description }));
        var wrap = el('div', { class: 'lf-opts', role: q.type === 'choice' ? 'radiogroup' : 'group' });
        answers[q.id] = q.type === 'choice' ? '' : [];
        (q.options || []).forEach(function (o, oi) {
          var inp = el('input', { type: q.type === 'choice' ? 'radio' : 'checkbox', name: id, id: id + '-' + oi, value: o.label });
          if (S ? o.label === want : (book && norm(o.label) === norm(book))) { inp.checked = true; }
          var lab = el('label', { class: 'lf-opt', for: id + '-' + oi }, [inp, el('span', { text: o.label })]);
          inp.addEventListener('change', function () {
            if (q.type === 'choice') answers[q.id] = inp.value;
            else answers[q.id] = Array.prototype.filter.call(wrap.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return x.value; });
            err.textContent = ''; mark(i, q);
          });
          wrap.appendChild(lab);
        });
        box.appendChild(wrap);
        var pre = Array.prototype.filter.call(wrap.querySelectorAll('input'), function (x) { return x.checked; }).map(function (x) { return x.value; });
        if (pre.length) { answers[q.id] = q.type === 'choice' ? pre[0] : pre; presets.push([i, q]); }
      } else if (q.type === 'consent') {
        if (q.description) box.appendChild(el('div', { class: 'lf-terms', tabindex: '0', text: q.description }));
        var cb = el('input', { type: 'checkbox', id: id });
        cb.addEventListener('change', function () { answers[q.id] = cb.checked ? true : undefined; err.textContent = ''; mark(i, q); });
        box.appendChild(el('label', { class: 'lf-agree', for: id }, [cb, el('span', { text: '동의합니다' })]));
      } else if (q.type === 'statement') {
        if (q.description) box.appendChild(el('p', { class: 'lf-d', text: q.description }));
      } else {
        var multi = q.type === 'long_text';
        var pre0 = (q.id === 'q_mycoin' && coinName) ? coinName : '';
        var input = el(multi ? 'textarea' : 'input', {
          id: id, name: q.id, 'aria-describedby': id + '-err',
          type: multi ? null : (q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'),
          inputmode: q.type === 'phone' ? 'numeric' : null,
          autocomplete: q.type === 'phone' ? 'tel' : (q.id === 'q_first' || /성함|이름/.test(q.title)) ? 'name' : 'off',
          placeholder: q.type === 'phone' ? '010-0000-0000' : (q.description || ''),
          maxlength: multi ? '2000' : '100',
          value: pre0 || null
        });
        if (pre0) answers[q.id] = pre0;
        input.addEventListener('input', function () {
          if (q.type === 'phone') input.value = fmtPhone(input.value);
          answers[q.id] = input.value.trim();
          err.textContent = '';
        });
        input.addEventListener('blur', function () { if (answers[q.id]) mark(i, q); });
        box.appendChild(input);
      }
      box.appendChild(err);
      form.appendChild(box);
    });

    var status = el('p', { class: 'lf-status', role: 'status' });
    var btn = el('button', { type: 'submit', class: 'lf-submit', text: (f.intro && f.intro.button && f.intro.button !== '시작') ? f.intro.button : '신청하기' });
    form.appendChild(btn);
    form.appendChild(status);
    /* ⛔2026-09-14 "신청 페이지에서 따로 하기"는 보내기에 실패했을 때만 보인다 — 신청 양식 서버의 옛 제목·선택지(사이트 전용 정의 전)가 평소엔 보이지 않게 */
    var alt = el('p', { class: 'lf-alt', hidden: '' }, [el('a', { href: link.href, target: '_blank', rel: 'noopener nofollow', text: '신청 페이지에서 따로 하기' })]);
    form.appendChild(alt);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = null;
      qs.forEach(function (q) {
        var m = validate(q, answers[q.id]), box = form.querySelector('#lf-' + q.id + '-err');
        if (box) box.textContent = m || '';
        if (m && !first) first = q;
      });
      if (first) {
        var target = form.querySelector('#lf-' + first.id) || form.querySelector('[name="lf-' + first.id + '"]');
        if (target) target.focus();
        status.textContent = '빠진 칸을 채워 주세요.';
        ev('invalid', { qid: first.id });
        return;
      }
      btn.disabled = true; btn.textContent = '보내는 중…'; status.textContent = '';
      var clean = {};
      qs.forEach(function (q) { if (q.type !== 'statement' && answers[q.id] !== undefined) clean[q.id] = answers[q.id]; });
      fetch('/admin/lead', {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pv: cur.pv, slug: cur.slug, fsid: cur.fsid, place: cur.place, p: location.pathname, t: document.title.slice(0, 140),
          utm: cur.utm, answers: clean, dur: Math.round((Date.now() - cur.t0) / 1000), hp: hp.value, book: cur.book || '' })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'fail');
        cur.done = true;
        var outro = (f.outro_plain && !answers.q_mycoin) ? f.outro_plain : (f.outro || {});   // 코인을 안 적었으면 "남겨 주신 코인을…"을 쓰지 않는다
        form.replaceWith(el('div', { class: 'lf-done' }, [
          el('p', { class: 'lf-done-t', text: outro.title || '신청이 끝났습니다' }),
          el('p', { class: 'lf-d', text: outro.description || '' }),
          el('button', { type: 'button', class: 'lf-submit', text: '닫기' })
        ]));
        dlg.querySelector('.lf-done .lf-submit').addEventListener('click', function () { dlg.close(); });
      }).catch(function (x) {
        btn.disabled = false; btn.textContent = '다시 보내기'; alt.hidden = false;
        status.textContent = (x && x.message && x.message !== 'fail' && x.message.length < 80) ? x.message : '보내지 못했습니다. 잠시 뒤 다시 누르거나 아래 신청 페이지에서 해 주세요.';
      });
    });
    return form;
  }

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = el('dialog', { class: 'lf', 'aria-labelledby': 'lf-title' }, [
      el('div', { class: 'lf-top' }, [
        el('div', {}, [el('p', { class: 'lf-eyebrow', text: '' }), el('h2', { id: 'lf-title', text: '' })]),
        el('button', { type: 'button', class: 'lf-x', 'aria-label': '닫기', text: '×' })
      ]),
      el('div', { class: 'lf-body' })
    ]);
    document.body.appendChild(dlg);
    dlg.querySelector('.lf-x').addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {
      if (cur && !cur.done) ev('abandon');
      cur = null;
      document.documentElement.classList.remove('lf-open');
    });
    window.addEventListener('pagehide', function () { if (cur && !cur.done) ev('abandon'); });
    return dlg;
  }

  function open(link, e) {
    var m = FORM.exec(link.href);
    if (!m) return;
    e.preventDefault();
    var d = ensureDialog(), slug = m[1].toLowerCase(), utm = {};
    try { new URL(link.href).searchParams.forEach(function (v, k) { if (/^utm_/.test(k)) utm[k.slice(4)] = v; }); } catch (x) {}
    var med = utm.medium || '', tail = med.split('-').pop();
    cur = { slug: slug, fsid: rid(), pv: (window.__pt && window.__pt.pv) || '', utm: utm, t0: Date.now(), step: 0, done: false,
      place: /^(top|float|hook|argue|bottom|foot)$/.test(tail) ? tail : 'bottom' };
    var body = d.querySelector('.lf-body');
    body.textContent = '';
    body.appendChild(el('p', { class: 'lf-d', text: '신청 창을 불러오는 중…' }));
    d.querySelector('#lf-title').textContent = '신청';
    d.querySelector('.lf-eyebrow').textContent = '';
    document.documentElement.classList.add('lf-open');
    d.showModal();
    ev('open');
    var mine = cur;
    (defs[slug] ? Promise.resolve(defs[slug]) : fetch('/admin/f/' + slug, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('def ' + r.status);
      return r.json();
    })).then(function (def) {
      if (!def || !def.form || !def.form.questions) throw new Error('def');
      defs[slug] = def;
      if (cur !== mine) return;
      var title = String((def.form.intro && def.form.intro.title) || def.form.title || '신청').replace(/\s*\n\s*/g, ' '), eyebrow = def.form.eyebrow || '';
      var bookText = (link.textContent || '').replace(/\s+/g, ' ').trim();
      var S = def.form.simple;
      if (S) {
        /* 09-15 단순 신청 창 — 상담 버튼이면 제목 "무료 1:1 상담", 책 버튼이면 그 책(『…』 무료로 받기) */
        cur.talk = isTalk(campOf(link.href), S);
        cur.book = pageBook(link, S);
        title = cur.talk ? S.talk : (bookText.indexOf('『') === 0 ? (bookText.indexOf('무료') < 0 ? bookText + ' 무료로 받기' : bookText) : S.book);
        eyebrow = '';
      } else {
        /* 책 버튼으로 열면 제목도 그 책으로(09-14 회의론자 심사: 『주식의 기본기』 제6장을 눌렀는데 "선별 종목 받아 보기"가 떴다)
           제안 선택지 = 사이트 정의의 첫 선택지(o_site0 · 관리 워커 LOCAL_DEFS) · 그 밖의 campaign = 책 이름 */
        var q0 = def.form.questions.filter(function (q) { return q.type === 'multi_choice'; })[0];
        var offer = q0 && q0.options && q0.options[0] && q0.options[0].id === 'o_site0' ? q0.options[0].label : '';
        if (offer && utm.campaign && String(utm.campaign).replace(/-/g, ' ') !== offer && bookText.indexOf('『') === 0) {
          title = bookText.indexOf('무료') < 0 ? bookText + ' 무료로 받기' : bookText;
          eyebrow = '';
        }
      }
      d.querySelector('#lf-title').textContent = title;
      d.querySelector('.lf-eyebrow').textContent = eyebrow;
      body.textContent = '';
      body.appendChild(build(def, link));
      var firstInput = body.querySelector('input:not(.lf-hp), textarea');
      if (firstInput && window.matchMedia && matchMedia('(pointer:fine)').matches) firstInput.focus({ preventScroll: true });
    }).catch(function () {
      if (cur !== mine) return;
      body.textContent = '';
      body.appendChild(el('p', { class: 'lf-d', text: '신청 창을 불러오지 못했습니다. 아래 버튼으로 신청 페이지에서 계속해 주세요.' }));
      body.appendChild(el('p', {}, [el('a', { class: 'lf-submit', href: link.href, target: '_blank', rel: 'noopener nofollow', text: '신청 페이지 열기' })]));
      ev('def_fail');
    });
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && FORM.test(a.href)) open(a, e);
  });

  /* ══ 페이지에 펼친 번호 칸 (★2026-09-15 CTA 통합 구성 `CTA_통합구성_정본_20260915.md` §4 · partials/cta/qform.html) ══════════
     첫 화면(hook) · 본문 끝(bottom) · 화면 아래 띠(float) 세 곳이 같은 코드를 쓴다.
     · 정의(칸 id·동의 글)는 창과 같은 /admin/f/<슬러그>(5분 기억)를 **처음 손댈 때** 한 번 부른다 — 페이지뷰마다 부르지 않는다(워커 무료 한도).
     · 제출은 창과 같은 /admin/lead · 보던 책(data-book)·종목(data-subject)은 book·subject 로 보낸다(텔레그램·저장 답에만).
     · 단계 기록 /admin/fe = start(첫 손댐) · answer(칸 채움) · invalid · abandon(채우다 떠남) — 창의 open 은 없다(펼쳐져 있으니).
     · 신청이 끝나면 이 페이지의 다른 번호 칸·아래 띠를 모두 "신청이 끝났습니다"로 바꾼다 · 고르지 않은 쪽은 한 번 눌러 함께 받게 한다(add). */
  var qforms = Array.prototype.slice.call(document.querySelectorAll('form.qf'));
  if (!qforms.length) return;
  var TALK = '무료 1:1 상담', BOOK = '무료 책 받기';
  var qdefs = {}, sentOnce = null;
  function qdef(slug) {
    if (!qdefs[slug]) qdefs[slug] = fetch('/admin/f/' + slug, { credentials: 'omit' }).then(function (r) {
      if (!r.ok) throw new Error('def ' + r.status);
      return r.json();
    }).then(function (d) { if (!d || !d.form || !d.form.questions) throw new Error('def'); return d; })
      .catch(function (e) { qdefs[slug] = null; throw e; });
    return qdefs[slug];
  }
  function utmOf(href) {
    var u = {};
    try { new URL(href).searchParams.forEach(function (v, k) { if (/^utm_/.test(k)) u[k.slice(4)] = v; }); } catch (e) {}
    return u;
  }
  function qfe(st, name, extra) {
    var o = { pv: (window.__pt && window.__pt.pv) || '', slug: st.slug, fsid: st.fsid, e: name, place: st.place, p: location.pathname, utm: st.utm, step: st.step };
    for (var k in extra || {}) o[k] = extra[k];
    beacon('/admin/fe', o);
  }
  function doneHtml(fm, chosen) {
    var other = chosen.length === 1 ? (chosen[0] === TALK ? BOOK : TALK) : '';
    var box = el('div', { class: 'qf-done', role: 'status' }, [
      el('p', { class: 'qf-done-t', text: '신청이 끝났습니다' }),
      el('p', { class: 'qf-done-d', text: '남겨 주신 번호로 연락드리겠습니다.' })
    ]);
    if (other && sentOnce) {
      var b = el('button', { type: 'button', class: 'qf-add', text: other === TALK ? '무료 1:1 상담도 함께 받기' : '무료 책도 함께 받기' });
      b.addEventListener('click', function () {
        b.disabled = true; b.textContent = '보내는 중…';
        submitQuick(sentOnce.st, [other], sentOnce.phone, sentOnce.name, true).then(function () {
          document.querySelectorAll('.qf-add').forEach(function (x) { x.replaceWith(el('p', { class: 'qf-done-d', text: (other === TALK ? '무료 1:1 상담' : '무료 책') + '도 함께 신청했습니다.' })); });
        }).catch(function () { b.disabled = false; b.textContent = '다시 누르기'; });
      });
      box.appendChild(b);
    }
    return box;
  }
  function markAllDone(chosen) {
    document.documentElement.classList.add('qf-sent');
    qforms.forEach(function (f) {
      if (f.__done) return;
      f.__done = true;
      if (f.__st && f.__st.started && !f.__st.sent) f.__st.sent = true;   // 다른 칸에서 끝났으면 "떠남"으로 세지 않는다
      f.replaceWith(doneHtml(f, chosen));
    });
    var bar = document.querySelector('.qbar');
    if (bar) bar.hidden = true;
  }
  function submitQuick(st, chosen, phone, name, add) {
    return qdef(st.slug).then(function (def) {
      var qs = def.form.questions, ans = {};
      var qc = qs.filter(function (q) { return q.type === 'multi_choice'; })[0];
      var qp = qs.filter(function (q) { return q.type === 'phone'; })[0];
      var qn = qs.filter(function (q) { return q.type === 'short_text'; })[0];
      var qa = qs.filter(function (q) { return q.type === 'consent'; });
      if (!qc || !qp || !qn || !qa.length) throw new Error('def shape');
      ans[qc.id] = chosen; ans[qp.id] = phone; ans[qn.id] = name;
      qa.forEach(function (q) { ans[q.id] = true; });
      return fetch('/admin/lead', {
        method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pv: (window.__pt && window.__pt.pv) || '', slug: st.slug, fsid: add ? rid() : st.fsid, place: st.place, p: location.pathname,
          t: document.title.slice(0, 140), utm: st.utm, answers: ans, dur: Math.round((Date.now() - (st.t0 || Date.now())) / 1000), hp: st.hp.value,
          book: st.book, subject: st.subject, add: add ? 1 : 0 })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'fail');
        return j;
      });
    });
  }
  function termsText(def) {
    var qa = def.form.questions.filter(function (q) { return q.type === 'consent'; });
    return qa.map(function (q) { return q.description || ''; }).join('\n\n');
  }

  qforms.forEach(function (fm) {
    var st = { slug: fm.getAttribute('data-slug'), place: fm.getAttribute('data-place'), utm: utmOf(fm.getAttribute('data-href') || ''),
      book: fm.getAttribute('data-book') || '', subject: fm.getAttribute('data-subject') || '', fsid: rid(), step: 0, started: false, sent: false,
      hp: fm.querySelector('.lf-hp') };
    fm.__st = st;
    if (st.place === 'float') {   // 펼친 띠를 다시 접는 단추(휴대폰은 Esc 가 없다)
      var x = el('button', { type: 'button', class: 'qbar-x', 'aria-label': '접기', text: '×' });
      x.addEventListener('click', function () { fm.closest('.qbar').classList.remove('open'); if (document.activeElement) document.activeElement.blur(); });
      fm.insertBefore(x, fm.firstChild);
    }
    var phone = fm.querySelector('input[name="phone"]'), name = fm.querySelector('input[name="name"]'), agree = fm.querySelector('input[name="agree"]');
    var status = fm.querySelector('.qf-status'), go = fm.querySelector('.qf-go'), terms = fm.querySelector('.qf-terms'), tbtn = fm.querySelector('.qf-terms-btn');
    function begin() {
      if (st.started) return;
      st.started = true; st.t0 = Date.now();
      qfe(st, 'start');
      qdef(st.slug).catch(function () {});   // 미리 불러 둔다(제출이 빨라지게)
    }
    fm.addEventListener('focusin', function () {
      begin();
      if (st.place === 'float') fm.closest('.qbar').classList.add('open');
    });
    fm.addEventListener('change', begin);
    phone.addEventListener('input', function () { phone.value = fmtPhone(phone.value); status.textContent = ''; });
    phone.addEventListener('blur', function () { if (/^01[016789]-\d{3,4}-\d{4}$/.test(phone.value) && st.step < 2) { st.step = 2; qfe(st, 'answer', { qi: 1 }); } });
    name.addEventListener('blur', function () { if (name.value.trim() && st.step < 3) { st.step = 3; qfe(st, 'answer', { qi: 2 }); } });
    tbtn.addEventListener('click', function () {
      var open = terms.hidden;
      tbtn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (!open) { terms.hidden = true; return; }
      terms.hidden = false;
      if (!terms.textContent) {
        terms.textContent = '불러오는 중…';
        qdef(st.slug).then(function (d) { terms.textContent = termsText(d); }).catch(function () { terms.textContent = '안내를 불러오지 못했습니다. 잠시 뒤 다시 눌러 주세요.'; });
      }
    });
    fm.addEventListener('submit', function (e) {
      e.preventDefault();
      begin();
      var chosen = Array.prototype.filter.call(fm.querySelectorAll('input[name="o"]'), function (x) { return x.checked; }).map(function (x) { return x.value; });
      var ph = fmtPhone(phone.value), nm = name.value.trim(), miss = null;
      if (!chosen.length) miss = ['받고 싶은 것을 하나 이상 골라 주세요.', fm.querySelector('input[name="o"]')];
      else if (!/^01[016789]-\d{3,4}-\d{4}$/.test(ph)) miss = ['휴대폰 번호를 확인해 주세요 (예: 010-1234-5678)', phone];
      else if (!nm) miss = ['이름을 적어 주세요.', name];
      else if (!agree.checked) miss = ['동의에 체크해 주세요.', agree];
      if (miss) {
        if (st.place === 'float') fm.closest('.qbar').classList.add('open');
        status.textContent = miss[0]; miss[1].focus();
        qfe(st, 'invalid', { qid: miss[1].name || '' });
        return;
      }
      go.disabled = true; var label = go.textContent; go.textContent = '보내는 중…'; status.textContent = '';
      submitQuick(st, chosen, ph, nm, false).then(function () {
        st.sent = true;
        sentOnce = { st: st, phone: ph, name: nm };
        markAllDone(chosen);
      }).catch(function (x) {
        go.disabled = false; go.textContent = label;
        status.textContent = (x && x.message && x.message !== 'fail' && x.message.length < 80 && !/^def/.test(x.message)) ? x.message : '보내지 못했습니다. 잠시 뒤 다시 눌러 주세요.';
      });
    });
  });
  window.addEventListener('pagehide', function () {
    qforms.forEach(function (f) { var st = f.__st; if (st && st.started && !st.sent) { st.sent = true; qfe(st, 'abandon'); } });
  });

  /* 화면 아래 신청 띠 — 페이지의 번호 칸(첫 화면·본문 끝)이 하나라도 화면에 보이면 숨기고, 안 보이면 띄운다 */
  var bar = document.querySelector('.qbar');
  var inPage = qforms.filter(function (f) { return f.getAttribute('data-place') !== 'float'; });
  if (bar && 'IntersectionObserver' in window) {
    var onScreen = new Set(), past = false;
    var bio = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (en.isIntersecting) onScreen.add(en.target); else onScreen.delete(en.target);
        if (!en.isIntersecting && en.boundingClientRect.bottom < 0) past = true;
      });
      if (document.documentElement.classList.contains('qf-sent')) { bar.hidden = true; return; }
      if (bar.classList.contains('open')) return;
      bar.hidden = onScreen.size > 0 || (!past && window.scrollY < 300);
    });
    inPage.forEach(function (f) { bio.observe(f); });
    window.addEventListener('scroll', function () {
      if (document.documentElement.classList.contains('qf-sent') || bar.classList.contains('open')) return;
      if (onScreen.size === 0 && window.scrollY >= 300) bar.hidden = false;
    }, { passive: true });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') bar.classList.remove('open'); });
  }
})();
