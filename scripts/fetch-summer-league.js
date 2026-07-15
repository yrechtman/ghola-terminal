import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const prospectsPath = path.join(root, "src", "prospects.json");
const outputPath = path.join(root, "src", "summer-league.json");
const prospects = JSON.parse(fs.readFileSync(prospectsPath, "utf8")).prospects;
const previous = JSON.parse(fs.readFileSync(outputPath, "utf8"));
const eventStart = globalThis.process.env.SUMMER_LEAGUE_START_DATE || "2026-07-03";
const leagues = [
  "nba-summer-california",
  "nba-summer-utah",
  "nba-summer-las-vegas",
];

const normalizeName = (name) => name.toLowerCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .replace(/a\.j\./g, "aj")
  .replace(/,?\s+jr\.?/g, "")
  .replace(/[^a-z0-9]/g, "");

const teamAliases = {
  GS: "GSW",
  NO: "NOP",
  NY: "NYK",
  SA: "SAS",
  UTAH: "UTA",
  WSH: "WAS",
};
const targets = new Map(prospects.map(prospect => [normalizeName(prospect.name), prospect]));
const totals = new Map();
const teamGames = {};
const seenGames = new Set();

function number(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function madeAttempts(value) {
  const [made, attempts] = String(value || "0-0").split("-");
  return [number(made), number(attempts)];
}

function round(value) {
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

function average(value, games) {
  return round(value / games);
}

function percentage(made, attempts) {
  return attempts ? round((made / attempts) * 100) : 0;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`ESPN returned HTTP ${response.status}: ${url}`);
  return response.json();
}

function addPlayerGame(player, values) {
  const [fgm, fga] = madeAttempts(values.FG);
  const [threeM, threeA] = madeAttempts(values["3PT"]);
  const [ftm, fta] = madeAttempts(values.FT);
  const current = totals.get(player.id) || {
    gp: 0, minutes: 0, pts: 0, fgm: 0, fga: 0, threeM: 0, threeA: 0,
    ftm: 0, fta: 0, orb: 0, drb: 0, reb: 0, ast: 0, stl: 0,
    blk: 0, tov: 0, pf: 0,
  };

  current.gp += 1;
  current.minutes += number(values.MIN);
  current.pts += number(values.PTS);
  current.fgm += fgm;
  current.fga += fga;
  current.threeM += threeM;
  current.threeA += threeA;
  current.ftm += ftm;
  current.fta += fta;
  current.orb += number(values.OREB);
  current.drb += number(values.DREB);
  current.reb += number(values.REB);
  current.ast += number(values.AST);
  current.stl += number(values.STL);
  current.blk += number(values.BLK);
  current.tov += number(values.TO);
  current.pf += number(values.PF);
  totals.set(player.id, current);
}

function processGame(summary, eventId) {
  if (seenGames.has(eventId)) return;
  seenGames.add(eventId);

  for (const teamBox of summary.boxscore?.players || []) {
    const team = teamAliases[teamBox.team?.abbreviation] || teamBox.team?.abbreviation;
    if (!team) throw new Error(`Missing team abbreviation for ESPN event ${eventId}`);
    teamGames[team] = (teamGames[team] || 0) + 1;

    const statistics = teamBox.statistics?.find(group => group.labels?.includes("MIN"));
    if (!statistics) throw new Error(`Missing player statistics for ${team} in ESPN event ${eventId}`);

    for (const athlete of statistics.athletes || []) {
      if (athlete.didNotPlay) continue;
      const player = targets.get(normalizeName(athlete.athlete?.displayName || ""));
      if (!player) continue;
      const values = Object.fromEntries(statistics.labels.map((label, index) => [label, athlete.stats[index]]));
      if (!values.MIN || values.MIN === "--") continue;
      addPlayerGame(player, values);
    }
  }
}

const start = eventStart.replaceAll("-", "");
const end = new Date().toISOString().slice(0, 10).replaceAll("-", "");
let completedGames = 0;

for (const league of leagues) {
  const scoreboardUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/scoreboard?dates=${start}-${end}&limit=100`;
  const scoreboard = await fetchJson(scoreboardUrl);
  const events = (scoreboard.events || []).filter(event => event.status?.type?.completed);

  for (const event of events) {
    const summaryUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/${league}/summary?event=${event.id}`;
    processGame(await fetchJson(summaryUrl), event.id);
    completedGames += 1;
  }
  console.log(`Scanned ${league}: ${events.length} completed games, ${totals.size} prospects matched`);
}

if (completedGames < 10) {
  throw new Error(`Only found ${completedGames} completed Summer League games. Existing data was not changed.`);
}

const minimumMatches = Math.min(8, Object.keys(previous.players || {}).length);
if (totals.size < minimumMatches) {
  throw new Error(`Only matched ${totals.size} prospects; expected at least ${minimumMatches}. Existing data was not changed.`);
}

const orderedPlayers = {};
for (const prospect of prospects) {
  const total = totals.get(prospect.id);
  if (!total) continue;
  orderedPlayers[prospect.id] = {
    gp: total.gp,
    mpg: average(total.minutes, total.gp),
    pts: average(total.pts, total.gp),
    fgm: average(total.fgm, total.gp),
    fga: average(total.fga, total.gp),
    fg: percentage(total.fgm, total.fga),
    threeM: average(total.threeM, total.gp),
    threeA: average(total.threeA, total.gp),
    three: percentage(total.threeM, total.threeA),
    ftm: average(total.ftm, total.gp),
    fta: average(total.fta, total.gp),
    ft: percentage(total.ftm, total.fta),
    orb: average(total.orb, total.gp),
    drb: average(total.drb, total.gp),
    reb: average(total.reb, total.gp),
    ast: average(total.ast, total.gp),
    stl: average(total.stl, total.gp),
    blk: average(total.blk, total.gp),
    tov: average(total.tov, total.gp),
    pf: average(total.pf, total.gp),
  };
}

const output = {
  season: previous.season,
  event: "All NBA Summer League Events",
  asOf: new Date().toISOString().slice(0, 10),
  source: "ESPN automated refresh",
  teamGames: Object.fromEntries(Object.entries(teamGames).sort(([a], [b]) => a.localeCompare(b))),
  players: orderedPlayers,
};

fs.writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Updated ${outputPath} from ${completedGames} games with ${totals.size} prospect profiles`);
