/* Token Radar — the page's whole behaviour.
 *
 * The page is one screen over one file: data.js, written by the entrypoint from the same ranked board
 * it hands the gate. There is no fetch, no timer, no random source and no clock anywhere below, so a
 * reload draws the same board with the same numbers, and the screenshots are that same draw.
 *
 * What it does with window.RADAR:
 *   - a filter bar (free search over name, slug, chain and category; category, chain and minimum-TVL
 *     selects; a watchlist-only switch) and a sort over rank/implied value, TVL, 7-day change,
 *     tokenless age, name and category, always tie-broken by rank so the order is total and stable;
 *   - the board itself: rank, protocol and its chains, category, TVL, 7-day change, tokenless age,
 *     the implied value with its 25th–75th band, and the plan;
 *   - the model strip under the tiles: the formula and the four factors, on the first screen, so a
 *     reader sees how a value is built before reading it;
 *   - a detail view per protocol: the implied value factor by factor, the band and where it comes from,
 *     the facts the snapshot records, and the farm plan step by step with the cost and the time;
 *   - the method section: the screen, the calibration table (one line a category: measured peers, the
 *     median multiple, the middle half, the board rows it prices, and the model's own miss there), and
 *     the out-of-sample test of the multiple on the protocols that already trade;
 *   - the protocols that already trade, each beside what the model says it is worth with its own ratio
 *     left out of the peer set: the model called against the market, all 128 of them.
 *
 * Every number on screen is formatted with one fixed locale so nothing depends on the reader's
 * machine, and every comparison is on the raw numbers, never on the formatted text.
 */
(function () {
  'use strict';

  var DATA = window.RADAR || {};
  var META = DATA.meta || {};
  var ROWS = DATA.rows || [];
  var LIVE = DATA.live || [];
  var TEST = META.backtest || { buckets: [], categories: [] };
  var CAL = META.calibration || [];

  /* ---------- formatting: one locale, no clock ---------- */

  var INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var D2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var D1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var D3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
  var UNITS = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];

  function usd(n) { return '$' + INT.format(n); }
  /** Three significant figures: $2.75B, $142M, $6.61M. Enough to read, never a fake precision. */
  function usdShort(n) {
    for (var i = 0; i < UNITS.length; i++) {
      if (n >= UNITS[i][1]) {
        var v = n / UNITS[i][1];
        return '$' + v.toFixed(v >= 100 ? 0 : v >= 10 ? 1 : 2) + UNITS[i][0];
      }
    }
    return '$' + INT.format(n);
  }
  /** A factor printed to four decimals with its trailing zeros dropped: 0.2748, 0.98, 1. */
  function fx(n) { return String(Number(n.toFixed(4))); }
  function pct(n) { return (n > 0 ? '+' : '') + D2.format(n) + '%'; }
  function mult(n) { return n >= 10 ? D1.format(n) : D3.format(n); }
  function ageText(n) { return n === null ? 'unrecorded' : (n < 365 ? n + ' d' : D1.format(n / 365) + ' y'); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function signed(n) { return (n > 0 ? '+' : n < 0 ? '\u2212' : '') + INT.format(Math.abs(Math.round(n * 100))) + '%'; }

  /* ---------- the sort table: six keys, each with the direction it reads best in ---------- */

  var SORTS = {
    implied: { label: 'Implied value', dir: 'desc', get: function (r) { return r.implied_value_usd; } },
    tvl: { label: 'TVL', dir: 'desc', get: function (r) { return r.tvl_usd; } },
    growth: { label: '7-day change', dir: 'desc', get: function (r) { return r.change_7d === null ? -1e9 : r.change_7d; } },
    age: { label: 'Tokenless age', dir: 'desc', get: function (r) { return r.age_days === null ? -1 : r.age_days; } },
    name: { label: 'Protocol name', dir: 'asc', get: function (r) { return r.name.toLowerCase(); } },
    category: { label: 'Category', dir: 'asc', get: function (r) { return (r.category || '\uffff').toLowerCase(); } }
  };
  var SORT_ORDER = ['implied', 'tvl', 'growth', 'age', 'name', 'category'];

  var MINS = [
    [0, 'Any TVL'], [5e7, '\u2265 $50M (the floor)'], [1e8, '\u2265 $100M'],
    [25e7, '\u2265 $250M'], [5e8, '\u2265 $500M'], [1e9, '\u2265 $1B'], [2e9, '\u2265 $2B']
  ];

  var VIEW = 'board';
  var state = { q: '', terms: [], cat: '', chain: '', min: 0, wl: false, sort: 'implied', dir: 'desc', open: '' };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    views: $('views'), prov: $('prov'), tiles: $('tiles'), model: $('model'),
    q: $('q'), cat: $('cat'), chain: $('chain'), min: $('min'),
    sort: $('sort'), wl: $('wl'), reset: $('reset'), count: $('count'), chips: $('chips'),
    rows: $('rows'), empty: $('empty'), etotal: $('etotal'), ereset: $('ereset'), boardnote: $('boardnote'),
    boardwrap: $('boardwrap'), methodnote: $('methodnote'), formula: $('formula'),
    consts: $('consts'), screen: $('screen'), calnote: $('calnote'), calintro: $('calintro'),
    calib: $('calib'), testlead: $('testlead'), testnums: $('testnums'), buckets: $('buckets'),
    testnote: $('testnote'),
    liverows: $('liverows'), livesub: $('livesub'), footnote: $('footnote'),
    detail: $('detail'), scrim: $('scrim'), dclose: $('dclose'), dkick: $('dkick'), dtitle: $('dtitle'),
    dsub: $('dsub'), dfactors: $('dfactors'), dcalc: $('dcalc'), dband: $('dband'), dfacts: $('dfacts'),
    dnotetoken: $('dnotetoken'), dlead: $('dlead'), dplan: $('dplan')
  };

  /* ---------- the URL is the state: ?view=method, ?q=…&cat=…&chain=…&min=…&wl=1&sort=… , #p=<slug> ---------- */

  function parsePairs(text) {
    var out = {};
    if (!text) return out;
    String(text).replace(/^[?#]+/, '').split('&').forEach(function (part) {
      if (!part) return;
      var at = part.indexOf('=');
      var k = decodeURIComponent(at < 0 ? part : part.slice(0, at));
      var v = at < 0 ? '' : decodeURIComponent(part.slice(at + 1).replace(/\+/g, ' '));
      if (k) out[k] = v;
    });
    return out;
  }

  function readURL() {
    var merged = {};
    [parsePairs(window.location.search), parsePairs(window.location.hash)].forEach(function (bag) {
      for (var k in bag) { if (Object.prototype.hasOwnProperty.call(bag, k)) merged[k] = bag[k]; }
    });
    return merged;
  }

  function syncURL() {
    var parts = [];
    if (state.q) parts.push('q=' + encodeURIComponent(state.q));
    if (state.cat) parts.push('cat=' + encodeURIComponent(state.cat));
    if (state.chain) parts.push('chain=' + encodeURIComponent(state.chain));
    if (state.min) parts.push('min=' + state.min);
    if (state.wl) parts.push('wl=1');
    if (state.sort !== 'implied') parts.push('sort=' + state.sort);
    if (state.dir !== SORTS[state.sort].dir) parts.push('dir=' + state.dir);
    var url = window.location.pathname + (parts.length ? '?' + parts.join('&') : '') +
      (state.open ? '#p=' + encodeURIComponent(state.open) : '');
    try { window.history.replaceState(null, '', url); } catch (e) { /* a file: page may refuse; the view is already drawn */ }
  }

  /* ---------- filter and sort: a total, stable order ---------- */

  function bySlug(slug) {
    for (var i = 0; i < ROWS.length; i++) if (ROWS[i].slug === slug) return ROWS[i];
    return null;
  }

  function matches(r) {
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && r.chains.indexOf(state.chain) < 0) return false;
    if (state.wl && !r.on_watchlist) return false;
    if (state.min && r.tvl_usd < state.min) return false;
    if (state.terms.length) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      for (var i = 0; i < state.terms.length; i++) if (hay.indexOf(state.terms[i]) < 0) return false;
    }
    return true;
  }

  function visible() {
    var list = [];
    for (var i = 0; i < ROWS.length; i++) if (matches(ROWS[i])) list.push(ROWS[i]);
    var s = SORTS[state.sort];
    var sign = state.dir === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var x = s.get(a), y = s.get(b);
      if (x < y) return -sign;
      if (x > y) return sign;
      return a.rank - b.rank;
    });
    return list;
  }

  var MAX_IMPLIED = ROWS.reduce(function (m, r) { return r.implied_value_usd > m ? r.implied_value_usd : m; }, 1);

  /** The floor label the control offers, for the chip that stands for the active one. */
  function minLabel(value) {
    for (var i = 0; i < MINS.length; i++) if (MINS[i][0] === value) return MINS[i][1];
    return usdShort(value) + ' and up';
  }

  /* ---------- the board ---------- */

  function chainLine(chains) {
    if (!chains.length) return 'chain unrecorded';
    var head = chains.slice(0, 3).join(' \u00b7 ');
    return chains.length > 3 ? head + ' +' + (chains.length - 3) + ' more' : head;
  }

  function bandOf(r) {
    return usdShort(r.implied_low_usd) + '\u2013' + usdShort(r.implied_high_usd);
  }

  function rowHTML(r) {
    var g = r.change_7d;
    var gCls = g === null ? 'dash' : (g < 0 ? 'neg' : 'pos');
    var width = Math.max(0.8, (r.implied_value_usd / MAX_IMPLIED) * 100);
    return '<tr class="row' + (r.on_watchlist ? ' wl' : '') + (r.slug === state.open ? ' is-open' : '') +
      '" data-slug="' + esc(r.slug) + '">' +
      '<td class="c-rank num">' + r.rank + '</td>' +
      '<td class="c-name"><button type="button" class="open" data-slug="' + esc(r.slug) + '">' + esc(r.name) + '</button>' +
        (r.on_watchlist ? '<span class="wlmark">watchlist</span>' : '') +
        '<span class="chains">' + esc(chainLine(r.chains)) + '</span></td>' +
      '<td class="c-cat"><span class="chip">' + esc(r.category || 'unclassified') + '</span></td>' +
      '<td class="c-tvl num">' + usdShort(r.tvl_usd) + '</td>' +
      '<td class="c-7d num ' + gCls + '">' + (g === null ? '\u2014' : pct(g)) + '</td>' +
      '<td class="c-age num">' + (r.age_days === null ? '\u2014' : ageText(r.age_days)) + '</td>' +
      '<td class="c-imp num"><span class="impv"><span class="bar"><i style="width:' + D1.format(width) + '%"></i></span>' +
        usd(r.implied_value_usd) + '</span>' +
        '<span class="band">' + bandOf(r) + ' \u00b7 ' +
        (r.factors.multiple_source === 'category' ? esc(r.category) : 'global') + '</span></td>' +
      '<td class="c-act"><button type="button" class="btn tiny" data-slug="' + esc(r.slug) + '">Plan</button></td>' +
      '</tr>';
  }

  function chip(label, key) {
    return '<li class="chip-f">' + esc(label) +
      '<button type="button" data-clear="' + esc(key) + '" title="Clear this filter">\u00d7</button></li>';
  }

  function renderBoard() {
    var list = visible();
    el.rows.innerHTML = list.map(rowHTML).join('');
    var filtered = state.q || state.cat || state.chain || state.min || state.wl;
    el.count.innerHTML = '<b>' + INT.format(list.length) + '</b> of ' + INT.format(ROWS.length) +
      ' screened protocols' + (filtered ? ' match this filter' : ' on the board') +
      ' \u00b7 sorted by ' + SORTS[state.sort].label + ', ' + (state.dir === 'asc' ? 'ascending' : 'descending');
    el.empty.hidden = list.length > 0;
    el.etotal.textContent = INT.format(ROWS.length);
    el.boardwrap.style.display = list.length ? '' : 'none';

    var chips = [];
    if (state.q) chips.push(chip('search: \u201c' + state.q + '\u201d', 'q'));
    if (state.cat) chips.push(chip('category: ' + state.cat, 'cat'));
    if (state.chain) chips.push(chip('chain: ' + state.chain, 'chain'));
    if (state.min) chips.push(chip('TVL ' + minLabel(state.min), 'min'));
    if (state.wl) chips.push(chip('watchlist only', 'wl'));
    el.chips.innerHTML = chips.join('');

    el.boardnote.textContent = (filtered
        ? INT.format(list.length) + ' of the board\u2019s ' + INT.format(ROWS.length) + ' rows pass this filter.'
        : 'The board holds ' + INT.format(ROWS.length) + ' rows.') +
      ' Across it: ' + INT.format(META.watchlist_count) + ' protocols from the house watchlist and ' +
      INT.format(META.early_count) + ' the screen found beneath the floor. Click a row for its factors, its band and its plan.';

    Array.prototype.forEach.call(document.querySelectorAll('.board thead th'), function (th) {
      var b = th.querySelector('.thb');
      if (!b) return;
      var on = b.getAttribute('data-sort') === state.sort;
      th.classList.toggle('on', on);
      th.classList.toggle('asc', on && state.dir === 'asc');
    });
  }

  /* ---------- the detail view ---------- */

  /** The implied value taken apart: the four factors, each with the note it needs to be read. */
  function factorRows(r) {
    var f = r.factors;
    var src = f.multiple_source === 'category'
      ? 'the median of its category, measured on ' + INT.format(f.peers) + ' protocols that already trade'
      : 'the global median, used because its category holds fewer than four measured peers';
    return '<tr><td>TVL, the snapshot\u2019s</td><td class="num">' + usd(r.tvl_usd) + '</td></tr>' +
      '<tr><td>\u00d7 multiple <span class="src">' + esc(src) + '</span></td>' +
        '<td class="num">' + fx(f.multiple) + '</td></tr>' +
      '<tr><td>\u00d7 growthAdj <span class="src">' +
        (r.change_7d === null ? 'no 7-day change is recorded, so the adjustment is 1' :
          '7 days: ' + pct(r.change_7d) + ', clamped to the \u221260 to +120 band, weight ' + (r.change_7d < 0 ? '0.9 (a fall counts harder)' : '0.7')) +
        '</span></td><td class="num">' + fx(f.growth_adj) + '</td></tr>' +
      '<tr><td>\u00d7 maturity <span class="src">' +
        (r.age_days === null ? 'no listing date is recorded, so the age is read as 365 days' :
          INT.format(r.age_days) + ' days tokenless, capped at 1,095') +
        '</span></td><td class="num">' + fx(f.maturity) + '</td></tr>' +
      '<tr class="total"><td>= implied value</td><td class="num">' + usd(r.implied_value_usd) + '</td></tr>' +
      '<tr class="bandrow"><td>25th\u201375th band <span class="src">the middle half of those ratios</span></td>' +
        '<td class="num">' + bandOf(r) + '</td></tr>';
  }

  /** The hand multiplication under the table: what the printed factors give, and how far off that is. */
  function calcNote(r) {
    var f = r.factors;
    var hand = Math.max(1, Math.round(r.tvl_usd * f.multiple * f.growth_adj * f.maturity));
    var drift = hand === r.implied_value_usd ? 0
      : (Math.abs(r.implied_value_usd - hand) / r.implied_value_usd) * 100;
    return INT.format(r.tvl_usd) + ' \u00d7 ' + fx(f.multiple) + ' \u00d7 ' + fx(f.growth_adj) +
      ' \u00d7 ' + fx(f.maturity) + ' = ' + INT.format(hand) +
      (drift === 0
        ? ' \u2014 the ranked value, exactly'
        : ' \u2014 ' + D3.format(drift) + '% from the ranked value, from the last digit the factors are printed at');
  }

  function bandNote(r) {
    var f = r.factors;
    var src = f.multiple_source === 'category'
      ? 'its category\u2019s ' + INT.format(f.peers) + ' measured ratios'
      : 'the ' + INT.format(f.peers) + ' measured ratios of the whole set';
    return 'Where the band comes from: ' + src + ' run from ' + mult(f.multiple_low) + ' to ' + mult(f.multiple_high) +
      ' between the 25th and 75th percentile, so this TVL is worth ' + bandOf(r) +
      ' before the growth and maturity terms move it. A band is a spread, not a range of promises.';
  }

  var returnFocus = null;

  function openDetail(slug, from) {
    var r = bySlug(slug);
    if (!r) return;
    state.open = slug;
    returnFocus = from || null;
    el.dkick.textContent = 'Rank ' + r.rank + ' of ' + INT.format(ROWS.length) +
      (r.on_watchlist ? ' \u00b7 on the house watchlist' : ' \u00b7 found by the screen');
    el.dtitle.textContent = r.name;
    el.dsub.textContent = (r.category || 'unclassified') + ' \u00b7 ' + r.chains.length + ' chain' +
      (r.chains.length === 1 ? '' : 's') + ' \u00b7 ' + r.slug;
    el.dfactors.innerHTML = factorRows(r);
    el.dcalc.textContent = calcNote(r);
    el.dband.textContent = bandNote(r);
    el.dfacts.innerHTML =
      '<dt>Category</dt><dd>' + esc(r.category || 'unclassified') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.length ? r.chains.join(', ') : 'unrecorded') + '</dd>' +
      '<dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + (r.change_7d === null ? 'unrecorded' : pct(r.change_7d)) + '</dd>' +
      '<dt>Listed at</dt><dd>' + (r.listed_at || 'unrecorded \u2014 read as 365 days') + '</dd>' +
      '<dt>Tokenless</dt><dd>' + ageText(r.age_days) + (r.age_days === null ? '' : ' (' + INT.format(r.age_days) + ' days)') + '</dd>' +
      '<dt>Multiple used</dt><dd>' + fx(r.factors.multiple) + ' \u2014 ' + r.factors.multiple_source + '</dd>' +
      '<dt>Watchlist</dt><dd>' + (r.on_watchlist ? 'yes, one of the ' + INT.format(META.watchlist_count) + ' the house tracks' : 'no, the screen found it below the floor') + '</dd>' +
      '<dt>Slug</dt><dd>' + esc(r.slug) + '</dd>';
    el.dnotetoken.textContent = r.name + ' records no token: its snapshot entry carries no CoinGecko id and no symbol. ' +
      'That is not the same as having none. Nothing here promises a launch \u2014 the board ranks a record, and the record can change before anything else does.';
    var steps = r.plan || [];
    el.dlead.textContent = INT.format(steps.length) + ' steps, none of them a promise: open a wallet, put the position on ' +
      (r.chains[0] || 'the protocol\u2019s own chain') + ', stay active, and keep the record long enough to matter. ' +
      'Each step carries the cost and the time it asks for.';
    el.dplan.innerHTML = steps.map(function (s) {
      return '<li><b>' + esc(s.step) + '</b><span class="meta"><span class="c">' + esc(s.cost) +
        '</span><span>' + esc(s.time) + '</span></span></li>';
    }).join('');
    el.detail.hidden = false;
    el.scrim.hidden = false;
    el.detail.scrollTop = 0;
    document.body.style.overflow = 'hidden';
    el.dclose.focus();
    renderBoard();
    syncURL();
  }

  function closeDetail() {
    state.open = '';
    el.detail.hidden = true;
    el.scrim.hidden = true;
    document.body.style.overflow = '';
    renderBoard();
    syncURL();
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }

  /* ---------- the model, stated on the first screen ---------- */

  function renderModel() {
    var win = 'a ratio under ' + mult(META.window_low) + ' or over ' + INT.format(META.window_high) + ' is dropped';
    el.formula.textContent = 'implied = round( TVL \u00d7 multiple \u00d7 growthAdj \u00d7 maturity )';
    el.model.innerHTML =
      '<div class="mformula"><span class="mk">the model</span>' +
        '<p class="mono">implied = TVL \u00d7 multiple \u00d7 growthAdj \u00d7 maturity</p>' +
        '<p class="mnote">four factors, all measured on the snapshot, ' + INT.format(META.candidate_count) +
        ' protocols ranked, every row recomputable by hand</p></div>' +
      '<dl class="mfact"><dt>multiple</dt><dd>' + mult(META.median_multiple_global) +
        '<span>median mcap \u00f7 TVL of the row\u2019s own category, n \u2265 4 measured, else the global figure</span></dd></dl>' +
      '<dl class="mfact"><dt>growthAdj</dt><dd>0.4 \u2013 1.6' +
        '<span>1 + 0.7 \u00d7 the 7-day change (0.9 when it falls), clamped</span></dd></dl>' +
      '<dl class="mfact"><dt>maturity</dt><dd>0.55 \u2013 1.00' +
        '<span>grows with the days the record has run with no token, capped at 1,095</span></dd></dl>' +
      '<dl class="mfact wide"><dt>the band</dt><dd>' + mult(META.global_low) + ' \u2013 ' + mult(META.global_high) +
        '<span>the 25th\u201375th of the same ratios, under every value; ' + win + '. ' + INT.format(META.measured) +
        ' of ' + INT.format(META.live_count) + ' traded ratios are measured</span></dd></dl>';
  }

  function renderViews() {
    el.views.innerHTML =
      '<a href="?view=board"' + (VIEW === 'board' ? ' class="on" aria-current="page"' : '') + '>Board</a>' +
      '<a href="?view=method"' + (VIEW === 'method' ? ' class="on" aria-current="page"' : '') + '>Model</a>';
  }

  /* ---------- the method, stated in full ---------- */

  function renderMethod() {
    var bt = TEST;
    var own = CAL.filter(function (c) { return c.used_for === 'category'; });
    var globalRow = CAL.filter(function (c) { return c.used_for === 'global'; });

    el.methodnote.textContent = 'Four measured numbers multiplied together. This page states them, the sample each one ' +
      'comes from, and how the model does when it is asked about protocols whose token already trades.';

    el.consts.innerHTML =
      '<dt>multiple</dt><dd>The median of market cap \u00f7 TVL over the row\u2019s own category, when four or more of ' +
        'its ratios survive the window: <b>' + mult(META.median_multiple_global) + '</b> globally, measured on <b>' +
        INT.format(META.measured) + '</b> of the ' + INT.format(META.live_count) + ' protocols that trade. Four is the ' +
        'smallest sample whose median has an order-statistic interval, so a thinner category takes the global figure.</dd>' +
      '<dt>the window</dt><dd>A ratio under <b>' + mult(META.window_low) + '</b> or over <b>' +
        INT.format(META.window_high) + '</b> is dropped: a market cap under one per cent of a protocol\u2019s TVL, or over ' +
        'a hundred times it, is a denominator artefact and not a comparable. <b>' +
        INT.format(META.live_count - META.measured) + '</b> of the ' + INT.format(META.live_count) + ' fall outside it.</dd>' +
      '<dt>growthAdj</dt><dd>clamp(1 + w \u00d7 g \u00f7 100, 0.4, 1.6), g = clamp(change_7d, \u221260, +120), w = <b>0.7</b> ' +
        'above zero and <b>0.9</b> below: a drawdown is a bigger warning than the same rise is a bonus.</dd>' +
      '<dt>maturity</dt><dd>0.55 + 0.45 \u00d7 min(age_days, 1,095) \u00f7 1,095, the age counted back from the ' +
        'snapshot\u2019s as_of to the listing date, and <b>365 days</b> when no date is recorded.</dd>' +
      '<dt>the band</dt><dd>The 25th and 75th percentile of the same ratios, through the same TVL, growth and maturity: ' +
        'what the category\u2019s own spread says about one of its members. It is printed under every value.</dd>';

    el.screen.textContent = META.screen_note || '';
    el.calnote.textContent = 'Read across the whole snapshot: ' + INT.format(META.protocols) + ' protocols, ' +
      INT.format(META.candidate_count) + ' screened in, ' + INT.format(META.live_count) +
      ' trading tokens measured for the multiples above, and ' + INT.format(META.early_count) +
      ' pre-token protocols the screen found below the floor.';

    el.testlead.textContent = 'Every protocol whose token trades is asked the model\u2019s question with its own ratio ' +
      'left out, and the answer goes beside the market cap the snapshot records. ' + INT.format(bt.tested) + ' of ' +
      INT.format(META.live_count) + ' are scored: the test drops parents\u2019 tokens and ratios outside the window.';
    el.testnums.innerHTML =
      '<div class="tn hot"><b>' + D1.format(bt.concordance * 100) + '%</b>' +
        '<span>of ' + INT.format(bt.pairs) + ' same-category pairs ordered as the market does (chance: 50%)</span></div>' +
      '<div class="tn"><b>' + INT.format(Math.round(bt.median_miss * 100)) + '%</b>' +
        '<span>median miss: half land closer, half further</span></div>' +
      '<div class="tn"><b>' + INT.format(Math.round(bt.within_100 * 100)) + '%</b>' +
        '<span>land between half and double the market\u2019s figure</span></div>';
    el.buckets.innerHTML = bt.buckets.map(function (b) {
      var share = bt.tested ? (b.count / bt.tested) * 100 : 0;
      return '<li><span class="bl">' + esc(b.label) + '</span><span class="bwrap"><i style="width:' +
        D1.format(share) + '%"></i></span><span class="bn">' + b.count + '</span></li>';
    }).join('');
    el.testnote.textContent = 'The test measures the multiple, the part of the model read off the snapshot; growthAdj ' +
      'and maturity are bounded by hand and have no market figure to be checked against. The miss is why every row ' +
      'carries a band.';

    el.calintro.textContent = 'How many of a category\u2019s protocols trade and how many ratios survive the window (the ' +
      'median is measured on those), the median multiple with the middle half around it, the board rows priced by it, and ' +
      'the model\u2019s own median miss there. Categories with fewer than four measured peers take the global line, last.';

    var rowsHtml = own.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td>' +
        '<td class="num">' + c.measured + '<span class="sub">of ' + c.observed + '</span></td>' +
        '<td class="num">' + mult(c.median) + '<span class="sub">' + mult(c.low) + ' \u2013 ' + mult(c.high) + '</span></td>' +
        '<td class="num">' + c.rows + '</td>' +
        '<td class="num">' + (c.tested ? INT.format(Math.round((c.test_miss || 0) * 100)) + '%<span class="sub">' + c.tested + ' tested</span>' : '\u2014') + '</td></tr>';
    }).join('');
    var restRows = globalRow.length ? globalRow[0].rows : 0;
    rowsHtml += '<tr class="globalrow"><td>Every other category <span class="sub">' + globalRow.length +
      ' categories with fewer than four measured peers</span></td>' +
      '<td class="num">' + INT.format(META.measured) + '<span class="sub">of ' + INT.format(META.live_count) + '</span></td>' +
      '<td class="num">' + mult(META.median_multiple_global) + '<span class="sub">' + mult(META.global_low) + ' \u2013 ' + mult(META.global_high) + '</span></td>' +
      '<td class="num">' + INT.format(restRows) + '</td>' +
      '<td class="num">' + INT.format(Math.round(bt.median_miss * 100)) + '%<span class="sub">' + INT.format(bt.tested) + ' tested</span></td></tr>';
    el.calib.innerHTML = rowsHtml;
  }

  function renderLive() {
    var list = LIVE.slice().sort(function (a, b) {
      if (a.mcap_usd !== b.mcap_usd) return b.mcap_usd - a.mcap_usd;
      return a.slug < b.slug ? -1 : 1;
    });
    el.livesub.textContent = INT.format(list.length) + ' protocols record a token, so the market prices them and the ' +
      'board leaves them out. Each one\u2019s market cap over its TVL is a ratio the medians above were measured from, ' +
      'and the model\u2019s figure beside it is the same product with this protocol left out of its own peer set. The ' +
      'miss is the model minus the market, as a share of the market. Sorted by market cap.';
    el.liverows.innerHTML = list.map(function (l) {
      var ratio = l.tvl_usd > 0 ? l.mcap_usd / l.tvl_usd : null;
      var missCls = !l.tested ? 'dash' : (Math.abs(l.miss) <= 0.5 ? 'pos' : (Math.abs(l.miss) <= 1 ? 'warn' : 'neg'));
      return '<tr' + (l.tested ? '' : ' class="untested"') + '><td class="mono">' + esc(l.symbol || '\u2014') + '</td>' +
        '<td>' + esc(l.name) + '</td>' +
        '<td><span class="chip">' + esc(l.category || 'unclassified') + '</span></td>' +
        '<td class="num">' + usdShort(l.tvl_usd) + '</td>' +
        '<td class="num">' + usd(l.mcap_usd) + '</td>' +
        '<td class="num">' + (ratio === null ? '\u2014' : mult(ratio)) + '</td>' +
        '<td class="num">' + usdShort(l.implied_usd) + '</td>' +
        '<td class="num ' + missCls + '">' + (l.tested ? signed(l.miss) : 'not scored') + '</td></tr>';
    }).join('');
  }

  function renderHeader() {
    el.prov.innerHTML =
      '<div><dt>Snapshot as of</dt><dd>' + esc(META.as_of) + '</dd></div>' +
      '<div><dt>Read at</dt><dd>' + esc(String(META.fetched_at || '').replace(/\.\d+Z$/, 'Z')) + '</dd></div>' +
      '<div><dt>Floor</dt><dd>' + usd(META.floor_usd) + '</dd></div>';
    el.tiles.innerHTML =
      '<dl class="tile"><dt>Screened in</dt><dd>' + INT.format(META.candidate_count) +
        '<span class="sub">of ' + INT.format(META.protocols) + ' protocols the snapshot holds</span></dd></dl>' +
      '<dl class="tile"><dt>Watchlist covered</dt><dd>' + INT.format(META.watchlist_count) + ' / ' + INT.format(META.watchlist_count) +
        '<span class="sub">every slug the house kept is a row on the board</span></dd></dl>' +
      '<dl class="tile hot"><dt>Board implied value</dt><dd>' + usdShort(META.total_implied_usd) +
        '<span class="sub">' + usd(META.total_implied_usd) + ' summed over the board</span></dd></dl>' +
      '<dl class="tile"><dt>Median multiple</dt><dd>' + mult(META.median_multiple_global) +
        '<span class="sub">mcap \u00f7 TVL over ' + INT.format(META.measured) + ' measured ratios</span></dd></dl>' +
      '<dl class="tile"><dt>Pairs ordered right</dt><dd>' + D1.format(TEST.concordance * 100) + '%' +
        '<span class="sub">' + INT.format(TEST.pairs_right) + ' of ' + INT.format(TEST.pairs) + ' same-category pairs, tested out of sample</span></dd></dl>';
    el.footnote.textContent = 'Board built from the sealed snapshot of ' + META.as_of + ' (' +
      INT.format(META.protocols) + ' protocols, floor ' + usd(META.floor_usd) + '), read at ' + META.fetched_at +
      '. The multiples are measured on the ' + INT.format(META.live_count) + ' protocols in the snapshot that ' +
      'already record a token; the board ranks the ' + INT.format(META.candidate_count) + ' that do not.';
  }

  /* ---------- controls ---------- */

  function renderControls() {
    var cats = {}, chains = {};
    ROWS.forEach(function (r) {
      if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
      r.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var catNames = Object.keys(cats).sort(function (a, b) { return a < b ? -1 : 1; });
    var chainNames = Object.keys(chains).sort(function (a, b) { return a < b ? -1 : 1; });
    el.cat.innerHTML = '<option value="">All categories (' + catNames.length + ')</option>' +
      catNames.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + ' (' + cats[c] + ')</option>';
      }).join('');
    el.chain.innerHTML = '<option value="">All chains (' + chainNames.length + ')</option>' +
      chainNames.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + ' (' + chains[c] + ')</option>';
      }).join('');
    el.min.innerHTML = MINS.map(function (m) {
      return '<option value="' + m[0] + '">' + esc(m[1]) + '</option>';
    }).join('');
    el.sort.innerHTML = SORT_ORDER.map(function (k) {
      return '<option value="' + k + '">' + esc(SORTS[k].label) + '</option>';
    }).join('');
  }

  function applyStateToControls() {
    el.q.value = state.q;
    el.cat.value = state.cat;
    el.chain.value = state.chain;
    el.min.value = String(state.min);
    el.sort.value = state.sort;
    el.wl.checked = state.wl;
  }

  function resetAll() {
    state.q = ''; state.terms = []; state.cat = ''; state.chain = ''; state.min = 0;
    state.wl = false; state.sort = 'implied'; state.dir = 'desc';
    applyStateToControls();
    renderBoard();
    syncURL();
  }

  function setQuery(text) {
    state.q = String(text || '').trim();
    state.terms = state.q.toLowerCase().split(/\s+/).filter(function (t) { return t.length > 0; });
  }

  /* ---------- wiring ---------- */

  function wire() {
    el.q.addEventListener('input', function () { setQuery(el.q.value); renderBoard(); syncURL(); });
    el.cat.addEventListener('change', function () { state.cat = el.cat.value; renderBoard(); syncURL(); });
    el.chain.addEventListener('change', function () { state.chain = el.chain.value; renderBoard(); syncURL(); });
    el.min.addEventListener('change', function () { state.min = Number(el.min.value) || 0; renderBoard(); syncURL(); });
    el.wl.addEventListener('change', function () { state.wl = el.wl.checked; renderBoard(); syncURL(); });
    el.sort.addEventListener('change', function () {
      state.sort = SORTS[el.sort.value] ? el.sort.value : 'implied';
      state.dir = SORTS[state.sort].dir;
      renderBoard(); syncURL();
    });
    el.reset.addEventListener('click', resetAll);
    el.ereset.addEventListener('click', resetAll);

    el.rows.addEventListener('click', function (event) {
      var node = event.target.closest ? event.target.closest('[data-slug]') : null;
      if (!node) return;
      openDetail(node.getAttribute('data-slug'), node);
    });

    Array.prototype.forEach.call(document.querySelectorAll('.board thead .thb'), function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (!SORTS[key]) return;
        if (state.sort === key) state.dir = state.dir === 'asc' ? 'desc' : 'asc';
        else { state.sort = key; state.dir = SORTS[key].dir; }
        renderBoard(); syncURL();
      });
    });

    el.chips.addEventListener('click', function (event) {
      var node = event.target.closest ? event.target.closest('[data-clear]') : null;
      if (!node) return;
      var key = node.getAttribute('data-clear');
      if (key === 'q') { state.q = ''; state.terms = []; el.q.value = ''; }
      if (key === 'cat') { state.cat = ''; el.cat.value = ''; }
      if (key === 'chain') { state.chain = ''; el.chain.value = ''; }
      if (key === 'min') { state.min = 0; el.min.value = '0'; }
      if (key === 'wl') { state.wl = false; el.wl.checked = false; }
      renderBoard(); syncURL();
    });

    el.dclose.addEventListener('click', closeDetail);
    el.scrim.addEventListener('click', closeDetail);
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !el.detail.hidden) closeDetail();
    });
  }

  /* ---------- the first draw ---------- */

  function start() {
    var url = readURL();
    VIEW = url.view === 'method' ? 'method' : 'board';
    if (VIEW === 'method') document.body.classList.add('view-method');
    renderViews();
    if (!ROWS.length) {
      document.querySelector('main').innerHTML =
        '<section class="wrap"><div class="empty"><p class="etitle">The board is empty</p>' +
        '<p class="ebody">data.js beside this page carries no rows: the entrypoint writes it from the ranked ' +
        'board on every run, so an empty set here means the snapshot held nothing to screen.</p></div></section>';
      return;
    }
    if (url.q) setQuery(url.q);
    state.cat = url.cat && ROWS.some(function (r) { return r.category === url.cat; }) ? url.cat : '';
    state.chain = url.chain && ROWS.some(function (r) { return r.chains.indexOf(url.chain) >= 0; }) ? url.chain : '';
    state.min = MINS.some(function (m) { return String(m[0]) === String(url.min); }) ? Number(url.min) : 0;
    state.wl = url.wl === '1' || url.wl === 'true' || url.wl === 'yes';
    if (url.sort && SORTS[url.sort]) {
      state.sort = url.sort;
      state.dir = url.dir === 'asc' || url.dir === 'desc' ? url.dir : SORTS[url.sort].dir;
    } else if (url.dir === 'asc' || url.dir === 'desc') {
      state.dir = url.dir;
    }
    renderControls();
    applyStateToControls();
    renderHeader();
    renderModel();
    renderMethod();
    renderLive();
    renderBoard();
    wire();
    if (url.p && bySlug(url.p)) openDetail(url.p, null);
  }

  start();
})();
