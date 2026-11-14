# farisghossani/token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/farisghossani/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/farisghossani/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar that reads one sealed DefiLlama snapshot and ranks the protocols whose record carries no token by what a token would be worth if that record stayed as it is. Every row carries the TVL, the seven-day change and the age behind its implied value, plus the steps that would farm the protocol with their cost and their time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <unpacked kit>/input/snapshot.json
```

It writes `out/board.json` (the ranked board), `out/data.js` (the dashboard's data), copies `dashboard/` and
`screenshots/` beside them, and writes `out/dossier.json` with the vendored library. Nothing is installed:
Node 22 runs the TypeScript as it is, the standard library only, and the same snapshot always writes the
same bytes.

## The model

`implied = round( TVL × multiple × growthAdj × maturity )`, four factors and nothing else:

- **multiple** — the median of market cap ÷ TVL over the protocols of the row's own category that
  already record a token, or the global median when that category holds fewer than three of them.
- **growthAdj** — `clamp(1 + w · g / 100, 0.4, 1.6)`, `g = clamp(change_7d, −60, +120)`, with
  `w = 0.7` on a rise and `0.9` on a fall: a seven-day drawdown is a bigger warning than the same rise
  is a bonus.
- **maturity** — `0.55 + 0.45 · min(age_days, 1095) / 1095`, the age counted from the snapshot's own
  as_of back to the listing date, with 365 days read in when no date is recorded.

The screen keeps a protocol when its record carries no token, its name ends in no release marker, it
carries no whole word *wrapped*, *staked* or *staking*, it does not begin with an exchange name, and its
category is not a bridge, a liquid-staking or a CEX category. The protocols whose token already trades
are held out of the ranking and used to measure the multiples instead.

## The dashboard

`dashboard/` is one page over one local file: `index.html`, `app.css` and `app.js` (about 50 KB of
source in all), reading `window.RADAR` out of `../data.js`. It makes no request of any kind and draws
the same board on every load — no clock, no random source, one fixed locale for the numbers. It carries:

- a header with the snapshot's own dates, the floor, and four tiles: candidates, watchlist, total
  implied value and the median multiple the ranking used;
- a filter bar — search over name, slug, chain and category, category and chain selects, a minimum-TVL
  select, a watchlist-only switch, a reset — and a sort over implied value, TVL, seven-day change,
  tokenless age, name and category, every sort tie-broken by rank so the order is total and stable;
- the board: rank, protocol and its chains, category, TVL, seven-day change, tokenless age, the implied
  value with a bar relative to the highest on the board, and a plan button on every row;
- a detail view per protocol: the implied value factor by factor with the note each factor carries, a
  hand multiplication the reader can check, the facts the snapshot records, and the farm plan step by
  step with the cost and the time of each step;
- the method, stated in full: the formula, the four factors with their constants and the observed
  per-category multiples table the calibration came from;
- the protocols that already trade, set aside with their market cap and their mcap ÷ TVL ratio, which
  is exactly the ratio those multiples were measured from.

The page opens a filtered board from its own location (`?chain=Ethereum&min=100000000`, or a
`filter=` parameter carrying the same pairs) and a protocol's detail view from its hash
(`#p=steakhouse-financial`), which is how the three screenshots in `screenshots/` were taken.

## Verify

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <unpacked kit>/input/snapshot.json   # exits 0
mkdir -p out2 && MAKEFUN_OUTPUT_DIR=out2 node main.ts --input <unpacked kit>/input/snapshot.json
diff out/board.json out2/board.json && diff out/data.js out2/data.js   # silent: byte for byte
```

`main.ts` refuses its own output before writing it: a board the gate would reject (row count, ranks,
ordering, farm-step lengths, watchlist coverage) and a page the gate would reject (a missing
stylesheet or script, a source naming a network address, or source past the 65,536 bytes the judge
reads) both stop the run with the reason, so nothing that would fail the gate reaches the output.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qa0bgxzb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
