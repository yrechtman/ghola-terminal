import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(root, "src", "prospects.json");
const data = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const cacheArg = globalThis.process.argv.indexOf("--cache");
const cacheDir = cacheArg >= 0 ? globalThis.process.argv[cacheArg + 1] : null;
const teamGamesCache = new Map();

const schoolSlugs = {
  Connecticut: "uconn",
  "Southern Methodist": "smu",
  "St. John's": "st-johns",
};

const slugify = (value) => value.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/['.]/g, "")
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");

const fields = {
  gp: "games_played",
  mpg: "minutes_per_game",
  pts: "points_per_game",
  reb: "rebounds_per_game",
  ast: "assists_per_game",
  stl: "steals_per_game",
  blk: "blocks_per_game",
  tov: "turnovers_per_game",
  fg: "field_goal_pct",
  three: "three_point_pct",
  ft: "free_throw_pct",
  ts: "ts_pct",
  efg: "efg_pct",
  ftr: "ftr",
  threePar: "three_par",
  usg: "usg_pct",
  tovPct: "tov_pct",
  astPct: "ast_pct",
  orbPct: "orb_pct",
  drbPct: "drb_pct",
  stlPct: "stl_pct",
  blkPct: "blk_pct",
  role: "role_label",
  roleSecondary: "role_secondary",
  top50Pts: "vs_top50_ppg",
  top50Ts: "vs_top50_ts_pct",
  top50Games: "vs_top50_games",
};

function extract(html, key) {
  const pattern = new RegExp(`\\\\"${key}\\\\":(?:\\\\"([^\\\\"]*)\\\\"|(-?\\d+(?:\\.\\d+)?|null|true|false))`);
  const match = html.match(pattern);
  const raw = match?.[1] ?? match?.[2];
  if (raw == null || raw === "null") return null;
  if (raw === "true" || raw === "false") return raw === "true";
  const numeric = Number(raw);
  return Number.isNaN(numeric) ? raw : numeric;
}

function extractGameAverages(html) {
  const match = html.match(/\\"game_log\\":(\[.*?\])\},\\"hotColdTrend/s);
  if (!match) return {};
  const games = JSON.parse(match[1].replaceAll('\\"', '"'));
  const average = (key) => Number((games.reduce((sum, game) => sum + (game[key] || 0), 0) / games.length).toFixed(2));
  return {
    fgm: average("field_goals_made"),
    fga: average("field_goals_attempted"),
    threeM: average("three_pointers_made"),
    threeA: average("three_pointers_attempted"),
    ftm: average("free_throws_made"),
    fta: average("free_throws_attempted"),
    pf: average("personal_fouls"),
  };
}

async function loadPage(prospect) {
  if (cacheDir) return fs.readFileSync(path.join(cacheDir, `${prospect.id}.html`), "utf8");
  const school = schoolSlugs[prospect.school] || slugify(prospect.school);
  const url = `https://www.college-hoops-data.com/players/${prospect.id}-${school}`;
  const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 prospect-research/1.0" } });
  if (!response.ok) throw new Error(`${prospect.name}: ${response.status} ${response.statusText}`);
  return response.text();
}

async function loadTeamGames(prospect) {
  const school = schoolSlugs[prospect.school] || slugify(prospect.school);
  if (!teamGamesCache.has(school)) {
    teamGamesCache.set(school, (async () => {
      const url = `https://www.college-hoops-data.com/teams/${school}`;
      const response = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 prospect-research/1.0" } });
      if (!response.ok) throw new Error(`${prospect.school}: ${response.status} ${response.statusText}`);
      const html = await response.text();
      const match = html.match(/\\"games_played\\":(\d+)/);
      if (!match) throw new Error(`${prospect.school}: team games not found`);
      return Number(match[1]);
    })());
  }
  return teamGamesCache.get(school);
}

for (const prospect of data.prospects) {
  if (prospect.collegeEligible === false) {
    prospect.college = null;
    console.log(`Skipped ${prospect.name}: no NCAA sample`);
    continue;
  }
  const html = await loadPage(prospect);
  const college = {};
  for (const [output, provider] of Object.entries(fields)) college[output] = extract(html, provider);
  Object.assign(college, extractGameAverages(html));
  college.teamGames = await loadTeamGames(prospect);
  if (college.gp == null) throw new Error(`${prospect.name}: college stats not found`);
  prospect.college = college;
  if (!cacheDir) await new Promise(resolve => setTimeout(resolve, 175));
  console.log(`Loaded ${prospect.name}: ${college.gp} GP, ${college.pts} PPG`);
}

data.asOf = new Date().toISOString().slice(0, 10);
data.collegeSource = "College Hoops Data";
fs.writeFileSync(dataPath, `${JSON.stringify(data, null, 2)}\n`);
console.log(`Updated ${dataPath}`);
