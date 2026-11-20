# Research behind token-radar

Every number the model uses is either a field of the sealed DefiLlama snapshot (2026-11-14) or a constant justified below. References were read during the build; each entry says what it supports.

## Airdrop base rates (the claim estimate)

1. **EarlyThunder Research — airdrop performance data (May 2026).** https://earlythunder.com/research/airdrop-performance-data — 12 airdrops: median ≈10% of supply airdropped, median payout ≈$1,000, 10th percentile ≈$400; 88% of tokens decline within 90 days. Supports `airdrop_share = 0.10` and the sanity range for `median_claim_usd` (the board's median estimate lands near the study's 10th percentile, not its median — deliberately conservative).
2. **Messias, Yaish & Livshits — "Airdrops: Giving Money Away Is Harder Than It Seems" (arXiv 2312.02752).** https://arxiv.org/abs/2312.02752 — farmer sell-off, sybil design, and the argument that rewards should scale with participants' costs. Supports treating the wallet estimate as a cost-bearing participant proxy (TVL/25k) and clamping it, and the disclaimer that claims are conditional.
3. **Arbitrum DAO — ARB eligibility & distribution.** https://docs.arbitrum.foundation/airdrop-eligibility-distribution — ≈11% of supply, activity-point criteria. Cross-check on the 10% share and on points-based eligibility used in the farm plans.
4. **Blockworks — Hyperliquid's HYPE airdrop.** https://blockworks.com/news/hyperliquid-hype-airdrop — 31% of supply: the outlier. Explicitly *not* the baseline; cited on the page so the 10% assumption is visibly a choice.
5. **Galaxy Research — Crypto Points Programs.** https://galaxy.com/insights/research/crypto-points-programs — points as pre-token distribution and their failure modes. Supports the risk notes (points can expire, reprice, or never convert).

## Points-program mechanics (the farm plans)

6. **Symbiotic docs — points program.** https://docs.symbiotic.fi/get-started/resources/points-program — Core V2: vault TVL allocated to adapters × 0.001 per hour; Season 2 delegation rewards. Used verbatim in the `symbiotic` plan step.
7. **Noble — points program blog.** https://noble.xyz/blog/points-program — USDN points vault: days × amount/100 × hold multiplier (×1 at 30d → ×1.75 at 120d+), <30d earns zero, TVL milestone bonus pools. Used in the `noble` plan (hold-period cost).
8. **Airdrops.io — OnRe and Upshift guides.** https://airdrops.io/onre and https://airdrops.io/upshift — ONyc points via partner DeFi strategies; Upshift's live vault points campaign. Used for those two protocols' steps.
9. **Doppler Finance — XDP airdrop.** https://doppler.finance (overview: https://phemex.com/academy/what-is-doppler-finance-xdp) — XRP/RLUSD vaults pay the return in the deposited asset during the campaign.
10. **Veda, Curvance, Mezo primary surfaces.** https://app.veda.tech (per-vault Points column), https://curvance.com (deposit/borrow/leverage/swap on Monad), https://mezo.org/blog/mezo-h1-2026 (MEZO launch covered → earn-season caveat). Protocol-specific facts carry their source string in `dashboard/plans.js`.

## Snapshot semantics (the row set and the comps)

11. **DefiLlama API docs & methodology.** https://api-docs.defillama.com and https://docs.llama.fi — `/protocols` fields: `tvl_usd`, `mcap_usd`, `change_7d`, `listed_at`, `category`, `parentProtocol`, `gecko_id`/`symbol`. Supports: tokenless = no mcap/gecko/symbol record; comps = mcap/TVL of live protocols; exclusions follow the watchlist's own rules (parent products, wrapped/staked/versioned variants, CEX/bridge/staking wrappers).

## Method decisions and their limits

- **Shrunk comps (k=3).** A category with one live protocol (e.g. Risk Curators) must not set its own multiple: `(n·median + 3·global)/(n+3)`, clamped [0.05, 8]. The clamp is what stops Prediction Market's ×400 raw median from pricing a small DEX at ×400.
- **Growth weight 0.5, floor −60%, cap +120%.** 7d TVL change is noisy; half-weight and caps keep one week from dominating a launch claim.
- **Maturity 0.7 → 1.2 over 1095 days.** Longer tokenless history = more accumulated points/expectation (Noble's hold multiplier is the micro-evidence); unknown age defaults to 365d, stated per row.
- **Wallets = TVL/25,000, clamped [1k, 1.5M].** A proxy for cost-bearing participants, not a census; the clamp keeps tiny protocols' per-wallet claims from exploding and mega-protocols' from vanishing.
- **Exclusions.** Above the floor the board follows the watchlist's own record (DefiLlama parent products excluded); below it, every pre-token protocol passing the same name/category rules is ranked. 178 rows = 40 watchlist + 138 early.
- **Honesty limits, stated on the page:** "records no token" ≠ "has no token"; implied value is conditional on the record standing; farm costs are estimates; nothing is financial advice.

## Round 2 — implied valuation cross-checks and early detection

12. **DeSpread Research — Point Valuation Framework (Gomble case).** https://research.despread.io/airdrop-valuation-gomble — a point's price is the expected airdrop value times the accrual share; pre-market point trades reveal an implied FDV before TGE. Independent confirmation that the radar's `implied` (FDV claim) → `claim` (per-wallet share) chain is the same arithmetic the points market prices, and that stating it conditionally is the honest form.
13. **DL News — Whales Market lets airdrop hunters trade points.** https://www.dlnews.com/articles/defi/solana-whales-market-lets-airdrop-hunters-trade-points — collateralised peer-to-peer points and pre-market allocation trading; the market-side analogue of the radar's claim estimate (see also https://fibonacci.market/blog/pre-market-token-trading-explained for the three pre-market forms).
14. **DL News — VCs blame airdrop flops on high-FDV tokens.** https://www.dlnews.com/articles/defi/vcs-blame-airdrop-flops-on-high-fdv-tokens-and-manipulation/ — KMNO −63% within an hour of launch, REZ sell-off; Gate Learn's airdrop-meta survey (https://www.gate.com/learn/articles/the-airdrop-meta-a-lull-in-performance-or-an-obituary/4137) shows the same TGE-to-date decay. Why the board labels every figure a *conditional* launch claim and never a prediction: high implied FDV is exactly what the market punishes.
15. **DefiLlama new-listing lead lists.** https://apify.com/yadroo/defillama-protocols/examples/new-defi-protocols-listed-in-2026 — filtering fresh DefiLlama listings by TVL floor and 7d change is an established early-sourcing pattern; the radar's EMERGING tier (≤120 days tokenless and growing) is that pattern applied to the sealed snapshot, surfaced as a filter and a masthead count.

Round 2 also adds setup economics to every plan (gas & fees, capital in position, active setup time, hold window), accumulated in `dashboard/plans.js` from the same per-step figures the step strings state, and shows the model equation on the board itself so the first screen carries the value model, not only the Model tab.

## Round 3 — the farm decision, not just the farm steps

16. **Break-even airdrop share.** `fees × wallets ÷ implied FDV` is the airdrop share at which the p50 claim just covers setup gas & fees; the detail view states it beside the model's 10% assumption (EarlyThunder's median, https://earlythunder.com/research/airdrop-performance-data) so a reader sees the headroom, not just the payout. Same arithmetic as the points market's price = expected airdrop value × accrual share (DeSpread, ref 12): inverted, it asks "how small can the drop be before this farm stops paying for itself".
17. **No-drop downside.** Capital returns on unwind, so a farm that never drops loses fees and active time only (plus the contract risk each plan's risk note states). Stating the downside next to the p50 claim is the honest form of the conditional claim: high-FDV launches decay (DL News / Gate Learn, ref 14), so the decision number is the break-even share and the fee loss, never the headline payout.

Round 3 shows both in the detail view's plan header (net p50 after fees, break-even share, claim per $1 fee, no-drop loss), computed in `dashboard/app.js` from the same model score and per-step fee totals `main.ts` writes, and trims duplicated fineprint so all five dashboard source files still fit the dossier's 65,536-byte text whole.
