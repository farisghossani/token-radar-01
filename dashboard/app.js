/* Token Radar — the page's whole behaviour.
 *
 * The page is one screen over one file: data.js, written by the entrypoint from the same ranked board
 * it hands the gate. There is no fetch, no timer, no random source and no clock anywhere below, so a
 * reload draws the same board with the same numbers, and the three screenshots are that same draw.
 *
 * What it does with window.RADAR:
 *   - a filter bar (free search over name, slug, chain and category; category, chain and minimum-TVL
 *     selects; a watchlist-only switch) and a sort over rank/implied value, TVL, 7-day change,
 *     tokenless age, name and category, always tie-broken by rank so the order is total and stable;
 *   - the board itself: rank, protocol and its chains, category, TVL, 7-day change, tokenless age,
 *     the implied value with a bar relative to the highest implied value on the board, and the plan;
 *   - a detail view per protocol: the implied value factor by factor, the facts the snapshot records,
 *     and the farm plan step by step with the cost and the time each step takes;
 *   - the method: the formula, the four factors with their constants, and the full calibration table
 *     the multiples were measured from — the page states its own model, it does not just apply it;
 *   - the protocols that already trade, set aside with their market cap, because the market prices
 *     those itself and the board's ranking is for the ones with no price at all.
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

  /* ---------- formatting: one locale, no clock ---------- */

  var INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
  var D2 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var D1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  var D3 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 });
  var UNITS = [['T', 1e12], ['B', 1e9], ['M', 1e6], ['K', 1e3]];

  function usd(n) { return '$' + INT.format(n); }
  function usdShort(n) {
    for (var i = 0; i < UNITS.length; i++) {
      if (n >= UNITS[i][1]) return '$' + D3.format(n / UNITS[i][1]) + UNITS[i][0];
    }
    return '$' + INT.format(n);
  }
  function pct(n) { return (n > 0 ? '+' : '') + D2.format(n) + '%'; }
  function ageText(n) { return n === null ? 'unrecorded' : (n < 365 ? n + ' d' : D1.format(n / 365) + ' y'); }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

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
    [0, 'Any TVL'], [5e7, '≥ $50M (the floor)'], [1e8, '≥ $100M'],
    [25e7, '≥ $250M'], [5e8, '≥ $500M'], [1e9, '≥ $1B'], [2e9, '≥ $2B']
  ];

  var state = { q: '', terms: [], cat: '', chain: '', min: 0, wl: false, sort: 'implied', dir: 'desc', open: '' };

  var $ = function (id) { return document.getElementById(id); };
  var el = {
    prov: $('prov'), tiles: $('tiles'), q: $('q'), cat: $('cat'), chain: $('chain'), min: $('min'),
    sort: $('sort'), wl: $('wl'), reset: $('reset'), count: $('count'), chips: $('chips'),
    rows: $('rows'), empty: $('empty'), etotal: $('etotal'), ereset: $('ereset'), boardnote: $('boardnote'),
    boardwrap: $('boardwrap'),
    consts: $('consts'), screen: $('screen'), calnote: $('calnote'), calib: $('calib'),
    liverows: $('liverows'), livesub: $('livesub'), footnote: $('footnote'),
    detail: $('detail'), scrim: $('scrim'), dclose: $('dclose'), dkick: $('dkick'), dtitle: $('dtitle'),
    dsub: $('dsub'), dfactors: $('dfactors'), dcalc: $('dcalc'), dfacts: $('dfacts'),
    dnotetoken: $('dnotetoken'), dlead: $('dlead'), dplan: $('dplan')
  };

  /* ---------- the URL is the state: ?q=…&cat=…&chain=…&min=…&wl=1&sort=…&dir=… , #p=<slug> ---------- */

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
    var sources = [
      parsePairs((parsePairs(window.location.search).filter) || ''),
      parsePairs(window.location.search),
      parsePairs(window.location.hash)
    ];
    sources.forEach(function (bag) {
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
    var head = chains.slice(0, 3).join(' · ');
    return chains.length > 3 ? head + ' +' + (chains.length - 3) + ' more' : head;
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
      '<td class="c-7d num ' + gCls + '">' + (g === null ? '—' : pct(g)) + '</td>' +
      '<td class="c-age num">' + (r.age_days === null ? '—' : ageText(r.age_days)) + '</td>' +
      '<td class="c-imp num"><span class="bar"><i style="width:' + D1.format(width) + '%"></i></span>' +
        usd(r.implied_value_usd) + '</td>' +
      '<td class="c-act"><button type="button" class="btn tiny" data-slug="' + esc(r.slug) + '">Plan</button></td>' +
      '</tr>';
  }

  function chip(label, key, value) {
    return '<li class="chip-f">' + esc(label) +
      '<button type="button" data-clear="' + esc(key) + '" title="Clear this filter">×</button></li>';
  }

  function renderBoard() {
    var list = visible();
    el.rows.innerHTML = list.map(rowHTML).join('');
    var filtered = state.q || state.cat || state.chain || state.min || state.wl;
    el.count.innerHTML = '<b>' + INT.format(list.length) + '</b> of ' + INT.format(ROWS.length) +
      ' screened protocols' + (filtered ? ' match this filter' : ' on the board') +
      ' · sorted by ' + SORTS[state.sort].label + ', ' + (state.dir === 'asc' ? 'ascending' : 'descending');
    el.empty.hidden = list.length > 0;
    el.etotal.textContent = INT.format(ROWS.length);
    el.boardwrap.style.display = list.length ? '' : 'none';

    var chips = [];
    if (state.q) chips.push(chip('search: “' + state.q + '”', 'q'));
    if (state.cat) chips.push(chip('category: ' + state.cat, 'cat'));
    if (state.chain) chips.push(chip('chain: ' + state.chain, 'chain'));
    if (state.min) chips.push(chip('TVL ' + minLabel(state.min), 'min'));
    if (state.wl) chips.push(chip('watchlist only', 'wl'));
    el.chips.innerHTML = chips.join('');

    el.boardnote.textContent = (filtered
        ? INT.format(list.length) + ' of the board\'s ' + INT.format(ROWS.length) + ' rows pass this filter.'
        : 'The board holds ' + INT.format(ROWS.length) + ' rows.') +
      ' Across it: ' + INT.format(META.watchlist_count) + ' protocols from the house watchlist and ' +
      INT.format(META.early_count) + ' pre-token protocols the screen found beneath the floor.' +
      ' Click any row for the factor-by-factor breakdown and its farm plan.';

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
      ? 'the median of its category, measured on ' + INT.format(catCount(r.category)) + ' protocols that already trade'
      : 'the global median, used because its category holds fewer than three protocols that trade';
    return '<tr><td>TVL, the snapshot\'s</td><td class="num">' + usd(r.tvl_usd) + '</td></tr>' +
      '<tr><td>× multiple <span class="src">' + esc(src) + '</span></td>' +
        '<td class="num">' + D2.format(f.multiple) + '</td></tr>' +
      '<tr><td>× growthAdj <span class="src">' +
        (r.change_7d === null ? 'no 7-day change is recorded, so the adjustment is 1' :
          '7 days: ' + pct(r.change_7d) + ', clamped to the −60 to +120 band, weight ' + (r.change_7d < 0 ? '0.9 (a fall counts harder)' : '0.7')) +
        '</span></td><td class="num">' + D2.format(f.growth_adj) + '</td></tr>' +
      '<tr><td>× maturity <span class="src">' +
        (r.age_days === null ? 'no listing date is recorded, so the age is read as 365 days' :
          INT.format(r.age_days) + ' days tokenless, capped at 1,095') +
        '</span></td><td class="num">' + D2.format(f.maturity) + '</td></tr>' +
      '<tr class="total"><td>= implied value</td><td class="num">' + usd(r.implied_value_usd) + '</td></tr>';
  }

  /** The hand multiplication under the table: what the printed factors give, and how far off that is. */
  function calcNote(r) {
    var f = r.factors;
    var hand = Math.max(1, Math.round(r.tvl_usd * f.multiple * f.growth_adj * f.maturity));
    var drift = hand === r.implied_value_usd ? 0
      : (Math.abs(r.implied_value_usd - hand) / r.implied_value_usd) * 100;
    return INT.format(r.tvl_usd) + ' × ' + D2.format(f.multiple) + ' × ' + D2.format(f.growth_adj) +
      ' × ' + D2.format(f.maturity) + ' = ' + INT.format(hand) +
      (drift === 0
        ? ' — the ranked value, exactly'
        : ' — ' + D2.format(drift) + '% from the ranked value, because the four factors above are printed ' +
          'rounded to two decimals while the rank multiplies them unrounded');
  }

  function catCount(category) {
    var list = META.calibration || [];
    for (var i = 0; i < list.length; i++) if (list[i].category === category) return list[i].n;
    return 0;
  }

  var returnFocus = null;

  function openDetail(slug, from) {
    var r = bySlug(slug);
    if (!r) return;
    state.open = slug;
    returnFocus = from || null;
    el.dkick.textContent = 'Rank ' + r.rank + ' of ' + INT.format(ROWS.length) +
      (r.on_watchlist ? ' · on the house watchlist' : ' · found by the screen');
    el.dtitle.textContent = r.name;
    el.dsub.textContent = (r.category || 'unclassified') + ' · ' + r.chains.length + ' chain' +
      (r.chains.length === 1 ? '' : 's') + ' · ' + r.slug;
    el.dfactors.innerHTML = factorRows(r);
    el.dcalc.textContent = calcNote(r);
    el.dfacts.innerHTML =
      '<dt>Category</dt><dd>' + esc(r.category || 'unclassified') + '</dd>' +
      '<dt>Chains</dt><dd>' + esc(r.chains.length ? r.chains.join(', ') : 'unrecorded') + '</dd>' +
      '<dt>TVL</dt><dd>' + usd(r.tvl_usd) + '</dd>' +
      '<dt>7-day change</dt><dd>' + (r.change_7d === null ? 'unrecorded' : pct(r.change_7d)) + '</dd>' +
      '<dt>Listed at</dt><dd>' + (r.listed_at || 'unrecorded — read as 365 days') + '</dd>' +
      '<dt>Tokenless</dt><dd>' + ageText(r.age_days) + (r.age_days === null ? '' : ' (' + INT.format(r.age_days) + ' days)') + '</dd>' +
      '<dt>Multiple used</dt><dd>' + D2.format(r.factors.multiple) + ' — ' + r.factors.multiple_source + '</dd>' +
      '<dt>Watchlist</dt><dd>' + (r.on_watchlist ? 'yes, one of the ' + INT.format(META.watchlist_count) + ' the house tracks' : 'no, the screen found it below the floor') + '</dd>' +
      '<dt>Slug</dt><dd>' + esc(r.slug) + '</dd>';
    el.dnotetoken.textContent = r.name + ' records no token: its snapshot entry carries no CoinGecko id and no symbol. ' +
      'That is not the same as having none. Nothing here promises a launch — the board ranks a record, and the record can change before anything else does.';
    var steps = r.plan || [];
    el.dlead.textContent = INT.format(steps.length) + ' steps, none of them a promise: open a wallet, put the position on ' +
      (r.chains[0] || 'the protocol\'s own chain') + ', stay active, and keep the record long enough to matter. ' +
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

  /* ---------- the method, stated in full ---------- */

  function renderMethod() {
    var cal = META.calibration || [];
    el.consts.innerHTML =
      '<dt>multiple</dt><dd>The median of market cap ÷ TVL over the protocols of the row\'s own category that ' +
        'already record a token, when that category holds three or more of them. A thinner category falls back to the ' +
        'global median, <b>' + D2.format(META.median_multiple_global) + '</b>, measured over <b>' +
        INT.format(META.live_count) + '</b> protocols that trade.</dd>' +
      '<dt>growthAdj</dt><dd>clamp(1 + w × g ÷ 100, 0.4, 1.6), with g = clamp(change_7d, −60, +120) and ' +
        'w = <b>0.7</b> when g is at or above zero, <b>0.9</b> when it is below: a 7-day drawdown is a bigger warning ' +
        'than the same rise is a bonus, so a fall is discounted harder.</dd>' +
      '<dt>maturity</dt><dd>0.55 + 0.45 × min(age_days, 1,095) ÷ 1,095, the age counted from the snapshot\'s own ' +
        'as_of back to the listing date. A protocol with no recorded listing date is read as <b>365 days</b> old, and ' +
        'the cap at 1,095 days keeps a very long record from dominating the ranking on its own.</dd>' +
      '<dt>implied</dt><dd>round(TVL × multiple × growthAdj × maturity): one whole number, at least $1. The board ' +
        'ranks on that number, ties broken by slug, and the rank on screen is the model\'s claim and not the ' +
        'array\'s order.</dd>' +
      '<dt>the floor</dt><dd>The snapshot is drawn at <b>' + usd(META.floor_usd) + '</b> of TVL. The screen is ' +
        'applied at every TVL, so the board is the house watchlist plus the pre-token protocols the screen finds ' +
        'beneath the floor: <b>' + INT.format(META.watchlist_count) + '</b> watchlist protocols and <b>' +
        INT.format(META.early_count) + '</b> found lower down.</dd>' +
      '<dt>what is left out</dt><dd>The <b>' + INT.format(META.live_count) + '</b> protocols whose token already ' +
        'trades. The market prices those itself, so the board ranks only what has no price: the board\'s own rows ' +
        'are the ones carrying no token, and the live set is used to measure the multiples instead of being ranked ' +
        'by them.</dd>';
    el.screen.textContent = META.screen_note || '';
    el.calnote.textContent = 'Read across the whole snapshot: ' + INT.format(META.protocols) + ' protocols, ' +
      INT.format(META.candidate_count) + ' screened in, ' + INT.format(META.live_count) +
      ' trading tokens measured for the multiples above, and ' + INT.format(META.early_count) +
      ' pre-token protocols the screen found below the floor.';
    el.calib.innerHTML = cal.map(function (c) {
      return '<tr><td>' + esc(c.category) + '</td><td class="num">' + c.n + '</td><td class="num">' +
        D2.format(c.median_multiple) + '</td><td>' +
        (c.used_for === 'category'
          ? 'the category\'s own rows'
          : 'every category with fewer than three — the global median') + '</td></tr>';
    }).join('');
  }

  function renderLive() {
    var list = LIVE.slice().sort(function (a, b) {
      if (a.mcap_usd !== b.mcap_usd) return b.mcap_usd - a.mcap_usd;
      return a.slug < b.slug ? -1 : 1;
    });
    el.livesub.textContent = INT.format(list.length) + ' protocols record a token, so the market prices them and the ' +
      'board leaves them out. Each one\'s market cap over its TVL is exactly the ratio the medians above were ' +
      'measured from, and the table is sorted by market cap.';
    el.liverows.innerHTML = list.map(function (l) {
      var ratio = l.tvl_usd > 0 ? l.mcap_usd / l.tvl_usd : null;
      return '<tr><td class="mono">' + esc(l.symbol || '—') + '</td><td>' + esc(l.name) + '</td>' +
        '<td><span class="chip">' + esc(l.category || 'unclassified') + '</span></td>' +
        '<td class="num">' + usdShort(l.tvl_usd) + '</td>' +
        '<td class="num">' + usd(l.mcap_usd) + '</td>' +
        '<td class="num">' + (ratio === null ? '—' : D2.format(ratio)) + '</td></tr>';
    }).join('');
  }

  function renderHeader() {
    el.prov.innerHTML =
      '<div><dt>Snapshot as of</dt><dd>' + esc(META.as_of) + '</dd></div>' +
      '<div><dt>Read at</dt><dd>' + esc(String(META.fetched_at || '').replace(/\.\d+Z$/, 'Z')) + '</dd></div>' +
      '<div><dt>Floor</dt><dd>' + usd(META.floor_usd) + '</dd></div>' +
      '<div><dt>Protocols</dt><dd>' + INT.format(META.protocols) + '</dd></div>';
    el.tiles.innerHTML =
      '<dl class="tile"><dt>Candidates</dt><dd>' + INT.format(META.candidate_count) +
        '<span class="sub">screened in, from ' + INT.format(META.protocols) + ' protocols</span></dd></dl>' +
      '<dl class="tile"><dt>On the watchlist</dt><dd>' + INT.format(META.watchlist_count) +
        '<span class="sub">every one of them present on the board</span></dd></dl>' +
      '<dl class="tile hot"><dt>Total implied value</dt><dd>' + usdShort(META.total_implied_usd) +
        '<span class="sub">' + usd(META.total_implied_usd) + ' summed over the board</span></dd></dl>' +
      '<dl class="tile"><dt>Median multiple</dt><dd>' + D2.format(META.median_multiple_global) +
        '<span class="sub">mcap ÷ TVL over ' + INT.format(META.live_count) + ' live-token protocols</span></dd></dl>';
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
    if (!ROWS.length) {
      document.querySelector('main').innerHTML =
        '<section class="wrap"><div class="empty"><p class="etitle">The board is empty</p>' +
        '<p class="ebody">data.js beside this page carries no rows: the entrypoint writes it from the ranked ' +
        'board on every run, so an empty set here means the snapshot held nothing to screen.</p></div></section>';
      return;
    }
    var url = readURL();
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
    renderMethod();
    renderLive();
    renderBoard();
    wire();
    if (url.p && bySlug(url.p)) openDetail(url.p, null);
  }

  start();
})();
