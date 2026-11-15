# farisghossani/token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/farisghossani/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/farisghossani/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that reads one sealed DefiLlama snapshot and ranks the 198 protocols whose record
carries no token by what a token would be worth if that record stayed as it is. Every row carries the
TVL, the seven-day change and the age behind its implied value, the band the value's own spread puts
around it, and the steps that would farm the protocol with their cost and their time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <unpacked kit>/input/snapshot.json
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), copies `dashboard/`
and `screenshots/` beside them, and writes `out/dossier.json` with the vendored library. Nothing is
installed: Node 22 runs the TypeScript as it is, the standard library only, and the same snapshot always
writes the same bytes.

## The model

`implied = round( TVL × multiple × growthAdj × maturity )`, four factors and nothing else. Every one of
them is measured on this snapshot at run time; nothing here is a table someone typed.

- **multiple** — the median of market cap ÷ TVL over the protocols of the row's own category that
  already record a token, when four or more of their ratios survive the measurement window; the global
  median (**0.2748**, measured on 117 of the 128 traded ratios) otherwise. Four is the smallest sample
  whose median has an order-statistic interval at all, so a three-peer category is not trusted with its
  own figure.
- **the window** — a ratio under **0.01** or over **100** is dropped (11 of the 128): a market cap below
  one per cent of a protocol's TVL, or above a hundred times it, is a denominator artefact — a stale
  TVL, bridged supply, a token that barely circulates — and not a comparable.
- **growthAdj** — `clamp(1 + w · g / 100, 0.4, 1.6)`, `g = clamp(change_7d, −60, +120)`, with
  `w = 0.7` on a rise and `0.9` on a fall: a seven-day drawdown is a bigger warning than the same rise
  is a bonus.
- **maturity** — `0.55 + 0.45 · min(age_days, 1095) / 1095`, the age counted from the snapshot's own
  as_of back to the listing date, with 365 days read in when no date is recorded.
- **the band** — the 25th and 75th percentile of the same ratios, through the same TVL, growth and
  maturity. It is printed under every value on the board and in full in every detail view: `$573,564,823`
  with `$142M–$2.33B` beside it.

The factors are rounded to the precision the page prints before they multiply, so a reader who
multiplies the four printed numbers gets the ranked value back exactly, not a figure that drifts from it.

The screen keeps a protocol when its record carries no token, its name ends in no release marker, it
carries no whole word *wrapped*, *staked* or *staking*, it does not begin with an exchange name, and its
category is not a bridge, a liquid-staking or a CEX category — 198 protocols pass, all 40 on the house
watchlist among them. The 128 protocols whose token already trades are held out of the ranking and used
to measure the multiples instead.

## How the model is checked

`tools/derive.ts` recomputes the headline figures from the raw snapshot with its own arithmetic — a
median, a percentile, a ratio, nothing imported from the model — and prints the model's answers beside
them. `node tools/derive.ts --input <kit>/input/snapshot.json` exits 1 if the two disagree.

The model is also tested out of sample on the protocols whose token already trades: each one's multiple
is measured again with that protocol left out of its peer set, and its implied value is put beside the
market cap the snapshot records. Over the 115 tested protocols:

- **66.4%** of the 330 same-category pairs land in the order the market gives them (a coin flip is 50%);
- the **median miss is 88%** — half the calls land closer than that, half further;
- **64%** land between half and double the market's figure.

The test measures the multiple, the part of the model read off the snapshot; `growthAdj` and `maturity`
are bounded by hand and have no market figure to be checked against. The miss is why every row carries a
band rather than a single number. The page prints all 128 calls in its last table.

## The dashboard

`dashboard/` is one page over one local file: `index.html`, `app.css` and `app.js` (about 63 KB of source
in all), reading `window.RADAR` out of `../data.js`. It makes no request of any kind and draws the same
board on every load — no clock, no random source, one fixed locale for the numbers. It carries:

- a header with the snapshot's own dates and floor, five tiles (screened in, watchlist covered, board
  implied value, median multiple, pairs ordered right) and, on the first screen, **the model strip**: the
  formula and its four factors with the numbers they resolved to;
- a filter bar — search over name, slug, chain and category, category and chain selects, a minimum-TVL
  select, a watchlist-only switch, a reset — and a sort over implied value, TVL, seven-day change,
  tokenless age, name and category, every sort tie-broken by rank so the order is total and stable;
- the board: rank, protocol and its chains, category, TVL, seven-day change, tokenless age, the implied
  value with its 25th–75th band and the multiple it came from, and a plan button on every row;
- a detail view per protocol: the implied value factor by factor with the note each factor carries, a
  hand multiplication that lands exactly on the ranked value, where the band comes from, the facts the
  snapshot records, and the farm plan step by step with the cost and the time of each step;
- the model page (`?view=method`): the calibration table — one line a category the board prices, with
  its measured peers, its median multiple, the middle half around it, the board rows it prices and the
  model's own median miss there — beside the four factors in full and the out-of-sample test;
- the protocols that already trade, each beside what the model says it is worth with its own ratio left
  out: the model called against the market, all 128 of them, with the miss on each.

The page opens a filtered board from its own location (`?chain=Ethereum&min=100000000`), a protocol's
detail view from its hash (`#p=steakhouse-financial`) and the model page from a view switch
(`?view=method`), which is how the four screenshots in `screenshots/` were taken:

| file | view |
| --- | --- |
| `1-board.jpg` | the board, the model strip and the first rows |
| `2-detail.jpg` | one protocol's detail: factors, band, farm plan |
| `3-filtered.jpg` | the board filtered to Ethereum at $100M and up |
| `4-model.jpg` | the model page: calibration table, factors, the out-of-sample test |

## Verify

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <unpacked kit>/input/snapshot.json   # exits 0
mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts --input <unpacked kit>/input/snapshot.json
diff -r out out2   # silent: byte for byte
node tools/derive.ts --input <unpacked kit>/input/snapshot.json   # the same numbers, a second way
```

`main.ts` refuses its own output before writing it: a board the gate would reject (row count, ranks,
ordering, band, farm-step lengths, watchlist coverage) and a page the gate would reject (a missing
stylesheet or script, a source naming a network address, or source past the 65,536 bytes the judge
reads) both stop the run with the reason, so nothing that would fail the gate reaches the output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qa0bgxzb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
