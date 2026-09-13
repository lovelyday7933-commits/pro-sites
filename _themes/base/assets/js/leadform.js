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
    var book = '';
    try { book = decodeURIComponent((/[?&]utm_campaign=([^&]+)/.exec(link.href) || [])[1] || '').replace(/-/g, ' '); } catch (e) {}

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
          if (book && norm(o.label) === norm(book)) { inp.checked = true; }
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
        var input = el(multi ? 'textarea' : 'input', {
          id: id, name: q.id, 'aria-describedby': id + '-err',
          type: multi ? null : (q.type === 'phone' ? 'tel' : q.type === 'email' ? 'email' : q.type === 'number' ? 'number' : q.type === 'date' ? 'date' : 'text'),
          inputmode: q.type === 'phone' ? 'numeric' : null,
          autocomplete: q.type === 'phone' ? 'tel' : (q.id === 'q_first' || /성함|이름/.test(q.title)) ? 'name' : 'off',
          placeholder: q.type === 'phone' ? '010-0000-0000' : (q.description || ''),
          maxlength: multi ? '2000' : '100'
        });
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
    var btn = el('button', { type: 'submit', class: 'lf-submit', text: (f.intro && f.intro.button && f.intro.button !== '시작') ? f.intro.button : '무료로 신청하기' });
    form.appendChild(btn);
    form.appendChild(status);
    form.appendChild(el('p', { class: 'lf-alt' }, [el('a', { href: link.href, target: '_blank', rel: 'noopener nofollow', text: '신청 페이지에서 따로 하기' })]));

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
          utm: cur.utm, answers: clean, dur: Math.round((Date.now() - cur.t0) / 1000), hp: hp.value })
      }).then(function (r) { return r.json(); }).then(function (j) {
        if (!j || !j.ok) throw new Error((j && j.error) || 'fail');
        cur.done = true;
        form.replaceWith(el('div', { class: 'lf-done' }, [
          el('p', { class: 'lf-done-t', text: (f.outro && f.outro.title) || '신청이 끝났습니다' }),
          el('p', { class: 'lf-d', text: (f.outro && f.outro.description) || '' }),
          el('button', { type: 'button', class: 'lf-submit', text: '닫기' })
        ]));
        dlg.querySelector('.lf-done .lf-submit').addEventListener('click', function () { dlg.close(); });
      }).catch(function (x) {
        btn.disabled = false; btn.textContent = '다시 보내기';
        status.textContent = (x && x.message && x.message !== 'fail' && x.message.length < 80) ? x.message : '보내지 못했습니다. 잠시 뒤 다시 누르거나 아래 신청 페이지에서 해 주세요.';
      });
    });
    return form;
  }

  function ensureDialog() {
    if (dlg) return dlg;
    dlg = el('dialog', { class: 'lf', 'aria-labelledby': 'lf-title' }, [
      el('div', { class: 'lf-top' }, [
        el('div', {}, [el('p', { class: 'lf-eyebrow', text: '무료 자료 신청' }), el('h2', { id: 'lf-title', text: '' })]),
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
      place: /^(top|float|intro|inline|foot)$/.test(tail) ? tail : 'bottom' };
    var body = d.querySelector('.lf-body');
    body.textContent = '';
    body.appendChild(el('p', { class: 'lf-d', text: '신청 창을 불러오는 중…' }));
    d.querySelector('#lf-title').textContent = '자료 신청';
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
      d.querySelector('#lf-title').textContent = String((def.form.intro && def.form.intro.title) || def.form.title || '자료 신청').replace(/\s*\n\s*/g, ' ');
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
})();
