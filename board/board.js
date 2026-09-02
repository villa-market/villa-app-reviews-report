/* Villa Market — shopper-app review board.
   Everything on screen comes from ../data/reviews.json. No derived estimates. */
(function () {
  'use strict';

  var DATA_URL = '../data/reviews.json';
  var REPO_ISSUES = 'https://github.com/villa-market/villa-app-reviews-report/issues/';
  var DESKTOP = window.matchMedia('(min-width: 1024px)');

  /* ---------------------------------------------------------- fix mapping
     Reviews carry an issue_tag, not an issue number. Map each review to at
     most one fix issue: first by review text, then by tag. No match -> we show
     the raw issue_tag and link nothing. */
  var FIX_RULES = [
    { n: 2, re: /developer\s*(mode|option)|dev\s*mode|นักพัฒนา/i },
    { n: 3, re: /\botp\b|otop|verification code|verify (my )?(phone|e-?mail)|log ?in|login|sign ?up|sign ?in|password|new account|ลงทะเบียน|เข้าสู่ระบบ|รหัสผ่าน/i },
    { n: 5, re: /checkout|payment|paying|card details|save .{0,14}card|wallet|ชำระเงิน/i },
    { n: 4, re: /out of stock|\bcart\b|\bbranch\b|\bbrach\b|different store|another store|force[sd]? .{0,18}store|ของสด|สาขา|สั่งไม่ได้/i },
    { n: 1, re: /\b(won'?t|doesn'?t|does not|cannot|can'?t|not|never|no)\s+(start|open|work|load|launch)|white scr|freez|crash|hang|stops working|forever to open|broken|โหลดค้าง|หน้าแรก|går inte öppna/i }
  ];
  var TAG_TO_FIX = { checkout: 5, stock: 4 };

  function fixFor(r) {
    var hay = (r.body || '') + ' ' + (r.title || '');
    for (var i = 0; i < FIX_RULES.length; i++) {
      if (FIX_RULES[i].re.test(hay)) return FIX_RULES[i].n;
    }
    return TAG_TO_FIX[r.issue_tag] || null;
  }

  /* ---------------------------------------------------------- state */
  var DATA = null, REVIEWS = [], FIXES = [], FIXBY = {};
  var state = {
    tab: 'overview',
    platform: 'all',
    countries: [],          // OR-matched
    stars: [],              // OR-matched, empty = all
    status: 'all',          // all | need_reply | replied | fix_tagged
    q: ''
  };

  /* ---------------------------------------------------------- helpers */
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function num(n) { return (n == null || isNaN(n)) ? '–' : Number(n).toLocaleString('en-US'); }

  var MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  function fmtDate(iso, withYear) {
    var p = String(iso || '').split('-');
    if (p.length !== 3) return esc(iso);
    return Number(p[2]) + ' ' + MONTHS[Number(p[1]) - 1] + (withYear ? ' ' + p[0] : '');
  }
  function truncate(s, n) {
    s = String(s || '').replace(/\s+/g, ' ').trim();
    return s.length > n ? s.slice(0, n - 1).replace(/[\s,.;:—-]+$/, '') + '…' : s;
  }
  function starHtml(n) {
    n = Number(n) || 0;
    var on = '', off = '';
    for (var i = 0; i < 5; i++) { (i < n ? (on += '★') : (off += '★')); }
    return '<span class="stars">' + on + '<span class="off">' + off + '</span></span>' +
           '<span class="starnum">' + n + '</span>';
  }
  function platClass(p) { return /ios/i.test(p) ? 'ios' : 'android'; }
  function countriesOf(r) {
    if (Array.isArray(r.countries) && r.countries.length) return r.countries;
    return String(r.country || '').split(',').map(function (c) { return c.trim(); }).filter(Boolean);
  }

  /* ---------------------------------------------------------- filtering */
  function isNeedReply(r) { return r.reply_status === 'need_reply'; }
  function isReplied(r) { return r.has_developer_reply === true || r.reply_status === 'replied' || r.reply_status === 'answered'; }
  function isFixTagged(r) { return r.issue_tag && r.issue_tag !== 'other'; }

  function passes(r) {
    if (state.platform !== 'all' && platClass(r.platform) !== state.platform) return false;

    if (state.countries.length) {
      var cs = countriesOf(r), hit = false;
      for (var i = 0; i < cs.length; i++) { if (state.countries.indexOf(cs[i]) !== -1) { hit = true; break; } }
      if (!hit) return false;
    }

    if (state.stars.length && state.stars.indexOf(Number(r.stars)) === -1) return false;

    if (state.status === 'need_reply' && !isNeedReply(r)) return false;
    if (state.status === 'replied' && !isReplied(r)) return false;
    if (state.status === 'fix_tagged' && !isFixTagged(r)) return false;

    if (state.q) {
      var hay = ((r.author || '') + ' ' + (r.title || '') + ' ' + (r.body || '')).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    return true;
  }

  function filtered(extra) {
    return REVIEWS.filter(function (r) { return passes(r) && (!extra || extra(r)); });
  }
  function filtersActive() {
    return state.platform !== 'all' || state.countries.length > 0 ||
           state.stars.length > 0 || state.status !== 'all' || state.q !== '';
  }

  /* ---------------------------------------------------------- chips */
  function chipsFor(r) {
    var out = [];
    out.push('<span class="chip plat ' + platClass(r.platform) + '">' + esc(r.platform) + '</span>');
    countriesOf(r).forEach(function (c) { out.push('<span class="chip cc">' + esc(c) + '</span>'); });
    return out.join('');
  }
  function statusChip(r) {
    if (isReplied(r)) return '<span class="chip replied">Public reply</span>';
    if (isNeedReply(r)) return '<span class="chip need">Need reply</span>';
    return '<span class="chip">' + esc(r.reply_status || '—') + '</span>';
  }
  function fixChip(r) {
    var n = r._fix;
    if (n && FIXBY[n]) {
      return '<a class="chip fix" href="' + esc(FIXBY[n].url || (REPO_ISSUES + n)) + '" target="_blank" rel="noopener">' +
             '<span class="hash">#' + n + '</span> ' + esc(FIXBY[n].title) + '</a>';
    }
    if (r.issue_tag) return '<span class="chip tag">' + esc(r.issue_tag) + '</span>';
    return '';
  }

  /* ---------------------------------------------------------- card view */
  function cardHtml(r) {
    var draft = r.suggested_reply
      ? '<details class="draft"><summary>Suggested reply</summary>' +
        '<div class="draft-body"><span class="lab">Draft — not sent</span>' + esc(r.suggested_reply) + '</div></details>'
      : '';
    return '<article class="rev' + (isNeedReply(r) ? ' hi' : '') + '">' +
      '<div class="rev-top">' + starHtml(r.stars) + chipsFor(r) +
        '<time datetime="' + esc(r.date) + '">' + fmtDate(r.date, false) + '</time></div>' +
      '<div class="rev-author">' + esc(r.author || 'Anonymous') + '</div>' +
      (r.title ? '<div class="rev-author" style="font-weight:700;font-size:13.5px">' + esc(r.title) + '</div>' : '') +
      '<p class="rev-body">' + esc(truncate(r.body, 190)) + '</p>' +
      '<div class="rev-foot">' + statusChip(r) + fixChip(r) + '</div>' +
      draft +
      '</article>';
  }
  function cardsHtml(list) {
    return '<div class="cards">' + list.map(cardHtml).join('') + '</div>';
  }

  /* ---------------------------------------------------------- table view */
  function tableHtml(list) {
    var rows = list.map(function (r, i) {
      var detailId = 'd-' + r.id;
      return '<tr class="r" data-row="' + esc(r.id) + '">' +
        '<td class="c-date">' + fmtDate(r.date, true) + '</td>' +
        '<td class="c-stars">' + starHtml(r.stars) + '</td>' +
        '<td class="c-plat"><span class="chip plat ' + platClass(r.platform) + '">' + esc(r.platform) + '</span></td>' +
        '<td class="c-cc">' + countriesOf(r).map(function (c) { return '<span class="chip cc">' + esc(c) + '</span>'; }).join(' ') + '</td>' +
        '<td class="c-author">' + esc(r.author || 'Anonymous') + '</td>' +
        '<td class="c-body">' + (r.title ? '<b>' + esc(r.title) + '</b> — ' : '') + esc(truncate(r.body, 150)) + '</td>' +
        '<td class="c-status">' + statusChip(r) + '</td>' +
        '<td class="c-fix">' + fixChip(r) + '</td>' +
        '<td class="c-more"><button type="button" class="expand" aria-expanded="false" aria-controls="' + detailId +
          '" data-toggle="' + esc(r.id) + '"><span aria-hidden="true">›</span><span class="sr">Details</span></button></td>' +
      '</tr>' +
      '<tr class="detail" id="' + detailId + '" hidden><td colspan="9"><div class="dwrap">' +
        '<div class="dcol"><h4>Full review</h4><p>' + esc(r.body || '—') + '</p></div>' +
        (r.suggested_reply ? '<div class="dcol"><h4>Suggested reply — draft, not sent</h4><p>' + esc(r.suggested_reply) + '</p></div>' : '') +
      '</div></td></tr>';
    }).join('');

    return '<div class="tablewrap"><table class="revs">' +
      '<thead><tr>' +
        '<th class="c-date">Date</th><th class="c-stars">Stars</th><th class="c-plat">Platform</th>' +
        '<th class="c-cc">Country</th><th class="c-author">Author</th><th class="c-body">Review</th>' +
        '<th class="c-status">Status</th><th class="c-fix">Fix issue</th>' +
        '<th class="c-more"><span class="sr">Details</span></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table></div>';
  }

  function listHtml(list, emptyMsg) {
    if (!list.length) {
      return '<div class="empty"><b>Nothing matches</b>' + esc(emptyMsg || 'Try clearing a filter or widening the search.') + '</div>';
    }
    return DESKTOP.matches ? tableHtml(list) : cardsHtml(list);
  }

  /* ---------------------------------------------------------- fix queue */
  function fixRowHtml(f, count) {
    var tracking = f.kind === 'tracking';
    return '<a class="fixrow' + (tracking ? ' track' : '') + '" href="' + esc(f.url || (REPO_ISSUES + f.number)) + '" target="_blank" rel="noopener">' +
      '<span class="num">#' + esc(f.number) + '</span>' +
      '<span class="fx"><span class="t">' + esc(f.title) + '</span>' +
        '<span class="m"><span class="chip">' + esc(f.platform || 'BOTH') + '</span>' +
        (tracking ? '<span class="chip tag">tracking</span>' : '') + '</span></span>' +
      (tracking ? '' : '<span class="cnt"><b>' + count + '</b><s>in sample</s></span>') +
      '<span class="chev" aria-hidden="true">›</span></a>';
  }
  function fixCounts(list) {
    var c = {};
    list.forEach(function (r) { if (r._fix) c[r._fix] = (c[r._fix] || 0) + 1; });
    return c;
  }

  /* ---------------------------------------------------------- KPIs */
  function renderOverview() {
    var m = DATA.meta || {};
    var kpis = [
      { k: 'Written reviews', v: num(m.written_total), d: (m.delta_vs_prev === 0 ? 'No change ' : (m.delta_vs_prev > 0 ? '+' + m.delta_vs_prev + ' ' : m.delta_vs_prev + ' ')) + (m.prev_label || ''), cls: '' },
      { k: 'Need reply', v: num(m.need_reply), d: 'Open, no store answer', cls: 'alert' },
      { k: 'Store replies', v: num(m.store_replies), d: num(m.answered_public) + ' answered publicly', cls: '' },
      { k: 'Fix-tagged', v: num(m.fix_tagged), d: 'Reviews pointing at a known bug', cls: '' }
    ];
    el('kpiStrip').innerHTML = kpis.map(function (x) {
      return '<div class="kpi ' + x.cls + '"><div class="k">' + esc(x.k) + '</div>' +
             '<div class="v">' + x.v + '</div><div class="d">' + esc(x.d) + '</div></div>';
    }).join('');
    el('prevLabel').textContent = m.prev_label || '';

    var ios = Number(m.written_ios) || 0, and = Number(m.written_android) || 0, tot = ios + and;
    el('kIos').textContent = num(m.written_ios);
    el('kAndroid').textContent = num(m.written_android);
    var pi = tot ? Math.round(ios / tot * 100) : 0;
    el('platBar').children[0].style.width = pi + '%';
    el('platBar').children[1].style.width = (100 - pi) + '%';
    el('pctIos').textContent = pi + '%';
    el('pctAndroid').textContent = (100 - pi) + '%';

    var counts = fixCounts(REVIEWS);
    el('fixSummary').innerHTML = FIXES.map(function (f) { return fixRowHtml(f, counts[f.number] || 0); }).join('');
    el('fixSummaryN').textContent = FIXES.length + ' issues';

    var need = REVIEWS.filter(isNeedReply).slice()
      .sort(function (a, b) { return (a.stars - b.stars) || (b.date < a.date ? -1 : 1); })
      .slice(0, 4);
    el('needPreview').innerHTML = need.map(cardHtml).join('');
    el('needPreviewN').textContent = REVIEWS.filter(isNeedReply).length + ' open';

    el('metaNote').textContent = m.note
      ? 'Note from the data file: ' + m.note
      : 'All figures read from data/reviews.json.';
  }

  /* ---------------------------------------------------------- render */
  function render() {
    var all = filtered();
    var need = filtered(isNeedReply);

    el('nAll').textContent = REVIEWS.length;
    el('nFix').textContent = FIXES.length;
    el('nNeed').textContent = REVIEWS.filter(isNeedReply).length;

    el('allList').innerHTML = listHtml(all);
    el('allHeadN').textContent = all.length + ' of ' + REVIEWS.length;

    el('needList').innerHTML = listHtml(need, 'No need-reply review matches these filters.');
    el('needHeadN').textContent = need.length + ' of ' + REVIEWS.filter(isNeedReply).length;

    var counts = fixCounts(all);
    el('fixList').innerHTML = FIXES.map(function (f) { return fixRowHtml(f, counts[f.number] || 0); }).join('');
    el('fixHeadN').textContent = FIXES.length + ' issues';

    var shown = state.tab === 'needreply' ? need.length : all.length;
    var total = state.tab === 'needreply' ? REVIEWS.filter(isNeedReply).length : REVIEWS.length;
    el('resultCount').innerHTML = '<b>' + shown + '</b> of ' + total + ' reviews';
    el('clearFilters').hidden = !filtersActive();

    var active = (state.platform !== 'all' ? 1 : 0) + state.countries.length +
                 state.stars.length + (state.status !== 'all' ? 1 : 0) + (state.q ? 1 : 0);
    var badge = el('filterCount');
    badge.textContent = active;
    badge.hidden = active === 0;

    // Sync pressed state on every filter control.
    document.querySelectorAll('#fPlatform .seg').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.platform === state.platform));
    });
    document.querySelectorAll('#fCountry .seg').forEach(function (b) {
      var c = b.dataset.country;
      b.setAttribute('aria-pressed', String(c === 'all' ? state.countries.length === 0 : state.countries.indexOf(c) !== -1));
    });
    document.querySelectorAll('#fStars .seg').forEach(function (b) {
      var s = b.dataset.stars;
      b.setAttribute('aria-pressed', String(s === 'all' ? state.stars.length === 0 : state.stars.indexOf(Number(s)) !== -1));
    });
    document.querySelectorAll('#fStatus .seg').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.status === state.status));
    });
  }

  var TABS = ['overview', 'all', 'fix', 'needreply'];

  function showTab(name, keepHash) {
    if (TABS.indexOf(name) === -1) name = 'overview';
    state.tab = name;
    if (!keepHash) {
      var h = name === 'overview' ? ' ' : '#' + name;
      if (history.replaceState) history.replaceState(null, '', h === ' ' ? location.pathname : h);
    }
    TABS.forEach(function (n) {
      el('panel-' + n).hidden = (n !== name);
      el('tab-' + n).setAttribute('aria-selected', String(n === name));
    });
    el('filters').hidden = (name !== 'all' && name !== 'needreply');
    render();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------------------------------------------------- filter UI */
  function buildFilters() {
    el('fPlatform').innerHTML = [
      { v: 'all', l: 'All' }, { v: 'ios', l: 'iOS' }, { v: 'android', l: 'Android' }
    ].map(function (o) {
      return '<button type="button" class="seg" data-platform="' + o.v + '" aria-pressed="false">' + o.l + '</button>';
    }).join('');

    var cc = {};
    REVIEWS.forEach(function (r) { countriesOf(r).forEach(function (c) { cc[c] = (cc[c] || 0) + 1; }); });
    var order = Object.keys(cc).sort(function (a, b) { return cc[b] - cc[a] || (a < b ? -1 : 1); });
    el('fCountry').innerHTML = '<button type="button" class="seg small" data-country="all" aria-pressed="true">All</button>' +
      order.map(function (c) {
        return '<button type="button" class="seg small" data-country="' + esc(c) + '" aria-pressed="false">' +
               '<span class="cc">' + esc(c) + '</span><span class="cn">' + cc[c] + '</span></button>';
      }).join('');

    el('fStars').innerHTML = '<button type="button" class="seg small" data-stars="all" aria-pressed="true">All</button>' +
      [1, 2, 3, 4, 5].map(function (s) {
        return '<button type="button" class="seg small" data-stars="' + s + '" aria-pressed="false">' + s + '★</button>';
      }).join('');

    el('fStatus').innerHTML = [
      { v: 'all', l: 'All' }, { v: 'need_reply', l: 'Need reply' },
      { v: 'replied', l: 'Has public reply' }, { v: 'fix_tagged', l: 'Fix-tagged' }
    ].map(function (o) {
      return '<button type="button" class="seg small" data-status="' + o.v + '" aria-pressed="false">' + o.l + '</button>';
    }).join('');
  }

  function wire() {
    el('tabbar').addEventListener('click', function (e) {
      var t = e.target.closest('.tab');
      if (t) showTab(t.dataset.panel);
    });
    document.querySelectorAll('[data-goto]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); showTab(a.dataset.goto); });
    });

    el('fPlatform').addEventListener('click', function (e) {
      var b = e.target.closest('[data-platform]'); if (!b) return;
      state.platform = b.dataset.platform; render();
    });
    el('fCountry').addEventListener('click', function (e) {
      var b = e.target.closest('[data-country]'); if (!b) return;
      var c = b.dataset.country;
      if (c === 'all') state.countries = [];
      else {
        var i = state.countries.indexOf(c);
        if (i === -1) state.countries.push(c); else state.countries.splice(i, 1);
      }
      render();
    });
    el('fStars').addEventListener('click', function (e) {
      var b = e.target.closest('[data-stars]'); if (!b) return;
      var s = b.dataset.stars;
      if (s === 'all') state.stars = [];
      else {
        var n = Number(s), i = state.stars.indexOf(n);
        if (i === -1) state.stars.push(n); else state.stars.splice(i, 1);
      }
      render();
    });
    el('fStatus').addEventListener('click', function (e) {
      var b = e.target.closest('[data-status]'); if (!b) return;
      state.status = b.dataset.status; render();
    });
    el('fSearch').addEventListener('input', function (e) {
      state.q = e.target.value.trim().toLowerCase(); render();
    });
    el('filterToggle').addEventListener('click', function () {
      var open = el('fGroups').classList.toggle('open');
      this.setAttribute('aria-expanded', String(open));
    });
    el('clearFilters').addEventListener('click', function () {
      state.platform = 'all'; state.countries = []; state.stars = []; state.status = 'all'; state.q = '';
      el('fSearch').value = ''; render();
    });

    // Expand/collapse a table row's detail drawer.
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-toggle]'); if (!b) return;
      var row = b.closest('tr'), detail = row.nextElementSibling;
      var open = detail.hidden;
      detail.hidden = !open;
      row.classList.toggle('open', open);
      b.setAttribute('aria-expanded', String(open));
    });

    // Cards <-> table swap when crossing the desktop breakpoint.
    var wasDesktop = DESKTOP.matches;
    window.addEventListener('resize', function () {
      if (DESKTOP.matches !== wasDesktop) { wasDesktop = DESKTOP.matches; render(); }
    });

    // Keep the sticky filter bar docked under the sticky tab bar.
    function measure() {
      document.documentElement.style.setProperty('--bar-h', el('tabbar').offsetHeight + 'px');
    }
    measure();
    window.addEventListener('resize', measure);

    window.addEventListener('hashchange', function () {
      showTab((location.hash || '').replace('#', '') || 'overview', true);
    });
  }

  /* ---------------------------------------------------------- boot */
  fetch(DATA_URL, { cache: 'no-store' })
    .then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    })
    .then(function (json) {
      DATA = json;
      REVIEWS = (json.reviews || []).slice();
      REVIEWS.forEach(function (r) { r._fix = fixFor(r); });
      REVIEWS.sort(function (a, b) { return a.date < b.date ? 1 : (a.date > b.date ? -1 : 0); });
      FIXES = json.fix || [];
      FIXES.forEach(function (f) { FIXBY[f.number] = f; });

      var gen = String(json.generated_at || '').slice(0, 10);
      el('generatedChip').textContent = gen ? fmtDate(gen, true) : '—';

      buildFilters();
      wire();
      renderOverview();
      showTab((location.hash || '').replace('#', '') || 'overview', true);
    })
    .catch(function (err) {
      document.querySelector('.page').innerHTML =
        '<div class="empty"><b>Could not load data/reviews.json</b>' +
        esc(String(err.message || err)) +
        '<br>Serve the repo over http (e.g. <code>python3 -m http.server</code>) — file:// blocks the fetch.</div>';
    });
})();
