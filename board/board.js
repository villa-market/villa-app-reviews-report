/* Villa reviews — triage inbox.
   Every number and every word on screen comes from ../data/reviews.json.
   Nothing here posts to the App Store or Play Store: replies are drafts only. */
(function () {
  'use strict';

  var DATA_URL = '../data/reviews.json';
  var QUEUES = ['need-reply', 'fix', 'all', 'overview'];
  var MOBILE = window.matchMedia('(max-width: 899px)');

  /* -------------------------------------------------------- fix mapping
     Reviews carry issue_tag, never a fix id (fix is null across the file),
     so map text -> issue #1-#6. Only reviews that are fix-tagged or rated
     3 stars and under are eligible, so praise never links to a bug. */
  var FIX_RULES = [
    { n: 2, re: /developer\s*(mode|option)|dev\s*mode|นักพัฒนา/i },
    { n: 3, re: /\botp\b|verification code|verify (my )?(phone|e-?mail|number)|log ?in|login|logged? in|sign ?in|sign ?up|password|เข้าสู่ระบบ|รหัสผ่าน|ลงทะเบียน/i },
    { n: 5, re: /check ?out|payment|paying|paid|\bpay\b|card details|save .{0,14}card|credit card|wallet|ชำระเงิน|จ่ายเงิน/i },
    { n: 4, re: /out of stock|\bstock\b|\bcart\b|\bbasket\b|\bbranch\b|different store|another store|change(d|s)? .{0,12}store|force[sd]? .{0,18}store|สาขา|ของหมด/i },
    { n: 6, re: /track(ing|er)?\b|where is my order|order status|ติดตาม/i },
    { n: 1, re: /splash|crash|freez|hang|white screen|black screen|stuck on|(won'?t|will not|doesn'?t|does not|cannot|can'?t|never) (open|start|load|launch|work)|keeps? closing|โหลดค้าง|เปิดไม่ได้/i }
  ];
  var TAG_FIX = { checkout: 5, stock: 4, delivery: 6, bug: 1 };

  function fixFor(r) {
    if (r.issue_tag === 'other' && r.stars > 3) return null;
    var hay = (r.title || '') + ' ' + (r.body || '');
    for (var i = 0; i < FIX_RULES.length; i++) {
      if (FIX_RULES[i].re.test(hay)) return FIX_RULES[i].n;
    }
    return TAG_FIX[r.issue_tag] || null;
  }

  /* --------------------------------------------------------------- state */
  var META = {}, REVIEWS = [], FIXES = {}, GENERATED = '';
  var state = { queue: 'need-reply', platform: 'all', country: 'all', stars: 'all', q: '' };
  var selectedId = null;
  var visible = [];

  /* ------------------------------------------------------------- helpers */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(n) {
    return (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('en-US');
  }
  function plural(n, one, many) { return num(n) + ' ' + (Number(n) === 1 ? one : many); }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso || '');
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }
  function starsHtml(n, big) {
    n = Number(n) || 0;
    var out = '<span class="stars' + (big ? ' big' : '') + '" role="img" aria-label="' + n + ' out of 5 stars">';
    for (var i = 1; i <= 5; i++) out += i <= n ? '★' : '<i>★</i>';
    return out + '</span>';
  }
  function icon(path, size) {
    return '<svg viewBox="0 0 24 24" width="' + (size || 22) + '" height="' + (size || 22) +
      '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" ' +
      'stroke-linejoin="round" aria-hidden="true" focusable="false">' + path + '</svg>';
  }
  var I_INBOX = '<path d="M3 12h5l2 3h4l2-3h5"/><path d="M5.5 5h13l2.5 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z"/>';
  var I_ARROW = '<path d="M9 6h9v9"/><path d="M18 6 6.5 17.5"/>';

  var CNAMES = {
    ae: 'UAE', at: 'Austria', au: 'Australia', ca: 'Canada', ch: 'Switzerland',
    de: 'Germany', fr: 'France', gb: 'United Kingdom', hk: 'Hong Kong', il: 'Israel',
    in: 'India', it: 'Italy', jp: 'Japan', kr: 'South Korea', nl: 'Netherlands',
    no: 'Norway', ru: 'Russia', se: 'Sweden', sg: 'Singapore', th: 'Thailand', us: 'United States'
  };
  function cname(code) { return CNAMES[code] || String(code || '').toUpperCase(); }

  function countriesOf(r) {
    if (Array.isArray(r.countries) && r.countries.length) return r.countries;
    return String(r.country || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function platKey(r) { return String(r.platform || '').toLowerCase(); }
  function platLabel(r) { return platKey(r) === 'ios' ? 'iOS' : 'Android'; }
  function storeLabel(r) { return platKey(r) === 'ios' ? 'iOS · App Store' : 'Android · Google Play'; }

  /* Source line: platform + countries as calm text, never a wall of chips. */
  function sourceLine(r, full) {
    var cs = countriesOf(r).map(full ? cname : function (c) { return cname(c); });
    return (full ? storeLabel(r) : platLabel(r)) + ' · ' + cs.join(' & ');
  }

  function isNeedReply(r) { return r.reply_status === 'need_reply'; }
  function isFixTagged(r) { return r.issue_tag && r.issue_tag !== 'other'; }

  /* ------------------------------------------------------------ filtering */
  function inQueue(r, queue) {
    if (queue === 'need-reply') return isNeedReply(r);
    if (queue === 'fix') return isFixTagged(r);
    return true;
  }
  function passesFilters(r) {
    if (state.platform !== 'all' && platKey(r) !== state.platform) return false;
    if (state.stars !== 'all' && Number(r.stars) !== Number(state.stars)) return false;
    if (state.country !== 'all' && countriesOf(r).indexOf(state.country) === -1) return false;
    if (state.q) {
      var hay = ((r.author || '') + ' ' + (r.title || '') + ' ' + (r.body || '')).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    return true;
  }
  function filtersActive() {
    return state.platform !== 'all' || state.country !== 'all' || state.stars !== 'all' || !!state.q;
  }
  function compute() {
    visible = REVIEWS.filter(function (r) {
      return inQueue(r, state.queue) && passesFilters(r);
    });
  }

  /* ------------------------------------------------------------ list head */
  function queueCopy() {
    var need = REVIEWS.filter(isNeedReply).length;
    var fix = REVIEWS.filter(isFixTagged).length;
    if (state.queue === 'fix') {
      return ['Fix queue', plural(fix, 'review', 'reviews') + ' tagged to a shipped fix issue, #1 to #6. ' +
        'Open the issue from the review to follow the engineering thread.'];
    }
    if (state.queue === 'all') {
      return ['All reviews', plural(REVIEWS.length, 'review', 'reviews') + ' across every storefront in the scrape. ' +
        esc(META.sample_note || '')];
    }
    return ['Need reply', plural(need, 'review', 'reviews') + ' waiting on a public answer — each one already has a ' +
      'drafted reply ready to copy. Nothing has been sent yet.'];
  }

  /* ------------------------------------------------------------- list */
  function renderList() {
    var box = el('list');
    var copy = queueCopy();
    el('listTitle').textContent = copy[0];
    el('listSub').innerHTML = copy[1];

    var pool = REVIEWS.filter(function (r) { return inQueue(r, state.queue); }).length;
    el('resultCount').textContent = visible.length === pool
      ? plural(visible.length, 'review', 'reviews')
      : num(visible.length) + ' of ' + num(pool) + ' reviews';
    el('clearFilters').hidden = !filtersActive();

    if (!visible.length) {
      box.innerHTML = emptyHtml('No reviews match these filters',
        'Try another platform, country or rating — or clear the filters to see the whole queue again.');
      return;
    }

    var html = '';
    for (var i = 0; i < visible.length; i++) {
      var r = visible[i];
      var f = fixFor(r);
      var flags = '';
      if (isNeedReply(r)) {
        flags += '<span class="flag flag-need"><span class="dot" aria-hidden="true"></span>Draft ready</span>';
      }
      if (f && FIXES[f]) flags += '<span class="flag">Fix #' + f + '</span>';

      html += '<button type="button" class="card" data-id="' + esc(r.id) + '"' +
        ' aria-selected="' + (r.id === selectedId ? 'true' : 'false') + '">' +
        '<span class="card-head">' +
          '<span class="card-who">' + esc(r.author || 'Anonymous') + '</span>' +
          '<span class="card-when">' + esc(fmtDate(r.date)) + '</span>' +
        '</span>' +
        '<span class="card-rate">' + starsHtml(r.stars) +
          '<span class="card-src">' + esc(sourceLine(r, false)) + '</span>' +
        '</span>' +
        (r.title ? '<span class="card-title">' + esc(r.title) + '</span>' : '') +
        (r.body ? '<span class="card-text">' + esc(r.body) + '</span>' : '') +
        (flags ? '<span class="card-foot">' + flags + '</span>' : '') +
      '</button>';
    }
    box.innerHTML = html;
  }

  function emptyHtml(head, sub) {
    return '<div class="empty"><span class="empty-mark">' + icon(I_INBOX, 24) + '</span>' +
      '<strong>' + esc(head) + '</strong><p>' + esc(sub) + '</p></div>';
  }

  /* ------------------------------------------------------------ detail */
  function renderDetail() {
    var body = el('detailBody');
    var r = null;
    for (var i = 0; i < REVIEWS.length; i++) if (REVIEWS[i].id === selectedId) { r = REVIEWS[i]; break; }

    if (!r) {
      body.innerHTML = emptyHtml('Pick a review',
        'Choose a review on the left to read it in full, see its drafted reply and jump to the linked fix issue.');
      return;
    }

    var draft = (r.suggested_reply || '').trim();
    var who = r.author || 'Anonymous';
    /* Play reviews carry no title, so the headline falls back to the author —
       don't then repeat the author in the meta line underneath it. */
    var head = (r.title || '').trim() || who;
    var meta = [head === who ? '' : who, fmtDate(r.date), countriesOf(r).map(cname).join(' & ')]
      .filter(Boolean).join(' · ');
    var html = '<article class="dt">' +
      '<p class="eyebrow">' + esc(storeLabel(r)) + '</p>' +
      '<h2 class="dt-title">' + esc(head) + '</h2>' +
      '<p class="dt-meta">' + esc(meta) + '</p>' +
      '<p class="dt-rate">' + starsHtml(r.stars, true) +
        (isNeedReply(r) ? '<span class="flag flag-need"><span class="dot" aria-hidden="true"></span>Needs a reply</span>' : '') +
      '</p>' +
      '<p class="dt-body">' + esc(r.body) + '</p>';

    if (draft) {
      html += '<section class="panel">' +
        '<div class="panel-head">' +
          '<p class="panel-label">Suggested reply</p>' +
          '<span class="tag">Draft · not sent</span>' +
        '</div>' +
        '<p class="draft-text" id="draftText">' + esc(draft) + '</p>' +
        '<div class="panel-foot">' +
          '<button type="button" class="btn" id="copyBtn">' +
            '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">' +
            '<rect x="5.2" y="5.2" width="8" height="8" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.4"/>' +
            '<path d="M10.8 3.2a1.8 1.8 0 0 0-1.8-1.8H4.4a3 3 0 0 0-3 3v4.6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/>' +
            '</svg>Copy draft</button>' +
          '<span class="hint">Paste into App Store Connect or Play Console to publish it.</span>' +
        '</div>' +
      '</section>';
    } else {
      html += '<section class="panel">' +
        '<div class="panel-head"><p class="panel-label">Suggested reply</p></div>' +
        '<p class="panel-note">No draft written for this review. Drafts exist for the ' +
        num(META.need_reply) + ' reviews in the Need reply queue.</p>' +
      '</section>';
    }

    var f = fixFor(r);
    if (f && FIXES[f]) {
      html += '<a class="rowlink" href="' + esc(FIXES[f].url) + '" target="_blank" rel="noopener">' +
        '<span class="issue-n">Issue #' + f + '</span>' +
        '<span class="issue-t">' + esc(FIXES[f].title) + '</span>' +
        '<span class="issue-go">' + icon(I_ARROW, 16) + '</span></a>';
    }

    body.innerHTML = html + '</article>';
    body.scrollTop = 0;

    var btn = el('copyBtn');
    if (btn) btn.addEventListener('click', function () { copy(draft); });
  }

  function copy(text) {
    function done() { toast('Draft copied — nothing sent'); }
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:0;left:-9999px';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? 'Draft copied — nothing sent' : 'Copy failed — select the text manually');
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else {
      fallback();
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var t = el('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 1800);
  }

  /* ---------------------------------------------------------- overview */
  function renderOverview() {
    var ios = 0, android = 0;
    (META.platforms || []).forEach(function (p) {
      if (String(p.platform).toLowerCase() === 'ios') ios = p.count; else android = p.count;
    });
    var delta = Number(META.delta_vs_prev || 0);
    var deltaTxt = delta > 0 ? '+' + num(delta) : delta < 0 ? num(delta) : 'No change';
    var low = REVIEWS.filter(function (r) { return Number(r.stars) <= 2; }).length;

    var kpi = [
      ['Reviews written', num(META.written_total), (META.prev_label || '') + ' · ' + deltaTxt],
      ['Need reply', num(META.need_reply), num(META.suggested_replies_filled) + ' drafts ready to copy'],
      ['Store replies sent', num(META.store_replies), 'Nothing sent from this board'],
      ['Fix-tagged', num(META.fix_tagged), 'Mapped to issues #1–#6'],
      ['1–2 star reviews', num(low), 'of ' + num(META.written_total) + ' in the scrape'],
      ['iOS · Android', num(ios) + ' · ' + num(android), 'App Store and Google Play']
    ].map(function (k) {
      return '<div class="kpi"><p class="kpi-k">' + esc(k[0]) + '</p>' +
        '<p class="kpi-v">' + esc(k[1]) + '</p><p class="kpi-s">' + esc(k[2]) + '</p></div>';
    }).join('');

    var rows = (META.fixList || []).map(function (f) {
      return '<a class="rowlink" href="' + esc(f.url) + '" target="_blank" rel="noopener">' +
        '<span class="issue-n">#' + f.number + '</span>' +
        '<span class="issue-t">' + esc(f.title) + '</span>' +
        '<span class="flag">' + esc(f.platform) + '</span>' +
        '<span class="issue-go">' + icon(I_ARROW, 16) + '</span></a>';
    }).join('');

    el('overview').innerHTML = '<div class="ov">' +
      '<h2>Overview</h2>' +
      '<p class="ov-sub">Everything below is counted straight from reviews.json, generated ' +
        esc(fmtDate(GENERATED)) + '.</p>' +
      '<p class="ov-label">Totals</p><div class="kpis">' + kpi + '</div>' +
      '<p class="ov-label">Fix issues</p><div class="fixrows">' + rows + '</div>' +
      '<p class="ov-note">' + esc(META.sample_note || '') +
      ' Suggested replies are drafts held on this board; no reply has been posted to either store.</p>' +
    '</div>';
  }

  /* ------------------------------------------------------------- routing */
  function applyQueue(queue, replaceHash) {
    state.queue = QUEUES.indexOf(queue) === -1 ? 'need-reply' : queue;
    el('app').setAttribute('data-queue', state.queue);
    el('overview').hidden = state.queue !== 'overview';

    var btns = document.querySelectorAll('.q');
    for (var i = 0; i < btns.length; i++) {
      if (btns[i].getAttribute('data-queue') === state.queue) btns[i].setAttribute('aria-current', 'page');
      else btns[i].removeAttribute('aria-current');
    }
    var hash = '#' + state.queue;
    if (location.hash !== hash) {
      if (replaceHash) history.replaceState(null, '', hash);
      else location.hash = hash;
    }
    if (state.queue === 'overview') { closeSheet(); return; }
    render();
  }

  function render() {
    compute();
    if (selectedId && !visible.some(function (r) { return r.id === selectedId; })) selectedId = null;
    if (!selectedId && !MOBILE.matches && visible.length) selectedId = visible[0].id;
    renderList();
    renderDetail();
  }

  function select(id) {
    selectedId = id;
    var cards = document.querySelectorAll('.card');
    for (var i = 0; i < cards.length; i++) {
      cards[i].setAttribute('aria-selected', cards[i].getAttribute('data-id') === id ? 'true' : 'false');
    }
    renderDetail();
    if (MOBILE.matches) el('detail').classList.add('is-open');
  }
  function closeSheet() { el('detail').classList.remove('is-open'); }

  /* ---------------------------------------------------------------- boot */
  function counts() {
    el('nNeed').textContent = num(REVIEWS.filter(isNeedReply).length);
    el('nFix').textContent = num(REVIEWS.filter(isFixTagged).length);
    el('nAll').textContent = num(REVIEWS.length);
  }

  function buildCountryOptions() {
    var sel = el('fCountry');
    (META.countries || []).forEach(function (c) {
      var o = document.createElement('option');
      o.value = c.code;
      o.textContent = cname(c.code) + ' (' + c.count + ')';
      sel.appendChild(o);
    });
  }

  function wire() {
    var qs = document.querySelectorAll('.q');
    for (var i = 0; i < qs.length; i++) {
      (function (b) {
        b.addEventListener('click', function () {
          selectedId = null;
          closeSheet();
          applyQueue(b.getAttribute('data-queue'), false);
        });
      })(qs[i]);
    }

    el('list').addEventListener('click', function (e) {
      var card = e.target.closest ? e.target.closest('.card') : null;
      if (card) select(card.getAttribute('data-id'));
    });

    el('list').addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var idx = -1;
      for (var i = 0; i < visible.length; i++) if (visible[i].id === selectedId) { idx = i; break; }
      var next = e.key === 'ArrowDown' ? idx + 1 : idx - 1;
      if (next < 0 || next >= visible.length) return;
      e.preventDefault();
      select(visible[next].id);
      var card = el('list').querySelector('.card[data-id="' + visible[next].id + '"]');
      if (card) { card.focus(); card.scrollIntoView({ block: 'nearest' }); }
    });

    el('backBtn').addEventListener('click', closeSheet);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && MOBILE.matches) closeSheet();
    });

    var t = null;
    el('fSearch').addEventListener('input', function (e) {
      var v = e.target.value.trim().toLowerCase();
      clearTimeout(t);
      t = setTimeout(function () { state.q = v; render(); }, 120);
    });
    ['fPlatform', 'fCountry', 'fStars'].forEach(function (id) {
      el(id).addEventListener('change', function (e) {
        state[id === 'fPlatform' ? 'platform' : id === 'fCountry' ? 'country' : 'stars'] = e.target.value;
        render();
      });
    });
    el('clearFilters').addEventListener('click', function () {
      state.platform = state.country = state.stars = 'all';
      state.q = '';
      el('fSearch').value = '';
      el('fPlatform').value = el('fCountry').value = el('fStars').value = 'all';
      render();
    });

    window.addEventListener('hashchange', function () {
      applyQueue(location.hash.replace('#', ''), true);
    });
    MOBILE.addEventListener('change', function () { render(); });
  }

  fetch(DATA_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (data) {
      META = data.meta || {};
      GENERATED = data.generated_at || '';
      META.fixList = data.fix || [];
      META.fixList.forEach(function (f) { FIXES[f.number] = f; });

      REVIEWS = (data.reviews || []).slice().sort(function (a, b) {
        return new Date(b.date) - new Date(a.date);
      });

      el('hdrMeta').textContent = 'Updated ' + fmtDate(GENERATED) + ' · ' +
        num(META.written_total) + ' reviews · ' + num(META.need_reply) + ' need a reply';

      counts();
      buildCountryOptions();
      wire();
      renderOverview();

      var start = location.hash.replace('#', '');
      applyQueue(QUEUES.indexOf(start) === -1 ? 'need-reply' : start, true);
    })
    .catch(function (err) {
      el('hdrMeta').textContent = 'Could not load reviews';
      el('listSub').textContent = '';
      el('list').innerHTML = emptyHtml('Could not load reviews.json',
        String(err.message || err) + '. Serve this folder over http rather than opening the file directly.');
    });
})();
