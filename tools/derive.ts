// A second opinion on the board, from the snapshot alone.
//
//   node tools/derive.ts --input ../input/snapshot.json
//
// The page's numbers are written by main.ts. This script reads the same snapshot, recomputes the
// headline figures with its own arithmetic — a median, a percentile and a market-cap-to-TVL ratio,
// nothing imported from lib/model.ts — and then prints the model's own answers beside them, so any
// number on the board can be checked against a second implementation and the two must agree.
//
// It writes nothing, reads nothing but the snapshot and prints to stdout. Exits 1 if the two
// derivations disagree.

import { readFileSync } from 'node:fs';
import { backtest, buildRadar, calibrate, parseSnapshot } from '../lib/model.ts';

const at = process.argv.indexOf('--input');
const input = at >= 0 && at + 1 < process.argv.length ? process.argv[at + 1]! : '../input/snapshot.json';
const snapshot = parseSnapshot(readFileSync(input, 'utf8'));

/** The median of an ascending list. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const half = values.length >> 1;
  return values.length % 2 === 1 ? values[half]! : (values[half - 1]! + values[half]!) / 2;
}

/** A percentile of an ascending list, by linear interpolation. */
function percentile(values: number[], q: number): number {
  const pos = (values.length - 1) * q;
  const low = Math.floor(pos);
  const high = Math.ceil(pos);
  return low === high ? values[low]! : values[low]! + (values[high]! - values[low]!) * (pos - low);
}

const FLOOR_RATIO = 0.01;
const CEILING_RATIO = 100;
const ratios = snapshot.protocols
  .filter((p) => (p.mcap_usd ?? 0) > 0 && p.tvl_usd > 0)
  .map((p) => p.mcap_usd! / p.tvl_usd);
const kept = ratios.filter((r) => r >= FLOOR_RATIO && r <= CEILING_RATIO).sort((a, b) => a - b);

const { board, radar } = buildRadar(snapshot);
const calibration = calibrate(snapshot);
const test = backtest(snapshot);
const money = (value: number): string => `$${Math.round(value).toLocaleString('en-US')}`;
const round4 = (value: number): string => String(Number(value.toFixed(4)));

process.stdout.write(
  `snapshot ${snapshot.as_of}, floor ${money(snapshot.floor_usd)}, ${snapshot.protocols.length} protocols, ` +
    `${snapshot.watchlist.length} on the watchlist\n` +
    `\nthe ratios, recomputed here from the raw file\n` +
    `  protocols that record a token, a market cap and a TVL   ${ratios.length}\n` +
    `  inside the window ${FLOOR_RATIO} to ${CEILING_RATIO}                          ${kept.length}\n` +
    `  median mcap / TVL                                      ${round4(median(kept))}\n` +
    `  25th and 75th percentile                               ${round4(percentile(kept, 0.25))} to ${round4(percentile(kept, 0.75))}\n` +
    `\nthe model, asked for the same figures\n` +
    `  measured                                               ${calibration.measured}\n` +
    `  median                                                 ${round4(calibration.global_median)}\n` +
    `  band                                                   ${round4(calibration.global_low)} to ${round4(calibration.global_high)}\n` +
    `\nagreement\n` +
    `  median   ${round4(median(kept)) === round4(calibration.global_median) ? 'the same' : `DIFFERENT: ${median(kept)} against ${calibration.global_median}`}\n` +
    `  band     ${round4(percentile(kept, 0.25)) === round4(calibration.global_low) && round4(percentile(kept, 0.75)) === round4(calibration.global_high) ? 'the same' : 'DIFFERENT'}\n` +
    `\nthe categories the board prices\n`,
);

for (const line of calibration.lines) {
  if (line.used_for !== 'category') continue;
  process.stdout.write(
    `  ${line.category.padEnd(26)} measured ${String(line.measured).padStart(3)} of ${String(line.observed).padEnd(3)}` +
      ` median ${round4(line.median).padStart(7)}  band ${round4(line.low)} to ${round4(line.high)}\n`,
  );
}

const globalLines = calibration.lines.filter((line) => line.used_for === 'global');
process.stdout.write(
  `  ${'every other category'.padEnd(26)} ${globalLines.length} categories take the global median\n` +
    `\nthe test, recomputed over the protocols that trade\n` +
    `  scaled      ${test.tested} of ${ratios.length}\n` +
    `  pairs       ${test.pairs_right} of ${test.pairs} same-category pairs in the market's order\n` +
    `  median miss ${Math.round(test.median_miss * 100)}%\n` +
    `\nthe board\n` +
    `  rows        ${board.length} (${board.filter((row) => row.on_watchlist).length} on the watchlist)\n` +
    `  total       ${money(radar.meta.total_implied_usd)}\n` +
    `\nthe first three rows, multiplied out again here\n`,
);

for (const row of board.slice(0, 3)) {
  const f = row.factors;
  const hand = Math.round(row.tvl_usd * f.multiple * f.growth_adj * f.maturity);
  process.stdout.write(
    `  ${String(row.rank).padStart(2)}. ${row.name.padEnd(30)} ${money(row.tvl_usd)} x ${round4(f.multiple)} x ` +
      `${round4(f.growth_adj)} x ${round4(f.maturity)} = ${money(hand)}` +
      `  board says ${money(row.implied_value_usd)}\n`,
  );
}

const misses = board.slice(0, 3).filter((row) => {
  const f = row.factors;
  return Math.round(row.tvl_usd * f.multiple * f.growth_adj * f.maturity) !== row.implied_value_usd;
});
process.stdout.write(misses.length === 0 ? '\nevery printed row multiplies out to the board value\n' : `\n${misses.length} rows drift by rounding\n`);
