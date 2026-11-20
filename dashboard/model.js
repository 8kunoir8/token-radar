// radar-2 value model. One source of truth: main.ts requires this file (Node, CJS export) and the
// dashboard loads it as a classic script (window.RadarModel), so board.json and the page run the
// same arithmetic. Every figure comes from the sealed snapshot; no protocol name is special-cased.
//
//   comp      = median(mcap/TVL) of the snapshot's live-token protocols in the same category,
//               shrunk toward the global median with k pseudo-observations, clamped to [0.05, 8]
//   growth    = 1 + clamp(change_7d, -60, 120)/100 * growth_weight
//   maturity  = maturity_floor + min(age_days, 1095)/1095 * maturity_range   (unknown age: 365d)
//   implied   = max(1, round(TVL * comp * growth * maturity))               (the launch's FDV claim)
//   claim     = implied * airdrop_share / wallets_est                      (median farmer estimate)
//   wallets   = clamp(round(TVL / 25000), 1000, 1500000)                   (eligible-wallet proxy)
//
// Calibration references (see RESEARCH.md): median historical airdrop ~10% of supply
// (EarlyThunder 2026, 12 drops; Arbitrum DAO ~11%; Hyperliquid 31% is the outlier), median payout
// ~$1000 and 10th percentile ~$400, wallet count drives the per-wallet share (Jito 9,852 wallets
// vs Starknet 1.3M). The model states a conditional launch value, never a prediction of issuance.
(function (root) {
  'use strict';

  var K = {
    growth_weight: 0.5,
    growth_floor: -60,
    growth_cap: 120,
    maturity_floor: 0.7,
    maturity_range: 0.5,
    maturity_days: 1095,
    unknown_age_days: 365,
    shrink_k: 3,
    mult_floor: 0.05,
    mult_cap: 8,
    airdrop_share: 0.10,
    tvl_per_wallet: 25000,
    wallets_min: 1000,
    wallets_max: 1500000
  };
  var VERSION = 'radar-2';
  var DAY_MS = 86400000;
  var VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
  var PRODUCT_WORDS = /\b(wrapped|staked|staking)\b/i;
  var EXCHANGE = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
  var PRODUCT_CATS = { Bridge: 1, 'Canonical Bridge': 1, 'Liquid Staking': 1, 'Liquid Restaking': 1, 'Restaked BTC': 1, CEX: 1 };

  function finite(v, fallback) { return typeof v === 'number' && isFinite(v) ? v : fallback; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function median(xs) {
    if (xs.length === 0) return null;
    var a = xs.slice().sort(function (x, y) { return x - y; });
    var m = a.length >> 1;
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
  }
  function round4(n) { return Math.round(n * 1e4) / 1e4; }

  function ageDays(asOf, listedAt) {
    if (!listedAt) return null;
    var a = Date.parse(asOf + 'T00:00:00Z'), b = Date.parse(listedAt + 'T00:00:00Z');
    if (!isFinite(a) || !isFinite(b)) return null;
    return Math.max(0, Math.round((a - b) / DAY_MS));
  }

  function isPreToken(p) { return p.mcap_usd === null && p.gecko_id === null && p.symbol === null; }

  // The watchlist's own name/category rule, applied below the floor where DefiLlama's parentProtocol
  // record is not in the snapshot. Above the floor the watchlist itself is authoritative: it already
  // carries the parent-product exclusions the ten-field snapshot cannot show.
  function isRankable(p) {
    return isPreToken(p) && !PRODUCT_CATS[p.category] && !VERSIONED.test(p.name) &&
      !PRODUCT_WORDS.test(p.name) && !EXCHANGE.test(p.name);
  }

  // Category comparables from the snapshot's live-token protocols: mcap/TVL medians, shrunk toward
  // the global median so a one-protocol category cannot set a wild multiple.
  function buildComps(protocols, k) {
    var kk = finite(k, K.shrink_k);
    var ratios = [], byCat = {};
    for (var i = 0; i < protocols.length; i++) {
      var p = protocols[i];
      if (p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0) {
        var r = p.mcap_usd / p.tvl_usd;
        ratios.push(r);
        var c = p.category || 'Uncategorized';
        (byCat[c] = byCat[c] || []).push(r);
      }
    }
    var global = median(ratios) || 0.2;
    var cats = {};
    Object.keys(byCat).sort().forEach(function (c) {
      var xs = byCat[c], med = median(xs);
      var shrunk = (xs.length * med + kk * global) / (xs.length + kk);
      cats[c] = { n: xs.length, median: round4(med), multiple: round4(clamp(shrunk, K.mult_floor, K.mult_cap)) };
    });
    return { global: round4(global), live_n: ratios.length, shrink_k: kk, cats: cats };
  }

  function compFor(comps, category) {
    var c = comps.cats[category || 'Uncategorized'];
    return c ? c.multiple : comps.global;
  }

  // The board's membership: every watchlist slug (the floor) plus every rankable pre-token protocol
  // below the floor (the early radar the owner asked for: find launches before they are obvious).
  function selectRows(snapshot) {
    var wl = {}, chosen = [];
    snapshot.watchlist.forEach(function (s) { wl[s] = 1; });
    var index = {};
    snapshot.protocols.forEach(function (p) { index[p.slug] = p; });
    snapshot.watchlist.forEach(function (s) { if (index[s]) chosen.push(index[s]); });
    snapshot.protocols.forEach(function (p) {
      if (!wl[p.slug] && p.tvl_usd < snapshot.floor_usd && isRankable(p)) chosen.push(p);
    });
    return chosen;
  }

  function score(p, asOf, comps, k) {
    var kk = k || K;
    var age = ageDays(asOf, p.listed_at);
    var g = clamp(finite(p.change_7d, 0), kk.growth_floor, kk.growth_cap);
    var gm = 1 + (g / 100) * kk.growth_weight;
    var ageFor = age === null ? kk.unknown_age_days : age;
    var mm = kk.maturity_floor + (clamp(ageFor, 0, kk.maturity_days) / kk.maturity_days) * kk.maturity_range;
    var mult = compFor(comps, p.category);
    var implied = Math.max(1, Math.round(p.tvl_usd * mult * gm * mm));
    var wallets = clamp(Math.round(p.tvl_usd / kk.tvl_per_wallet), kk.wallets_min, kk.wallets_max);
    var pool = implied * kk.airdrop_share;
    var claim = Math.max(1, Math.round(pool / wallets));
    return {
      age: age, growth_pct: round4(g), growth_mult: round4(gm), maturity_mult: round4(mm),
      comp_multiple: mult, implied: implied, wallets_est: wallets,
      airdrop_pool_usd: Math.round(pool), median_claim_usd: claim
    };
  }

  function tierOf(p, floor, watchlist) {
    if (watchlist[p.slug]) return 'watchlist';
    return p.tvl_usd < floor ? 'early' : 'listed';
  }

  // Full ranked board: ranks 1..N, implied value never rising as rank ascends, slug tie-break.
  function buildBoard(snapshot, k) {
    var kk = k || K;
    var comps = buildComps(snapshot.protocols, kk.shrink_k);
    var wl = {};
    snapshot.watchlist.forEach(function (s) { wl[s] = 1; });
    var scored = selectRows(snapshot).map(function (p) {
      return { p: p, s: score(p, snapshot.as_of, comps, kk), tier: tierOf(p, snapshot.floor_usd, wl) };
    });
    scored.sort(function (a, b) { return b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0); });
    return { comps: comps, rows: scored.map(function (x, i) { return { rank: i + 1, p: x.p, s: x.s, tier: x.tier }; }) };
  }

  var M = {
    K: K, VERSION: VERSION, ageDays: ageDays, isPreToken: isPreToken, isRankable: isRankable,
    buildComps: buildComps, compFor: compFor, selectRows: selectRows, score: score,
    tierOf: tierOf, buildBoard: buildBoard, median: median, clamp: clamp, round4: round4
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  root.RadarModel = M;
})(typeof globalThis !== 'undefined' ? globalThis : this);
