// token-radar-01: the token launch radar's entrypoint (Node 22, standard library only, no build step).
//
// The program reads the sealed snapshot, scores every protocol that records no token with the model in
// lib/model.ts, ranks them by implied value, and hands in four things:
//
//   board.json     the ranked board: one row a protocol, with its rank, its implied value and its plan
//   data.js        the dashboard's whole dataset as one script: window.RADAR, no fetch and no network
//   dashboard/     the page and its source, copied from this repository
//   dossier.json   the screenshots and the page's source text, rebuilt by the vendored make.fun library
//
// The page reads data.js beside it and renders the board, a detail view of every protocol and a filter
// over the same rows the board holds, so nothing on screen comes from anywhere but the snapshot.
//
// Outside the grader's container MAKEFUN_OUTPUT_DIR stands in for the writable /output:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input ../input/snapshot.json
//
// Every number it writes is a function of the snapshot's bytes alone: the same input writes the same
// output, twice running, with no clock, no random source and no network read anywhere in it.

import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODEL_VERSION, boardDocument, boardIssue, buildRadar, dataScript, parseSnapshot } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

/** The directory this program lives in: the repository, read-only under the grader. */
const repo = fileURLToPath(new URL('.', import.meta.url));

/** The judge reads at most this many bytes of the dashboard's source; the caps below only refuse. */
const TEXT_MAX_BYTES = 65_536;
const SCREENSHOT_CAPS = { max: 4, max_bytes: 524_288 };
const DASHBOARD_CAPS = { max_files: 400, max_bytes: 4_194_304 };
const IMAGE_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;
const SCREENSHOT_MINIMUM = 3;

/** --name <value> out of the arguments, or the fallback; `--name=value` reads the same way. */
function arg(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const inline = process.argv.find((a) => a.startsWith(`--${name}=`));
  return inline === undefined ? fallback : inline.slice(name.length + 3);
}

/** Stop with one line on standard error and the exit code the caller should see. */
function fail(code: number, message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputArg = arg('input', '/input');
const inputFile = inputArg.endsWith('.json') ? inputArg : join(inputArg, 'snapshot.json');
if (!existsSync(inputFile)) {
  fail(2, `no snapshot at ${inputFile}: pass --input <snapshot.json|directory> or mount the sealed /input`);
}
const out = arg('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

/** Parse, score and validate: a board the gate would refuse never reaches disk. */
const snapshot = parseSnapshot(readFileSync(inputFile, 'utf8'));
const { board, radar } = buildRadar(snapshot);
const issue = boardIssue(board, snapshot);
if (issue !== null) fail(1, `the model wrote a board the gate refuses: ${issue}`);

mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'board.json'), boardDocument(board));
writeFileSync(join(out, 'data.js'), dataScript(radar));

/** Copy one directory's regular files into `to`, skipping dot-files; returns what it copied. */
function copyDirectory(from: string, to: string): string[] {
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

const dashboardFiles = copyDirectory(join(repo, 'dashboard'), join(out, 'dashboard'));
const screenshots = copyDirectory(join(repo, 'screenshots'), join(out, 'screenshots'));
if (screenshots.length < SCREENSHOT_MINIMUM) {
  fail(1, `screenshots/ holds ${screenshots.length} image${screenshots.length === 1 ? '' : 's'}: hand in 3, the board, a protocol's detail view and a filtered view`);
}
for (const name of screenshots) {
  if (!IMAGE_NAME.test(name)) {
    fail(1, `screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier is written last and never shaped by hand: the gate rebuilds it from this same /output
// with the vendored library and compares the bytes, so anything else on disk would be a mismatch.
try {
  writeFileSync(join(out, 'dossier.json'), buildDossier(out, { text_max_bytes: TEXT_MAX_BYTES, screenshots: SCREENSHOT_CAPS, dashboard: DASHBOARD_CAPS }));
} catch (error) {
  fail(1, `the dossier was refused: ${error instanceof Error ? error.message : String(error)}`);
}

const top = board[0]!;
const onWatchlist = board.filter((row) => row.on_watchlist).length;
process.stdout.write(
  `token radar ${MODEL_VERSION}: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${radar.meta.candidate_count} rows scored (${onWatchlist} on the watchlist, ${radar.meta.early_count} found below the floor, ${radar.meta.live_count} live-token protocols set aside)\n` +
    `token radar ${MODEL_VERSION}: median multiple ${radar.meta.median_multiple_global} over ${radar.meta.live_count} protocols that already trade; ` +
    `rank 1 is ${top.name} at $${top.implied_value_usd} implied (TVL $${top.tvl_usd})\n` +
    `token radar ${MODEL_VERSION}: wrote ${join(out, 'board.json')}, ${join(out, 'data.js')}, ${join(out, 'dashboard')} (${dashboardFiles.length} files), ` +
    `${join(out, 'screenshots')} (${screenshots.length} images) and ${join(out, 'dossier.json')}\n`,
);
