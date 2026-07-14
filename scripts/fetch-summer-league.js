import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prospectsPath = path.join(root, "src", "prospects.json");
const outputPath = path.join(root, "src", "summer-league.json");
const prospects = JSON.parse(fs.readFileSync(prospectsPath, "utf8")).prospects;
const previous = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const seasonYear = globalThis.process.env.REALGM_SEASON_YEAR || "2027";
const sorts = ["points", "minutes", "rebounds", "assists", "steals", "blocks"];
const qualificationModes = ["All", "Qualified"];

const normalizeName = (name) => name.toLowerCase()
  .replace(/a\.j\./g, "aj")
  .replace(/,?\s+jr\.?/g, "")
  .replace(/[^a-z0-9]/g, "");

const teamAliases = { BRK: "BKN", GOS: "GSW", PHL: "PHI" };
const targets = new Map(prospects.map(prospect => [normalizeName(prospect.name), prospect]));
const discovered = new Map();
const teamGames = {};

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRow(cells) {
  if (cells.length < 23 || number(cells[3]) == null) return null;
  const team = teamAliases[cells[2]] || cells[2];
  return {
    name: cells[1],
    team,
    stats: {
      gp: number(cells[3]), mpg: number(cells[4]), pts: number(cells[5]),
      fgm: number(cells[6]), fga: number(cells[7]), fg: number(cells[8]) * 100,
      threeM: number(cells[9]), threeA: number(cells[10]), three: number(cells[11]) * 100,
      ftm: number(cells[12]), fta: number(cells[13]), ft: number(cells[14]) * 100,
      orb: number(cells[15]), drb: number(cells[16]), reb: number(cells[17]),
      ast: number(cells[18]), stl: number(cells[19]), blk: number(cells[20]),
      tov: number(cells[21]), pf: number(cells[22]),
    },
  };
}

const browser = await chromium.launch({
  headless: true,
  args: ["--disable-blink-features=AutomationControlled"],
});

try {
  const page = await browser.newPage({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 1000 },
  });

  for (const mode of qualificationModes) {
    for (const sort of sorts) {
      const url = `https://basketball.realgm.com/nba/stats/${seasonYear}/Averages/${mode}/${sort}/All/desc/1/Summer_League`;
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForSelector("table tbody tr", { timeout: 20_000 });
      const rows = await page.locator("table tbody tr").evaluateAll(elements => elements.map(row =>
        Array.from(row.querySelectorAll("td"), cell => cell.textContent.trim())
      ));

      if (rows.length < 50) throw new Error(`Unexpectedly small RealGM table (${rows.length} rows): ${url}`);

      for (const cells of rows) {
        const parsed = parseRow(cells);
        if (!parsed) continue;
        teamGames[parsed.team] = Math.max(teamGames[parsed.team] || 0, parsed.stats.gp);
        const prospect = targets.get(normalizeName(parsed.name));
        if (prospect) discovered.set(prospect.id, parsed.stats);
      }
      console.log(`Scanned ${mode}/${sort}: ${rows.length} rows, ${discovered.size} prospects matched`);
    }
  }
} finally {
  await browser.close();
}

const minimumMatches = Math.min(8, Object.keys(previous.players || {}).length);
if (discovered.size < minimumMatches) {
  throw new Error(`Only matched ${discovered.size} prospects; expected at least ${minimumMatches}. Existing data was not changed.`);
}

const orderedPlayers = {};
for (const prospect of prospects) {
  if (discovered.has(prospect.id)) orderedPlayers[prospect.id] = discovered.get(prospect.id);
}

const output = {
  season: previous.season,
  event: "NBA Summer League",
  asOf: new Date().toISOString().slice(0, 10),
  source: "RealGM automated refresh",
  teamGames: Object.fromEntries(Object.entries(teamGames).sort(([a], [b]) => a.localeCompare(b))),
  players: orderedPlayers,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${outputPath} with ${discovered.size} prospect profiles`);
