# token-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/8kunoir8/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/8kunoir8/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ranks 178 tokenless protocols from DefiLlama's sealed snapshot by implied launch value, with costed farm plans and live-token comps. A launch radar for the tokens that do not exist yet: every protocol on the snapshot's watchlist plus every other pre-token protocol below the watchlist floor, scored by one stated model (radar-2), each with a concrete farm plan, an estimated airdrop claim, and the live tokens whose market caps set its comps.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input /path/to/snapshot.json
```

Node.js 22.18 or later, stdlib only, no network at run time. Then open `out/dashboard/index.html` in a browser — the page is fully offline (`data.js` carries the whole board).

## What it writes

- `out/board.json` — 178 ranked rows: rank, slug, name, category, chains, TVL, 7d change, tokenless age, tier (`watchlist` / `early`), implied launch value, comp/growth/maturity multiples, airdrop pool, wallet estimate, median claim estimate, and 3–12 farm-plan steps (each 20–600 chars with a cost and a time).
- `out/data.js` — the same board compacted for the offline page, plus the top-30 live comps and the model constants.
- `out/dashboard/` — the page: sortable/filterable board, per-protocol detail (value breakdown, comps provenance, airdrop math, farm plan, risks), live-token comps tab, and a model tab with a what-if sandbox that re-ranks client-side with the same model code.
- `out/dossier.json` — make.fun dossier (cover, three screenshots, full dashboard source).
- `out/screenshots/` — board, detail and filtered views, 1440×900.

## The model (radar-2)

```
implied_launch_usd = tvl_usd × comp_multiple × growth_mult × maturity_mult
comp_multiple      = clamp((n·median_cat + k·median_global)/(n+k), 0.05, 8), k=3
growth_mult        = 1 + 0.5·clamp(change_7d, -60, 120)/100
maturity_mult      = 0.7 + 0.5·min(age_days, 1095)/1095   (unknown age → 365d)
median_claim_usd   = implied × 0.10 / clamp(tvl/25000, 1000, 1500000)
```

Comps are mcap/TVL medians of the snapshot's own live protocols, per category, shrunk toward the global median so a one-protocol category cannot invent a multiple. Every input is a snapshot field; nothing is hardcoded per protocol except researched points-program facts (cited in `dashboard/plans.js` and `RESEARCH.md`). The airdrop base rates (≈10% of supply, ≈$1,000 median payout, ≈$400 at the 10th percentile) come from EarlyThunder's 12-airdrop study; the wallet count is a TVL proxy, not a census.

## Why these rows

The watchlist's 40 protocols are all covered. Below the floor, every protocol that records no token and is not a wrapped/staked/versioned product of a traded token, a CEX/bridge/staking wrapper, or a parent protocol's sub-product is ranked — the same exclusions the watchlist itself applies, stated on the page. "Records no token" is DefiLlama's record, not proof a token cannot exist; implied value is a conditional claim, never an issuance prediction.

## Research

`RESEARCH.md` lists every reference (airdrop base rates, points-program mechanics, DefiLlama semantics) and what each one supports. The dashboard's Model & sources tab shows the same list offline.

## Reproducibility

Two runs on the same snapshot write byte-identical `board.json`, `data.js` and `dossier.json` (no clocks, no randomness). `main.ts` self-checks the board against the kit's gate rules before writing the dossier.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=2zer828j&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
