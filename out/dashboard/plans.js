// Farm plans: concrete steps with what they cost and how long they take, derived from the protocol's
// own record (category, chains, TVL, age). Same dual-mode contract as model.js: main.ts requires it,
// the page loads it, board.json's farm_steps and the detail view are the same derivation.
// Protocol-specific notes come from first-party docs researched for this build (RESEARCH.md cites
// them); they enrich a plan, never the value model.
(function (root) {
  'use strict';

  // Typical cost of one transaction per chain, in USD, for the gas estimates below.
  var GAS = {
    Ethereum: 4, Base: 0.05, Arbitrum: 0.1, Optimism: 0.1, Polygon: 0.02, Avalanche: 0.15,
    Solana: 0.01, Sui: 0.02, Aptos: 0.02, Bitcoin: 2, 'Babylon Genesis': 0.5, CORE: 0.02,
    BSquared: 0.05, Monad: 0.05, Ink: 0.05, Plasma: 0.02, Flare: 0.02, Stellar: 0.001,
    Algorand: 0.002, Tron: 0.5, Bittensor: 0.02, Noble: 0.05, Mezo: 0.05, Berachain: 0.05,
    Pharos: 0.02, 'Robinhood Chain': 0.02, Arc: 0.02, 'Plume Mainnet': 0.05, Ripple: 0.002,
    Hyperliquid: 0.01, Sonic: 0.02, Linea: 0.05, 'zkSync Era': 0.05, Scroll: 0.05, Blast: 0.05
  };
  function gasOf(chain) { return GAS[chain] !== undefined ? GAS[chain] : 0.5; }
  function chainOf(p) { return p.chains && p.chains.length ? p.chains[0] : 'its main chain'; }
  function money(n) { return n < 1 ? '$' + n.toFixed(2) : '$' + Math.round(n); }

  // Starter capital by protocol size: enough to be a real position, small enough to lose.
  function capitalFor(tvl) {
    if (tvl >= 1e9) return 1000;
    if (tvl >= 1e8) return 500;
    if (tvl >= 5e7) return 250;
    return 100;
  }
  // Younger protocols get a longer qualifying window: more snapshots before a likely TGE.
  function holdDaysFor(age) {
    if (age === null) return 45;
    if (age < 180) return 90;
    if (age < 365) return 60;
    return 30;
  }

  // Researched first-party facts (RESEARCH.md). Each adds one concrete step; the value model never
  // reads this table.
  var FACTS = {
    'symbiotic': { note: 'Symbiotic Core V2 pays points per hour on vault TVL allocated to adapters (TVL x 0.001); Season 2 also rewards delegating collateral to secure networks.', src: 'docs.symbiotic.fi/get-started/resources/points-program' },
    'noble': { note: 'Noble points accrue on USDN in the points vault as days x amount/100 x a hold multiplier (x1 at 30 days to x1.75 at 120+); withdrawing before 30 days earns zero, and TVL milestones add 5% bonus pools.', src: 'noble.xyz/blog/points-program' },
    'onre': { note: 'OnRe runs a points program for ONyc holders: deposit ONyc into its partner DeFi strategies (e.g. Kamino USDC lending) to boost points on top of the base yield.', src: 'airdrops.io/onre; app.onre.finance/earn/defi' },
    'upshift': { note: 'Upshift runs a live points campaign on its vaults (Ethereum and Hyperliquid); points accrue on deposited capital while the vault strategy earns its base yield.', src: 'airdrops.io/upshift; docs.upshift.finance' },
    'doppler-finance': { note: 'Doppler Finance publishes an XDP airdrop page: deposit XRP or RLUSD into Doppler Vaults and earn the vault return in the same asset while the campaign runs.', src: 'doppler.finance; phemex.com/academy/what-is-doppler-finance-xdp' },
    'veda': { note: 'Veda Labs vaults (app.veda.tech) show a Points column per vault: deposit the benchmark asset into a points-enabled vault and hold the shares.', src: 'app.veda.tech' },
    'curvance': { note: 'Curvance on Monad folds deposit, borrow, leverage and swap into one app; supplied collateral keeps earning its base yield while borrowed positions run.', src: 'curvance.com' },
    'mezo-earn': { note: 'Mezo Earn is the yield side of Mezo, a Bitcoin lending network (MUSD stablecoin, Mezo Prime); the MEZO token launch was covered in Mezo\'s H1 2026 review, so check the earn app for the current season.', src: 'mezo.org/blog/mezo-h1-2026' }
  };

  // Category playbooks: the action sequence a farmer actually follows, with cost and time per step.
  function playbook(cat, name, chain, cap, gas, hold) {
    var c = (cat || '').toLowerCase();
    var g2 = money(gas * 2), gW = money(Math.max(0.05, gas * 3));
    var core;
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('yield') >= 0) {
      core = [
        ['Deposit ' + money(cap) + ' of the vault\'s benchmark asset (USDC or wETH) into a ' + name + '-curated vault and keep the shares; curator vaults pass through the underlying protocol\'s own points where one runs.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes'],
        ['Check the vault\'s curator page and the underlying market (e.g. Morpho or Euler) for a points or rewards program layered on the same deposit; one deposit can earn two programs.', 'no extra fee to check', '10 minutes']
      ];
    } else if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) {
      core = [
        ['Supply ' + money(cap) + ' of USDC to ' + name + ' on ' + chain + ', then borrow a small amount (20-30% LTV) of the same asset to register borrow activity without taking a liquidation risk on a stable pair.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes'],
        ['Repay and re-borrow once a month so the position shows sustained usage, and watch the health factor stay above 2.', gW + ' gas a month', '10 minutes a month']
      ];
    } else if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('perpetual') >= 0 || c.indexOf('basis') >= 0) {
      core = [
        ['Deposit ' + money(cap) + ' of USDC as margin or liquidity on ' + name + ' (' + chain + ') and run one small trade or LP position each week; volume-weighted programs count turnover, not idle balance.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes'],
        ['Keep weekly turnover around ' + money(cap * 2) + ' (two turns of the position) and log the fees paid; wash volume between your own wallets is sybil-flagged, so trade the real market.', gW + ' gas a week', '15 minutes a week']
      ];
    } else if (c.indexOf('rwa') >= 0) {
      core = [
        ['Mint ' + money(cap) + ' of ' + name + '\'s yield-bearing asset on ' + chain + ' (complete any KYC gate first if the product requires it) and hold the token in the farming wallet.', money(cap) + ' capital + ' + g2 + ' gas', '30 minutes'],
        ['Hold through at least one yield distribution so the wallet shows a settled balance, not a mint-and-dump pattern.', 'the ' + money(cap) + ' stays minted', hold + ' days']
      ];
    } else if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) {
      core = [
        ['Stake ' + money(cap) + ' of the chain\'s staking asset through ' + name + ' on ' + chain + ' and keep the receipt token in the farming wallet; delegate to a network or validator where the app asks.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes']
      ];
    } else if (c.indexOf('bridge') >= 0) {
      core = [
        ['Bridge ' + money(cap) + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in one app on the destination chain; bridge programs count volume and distinct destinations.', money(cap) + ' capital + ' + money(gas * 3) + ' fees', '20 minutes']
      ];
    } else if (c.indexOf('insurance') >= 0) {
      core = [
        ['Buy ' + money(cap) + ' of cover from ' + name + ' on ' + chain + ' for a position you already hold, and keep the policy active; insurance programs count premium paid and cover duration.', money(cap) + ' premium + ' + g2 + ' gas', '20 minutes']
      ];
    } else if (c.indexOf('payment') >= 0 || c.indexOf('chain') >= 0) {
      core = [
        ['Move ' + money(cap) + ' through ' + name + ' on ' + chain + ': fund the wallet, make one real payment or transfer a week, and keep a settled balance between transfers.', money(cap) + ' capital + ' + gW + ' fees a week', '15 minutes a week']
      ];
    } else if (c.indexOf('stable') >= 0 || c.indexOf('cedefi') >= 0) {
      core = [
        ['Mint or deposit ' + money(cap) + ' of the stable asset through ' + name + ' on ' + chain + ' and hold it in the farming wallet; wrapper and CeDeFi programs count minted supply and hold time.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes']
      ];
    } else if (c.indexOf('governance') >= 0 || c.indexOf('incentive') >= 0) {
      core = [
        ['Deposit ' + money(cap) + ' into ' + name + '\'s incentive vault on ' + chain + ' and vote or gauge-lock where the app offers it; governance-incentive programs weight locked balances and votes.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes']
      ];
    } else {
      core = [
        ['Deposit ' + money(cap) + ' of USDC into ' + name + ' on ' + chain + ' through its main app and keep the position open; use the product\'s core action, not a bare transfer.', money(cap) + ' capital + ' + g2 + ' gas', '20 minutes']
      ];
    }
    return core;
  }

  function riskNote(cat) {
    var c = (cat || '').toLowerCase();
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Curator risk: the curator picks the markets; a bad allocation can lose principal even when the underlying protocol is sound. Read the vault\'s risk framework before depositing.';
    if (c.indexOf('rwa') >= 0) return 'RWA risk: redemption depends on the issuer and any KYC gate; the yield asset can trade below par in stress.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0) return 'Lending risk: borrowed positions can be liquidated; keep the health factor above 2 and never borrow more than 30% on a farm.';
    if (c.indexOf('restak') >= 0 || c.indexOf('staking') >= 0) return 'Restaking risk: slashing conditions stack on the base asset; read each network\'s slashing terms before delegating.';
    if (c.indexOf('dex') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('basis') >= 0) return 'Trading risk: LP positions take impermanent loss and perp margin can be liquidated; size the farm so a total loss is survivable.';
    return 'Smart-contract risk: a pre-token protocol is unaudited or young; farm only what you can lose, and revoke approvals when you unwind.';
  }

  function stepText(text, cost, time) {
    var s = text + ' Cost: ' + cost + '. Time: ' + time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + ' Keep the position open and check the protocol\'s own page.';
    return s;
  }

  // 6-9 steps: wallet hygiene, the category's core actions, a researched protocol note when one
  // exists, the qualifying hold, weekly activity, claim safety and the farm log.
  function farmSteps(p, age) {
    var chain = chainOf(p), gas = gasOf(chain), cap = capitalFor(p.tvl_usd), hold = holdDaysFor(age);
    var steps = [
      stepText('Create a dedicated farming wallet for ' + p.name + ', fund it only with the farm capital plus gas, and keep the seed phrase offline; never reuse a wallet that holds your savings.', 'under ' + money(gas) + ' of gas for the first transaction', '5 minutes')
    ];
    playbook(p.category, p.name, chain, cap, gas, hold).forEach(function (s) { steps.push(stepText(s[0], s[1], s[2])); });
    var f = FACTS[p.slug];
    if (f) steps.push(stepText('Protocol note: ' + f.note + ' Source: ' + f.src + '.', 'no fee to read the docs', '10 minutes'));
    steps.push(stepText('Hold the position at least ' + hold + ' days so the wallet appears in several snapshots; time-weighted programs (Noble-style multipliers) pay more for longer holds.', 'the ' + money(cap) + ' stays in the position', hold + ' days'));
    steps.push(stepText('Make one qualifying action each week (deposit, borrow, swap, vote or claim rewards) and record it; sybil filters reward steady distinct activity over burst volume.', 'about ' + money(Math.max(0.05, gas * 3)) + ' of gas a week', '10 minutes a week'));
    steps.push(stepText('Before any claim, open the protocol\'s own points or rewards page from its official docs or app, never a link from a comment or DM; a real airdrop never asks you to pay to claim.', 'free to check; never pay to claim', '10 minutes'));
    steps.push(stepText('Log the wallet, dates, deposits and every transaction hash in a farm sheet so you can prove eligibility, repeat the position next season, or unwind cleanly and revoke approvals.', 'nothing but the log', '5 minutes'));
    return steps;
  }

  var P = {
    GAS: GAS, FACTS: FACTS, gasOf: gasOf, chainOf: chainOf, capitalFor: capitalFor,
    holdDaysFor: holdDaysFor, farmSteps: farmSteps, riskNote: riskNote, stepText: stepText
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = P;
  root.RadarPlans = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
