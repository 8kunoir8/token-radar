// token-radar: a pre-token launch radar for make.fun's token-radar-01 bounty (Node 22, stdlib only).
//
// Reads the sealed DefiLlama snapshot (/input/snapshot.json, or --input <file|dir>), ranks every
// watchlist protocol plus every rankable pre-token protocol below the floor with the radar-2 model
// (dashboard/model.js, the same file the page loads), writes /output/board.json with a concrete farm
// plan per row (dashboard/plans.js), writes the page's data to /output/data.js, copies dashboard/
// and screenshots/ to /output, and writes /output/dossier.json with the kit's vendored library.
//
// Run locally:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <kit>/input/snapshot.json
//
// The two runs the grader makes write identical bytes: every figure derives from the snapshot, and
// nothing here reads a clock, a random source or the network.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildDossier } from './vendor/makefun-board.ts';

// --- the shapes the sealed input and the shared scripts carry ----------------

interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}
interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}
interface Score {
  age: number | null;
  growth_pct: number;
  growth_mult: number;
  maturity_mult: number;
  comp_multiple: number;
  implied: number;
  implied_lo: number;
  implied_hi: number;
  wallets_est: number;
  airdrop_pool_usd: number;
  median_claim_usd: number;
}
interface ScoredRow { rank: number; p: SnapshotProtocol; s: Score; tier: string }
interface CompCat { n: number; median: number; multiple: number }
interface Comps { global: number; live_n: number; shrink_k: number; cats: Record<string, CompCat> }
interface ModelConstants {
  growth_weight: number; growth_floor: number; growth_cap: number;
  maturity_floor: number; maturity_range: number; maturity_days: number; unknown_age_days: number;
  shrink_k: number; mult_floor: number; mult_cap: number;
  airdrop_share: number; tvl_per_wallet: number; wallets_min: number; wallets_max: number;
}
interface RadarModel {
  K: ModelConstants;
  VERSION: string;
  buildBoard(snapshot: Snapshot, k: ModelConstants): { comps: Comps; rows: ScoredRow[] };
  round4(n: number): number;
}
interface RadarPlans { farmSteps(p: SnapshotProtocol, age: number | null): string[] }
interface BoardRow {
  rank: number; slug: string; name: string; category: string | null; chains: string[];
  tvl_usd: number; change_7d: number | null; listed_at: string | null;
  token_status: 'pre-token'; tier: string; age_days: number | null; implied_value_usd: number;
  model: {
    version: string; comp_category: string; comp_multiple: number; growth_pct: number;
    band_lo: number; band_hi: number;
    growth_multiplier: number; maturity_multiplier: number; airdrop_share: number;
    wallets_est: number; airdrop_pool_usd: number; median_claim_usd: number;
  };
  farm_steps: string[];
}

// CJS boundary: model.js and plans.js are dual-mode scripts (Node require + browser global); their
// shapes are declared above and checked at runtime by the gate replica below.
const require = createRequire(import.meta.url);
const M = require('./dashboard/model.js') as RadarModel;
const P = require('./dashboard/plans.js') as RadarPlans;

const here = fileURLToPath(new URL('.', import.meta.url));
const TEXT_MAX_BYTES = 65_536;
const SHOT_CAPS = { max: 4, max_bytes: 524_288 };
const PLAIN_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq === undefined ? fallback : eq.slice(name.length + 3);
}

// --- input: validate once, then consume a typed snapshot ---------------------

function isProtocol(v: unknown): v is SnapshotProtocol {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return typeof p.slug === 'string' && typeof p.name === 'string' &&
    typeof p.tvl_usd === 'number' && Array.isArray(p.chains) &&
    (p.category === null || typeof p.category === 'string') &&
    (p.change_7d === null || typeof p.change_7d === 'number') &&
    (p.mcap_usd === null || typeof p.mcap_usd === 'number') &&
    (p.listed_at === null || typeof p.listed_at === 'string') &&
    (p.gecko_id === null || typeof p.gecko_id === 'string') &&
    (p.symbol === null || typeof p.symbol === 'string');
}
function parseSnapshot(text: string): Snapshot {
  const v: unknown = JSON.parse(text);
  if (!v || typeof v !== 'object') throw new Error('snapshot is not an object');
  const s = v as Record<string, unknown>;
  if (typeof s.as_of !== 'string' || typeof s.source !== 'string' || typeof s.floor_usd !== 'number' ||
      !Array.isArray(s.protocols) || !Array.isArray(s.watchlist) || !s.protocols.every(isProtocol) ||
      !s.watchlist.every((w: unknown) => typeof w === 'string')) {
    throw new Error('snapshot is not the sealed shape (as_of, source, floor_usd, protocols, watchlist)');
  }
  // Runtime checks above establish the shape; the cast names it for the rest of the program.
  return v as Snapshot;
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  process.stderr.write(`token-radar: no snapshot at ${inputFile}: pass --input <snapshot.json|dir>\n`);
  process.exit(2);
}
let snapshot: Snapshot;
try {
  snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
} catch (e) {
  process.stderr.write(`token-radar: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(2);
}

const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

// --- board -----------------------------------------------------------------

const { comps, rows } = M.buildBoard(snapshot, M.K);
const bySlug = new Map<string, SnapshotProtocol>(snapshot.protocols.map((p) => [p.slug, p]));

const board: BoardRow[] = rows.map((r) => {
  const p = r.p, s = r.s;
  return {
    rank: r.rank,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    listed_at: p.listed_at,
    token_status: 'pre-token',
    tier: r.tier,
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      version: M.VERSION,
      comp_category: p.category || 'Uncategorized',
      comp_multiple: s.comp_multiple,
      band_lo: s.implied_lo, band_hi: s.implied_hi,
      growth_pct: s.growth_pct,
      growth_multiplier: s.growth_mult,
      maturity_multiplier: s.maturity_mult,
      airdrop_share: M.K.airdrop_share,
      wallets_est: s.wallets_est,
      airdrop_pool_usd: s.airdrop_pool_usd,
      median_claim_usd: s.median_claim_usd
    },
    farm_steps: P.farmSteps(p, s.age)
  };
});

// --- the gate's own rows, checked here before anything is written -----------

function boardIssue(): string | null {
  if (board.length < 100 || board.length > 4000) return `board holds ${board.length} rows: the gate takes 100..4000`;
  const seen = new Set<string>();
  const wl = new Set(snapshot.watchlist);
  let prev = Infinity;
  for (const row of board) {
    if (!bySlug.has(row.slug)) return `slug ${row.slug} is not in the snapshot`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (!Number.isInteger(row.rank) || row.rank < 1) return `rank ${row.rank} is not a positive whole number`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > 1e14) return `implied value out of range on ${row.slug}`;
    if (row.implied_value_usd > prev) return `implied value rises at rank ${row.rank}`;
    prev = row.implied_value_usd;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `farm_steps count on ${row.slug}`;
    for (const st of row.farm_steps) {
      const t = st.trim();
      if (t.length < 20 || t.length > 600) return `farm step of ${t.length} chars on ${row.slug}: the gate takes 20..600`;
    }
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return 'ranks are not exactly 1..N';
  for (const s of wl) if (!seen.has(s)) return `watchlist slug ${s} missing from the board`;
  if (board.length >= 2 && board.every((r) => r.implied_value_usd === board[0]!.implied_value_usd)) return 'every implied value is the same';
  return null;
}
const issue = boardIssue();
if (issue !== null) {
  process.stderr.write(`token-radar: the model wrote a board the gate refuses: ${issue}\n`);
  process.exit(1);
}

// --- output ----------------------------------------------------------------

mkdirSync(out, { recursive: true });
const boardJson = `${JSON.stringify({ rows: board })}\n`;
if (Buffer.byteLength(boardJson, 'utf8') > 8 * 1024 * 1024) {
  process.stderr.write('token-radar: board.json past the 8 MiB cap\n');
  process.exit(1);
}
writeFileSync(join(out, 'board.json'), boardJson);

// The page's dataset, written beside dashboard/ (not inside it): the dossier's source text stays
// under the judge's 64 KB cap while the page carries every row.
const live = snapshot.protocols
  .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0)
  .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || (a.slug < b.slug ? -1 : 1))
  .slice(0, 30)
  .map((p) => ({
    slug: p.slug, name: p.name, cat: p.category, chains: p.chains, tvl: p.tvl_usd,
    mcap: p.mcap_usd, g7: p.change_7d, ratio: p.tvl_usd > 0 ? M.round4(p.mcap_usd! / p.tvl_usd) : null
  }));

const radar = {
  as_of: snapshot.as_of,
  source: snapshot.source,
  floor_usd: snapshot.floor_usd,
  version: M.VERSION,
  k: M.K,
  comps,
  watchlist_size: snapshot.watchlist.length,
  board_size: board.length,
  early_size: board.filter((r) => r.tier === 'early').length,
  rising_size: board.filter((r) => r.tier === 'early' && (r.change_7d ?? 0) >= 15).length,
  rows: board.map((r) => ({
    rank: r.rank, slug: r.slug, name: r.name, cat: r.category, chains: r.chains, tvl: r.tvl_usd,
    g7: r.change_7d, listed: r.listed_at, age: r.age_days, tier: r.tier, implied: r.implied_value_usd,
    mult: r.model.comp_multiple, gm: r.model.growth_multiplier, mm: r.model.maturity_multiplier,
    lo: r.model.band_lo, hi: r.model.band_hi,
    claim: r.model.median_claim_usd, wallets: r.model.wallets_est, pool: r.model.airdrop_pool_usd
  })),
  live
};
writeFileSync(join(out, 'data.js'), `window.RADAR=${JSON.stringify(radar)};\n`);

function copyFiles(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from).sort()) {
    if (name.startsWith('.')) continue;
    const path = join(from, name);
    if (!statSync(path).isFile()) continue;
    copyFileSync(path, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyFiles(join(here, 'dashboard'), join(out, 'dashboard'));
const shots = copyFiles(join(here, 'screenshots'), join(out, 'screenshots'));
if (shots.length < 3 || shots.length > 4) {
  process.stderr.write(`token-radar: screenshots/ holds ${shots.length} images: hand in 3 (board, detail, filtered)\n`);
  process.exit(1);
}
for (const name of shots) {
  if (!PLAIN_NAME.test(name)) {
    process.stderr.write(`token-radar: screenshots/${name}: bad name\n`);
    process.exit(1);
  }
  const bytes = readFileSync(join(out, 'screenshots', name));
  const isPng = bytes.length > 24 && bytes[0] === 0x89 && bytes[1] === 0x50;
  if (!isPng) {
    process.stderr.write(`token-radar: screenshots/${name}: hand in whole PNGs\n`);
    process.exit(1);
  }
  const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
  if (bytes.length > SHOT_CAPS.max_bytes || Math.max(w, h) > 1440 || Math.min(w, h) < 800) {
    process.stderr.write(`token-radar: screenshots/${name}: ${w}x${h}, ${bytes.length} bytes: cap 512 KiB, long side <=1440, short side >=800\n`);
    process.exit(1);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
writeFileSync(join(out, 'dossier.json'), buildDossier(out, {
  text_max_bytes: TEXT_MAX_BYTES,
  screenshots: SHOT_CAPS,
  dashboard: { max_files: 400, max_bytes: 4_194_304 }
}));

const wlCovered = snapshot.watchlist.filter((s) => board.some((r) => r.slug === s)).length;
process.stdout.write(
  `token-radar: ${snapshot.protocols.length} protocols, watchlist ${wlCovered}/${snapshot.watchlist.length} covered, ` +
  `${board.length} rows (${radar.early_size} early, ${radar.rising_size} rising), ${live.length} live comps\n` +
  `token-radar: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length}), dossier.json to ${out}\n`
);
