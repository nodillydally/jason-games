// tools/fetch-flags.mjs — vendor flag images into data/flags/.
//
// Why this exists: Windows has no flag-emoji font, so 🇵🇪 renders as the bare
// letters "PE" in Chrome/Edge. In flag-guessing mode that literally spells out
// the answer. Images render identically everywhere, and vendoring them keeps
// the game playable offline from a local index.html.
//
// Source: flagcdn.com (public domain flag artwork), w320 PNG — small enough
// that the whole set is a few hundred KB, sharp enough for a ~120px render.
//
// Run:  node tools/fetch-flags.mjs        (skips files already downloaded)
//       node tools/fetch-flags.mjs --force

import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, "..");
const OUT = join(GAME, "data", "flags");
const FORCE = process.argv.includes("--force");

const exists = (p) => access(p).then(() => true, () => false);

const src = await readFile(join(GAME, "data", "countries.js"), "utf8");
const codes = [...new Set([...src.matchAll(/"cca2":"([A-Za-z]{2})"/g)].map((m) => m[1].toLowerCase()))].sort();

if (!codes.length) {
  console.error("No cca2 codes found in data/countries.js — did the format change?");
  process.exit(1);
}

await mkdir(OUT, { recursive: true });

let fetched = 0, skipped = 0;
const failed = [];

for (const cc of codes) {
  const dest = join(OUT, `${cc}.png`);
  if (!FORCE && (await exists(dest))) { skipped += 1; continue; }
  try {
    const res = await fetch(`https://flagcdn.com/w320/${cc}.png`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // A valid PNG starts with the 8-byte signature; anything else is an error
    // page dressed up as a 200 and would render as a broken image in-game.
    if (buf.length < 8 || buf.readUInt32BE(0) !== 0x89504e47) throw new Error("not a PNG");
    await writeFile(dest, buf);
    fetched += 1;
  } catch (err) {
    failed.push(`${cc}: ${err.message}`);
  }
}

console.log(`flags: ${fetched} fetched, ${skipped} already present, ${failed.length} failed`);
if (failed.length) {
  console.error(failed.join("\n"));
  process.exit(1);
}
