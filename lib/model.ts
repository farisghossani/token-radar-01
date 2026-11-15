// The token radar's model: one sealed snapshot of the protocol universe in, one ranked board out.
//
// What the board claims
// --------------------
// A protocol's launch is the token it may issue one day. The board asks what a token would be worth if
// the protocol's record stayed exactly as it is today, and what a reader should do to farm the protocol
// before or after it issues one. It never predicts whether or when a token is issued, and a protocol's
// implied value is this program's own claim, never a promise made by anyone.
//
// Which protocols are ranked
// --------------------------
// The snapshot lists every protocol DefiLlama tracks at or above five million dollars of TVL, and names
// a watchlist: the protocols the house's rule kept. That rule is applied here at every TVL, so the board
// carries the watchlist (the floor, never a ceiling) and the pre-token protocols beneath the floor as
// well; the ranking itself is entirely the model's. A protocol passes the structural screen when its
// record carries no token and it is not a second-hand product of one that already trades:
//
//   records no token          gecko_id and symbol are both null
//   no release marker         its name does not end in a version marker such as V2, v3 or 2.0
//   no product word           its name carries no whole word wrapped, staked or staking
//   not an exchange's         its name does not begin with an exchange's name
//   not a product category    its category is not a bridge or a staking product of a live token
//
// Every rule is read off the record, never a list of protocol names: the same function decides every
// protocol, and adding a protocol to the snapshot adds it to whichever side of the screen it belongs.
//
// What a row is worth
// -------------------
// A protocol that records no token has no market cap of its own, so its implied value is built from the
// three facts the snapshot does carry. The first is its TVL, scaled by what the market already pays for
// the same kind of protocol: the multiple is the median market-cap-to-TVL ratio of the protocols that
// record a token, taken for the row's own category when that category has at least four such protocols
// inside the measurement window, and from the whole set otherwise. The second fact is the protocol's
// seven-day TVL change, which says how much the record is currently worth to users: a drawdown is
// weighted a little more heavily than the same rise, because money leaving a protocol is a bigger
// warning than money arriving is a bonus. The third is how long the protocol has run with no token,
// which is what a launch would reward.
//
//   window     a ratio under 0.01 or over 100 is dropped: a market cap below one per cent of the
//              protocol's TVL, or above a hundred times it, is a denominator artefact rather than a
//              comparable, and 11 of the snapshot's 128 ratios fall outside it
//   multiple   median(mcap / tvl) of the row's category (>= 4 measured) or of the whole measured set
//   band       the 25th and 75th percentile of the same ratios: the middle half the median sits inside
//   growthAdj  clamp(1 + w * g / 100, 0.4, 1.6); g = clamp(change_7d, -60, 120); w = 0.7 if g >= 0 else 0.9
//   maturity   0.55 + 0.45 * min(age_days, 1095) / 1095; age from listed_at, 365 days when unrecorded
//   implied    max(1, round(tvl_usd * multiple * growthAdj * maturity)), a whole number at most 1e14
//   low, high  the same product with the band's low and high multiple in place of the median
//
// The board is every screened protocol, sorted by implied value and then by slug for ties, ranked from
// one down; the rank is the model's claim and not the array's order. Protocols whose token already
// trades are kept out of the ranking entirely: the market prices those itself, and they are what the
// multiples are measured from.
//
// How the model is checked
// ------------------------
// The same ratios let the model be tested on the protocols that already trade. For each of them the
// multiple is measured again with that protocol left out — its own category's median when four peers
// remain inside the window, the global median otherwise — and the implied value is compared with the
// market cap the snapshot records. That is an out-of-sample test of the part of the model that is
// measured rather than chosen; the growth and maturity terms are bounded adjustments for the quality of
// a record, not fitted to a price, and the test states the multiple's error alone. Two numbers come out
// of it: the median size of the miss, and how often the model puts two protocols of the same category
// in the order the market puts them in. Both are printed by `tools/derive.ts` and shown on the page.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
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

/** The whole sealed snapshot. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** One farm step: the action, what it costs and how long it takes. */
export interface FarmStep {
  step: string;
  cost: string;
  time: string;
}

/** The factors behind one row's implied value, and the band the multiple's spread puts around it. */
export interface RowFactors {
  multiple: number;
  multiple_low: number;
  multiple_high: number;
  multiple_source: 'category' | 'global';
  /** How many ratios the multiple was measured from, after the window. */
  peers: number;
  growth_adj: number;
  maturity: number;
}

/** One category's calibration line: how many live-token protocols it holds and what they are worth. */
export interface CalibrationLine {
  category: string;
  /** Protocols of the category that record both a token and a TVL, before the window. */
  observed: number;
  /** Ratios left inside the window: what the median is measured from. */
  measured: number;
  dropped: number;
  median: number;
  low: number;
  high: number;
  used_for: 'category' | 'global';
  /** Board rows that take their multiple from this line. */
  rows: number;
  /** Protocols of the category the model was tested on, and the median size of its miss there. */
  tested: number;
  test_miss: number | null;
}

/** The calibration every implied value is read against, computed from the snapshot on the run. */
export interface Calibration {
  global_median: number;
  global_low: number;
  global_high: number;
  /** Ratios inside the window across the whole set. */
  measured: number;
  /** Ratios the snapshot offered, inside the window or not. */
  observed: number;
  category_medians: Map<string, number>;
  lines: CalibrationLine[];
}

/** One protocol the model was tested against: what it says, what the market says, and the gap. */
export interface BacktestCase {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  implied_usd: number;
  actual_usd: number;
  /** implied / actual - 1, signed, rounded to four places. */
  miss: number;
  source: 'category' | 'global';
  peers: number;
  /** Whether the case counts toward the test's statistics: a ratio inside the window, no parent's token. */
  tested: boolean;
}

/** The out-of-sample test of the measured part of the model. */
export interface Backtest {
  /** Protocols that record a token, a market cap and a TVL: one test each. */
  tested: number;
  /** Same-category pairs among them, and how many the model orders as the market does. */
  pairs: number;
  pairs_right: number;
  concordance: number;
  /** Median of |implied / actual - 1| over the tested set. */
  median_miss: number;
  within_50: number;
  within_100: number;
  /** The calls counted by the size of their miss, in five bands, in the order the page draws them. */
  buckets: { label: string; count: number }[];
  /** Every protocol the model was run against, in slug order, for the page's own table. */
  cases: BacktestCase[];
  /** One line a category: how many of its protocols were tested, and the median miss among them. */
  categories: { category: string; tested: number; median_miss: number }[];
}

/** One row of board.json: a screened protocol, its rank and its plan. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  factors: RowFactors;
  plan: FarmStep[];
  farm_steps: string[];
}

/** A live-token protocol: it already trades, so the market prices it and the board does not. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  symbol: string | null;
  /** What the model says this protocol is worth, with its own figure left out of the peer set. */
  implied_usd: number;
  miss: number;
  source: 'category' | 'global';
  peers: number;
  tested: boolean;
}

/** The page's frozen data interface: what the dashboard reads and renders. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  age_days: number | null;
  listed_at: string | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  implied_low_usd: number;
  implied_high_usd: number;
  factors: RowFactors;
  plan: FarmStep[];
}

/** Everything the dashboard renders, plus the model's own statement of itself. */
export interface Radar {
  meta: {
    as_of: string;
    fetched_at: string;
    floor_usd: number;
    protocols: number;
    watchlist_count: number;
    candidate_count: number;
    live_count: number;
    early_count: number;
    total_implied_usd: number;
    median_multiple_global: number;
    global_low: number;
    global_high: number;
    measured: number;
    window_low: number;
    window_high: number;
    screen_note: string;
    calibration: CalibrationLine[];
    backtest: Backtest;
  };
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

/** The name the model's numbers are labelled with. */
export const MODEL_VERSION = 'radar-3';

/** The rules the structural screen applies, written once so the page can quote them. */
export const SCREEN_NOTE =
  'A protocol is screened in when its record carries no token (no CoinGecko id and no symbol), its name ' +
  'ends in no release marker (V2, v3, 2.0 and the like), its name carries no whole word wrapped, staked ' +
  'or staking, its name does not begin with an exchange name (Binance, Coinbase, Bybit, Kraken, Bitget, ' +
  'OKX, Bitfinex or Gemini), and its category is not Bridge, Canonical Bridge, Liquid Staking, Liquid ' +
  'Restaking, Restaked BTC or CEX. The rule is applied at every TVL, so the board is the watchlist plus ' +
  'the pre-token protocols beneath the watchlist floor.';

const DAY_MS = 86_400_000;
const MAX_IMPLIED = 100_000_000_000_000;
const GROWTH_FLOOR = -60;
const GROWTH_CAP = 120;
const GROWTH_WEIGHT_UP = 0.7;
const GROWTH_WEIGHT_DOWN = 0.9;
const GROWTH_ADJ_FLOOR = 0.4;
const GROWTH_ADJ_CAP = 1.6;
const MATURITY_FLOOR = 0.55;
const MATURITY_RANGE = 0.45;
const MATURITY_DAYS = 1095;
const UNKNOWN_AGE_DAYS = 365;
/** A category needs this many measured peers before its own median is used; four is the smallest
 *  sample whose median has an order-statistic interval at all, and three-peer medians were unusable. */
const MIN_CATEGORY_OBSERVATIONS = 4;
/** The measurement window: one per cent of TVL at the floor, a hundred times TVL at the ceiling. */
const RATIO_FLOOR = 0.01;
const RATIO_CEILING = 100;

/** A name that ends in a release marker is a pool or a version of another protocol, not a new one. */
const RELEASE_MARKER = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
/** A whole product word, in any case: the protocol is a wrapped or staked product of another. */
const PRODUCT_WORD = /\b(?:wrapped|staked|staking)\b/i;
/** An exchange's own protocol, never a launch candidate. */
const EXCHANGE_PREFIX = /^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;
/** The categories whose protocols are products of a token that already trades. */
const PRODUCT_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);

/** Whether the record carries no token at all. A record with a price but no token is not one. */
export function recordsNoToken(p: SnapshotProtocol): boolean {
  return p.gecko_id === null && p.symbol === null;
}

/** Why a protocol is not a candidate, or null when it is one. */
export function screenReason(p: SnapshotProtocol): string | null {
  if (!recordsNoToken(p)) return 'it records a token';
  if (RELEASE_MARKER.test(p.name)) return 'its name ends in a release marker';
  if (PRODUCT_WORD.test(p.name)) return 'it is a wrapped or staked product';
  if (EXCHANGE_PREFIX.test(p.name)) return 'it is an exchange’s own protocol';
  if (p.category !== null && PRODUCT_CATEGORIES.has(p.category)) return `its category ${p.category} is a product of a live token`;
  return null;
}

/** Whether a protocol passes the structural screen and is ranked. */
export function isCandidate(p: SnapshotProtocol): boolean {
  return screenReason(p) === null;
}

/** Every protocol with a token the market prices, which is what the multiples are measured from. */
function pricedProtocols(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0);
}

/** A protocol's own market-cap-to-TVL ratio; the caller has already checked both are positive. */
function ratioOf(p: SnapshotProtocol): number {
  return p.mcap_usd! / p.tvl_usd;
}

/** Whether a ratio is inside the measurement window. */
function inWindow(ratio: number): boolean {
  return Number.isFinite(ratio) && ratio >= RATIO_FLOOR && ratio <= RATIO_CEILING;
}

/** The median of an ascending list; 0 for an empty one, the mean of the two middle values for an even one. */
function medianOfAscending(values: number[]): number {
  if (values.length === 0) return 0;
  const half = values.length >> 1;
  return values.length % 2 === 1 ? values[half]! : (values[half - 1]! + values[half]!) / 2;
}

/** A percentile of an ascending list by linear interpolation, the same way on every run. */
function percentileOfAscending(values: number[], q: number): number {
  const n = values.length;
  if (n === 0) return 0;
  const pos = (n - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  if (low === high) return values[low]!;
  return values[low]! + (values[high]! - values[low]!) * (pos - low);
}

/** A multiple rounded to four places: enough to recompute a row by hand, few enough to print. */
function toTenThousandth(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** A fraction rounded to four places, as the page states the test's numbers. */
function toTenThousandthFraction(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

/** The ratios of a set of priced protocols that survive the window, ascending. */
function measuredRatios(protocols: SnapshotProtocol[]): number[] {
  return protocols
    .map(ratioOf)
    .filter(inWindow)
    .sort((a, b) => a - b);
}

/** One pool of ratios, summarised: how many it holds, its median and the middle half around it. */
interface PoolSummary {
  measured: number;
  median: number;
  low: number;
  high: number;
}

/** The median and the middle half of a set of ratios already reduced to an ascending list. */
function summarise(ratios: number[]): PoolSummary {
  return {
    measured: ratios.length,
    median: toTenThousandth(medianOfAscending(ratios)),
    low: toTenThousandth(percentileOfAscending(ratios, 0.25)),
    high: toTenThousandth(percentileOfAscending(ratios, 0.75)),
  };
}

/**
 * The calibration, read off the snapshot: for every protocol whose record carries a token with a market
 * cap and a TVL, the ratio of what the market pays to what the protocol holds. The whole set's median is
 * the fallback; a category's own median is used when at least four of its ratios survive the window.
 */
export function calibrate(snapshot: Snapshot): Calibration {
  const priced = pricedProtocols(snapshot);
  const global = summarise(measuredRatios(priced));

  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of priced) {
    const key = p.category ?? 'Uncategorised';
    const seen = byCategory.get(key);
    if (seen === undefined) byCategory.set(key, [p]);
    else seen.push(p);
  }

  const categoryMedians = new Map<string, number>();
  const lines: CalibrationLine[] = [];
  for (const [category, protocols] of byCategory) {
    const summary = summarise(measuredRatios(protocols));
    const own = summary.measured >= MIN_CATEGORY_OBSERVATIONS;
    if (own) categoryMedians.set(category, summary.median);
    lines.push({
      category,
      observed: protocols.length,
      measured: summary.measured,
      dropped: protocols.length - summary.measured,
      median: own ? summary.median : global.median,
      low: own ? summary.low : global.low,
      high: own ? summary.high : global.high,
      used_for: own ? 'category' : 'global',
      rows: 0,
      tested: 0,
      test_miss: null,
    });
  }
  lines.sort((a, b) => b.measured - a.measured || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  return {
    global_median: global.median,
    global_low: global.low,
    global_high: global.high,
    measured: global.measured,
    observed: priced.length,
    category_medians: categoryMedians,
    lines,
  };
}

/** The multiple a protocol's category is worth, where it comes from, and the band around it. */
export function multipleFor(
  p: SnapshotProtocol,
  calibration: Calibration,
): { median: number; low: number; high: number; source: 'category' | 'global'; peers: number } {
  const key = p.category ?? 'Uncategorised';
  const own = calibration.category_medians.get(key);
  if (own !== undefined) {
    const line = calibration.lines.find((l) => l.category === key)!;
    return { median: own, low: line.low, high: line.high, source: 'category', peers: line.measured };
  }
  return {
    median: calibration.global_median,
    low: calibration.global_low,
    high: calibration.global_high,
    source: 'global',
    peers: calibration.measured,
  };
}

/** Whole days from the snapshot's date to the day a protocol was first listed; null when unrecorded. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const now = Date.parse(`${asOf}T00:00:00Z`);
  const then = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(now) || !Number.isFinite(then)) return null;
  return Math.max(0, Math.floor((now - then) / DAY_MS));
}

/** The seven-day change, clamped to the band the model reads, with its own weight for a fall. */
export function growthAdjustment(change7d: number | null): number {
  const reported = typeof change7d === 'number' && Number.isFinite(change7d) ? change7d : 0;
  const g = Math.min(GROWTH_CAP, Math.max(GROWTH_FLOOR, reported));
  const w = g >= 0 ? GROWTH_WEIGHT_UP : GROWTH_WEIGHT_DOWN;
  const adjusted = 1 + (w * g) / 100;
  return Math.min(GROWTH_ADJ_CAP, Math.max(GROWTH_ADJ_FLOOR, adjusted));
}

/** How long a protocol has run with no token, as a multiplier on what a launch would be worth. */
export function maturityMultiplier(age: number | null): number {
  const days = Math.min(Math.max(age ?? UNKNOWN_AGE_DAYS, 0), MATURITY_DAYS);
  return MATURITY_FLOOR + (MATURITY_RANGE * days) / MATURITY_DAYS;
}

/** Clamp a product to the range board.json accepts and round it to whole dollars. */
function wholeValue(raw: number): number {
  return Math.min(MAX_IMPLIED, Math.max(1, Math.round(raw)));
}

/** One protocol's implied value, the band around it, and the factors behind both. */
export function impliedValue(
  p: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
): { implied: number; low: number; high: number; factors: RowFactors; age: number | null } {
  const age = ageDays(asOf, p.listed_at);
  const multiple = multipleFor(p, calibration);
  // The factors are rounded to the precision the page prints, so a reader who multiplies the four
  // printed numbers gets the ranked value back, exactly, rather than a figure that drifts from it.
  const growthAdj = toTenThousandth(growthAdjustment(p.change_7d));
  const maturity = toTenThousandth(maturityMultiplier(age));
  const scale = growthAdj * maturity;
  return {
    implied: wholeValue(p.tvl_usd * multiple.median * scale),
    low: wholeValue(p.tvl_usd * multiple.low * scale),
    high: wholeValue(p.tvl_usd * multiple.high * scale),
    age,
    factors: {
      multiple: multiple.median,
      multiple_low: multiple.low,
      multiple_high: multiple.high,
      multiple_source: multiple.source,
      peers: multiple.peers,
      growth_adj: growthAdj,
      maturity,
    },
  };
}

/**
 * The model tested on the protocols that already trade: each one's multiple is measured again with the
 * protocol itself left out, its implied value is compared with the market cap the snapshot records, and
 * every same-category pair among them is checked for the order the market gives it.
 */
export function backtest(snapshot: Snapshot): Backtest {
  const priced = pricedProtocols(snapshot);
  // A protocol is tested when it trades a token of its own — one whose name carries a release marker or
  // a product word trades its parent's (Aave V2's market cap is AAVE's) — and its own ratio is inside
  // the window the multiples are measured in, so no test is run on a figure the model calls an artefact.
  const isTested = (p: SnapshotProtocol): boolean =>
    !RELEASE_MARKER.test(p.name) && !PRODUCT_WORD.test(p.name) && inWindow(ratioOf(p));
  const pool = priced.filter(isTested);

  const byCategory = new Map<string, SnapshotProtocol[]>();
  for (const p of pool) {
    const key = p.category ?? 'Uncategorised';
    const seen = byCategory.get(key);
    if (seen === undefined) byCategory.set(key, [p]);
    else seen.push(p);
  }
  const globalRatios = measuredRatios(pool);

  const cases: BacktestCase[] = [];
  const impliedByProtocol = new Map<string, number>();

  for (const p of priced) {
    const key = p.category ?? 'Uncategorised';
    const peers = (byCategory.get(key) ?? []).filter((q) => q.slug !== p.slug);
    const summary = summarise(measuredRatios(peers));
    const own = summary.measured >= MIN_CATEGORY_OBSERVATIONS;
    // With too few peers left, the global pool without this protocol; no test sees its own ratio twice.
    const multiple = own ? summary.median : summarise(measuredRatios(pool.filter((q) => q.slug !== p.slug))).median;
    const implied = wholeValue(p.tvl_usd * multiple);
    impliedByProtocol.set(p.slug, implied);
    cases.push({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: p.tvl_usd,
      implied_usd: implied,
      actual_usd: p.mcap_usd!,
      miss: toTenThousandthFraction(implied / p.mcap_usd! - 1),
      source: own ? 'category' : 'global',
      peers: own ? summary.measured : globalRatios.length,
      tested: isTested(p),
    });
  }

  const scored = cases.filter((c) => c.tested);
  const misses = scored.map((c) => Math.abs(c.miss)).sort((a, b) => a - b);

  let pairs = 0;
  let pairsRight = 0;
  for (const [, protocols] of byCategory) {
    for (let i = 0; i < protocols.length; i++) {
      for (let j = i + 1; j < protocols.length; j++) {
        const a = protocols[i]!;
        const b = protocols[j]!;
        if (a.mcap_usd === b.mcap_usd) continue;
        pairs++;
        const modelSaysAGreater = impliedByProtocol.get(a.slug)! > impliedByProtocol.get(b.slug)!;
        if (modelSaysAGreater === a.mcap_usd! > b.mcap_usd!) pairsRight++;
      }
    }
  }

  // The calls counted by the band their miss falls in, in the order the page draws them.
  const bands: [string, (miss: number) => boolean][] = [
    ['within 20%', (m) => Math.abs(m) <= 0.2],
    ['20 to 50%', (m) => Math.abs(m) > 0.2 && Math.abs(m) <= 0.5],
    ['50 to 100%', (m) => Math.abs(m) > 0.5 && Math.abs(m) <= 1],
    ['1 to 3 times', (m) => Math.abs(m) > 1 && Math.abs(m) <= 3],
    ['over 3 times', (m) => Math.abs(m) > 3],
  ];
  const buckets = bands.map(([label, test]) => ({ label, count: scored.filter((c) => test(c.miss)).length }));

  const byCategoryMiss = new Map<string, number[]>();
  for (const c of scored) {
    const key = c.category ?? 'Uncategorised';
    const seen = byCategoryMiss.get(key);
    if (seen === undefined) byCategoryMiss.set(key, [Math.abs(c.miss)]);
    else seen.push(Math.abs(c.miss));
  }
  const categories = [...byCategoryMiss.entries()]
    .map(([category, sizes]) => ({
      category,
      tested: sizes.length,
      median_miss: toTenThousandthFraction(medianOfAscending([...sizes].sort((a, b) => a - b))),
    }))
    .sort((a, b) => b.tested - a.tested || (a.category < b.category ? -1 : a.category > b.category ? 1 : 0));

  return {
    tested: scored.length,
    pairs,
    pairs_right: pairsRight,
    concordance: pairs === 0 ? 0 : toTenThousandthFraction(pairsRight / pairs),
    median_miss: toTenThousandthFraction(medianOfAscending(misses)),
    within_50: toTenThousandthFraction(misses.filter((m) => m <= 0.5).length / Math.max(1, misses.length)),
    within_100: toTenThousandthFraction(misses.filter((m) => m <= 1).length / Math.max(1, misses.length)),
    buckets,
    cases: [...cases].sort((a, b) => bySlugCodeUnit(a.slug, b.slug)),
    categories,
  };
}

const bySlugCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The protocols whose token already trades, dearest first, each beside what the model says it is worth
 * with its own ratio left out of the peer set: the page's own column of calls against the market.
 */
export function liveRows(snapshot: Snapshot, test: Backtest): LiveRow[] {
  const cases = new Map(test.cases.map((c) => [c.slug, c]));
  return pricedProtocols(snapshot)
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || bySlugCodeUnit(a.slug, b.slug))
    .map((p) => {
      const c = cases.get(p.slug)!;
      return {
        slug: p.slug,
        name: p.name,
        category: p.category,
        tvl_usd: p.tvl_usd,
        mcap_usd: p.mcap_usd!,
        symbol: p.symbol,
        implied_usd: c.implied_usd,
        miss: c.miss,
        source: c.source,
        peers: c.peers,
        tested: c.tested,
      };
    });
}

// ------------------------------------------------------------------ the farm plan

/** The first chain a protocol names, or a phrase for the ones that name none. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 && p.chains[0] !== undefined ? p.chains[0] : 'its main chain';
}

/** The capital one position is worth risking, read off the protocol's own size. */
export function positionSizeUsd(tvlUsd: number): number {
  if (tvlUsd >= 5_000_000_000) return 250;
  if (tvlUsd >= 1_000_000_000) return 150;
  if (tvlUsd >= 100_000_000) return 100;
  if (tvlUsd >= 10_000_000) return 50;
  return 25;
}

/** How long a position should stand, from how long the protocol has run with no token. */
export function holdingDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  if (age < 730) return 30;
  return 21;
}

/** The words the 7-day figure is described with, or null when nothing was reported. */
function trendWords(change7d: number | null): string | null {
  if (change7d === null || !Number.isFinite(change7d)) return null;
  const magnitude = Math.abs(change7d).toFixed(2);
  if (change7d > 0.05) return `its TVL rose ${magnitude} per cent over the last seven days`;
  if (change7d < -0.05) return `its TVL fell ${magnitude} per cent over the last seven days`;
  return `its TVL barely moved over the last seven days (${magnitude} per cent)`;
}

/** How long the protocol has run with no token, as a short phrase for a plan step. */
function ageWords(age: number | null): string {
  if (age === null) return 'no first-listing day on its record';
  if (age < 30) return `only ${age} days`;
  if (age < 365) return `about ${Math.floor(age / 30)} months`;
  return `about ${(age / 365).toFixed(1)} years`;
}

/** One category's action, worded for a reader who has to sign the transaction. */
function categoryAction(category: string | null, name: string, chain: string, capital: number): FarmStep {
  const c = (category ?? '').toLowerCase();
  if (c.includes('risk curator') || c.includes('onchain capital allocator') || c.includes('curator')) {
    return {
      step: `Deposit $${capital} of USDC into a ${name} vault on ${chain} and keep the vault shares in the same wallet, so the deposit is one address's record and not a series of moves.`,
      cost: `$${capital} of capital and about $6 of gas to deposit and later withdraw`,
      time: '20 minutes to pick the vault and deposit',
    };
  }
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) {
    return {
      step: `Supply $${capital} of a stable to ${name} on ${chain}, borrow a small amount against it if the market allows, and keep the position open.`,
      cost: `$${capital} of capital and about $8 of gas over the deposit and the borrow`,
      time: '20 minutes to open the position',
    };
  }
  if (c.includes('dex') || c.includes('liquidity') || c.includes('farm') || c.includes('derivative') || c.includes('option') || c.includes('perpetual')) {
    return {
      step: `Add $${capital} of liquidity to ${name}'s deepest pool on ${chain}, or open one small position on it, and leave the position in place between visits.`,
      cost: `$${capital} of capital and about $8 of gas to add and remove liquidity`,
      time: '20 minutes to choose the pool and add',
    };
  }
  if (c.includes('yield') || c.includes('vault') || c.includes('cefi') || c.includes('index')) {
    return {
      step: `Deposit $${capital} of a stable into a ${name} vault on ${chain} and hold the receipt token the vault gives back.`,
      cost: `$${capital} of capital and about $6 of gas in and out`,
      time: '15 minutes to deposit',
    };
  }
  if (c.includes('restak') || c.includes('staking') || c.includes('chain') || c.includes('anchor btc') || c.includes('decentralized btc')) {
    return {
      step: `Stake or restake $${capital} of the chain's staking asset through ${name} on ${chain} and keep the receipt token in the wallet that staked.`,
      cost: `$${capital} of capital and about $5 of gas for the stake and the later unstake`,
      time: '15 minutes to stake',
    };
  }
  if (c.includes('bridge') || c.includes('cross chain')) {
    return {
      step: `Move $${capital} of USDC to ${chain} through ${name}'s own route and then use the bridged funds inside its app, so the route and the use are both on the record.`,
      cost: `$${capital} of capital and about $4 of bridging gas either way`,
      time: '20 minutes including the bridge wait',
    };
  }
  if (c.includes('rwa')) {
    return {
      step: `Mint or buy $${capital} of ${name}'s yield asset on ${chain} and hold it in the same wallet that opened the position.`,
      cost: `$${capital} of capital and about $6 of gas`,
      time: '20 minutes to mint or buy',
    };
  }
  if (c.includes('prediction')) {
    return {
      step: `Fund $${capital} into ${name} on ${chain} and place one or two positions in markets that settle within a month.`,
      cost: `$${capital} of capital, of which the positions hold the risk`,
      time: '15 minutes to place the positions',
    };
  }
  if (c.includes('stablecoin') || c.includes('stable')) {
    return {
      step: `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and keep the balance in the same wallet.`,
      cost: `$${capital} of capital and about $5 of gas to mint and redeem`,
      time: '15 minutes to mint',
    };
  }
  if (c.includes('insurance')) {
    return {
      step: `Buy $${capital} of cover from ${name} on ${chain} and hold the policy to its expiry rather than cancelling it early.`,
      cost: `$${capital} of premium and about $4 of gas`,
      time: '15 minutes to buy the policy',
    };
  }
  if (c.includes('payment') || c.includes('card') || c.includes('otc') || c.includes('governance')) {
    return {
      step: `Use ${name} on ${chain} for ${capital} dollars of its own business — a payment, a trade or a vote — and repeat it in a later month.`,
      cost: `$${capital} of volume plus the network fee, about $5 in all`,
      time: '15 minutes per use',
    };
  }
  return {
    step: `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open in one wallet that only farms.`,
    cost: `$${capital} of capital and about $6 of gas in and out`,
    time: '20 minutes to deposit',
  };
}

/**
 * A row's farm plan: what to do, what it costs and how long it takes, built from the row's own facts —
 * its first chain, its size, its seven-day direction, how long it has run with no token, and whether
 * the house's rule kept it on the watchlist. No protocol is named in the plan generator; the template a
 * row gets follows its category, and the words inside it follow the row.
 */
export function farmPlan(p: SnapshotProtocol, age: number | null, onWatchlist: boolean, watchlistCount: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = positionSizeUsd(p.tvl_usd);
  const hold = holdingDays(age);
  const trend = trendWords(p.change_7d);
  const falling = p.change_7d !== null && p.change_7d < -0.05;

  const steps: FarmStep[] = [
    {
      step: `Create a wallet that holds only the money you plan to farm on ${chain} and keep its recovery phrase offline; that address is the record ${p.name} will read.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      step: `Bridge or buy about $${Math.max(capital * 2, 60)} of gas money and a stable on ${chain}, and keep the farm wallet separate from the wallet you use every day.`,
      cost: `$${Math.max(capital * 2, 60)} of float, of which only the gas is spent`,
      time: '10 to 20 minutes, most of it waiting on a bridge',
    },
    categoryAction(p.category, p.name, chain, capital),
    {
      step: `Use ${p.name} at least once a week — a deposit, a borrow, a swap, a claim or a vote — so the address stays an active user rather than a one-day visitor.`,
      cost: 'about $1 to $3 of gas each week',
      time: '10 minutes a week',
    },
    {
      step: `Leave the position open for at least ${hold} days, so the activity falls inside more than one of the protocol's own snapshots before you think about moving it.`,
      cost: `the $${capital} stays in the position for the whole window`,
      time: `${hold} days`,
    },
    {
      step: `${p.name} records no token, with ${ageWords(age)} of tracked history behind it: that record is what a launch would reward, and a record is all this radar can see.`,
      cost: 'nothing, this is the snapshot\u2019s own dates',
      time: '2 minutes to read',
    },
    {
      step: falling
        ? `The line is not going the protocol's way: ${trend ?? 'no seven-day figure is recorded'}. Keep the position small, and read the vault contract and its audit before adding another dollar.`
        : `${trend ?? 'No seven-day figure is recorded'} for ${p.name}. Check the contract you are depositing into, and its audit, before you size the position up.`,
      cost: 'nothing to check, and the check is what protects the deposit',
      time: '20 minutes to read the contract and the audit',
    },
    onWatchlist
      ? {
          step: `${p.name} is on the house's own watchlist of ${watchlistCount} protocols: its record carries no token, it holds at least the floor in TVL, and it is not a wrapped or staked product of a token that trades.`,
          cost: 'nothing, it is the snapshot\u2019s own rule applied to this protocol',
          time: '2 minutes to read',
        }
      : {
          step: `${p.name} sits outside the house's watchlist and below its floor, so this is an early row the radar found rather than a name the house kept. Weigh it accordingly.`,
          cost: 'nothing, it is the screen\u2019s own verdict',
          time: '2 minutes to read',
        },
    {
      step: `Treat the plan as a record-based watch and nothing more: ${p.name} records no token, which is not the same as having none, and no step here promises that one is issued.`,
      cost: 'no cost, and no one should pay for a promise',
      time: '1 minute to read',
    },
    {
      step: `Write the wallet address, the dates, the deposit and every later transaction in a farm log, so the position can be repeated, sized up or unwound without guesswork.`,
      cost: 'nothing beyond the log itself',
      time: '10 minutes to keep current',
    },
  ];
  return steps;
}

/** One farm step as the board's single string: the action, then its cost and its time. */
export function foldStep(step: FarmStep): string {
  const text = `${step.step} Cost: ${step.cost}. Time: ${step.time}.`.trim();
  if (text.length <= 600) return text;
  return `${text.slice(0, 597)}...`;
}

// ------------------------------------------------------------------ the board

/** The board's rows, strongest first, ranked from one; ties fall back to the slug's order. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration): BoardRow[] {
  const watchlist = new Set(snapshot.watchlist);
  const scored = snapshot.protocols
    .filter(isCandidate)
    .map((p) => {
      const { implied, low, high, factors, age } = impliedValue(p, snapshot.as_of, calibration);
      return { p, implied, low, high, factors, age, onWatchlist: watchlist.has(p.slug) };
    })
    .sort((a, b) => b.implied - a.implied || bySlugCodeUnit(a.p.slug, b.p.slug));

  return scored.map((s, index) => {
    const plan = farmPlan(s.p, s.age, s.onWatchlist, snapshot.watchlist.length);
    return {
      rank: index + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      age_days: s.age,
      listed_at: s.p.listed_at,
      on_watchlist: s.onWatchlist,
      implied_value_usd: s.implied,
      implied_low_usd: s.low,
      implied_high_usd: s.high,
      factors: s.factors,
      plan,
      farm_steps: plan.map(foldStep),
    };
  });
}

/** The snapshot's own fetch time, read out of its source line, with a fallback that is still fixed. */
export function fetchedAt(source: string, asOf: string): string {
  const match = /fetched\s+(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)/.exec(source);
  return match === null ? `${asOf}T00:00:00Z` : match[1]!;
}

/** The board, the live-token set beside it, and the model's own statement of itself. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: Radar } {
  const calibration = calibrate(snapshot);
  const board = buildBoard(snapshot, calibration);
  const watchlist = new Set(snapshot.watchlist);
  const rows: RadarRow[] = board.map((row) => ({
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    age_days: row.age_days,
    listed_at: row.listed_at,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    implied_low_usd: row.implied_low_usd,
    implied_high_usd: row.implied_high_usd,
    factors: row.factors,
    plan: row.plan,
  }));

  // How many board rows each calibration line prices: the category's own median or the global one.
  const usesByCategory = new Map<string, number>();
  let usesGlobal = 0;
  for (const row of board) {
    if (row.factors.multiple_source === 'category') {
      const key = row.category ?? 'Uncategorised';
      usesByCategory.set(key, (usesByCategory.get(key) ?? 0) + 1);
    } else usesGlobal++;
  }
  const test = backtest(snapshot);
  const live = liveRows(snapshot, test);
  const testByCategory = new Map(test.categories.map((c) => [c.category, c]));
  const lines = calibration.lines.map((line) => {
    const rows = line.used_for === 'global' && line.measured < MIN_CATEGORY_OBSERVATIONS
      ? usesGlobal
      : usesByCategory.get(line.category) ?? 0;
    const tested = testByCategory.get(line.category);
    return { ...line, rows, tested: tested?.tested ?? 0, test_miss: tested?.median_miss ?? null };
  });

  const radar: Radar = {
    meta: {
      as_of: snapshot.as_of,
      fetched_at: fetchedAt(snapshot.source, snapshot.as_of),
      floor_usd: snapshot.floor_usd,
      protocols: snapshot.protocols.length,
      watchlist_count: snapshot.watchlist.length,
      candidate_count: board.length,
      live_count: live.length,
      early_count: board.filter((row) => !watchlist.has(row.slug)).length,
      total_implied_usd: board.reduce((sum, row) => sum + row.implied_value_usd, 0),
      median_multiple_global: calibration.global_median,
      global_low: calibration.global_low,
      global_high: calibration.global_high,
      measured: calibration.measured,
      window_low: RATIO_FLOOR,
      window_high: RATIO_CEILING,
      screen_note: SCREEN_NOTE,
      calibration: lines,
      backtest: test,
    },
    rows,
    live,
  };
  return { board, radar };
}

/**
 * Why a board is not one the gate would take, or null when it is: the row count, every rank once,
 * one slug per row, implied values that never rise as the rank ascends, a board that ranks something,
 * three to twelve farm steps a row inside their length band, and every watchlist slug covered.
 */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (board.length < 100 || board.length > 4000) return `the board holds ${board.length} rows, outside the 100 to 4000 a board may hold`;
  const seen = new Set<string>();
  for (const row of board) {
    if (seen.has(row.slug)) return `${row.slug} appears twice in the board`;
    seen.add(row.slug);
    if (row.name.trim().length === 0) return `${row.slug} has no name`;
  }
  const ranks = board.map((row) => row.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${String(ranks[i])}, so the ranks are not one to ${board.length}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share one implied value, so the board ranks nothing by value`;
  }
  for (const row of board) {
    if (!Number.isSafeInteger(row.implied_value_usd) || row.implied_value_usd <= 0) return `${row.slug} has implied value ${String(row.implied_value_usd)}`;
    if (row.implied_value_usd > MAX_IMPLIED) return `${row.slug} has an implied value past the cap the gate reads`;
    if (!(row.implied_low_usd <= row.implied_value_usd && row.implied_value_usd <= row.implied_high_usd)) {
      return `${row.slug} has a band that does not hold its implied value`;
    }
    const steps = row.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${row.slug} has ${steps.length} farm steps`;
    for (const step of steps) {
      const length = step.trim().length;
      if (length < 20 || length > 600) return `${row.slug} has a farm step of ${length} characters, outside the 20 to 600 the gate reads`;
    }
  }
  const missing = snapshot.watchlist.filter((slug) => !seen.has(slug));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  return null;
}

/** The snapshot out of a file's text, refused unless it is the shape this model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const document = raw as Record<string, unknown>;
  if (typeof document.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(document.as_of)) throw new SnapshotError('snapshot.json carries no as_of date');
  if (typeof document.source !== 'string') throw new SnapshotError('snapshot.json carries no source line');
  if (typeof document.floor_usd !== 'number' || !Number.isSafeInteger(document.floor_usd) || document.floor_usd <= 0) {
    throw new SnapshotError('snapshot.json carries no whole floor_usd');
  }
  if (!Array.isArray(document.protocols)) throw new SnapshotError('snapshot.json carries no protocols array');
  if (!Array.isArray(document.watchlist) || document.watchlist.some((slug) => typeof slug !== 'string')) {
    throw new SnapshotError('snapshot.json carries no watchlist of slugs');
  }
  const protocols = document.protocols.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) throw new SnapshotError(`snapshot.json's protocol ${index} is not an object`);
    const p = entry as Record<string, unknown>;
    if (typeof p.slug !== 'string' || p.slug.length === 0 || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${index} carries no slug, name or TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((chain): chain is string => typeof chain === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: document.as_of,
    source: document.source,
    floor_usd: document.floor_usd,
    protocols,
    watchlist: document.watchlist as string[],
  };
}

/** The board as the gate reads it: an object whose rows are the ranked protocols. */
export function boardDocument(board: BoardRow[]): string {
  return `${JSON.stringify({ rows: board })}\n`;
}

/** The dashboard's whole dataset as one script the page loads locally: no fetch and no network. */
export function dataScript(radar: Radar): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
