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

---

<sub>Entered on [make.fun](https://make.fun/?ref=qa0bgxzb&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
