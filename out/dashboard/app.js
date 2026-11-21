// Token Radar's page. Reads window.RADAR (written beside dashboard/ by main.ts) and renders the
// ranked board, a detail view per protocol, the live-token comps set and the model with a what-if
// sandbox. No network: every byte is in data.js, model.js and plans.js — the same model and plans
// main.ts ran to write board.json, so the page and the board are one derivation.
(function () {
  'use strict';
  var D = window.RADAR, M = window.RadarModel, P = window.RadarPlans;
  var app = document.getElementById('app');
  if (!D || !M || !P) { app.textContent = 'data.js missing: run main.ts first.'; return; }

  var state = { tab: 'board', q: '', cat: 'all', chain: 'all', tier: 'all', sort: 'rank', dir: 1, selected: null, sandbox: null };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined) return '—';
    var a = Math.abs(n);
    if (a >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (a >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { return n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%'; }
  function fmtAge(d) {
    if (d === null || d === undefined) return '—';
    if (d >= 730) return (d / 365).toFixed(1) + 'y';
    if (d >= 60) return Math.round(d / 30) + 'mo';
    return d + 'd';
  }
  function fmtMin(m) { return m < 60 ? m + ' min' : (m / 60).toFixed(1) + ' h'; }
  function el(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined) return;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    });
    (kids || []).forEach(function (c) { if (c === null || c === undefined) return; e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function g7class(n) { return n === null || n === undefined ? 'flat' : n > 0.5 ? 'up' : n < -0.5 ? 'down' : 'flat'; }
  function isRising(r) { return r.tier === 'early' && (r.g7 || 0) >= 15; }
  function isEmerging(r) { return r.tier === 'early' && r.age !== null && r.age <= 120 && (r.g7 || 0) > 0; }

  // --- sandbox: re-score every row with adjusted constants, same model code ----
  function protoOf(r) {
    return { slug: r.slug, name: r.name, category: r.cat, chains: r.chains, tvl_usd: r.tvl, change_7d: r.g7, mcap_usd: null, listed_at: r.listed, gecko_id: null, symbol: null };
  }
  function currentK() {
    var k = {}; Object.keys(D.k).forEach(function (x) { k[x] = D.k[x]; });
    if (state.sandbox) Object.keys(state.sandbox).forEach(function (x) { k[x] = state.sandbox[x]; });
    return k;
  }
  function currentComps() {
    var k = currentK();
    if (!state.sandbox || state.sandbox.shrink_k === undefined) return D.comps;
    var cats = {};
    Object.keys(D.comps.cats).forEach(function (c) {
      var x = D.comps.cats[c];
      var sh = (x.n * x.median + k.shrink_k * D.comps.global) / (x.n + k.shrink_k);
      cats[c] = { n: x.n, median: x.median, multiple: M.round4(M.clamp(sh, k.mult_floor, k.mult_cap)) };
    });
    return { global: D.comps.global, live_n: D.comps.live_n, shrink_k: k.shrink_k, cats: cats };
  }
  function scoredRows() {
    var k = currentK(), comps = currentComps();
    var rows = D.rows.map(function (r) {
      if (!state.sandbox) return r;
      var s = M.score(protoOf(r), D.as_of, comps, k);
      var c = {}; Object.keys(r).forEach(function (x) { c[x] = r[x]; });
      c.implied = s.implied; c.mult = s.comp_multiple; c.gm = s.growth_mult; c.mm = s.maturity_mult;
      c.claim = s.median_claim_usd; c.wallets = s.wallets_est; c.pool = s.airdrop_pool_usd;
      return c;
    });
    rows.sort(function (a, b) { return b.implied - a.implied || (a.slug < b.slug ? -1 : 1); });
    rows.forEach(function (r, i) { r.rank = i + 1; });
    return rows;
  }

  // --- filtering + sorting -----------------------------------------------------
  function visible(rows) {
    var q = state.q.toLowerCase();
    return rows.filter(function (r) {
      if (state.tier === 'watchlist' && r.tier !== 'watchlist') return false;
      if (state.tier === 'early' && r.tier !== 'early') return false;
      if (state.tier === 'rising' && !isRising(r)) return false;
      if (state.tier === 'emerging' && !isEmerging(r)) return false;
      if (state.cat !== 'all' && (r.cat || 'Uncategorized') !== state.cat) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) < 0) return false;
      if (q && (r.name + ' ' + r.slug + ' ' + (r.cat || '')).toLowerCase().indexOf(q) < 0) return false;
      return true;
    });
  }
  function sorted(rows) {
    var s = state.sort, d = state.dir;
    return rows.slice().sort(function (a, b) {
      var av = a[s], bv = b[s];
      if (s === 'name' || s === 'cat') { av = (av || '').toLowerCase(); bv = (bv || '').toLowerCase(); return av < bv ? -d : av > bv ? d : 0; }
      av = av === null || av === undefined ? -Infinity : av; bv = bv === null || bv === undefined ? -Infinity : bv;
      return (av - bv) * d || (a.slug < b.slug ? -1 : 1);
    });
  }
  function options(key) {
    var set = {};
    D.rows.forEach(function (r) {
      if (key === 'cat') set[r.cat || 'Uncategorized'] = 1;
      else r.chains.forEach(function (c) { set[c] = 1; });
    });
    return Object.keys(set).sort();
  }

  // --- hash routing -------------------------------------------------------------
  function readHash() {
    var h = location.hash.replace(/^#/, '');
    h.split('&').forEach(function (kv) {
      var p = kv.split('=');
      if (p[0] === 'p' && p[1]) state.selected = decodeURIComponent(p[1]);
      if (p[0] === 'tab' && ['board', 'live', 'model'].indexOf(p[1]) >= 0) state.tab = p[1];
    });
  }
  function writeHash() {
    var parts = [];
    if (state.tab !== 'board') parts.push('tab=' + state.tab);
    if (state.selected) parts.push('p=' + encodeURIComponent(state.selected));
    var h = parts.length ? '#' + parts.join('&') : '';
    if (location.hash !== h) history.replaceState(null, '', h || location.pathname + location.search);
  }

  // --- board ---------------------------------------------------------------------
  var COLS = [
    ['rank', '#', 1], ['name', 'Protocol', 1], ['cat', 'Category', 1], ['chains', 'Chains', 1],
    ['tvl', 'TVL', -1], ['g7', '7d', -1], ['age', 'Tokenless', -1], ['implied', 'Implied launch', -1], ['claim', 'Est. claim', -1]
  ];
  function sortHeader(key, label, num) {
    var active = state.sort === key;
    var th = el('th', { class: num ? 'num' : '', 'aria-sort': active ? (state.dir > 0 ? 'ascending' : 'descending') : 'none',
      onclick: function () { if (active) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'rank' || key === 'name' || key === 'cat' ? 1 : -1; } render(); } },
      [label + ' ', active ? el('span', { class: 'arr', text: state.dir > 0 ? '▲' : '▼' }) : null]);
    return th;
  }
  function boardTable(rows) {
    var head = el('thead', {}, [el('tr', {}, COLS.map(function (c) { return sortHeader(c[0], c[1], c[2] < 0); }))]);
    var body = el('tbody');
    rows.forEach(function (r) {
      var tr = el('tr', { class: r.rank <= 10 ? 'top' : '', tabindex: '0', role: 'button', 'aria-label': r.name + ' detail',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } } }, [
        el('td', {}, [el('span', { class: 'rank', text: String(r.rank) })]),
        el('td', {}, [
          el('span', { class: 'dot ' + r.tier }), el('span', { class: 'pname', text: r.name }),
          isRising(r) ? el('span', { class: 'rising', text: 'rising' }) : null,
          isEmerging(r) ? el('span', { class: 'rising new', text: 'emerging' }) : null,
          el('span', { class: 'pslug', text: r.slug })
        ]),
        el('td', { class: 'cat', text: r.cat || '—' }),
        el('td', { class: 'chains', title: r.chains.join(', '), text: r.chains.slice(0, 2).join(', ') + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl) }),
        el('td', { class: 'num ' + g7class(r.g7), text: fmtPct(r.g7) }),
        el('td', { class: 'num', text: fmtAge(r.age) }),
        el('td', { class: 'num value', text: fmtUsd(r.implied) }),
        el('td', { class: 'num claim', text: fmtUsd(r.claim) })
      ]);
      body.appendChild(tr);
    });
    return el('div', { class: 'tablewrap', id: 'board' }, [el('table', {}, [head, body])]);
  }
  function controls(shown, total) {
    var search = el('input', { class: 'search', type: 'search', placeholder: 'Search name, slug or category…', value: state.q, 'aria-label': 'Search protocols',
      oninput: function (e) { state.q = e.target.value; render(); var s = document.querySelector('.search'); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } } });
    var cat = el('select', { 'aria-label': 'Filter by category', onchange: function (e) { state.cat = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All categories' })].concat(options('cat').map(function (c) { return el('option', { value: c, text: c, selected: state.cat === c ? '' : null }); })));
    var chain = el('select', { 'aria-label': 'Filter by chain', onchange: function (e) { state.chain = e.target.value; render(); } },
      [el('option', { value: 'all', text: 'All chains' })].concat(options('chain').map(function (c) { return el('option', { value: c, text: c, selected: state.chain === c ? '' : null }); })));
    var seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Filter by tier' }, ['all', 'watchlist', 'early', 'rising', 'emerging'].map(function (t) {
      return el('button', { 'aria-pressed': state.tier === t ? 'true' : 'false', text: t, onclick: function () { state.tier = t; render(); } });
    }));
    return el('div', { class: 'controls' }, [search, cat, chain, seg, el('span', { class: 'count', text: shown + ' / ' + total + ' rows' })]);
  }
  function stats(rows) {
    var claims = rows.map(function (r) { return r.claim; }).sort(function (a, b) { return a - b; });
    var med = claims.length ? claims[claims.length >> 1] : 0;
    var wl = D.rows.filter(function (r) { return r.tier === 'watchlist'; }).length;
    var rising = rows.filter(isRising).length;
    return el('div', { class: 'stats' }, [
      el('div', { class: 'stat' }, [el('div', { class: 'lbl', text: 'Pre-token rows' }), el('div', { class: 'val', text: String(rows.length) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'lbl', text: 'Watchlist covered' }), el('div', { class: 'val green', text: wl + ' / ' + D.watchlist_size })]),
      el('div', { class: 'stat' }, [el('div', { class: 'lbl', text: 'Rising early (7d ≥ +15%)' }), el('div', { class: 'val amber', text: String(rising) })]),
      el('div', { class: 'stat' }, [el('div', { class: 'lbl', text: 'Median est. claim' }), el('div', { class: 'val cyan', text: fmtUsd(med) })])
    ]);
  }
  function boardView() {
    var all = scoredRows(), rows = sorted(visible(all));
    var strip = el('p', { class: 'modelstrip', text: 'implied = TVL × comp (shrunk category median mcap/TVL, k=' + D.k.shrink_k + ', clamp 0.05–8) × growth (7d) × maturity (tokenless age) · claim = implied × ' + Math.round(D.k.airdrop_share * 100) + '% airdrop ÷ wallets ≈ TVL/25K' });
    var frag = el('div', {}, [stats(rows), strip, controls(rows.length, all.length)]);
    if (state.sandbox) frag.appendChild(el('div', { class: 'note', text: 'Sandbox what-if: ranks below use your adjusted constants. Reset on the Model tab.' }));
    frag.appendChild(rows.length ? boardTable(rows) : el('div', { class: 'tablewrap' }, [el('div', { class: 'empty', text: 'No protocol matches these filters.' })]));
    frag.appendChild(el('p', { class: 'fineprint', text: 'Conditional FDV claim on this record, not a prediction. Click a row for breakdown + farm plan.' }));
    return frag;
  }

  // --- detail ---------------------------------------------------------------------
  var dialog = el('dialog', { class: 'detail', 'aria-labelledby': 'dtitle' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });
  document.body.appendChild(dialog);
  function parseStep(s) {
    var ci = s.lastIndexOf(' Cost: '), ti = s.lastIndexOf('. Time: ');
    if (ci < 0 || ti < ci) return { text: s, cost: '', time: '' };
    return { text: s.slice(0, ci), cost: s.slice(ci + 7, ti), time: s.slice(ti + 8).replace(/\.$/, '') };
  }
  function openDetail(slug) {
    var r = scoredRows().filter(function (x) { return x.slug === slug; })[0];
    if (!r) return;
    state.selected = slug; writeHash();
    var p = protoOf(r), k = currentK(), comps = currentComps();
    var s = M.score(p, D.as_of, comps, k);
    var cc = comps.cats[r.cat || 'Uncategorized'];
    var steps = P.farmSteps(p, r.age), tot = steps.totals;
    dialog.textContent = '';
    var head = el('div', { class: 'dhead' }, [
      el('div', {}, [
        el('h2', { id: 'dtitle', text: r.name }),
        el('p', { class: 'dsub', text: r.slug + '  ·  ' + (r.cat || 'Uncategorized') + '  ·  ' + r.chains.join(', ') }),
        el('p', { class: 'dsub' }, [el('span', { class: 'chip', text: r.tier.toUpperCase() }), ' ', el('span', { class: 'chip', text: 'RECORDS NO TOKEN' }), ' ', el('span', { class: 'chip', text: 'RANK #' + r.rank })])
      ]),
      el('button', { class: 'dclose', 'aria-label': 'Close detail', text: '✕', onclick: function () { dialog.close(); } })
    ]);
    var calc = el('div', { class: 'calc' }, [
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'TVL' }), el('div', { class: 'num', text: fmtUsd(r.tvl) })]),
      el('div', { class: 'op', text: '×' }),
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Comp multiple (' + (r.cat || 'global') + ')' }), el('div', { class: 'num', text: '×' + s.comp_multiple.toFixed(2) })]),
      el('div', { class: 'op', text: '×' }),
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Growth (' + fmtPct(r.g7) + ' 7d)' }), el('div', { class: 'num', text: '×' + s.growth_mult.toFixed(2) })]),
      el('div', { class: 'op', text: '×' }),
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Maturity (' + fmtAge(r.age) + ' tokenless)' }), el('div', { class: 'num', text: '×' + s.maturity_mult.toFixed(2) })]),
      el('div', { class: 'cell result' }, [el('div', { class: 'lbl', text: 'Implied launch FDV' }), el('div', { class: 'num', text: fmtUsd(s.implied) })])
    ]);
    var compKv = el('dl', { class: 'kv' }, [
      el('dt', { text: 'Comp category' }), el('dd', { text: (r.cat || 'Uncategorized') + (cc ? ' — ' + cc.n + ' live protocols' : ' — no live comp; global median') }),
      el('dt', { text: 'Raw median mcap/TVL' }), el('dd', { text: cc ? '×' + cc.median.toFixed(3) : '×' + comps.global.toFixed(3) + ' (global)' }),
      el('dt', { text: 'Shrunk (k=' + comps.shrink_k + ')' }), el('dd', { text: '×' + s.comp_multiple.toFixed(3) + ', clamped [0.05, 8]' }),
      el('dt', { text: 'p10–p90 band' }), el('dd', { text: fmtUsd(s.implied_lo) + '–' + fmtUsd(s.implied_hi) + ' FDV (category comps)' }),
      el('dt', { text: 'Listed / age' }), el('dd', { text: (r.listed || 'unknown') + ' · ' + (r.age === null ? 'age unknown → 365d' : r.age + ' days') })
    ]);
    var air = el('div', { class: 'airdrop' }, [
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Airdrop share' }), el('div', { class: 'num', text: Math.round(k.airdrop_share * 100) + '%' })]),
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Pool at FDV' }), el('div', { class: 'num', text: fmtUsd(s.airdrop_pool_usd) })]),
      el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Wallets est. (TVL/25K)' }), el('div', { class: 'num', text: s.wallets_est.toLocaleString('en-US') })]),
      el('div', { class: 'cell result' }, [el('div', { class: 'lbl', text: 'Median claim est.' }), el('div', { class: 'num', text: fmtUsd(s.median_claim_usd) })])
    ]);
    var stepList = el('ol', { class: 'steps' }, steps.map(function (st) {
      var x = parseStep(st);
      return el('li', {}, [x.text, el('div', { class: 'tags' }, [
        x.cost ? el('span', { class: 'tag cost', text: 'cost: ' + x.cost }) : null,
        x.time ? el('span', { class: 'tag time', text: 'time: ' + x.time }) : null
      ])]);
    }));
    var body = el('div', { class: 'dbody' }, [
      el('h3', { text: 'Value breakdown — radar-2' }), calc,
      el('h3', { text: 'Where the multiple comes from' }), compKv,
      el('h3', { text: 'What a farm could pay (conditional)' }), air,
      el('p', { class: 'fineprint', text: 'Base rates: median airdrop ≈ 10% of supply; wallets est. is a TVL proxy, not a census (Jito 9,852 vs Starknet 1.3M).' }),
      el('h3', { text: 'Farm plan — ' + steps.length + ' steps · p50 claim ' + fmtUsd(s.median_claim_usd) + ' · FDV band ' + fmtUsd(s.implied_lo) + '–' + fmtUsd(s.implied_hi) }),
      el('div', { class: 'airdrop' }, [
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Setup gas & fees' }), el('div', { class: 'num', text: '$' + tot.fees_usd.toFixed(2) })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Capital in position' }), el('div', { class: 'num', text: fmtUsd(tot.capital_usd) })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Active setup time' }), el('div', { class: 'num', text: fmtMin(tot.active_min) })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Hold window' }), el('div', { class: 'num', text: tot.hold_days + ' days' })])
      ]),
      el('div', { class: 'airdrop' }, [
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Net p50 after fees' }), el('div', { class: 'num', text: fmtUsd(s.median_claim_usd - tot.fees_usd) })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Break-even airdrop share' }), el('div', { class: 'num', text: (100 * tot.fees_usd * s.wallets_est / s.implied).toFixed(3) + '%' })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'Claim per $1 fee' }), el('div', { class: 'num', text: '×' + Math.round(s.median_claim_usd / tot.fees_usd) })]),
        el('div', { class: 'cell' }, [el('div', { class: 'lbl', text: 'No-drop loss' }), el('div', { class: 'num', text: '−$' + tot.fees_usd.toFixed(2) })])
      ]),
      el('p', { class: 'fineprint', text: 'Break-even share = fees × wallets ÷ implied FDV; model assumes 10%. Capital returns on unwind.' }),
      stepList,
      el('div', { class: 'note risk', text: P.riskNote(r.cat) }),
    ]);
    dialog.appendChild(head); dialog.appendChild(body);
    if (!dialog.open) dialog.showModal();
  }

  // --- live + model ------------------------------------------------------------------
  function liveView() {
    var head = el('thead', {}, [el('tr', {}, ['Protocol', 'Category', 'Market cap', 'TVL', 'mcap/TVL', '7d'].map(function (h, i) { return el('th', { class: i > 1 ? 'num' : '', text: h }); }))]);
    var body = el('tbody', {}, D.live.map(function (l) {
      return el('tr', {}, [
        el('td', {}, [el('span', { class: 'pname', text: l.name }), el('span', { class: 'pslug', text: l.slug })]),
        el('td', { class: 'cat', text: l.cat || '—' }),
        el('td', { class: 'num', text: fmtUsd(l.mcap) }),
        el('td', { class: 'num', text: fmtUsd(l.tvl) }),
        el('td', { class: 'num value', text: l.ratio === null ? '—' : '×' + l.ratio.toFixed(2) }),
        el('td', { class: 'num ' + g7class(l.g7), text: fmtPct(l.g7) })
      ]);
    }));
    return el('div', {}, [
      el('div', { class: 'note', text: 'These protocols already trade a token: they are the comparables that set the board’s category multiples (mcap ÷ TVL), not farm targets. The ranked board holds only protocols whose DefiLlama record carries no token. Top 30 by market cap of ' + D.comps.live_n + ' live protocols in the snapshot.' }),
      el('div', { class: 'tablewrap' }, [el('table', {}, [head, body])])
    ]);
  }
  var SOURCES = [
    ['Messias, Yaish & Livshits — “Airdrops: Giving Money Away Is Harder Than It Seems” (arXiv 2312.02752): farmer sell-off, sybil design, rewards should scale with costs.', 'arxiv.org/abs/2312.02752'],
    ['EarlyThunder Research (May 2026) — 12 airdrops: median ≈ 10% of supply airdropped, median payout ≈ $1,000, 10th percentile ≈ $400; 88% of tokens decline within 90 days.', 'earlythunder.com/research/airdrop-performance-data'],
    ['Arbitrum DAO — ARB eligibility and distribution specifications (≈ 11% of supply, activity-point criteria).', 'docs.arbitrum.foundation/airdrop-eligibility-distribution'],
    ['Blockworks — Hyperliquid’s HYPE airdrop: 31% of supply, the outlier that should not be the baseline.', 'blockworks.com/news/hyperliquid-hype-airdrop'],
    ['Symbiotic docs — Core V2 points: vault TVL allocated to adapters × 0.001 per hour; Season 2 delegation.', 'docs.symbiotic.fi/get-started/resources/points-program'],
    ['Noble — USDN points vault: days × amount/100 × hold multiplier (×1 at 30d → ×1.75 at 120d+), TVL milestone bonuses.', 'noble.xyz/blog/points-program'],
    ['Airdrops.io — OnRe (ONyc points, updated Nov 2026) and Upshift (live vault points campaign) eligibility guides.', 'airdrops.io/onre · airdrops.io/upshift'],
    ['Doppler Finance — XDP airdrop page; XRP/RLUSD vaults pay the return in the deposited asset.', 'doppler.finance'],
    ['DefiLlama — /protocols API and methodology: TVL, mcap, parentProtocol and category semantics the snapshot carries.', 'api-docs.defillama.com · docs.llama.fi'],
    ['Galaxy Research — Crypto Points Programs: points as pre-token distribution and their failure modes.', 'galaxy.com/insights/research/crypto-points-programs'],
    ['DeSpread Research — point valuation framework (Gomble case): a point’s price is the expected airdrop value times the accrual share; pre-market point trades reveal an implied FDV.', 'research.despread.io/airdrop-valuation-gomble'],
    ['DL News — high-FDV airdrops flop: KMNO fell 63% within an hour of launch, REZ sold off; a launch FDV claim must stay conditional.', 'dlnews.com/articles/defi/vcs-blame-airdrop-flops-on-high-fdv-tokens-and-manipulation/']
  ];
  function modelView() {
    var k = currentK();
    var formula = el('pre', { class: 'formula', text:
'comp     = median(mcap/TVL of live protocols in category)\n' +
'           shrunk: (n·median + k·global) / (n + k),  k = ' + k.shrink_k + ',  clamp [0.05, 8]\n' +
'growth   = 1 + clamp(change_7d, −60, +120)/100 × ' + k.growth_weight + '\n' +
'maturity = ' + k.maturity_floor + ' + min(tokenless_days, 1095)/1095 × ' + k.maturity_range + '   (unknown age → 365d)\n' +
'implied  = max(1, round(TVL × comp × growth × maturity))      ← the launch’s FDV claim\n' +
'claim    = implied × ' + k.airdrop_share + ' ÷ clamp(round(TVL/25000), 1000, 1.5M)   ← median farmer estimate' });
    var sliders = [
      ['growth_weight', 'Growth weight', 0, 1.5, 0.1],
      ['maturity_range', 'Maturity range', 0, 1, 0.1],
      ['airdrop_share', 'Airdrop share', 0.02, 0.3, 0.01],
      ['shrink_k', 'Comp shrink k', 0, 10, 1]
    ].map(function (s) {
      var out = el('output', { text: String(k[s[0]]) });
      var rng = el('input', { class: 'rng', type: 'range', min: String(s[2]), max: String(s[3]), step: String(s[4]), value: String(k[s[0]]), 'aria-label': s[1],
        oninput: function (e) {
          var v = parseFloat(e.target.value);
          state.sandbox = state.sandbox || {};
          state.sandbox[s[0]] = v; out.textContent = String(v);
          render();
        } });
      return el('div', { class: 'slider' }, [el('label', {}, [s[1], out]), rng]);
    });
    var compRows = Object.keys(D.comps.cats).map(function (c) { var x = D.comps.cats[c]; return { c: c, n: x.n, m: x.median, u: x.multiple }; })
      .sort(function (a, b) { return b.n - a.n || (a.c < b.c ? -1 : 1); });
    var compTable = el('div', { class: 'tablewrap' }, [el('table', {}, [
      el('thead', {}, [el('tr', {}, [el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live n' }), el('th', { class: 'num', text: 'Median mcap/TVL' }), el('th', { class: 'num', text: 'Board multiple' })])]),
      el('tbody', {}, compRows.map(function (x) {
        return el('tr', {}, [el('td', { class: 'cat', text: x.c }), el('td', { class: 'num', text: String(x.n) }), el('td', { class: 'num', text: '×' + x.m.toFixed(3) }), el('td', { class: 'num value', text: '×' + x.u.toFixed(3) })]);
      }))
    ])]);
    return el('div', {}, [
      el('div', { class: 'panel' }, [el('h3', { text: 'The radar-2 value model (dashboard/model.js — the same code main.ts ran)' }), formula,
        el('p', { class: 'fineprint', text: 'Every input is the snapshot’s own: TVL, seven-day change, days listed with no token recorded, and the live-token set’s mcap/TVL medians. No protocol name enters the value model. The board ranks pre-token protocols only; the Live tab holds the traded comparables apart. Membership: all ' + D.watchlist_size + ' watchlist slugs (the floor) plus every pre-token protocol below $50M passing the watchlist’s name/category rule — ' + D.early_size + ' early rows, ' + D.rising_size + ' of them rising ≥ +15% in 7 days.' })]),
      el('div', { class: 'panel' }, [el('h3', { text: 'What-if sandbox — re-ranks the board live' }), el('div', { class: 'sandbox' }, sliders),
        el('div', { class: 'sandbox-actions' }, [
          el('button', { class: 'btn ghost', text: 'Reset to shipped model', onclick: function () { state.sandbox = null; render(); } }),
          el('span', { class: 'sandbox-note', text: state.sandbox ? 'Sandbox active — the Board tab shows what-if ranks.' : 'Shipped constants in force.' })
        ])]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Category comparables — global median ×' + D.comps.global.toFixed(3) + ' over ' + D.comps.live_n + ' live protocols' }), compTable]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Research behind the constants and plans' }),
        el('ul', { class: 'srcs' }, SOURCES.map(function (s) { return el('li', {}, [s[0], el('span', { class: 'u', text: s[1] })]); }))]),
      el('div', { class: 'panel' }, [el('h3', { text: 'Reading this radar honestly' }),
        el('p', { class: 'fineprint', text: '“Records no token” is DefiLlama’s record at ' + D.as_of + ', not proof a token cannot exist: a listed protocol may still carry a token the record misses, and wrapped/staked products of traded tokens are excluded by the watchlist’s own rule. Implied value is this entry’s conditional claim — what a launch would be worth if the record stood — never a prediction of whether or when a token issues, and never make.fun’s claim. Farm plans are general guidance with estimated costs; verify every program against the protocol’s own docs, farm only what you can lose, and never pay to claim. Nothing here is financial advice.' })])
    ]);
  }

  // --- shell ------------------------------------------------------------------------
  function masthead() {
    return el('header', { class: 'masthead' }, [
      el('div', { class: 'sweep', 'aria-hidden': 'true' }),
      el('div', {}, [
        el('h1', { class: 'wordmark' }, ['Token ', el('em', { text: 'Radar' })]),
        el('p', { class: 'tagline', text: 'Pre-token protocols ranked by implied launch value, with a concrete farm plan each. Sealed DefiLlama snapshot · ' + D.as_of + ' · model ' + D.version + '.' })
      ]),
      el('div', { class: 'meta' }, [
        el('span', { class: 'chip' }, [el('b', { text: String(D.board_size) }), ' rows']),
        el('span', { class: 'chip' }, ['watchlist ', el('b', { text: D.watchlist_size + '/' + D.watchlist_size })]),
        el('span', { class: 'chip' }, [el('b', { text: String(D.early_size) }), ' early']),
        el('span', { class: 'chip' }, [el('b', { text: String(D.rows.filter(isEmerging).length) }), ' emerging']),
        el('span', { class: 'chip' }, ['as of ', el('b', { text: D.as_of })])
      ])
    ]);
  }
  function tabs() {
    return el('nav', { class: 'tabs', role: 'tablist', 'aria-label': 'Views' }, [['board', 'Board'], ['live', 'Live tokens'], ['model', 'Model & sources']].map(function (t) {
      return el('button', { class: 'tab', role: 'tab', 'aria-selected': state.tab === t[0] ? 'true' : 'false', text: t[1],
        onclick: function () { state.tab = t[0]; state.selected = null; if (dialog.open) dialog.close(); writeHash(); render(); } });
    }));
  }
  function render() {
    app.textContent = '';
    app.removeAttribute('aria-busy');
    app.appendChild(masthead());
    app.appendChild(tabs());
    app.appendChild(state.tab === 'board' ? boardView() : state.tab === 'live' ? liveView() : modelView());
    app.appendChild(el('footer', { text: 'token-radar · radar-2 · built for make.fun/bounty/token-radar-01 · data: DefiLlama /protocols, fetched ' + D.source.split('fetched ')[1] + ' · no network, no tracking · MIT' }));
    if (state.selected) openDetail(state.selected);
  }
  readHash();
  render();
  window.addEventListener('hashchange', function () { readHash(); render(); });
  window.addEventListener('keydown', function (e) {
    if (e.key === '/' && !dialog.open && document.activeElement.tagName !== 'INPUT') { e.preventDefault(); var s = document.querySelector('.search'); if (s) s.focus(); }
  });
})();
