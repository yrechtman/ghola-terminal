#!/usr/bin/env node

// Fetches league data from the Fantrax API and supplemental data from external
// sources, then writes everything to src/data.json.
//
// External sources (all free, no auth required):
//   - PrizePicks: NBA player prop lines for today's games
//   - Fantrax getAdp: Dynasty ADP from within the platform
//
// Usage:
//   npm run fetch-data

import { readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LEAGUE_ID = "i4mue2axmd7ntz13";
const BASE_URL = "https://www.fantrax.com/fxea/general";
const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ============================================================
// API FETCHING
// ============================================================

async function fantraxFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res;
  try {
    res = await fetch(url.toString(), { headers: { "User-Agent": BROWSER_UA } });
  } catch (err) {
    throw new Error(`${endpoint}: network error (${err.cause?.code || err.message}). Is fantrax.com reachable?`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

// Fetch PrizePicks NBA prop lines — no auth required.
// Returns { [normalizedPlayerName]: { pts, reb, ast, threes, blk, stl, to, ftm, team, gameTime } }
async function fetchPrizePicks() {
  const STAT_MAP = {
    "Points": "pts", "Rebounds": "reb", "Assists": "ast",
    "3-Pointers Made": "threes", "Blocked Shots": "blk",
    "Steals": "stl", "Turnovers": "to", "Free Throws Made": "ftm",
  };

  let raw;
  try {
    const res = await fetch("https://api.prizepicks.com/projections?league_id=7&per_page=1000", {
      headers: { "User-Agent": BROWSER_UA, "Accept": "application/json" },
    });
    console.log(`  PrizePicks HTTP ${res.status} (${res.headers.get("content-type") || "no content-type"})`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();
    console.log(`  PrizePicks response size: ${text.length} bytes`);
    try {
      raw = JSON.parse(text);
    } catch {
      console.warn(`  PrizePicks response is not JSON (likely blocked/captcha): ${text.slice(0, 200)}`);
      return {};
    }
  } catch (err) {
    console.warn(`  PrizePicks fetch failed (${err.message}) — skipping player props`);
    return {};
  }

  console.log(`  PrizePicks data[]: ${(raw.data || []).length} projections, included[]: ${(raw.included || []).length} records`);

  // Build player ID → { name, team } from the "included" sideload
  const playerMeta = {};
  for (const item of (raw.included || [])) {
    if (item.type === "new_player") {
      playerMeta[item.id] = { name: item.attributes.name, team: item.attributes.team };
    }
  }

  // Accumulate lines per player
  const props = {};
  for (const proj of (raw.data || [])) {
    const playerId = proj.relationships?.new_player?.data?.id;
    if (!playerId) continue;
    const meta = playerMeta[playerId];
    if (!meta) continue;

    const statKey = STAT_MAP[proj.attributes.stat_type];
    if (!statKey) continue;

    const key = normalizeName(meta.name);
    if (!props[key]) props[key] = { name: meta.name, team: meta.team, gameTime: null };
    props[key][statKey] = proj.attributes.line_score;
    if (!props[key].gameTime && proj.attributes.start_time) {
      props[key].gameTime = proj.attributes.start_time;
    }
  }

  return props;
}

// Fetch Fantrax dynasty ADP. Returns { [fantraxPlayerId]: adpRank } or {}
async function fetchFantraxAdp() {
  try {
    const raw = await fantraxFetch("getAdp", { leagueId: LEAGUE_ID, sport: "NBA" });
    console.log(`  Fantrax ADP top-level keys: ${Object.keys(raw).join(", ")}`);
    // Save raw response for inspection
    writeFileSync(join(ROOT, "scripts/.debug-adp.json"), JSON.stringify(raw, null, 2));

    const adp = {};
    const players = raw.players || raw.adpPlayers || raw.adpData || [];
    for (const p of Array.isArray(players) ? players : []) {
      if (p.id && p.adp != null) adp[p.id] = p.adp;
    }
    // Try alternate response shape (object keyed by player ID)
    if (Object.keys(adp).length === 0 && typeof raw === "object" && !Array.isArray(raw)) {
      for (const [id, data] of Object.entries(raw)) {
        if (typeof data === "object" && data?.adp != null) adp[id] = data.adp;
      }
    }
    console.log(`  Fantrax ADP: parsed ${Object.keys(adp).length} players`);
    return adp;
  } catch (err) {
    console.warn(`  Fantrax ADP fetch failed (${err.message}) — skipping dynasty ADP`);
    return {};
  }
}

function normalizeName(name) {
  return name.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")  // strip diacritics
    .replace(/\./g, "")                                   // Jr. → Jr
    .replace(/\s+/g, " ").trim();
}

// ============================================================
// TRANSFORMS
// ============================================================

function buildTeamMap(leagueInfoRaw) {
  const teamMap = {};
  if (leagueInfoRaw.teamInfo) {
    for (const [teamId, info] of Object.entries(leagueInfoRaw.teamInfo)) {
      teamMap[teamId] = info.name;
    }
  }
  return teamMap;
}

function extractScoring(leagueInfoRaw) {
  const scoring = {};
  if (!leagueInfoRaw.scoringSystem?.scoringCategorySettings) return scoring;
  for (const group of leagueInfoRaw.scoringSystem.scoringCategorySettings) {
    for (const config of group.configs || []) {
      if (config.points !== undefined && config.scoringCategory) {
        const code = config.scoringCategory.shortName || config.scoringCategory.code || config.scoringCategory.name;
        if (code) scoring[code] = config.points;
      }
    }
  }
  return scoring;
}

function extractLeagueInfo(leagueInfoRaw, teamMap) {
  const info = {
    leagueName: leagueInfoRaw.leagueName || "The Bene Gessirit",
    scoring: extractScoring(leagueInfoRaw),
    teams: {},
    rosterInfo: null,
  };

  let numericId = 2;
  for (const [fantraxId, name] of Object.entries(teamMap)) {
    info.teams[fantraxId] = { name, numericId };
    numericId++;
  }

  if (leagueInfoRaw.rosterInfo) {
    info.rosterInfo = {
      maxTotalPlayers: leagueInfoRaw.rosterInfo.maxTotalPlayers,
      maxActivePlayers: leagueInfoRaw.rosterInfo.maxTotalActivePlayers,
      maxReservePlayers: leagueInfoRaw.rosterInfo.maxTotalReservePlayers,
    };
  }

  return info;
}

function transformStandings(raw) {
  return raw.map(t => {
    const [w, l] = t.points.split("-").map(Number);
    return {
      rank: t.rank,
      team: t.teamName,
      w,
      l,
      fpFor: t.totalPointsFor,
      fpAgainst: 0,
      streak: "",
    };
  }).sort((a, b) => a.rank - b.rank);
}

function transformDraftPicks(raw, teamMap) {
  const picks = {};
  Object.values(teamMap).forEach(name => { picks[name] = []; });

  const futurePicks = raw.futureDraftPicks.filter(p => p.year === 2026);
  for (const pick of futurePicks) {
    const ownerName = teamMap[pick.currentOwnerTeamId];
    const originalName = teamMap[pick.originalOwnerTeamId];
    if (!ownerName || !originalName) continue;
    const entry = { round: pick.round };
    if (ownerName !== originalName) entry.from = originalName;
    picks[ownerName].push(entry);
  }

  for (const team of Object.keys(picks)) {
    picks[team].sort((a, b) => a.round - b.round);
  }
  return picks;
}

function transformRosters(rostersRaw, playerIdsRaw, existingCsv, leagueInfo) {
  const playerLookup = {};
  for (const [id, info] of Object.entries(playerIdsRaw)) {
    if (info.name && info.name !== "Team") {
      playerLookup[id] = {
        name: info.name.includes(",")
          ? info.name.split(",").map(s => s.trim()).reverse().join(" ")
          : info.name,
        nbaTeam: info.team || "(N/A)",
        position: info.position || "",
        eligible: info.position || "",
      };
    }
  }

  const statusMap = { ACTIVE: "Act", RESERVE: "Res", INJURED_RESERVE: "IR", MINORS: "Min" };
  const newCsv = {};

  const existingStats = {};
  for (const [, csv] of Object.entries(existingCsv)) {
    for (const line of csv.split("\n").filter(Boolean)) {
      const match = line.match(/^\*([^*]+)\*/);
      if (!match) {
        const qMatch = line.match(/^"?\*([^*]+)\*"?/);
        if (qMatch) existingStats[qMatch[1]] = line;
      } else {
        existingStats[match[1]] = line;
      }
    }
  }

  for (const [fantraxTeamId, teamData] of Object.entries(rostersRaw.rosters)) {
    const teamInfo = leagueInfo.teams[fantraxTeamId];
    if (!teamInfo) continue;
    const teamNum = teamInfo.numericId;

    const lines = [];
    for (const item of teamData.rosterItems) {
      const playerId = item.id;
      const status = statusMap[item.status] || item.status;
      const pos = item.position || "";

      if (existingStats[playerId]) {
        let line = existingStats[playerId];
        const fields = [];
        let current = "";
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
          const ch = line[i];
          if (ch === '"') inQuotes = !inQuotes;
          else if (ch === ',' && !inQuotes) { fields.push(current.trim()); current = ""; }
          else current += ch;
        }
        fields.push(current.trim());
        fields[1] = pos || fields[1];
        fields[5] = status;
        lines.push(fields.map(f => `"${f}"`).join(","));
      } else {
        const info = playerLookup[playerId] || { name: `Unknown(${playerId})`, nbaTeam: "(N/A)", eligible: pos };
        const zeroes = Array(11).fill("0").join('","');
        lines.push(`"*${playerId}*","${pos}","${info.name}","${info.nbaTeam}","${info.eligible}","${status}","0","0","0","0","${zeroes}"`);
      }
    }
    newCsv[teamNum] = lines.join("\n");
  }
  return newCsv;
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log("=== Ghola Terminal Data Fetcher ===");
  console.log(`League ID: ${LEAGUE_ID}`);
  console.log("");

  const existingData = JSON.parse(readFileSync(join(ROOT, "src/data.json"), "utf8"));

  try {
    console.log("Fetching Fantrax data...");
    const [standingsRaw, rostersRaw, draftPicksRaw, playerIdsRaw, leagueInfoRaw] = await Promise.all([
      fantraxFetch("getStandings", { leagueId: LEAGUE_ID }),
      fantraxFetch("getTeamRosters", { leagueId: LEAGUE_ID }),
      fantraxFetch("getDraftPicks", { leagueId: LEAGUE_ID }),
      fantraxFetch("getPlayerIds", { sport: "NBA" }),
      fantraxFetch("getLeagueInfo", { leagueId: LEAGUE_ID }),
    ]);

    console.log("Fetching supplemental data (PrizePicks props, Fantrax ADP)...");
    const [playerProps, dynastyAdp] = await Promise.all([
      fetchPrizePicks(),
      fetchFantraxAdp(),
    ]);

    writeFileSync(join(__dirname, ".debug-standings.json"), JSON.stringify(standingsRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-rosters.json"), JSON.stringify(rostersRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-draftpicks.json"), JSON.stringify(draftPicksRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-leagueinfo.json"), JSON.stringify(leagueInfoRaw, null, 2));
    if (Object.keys(playerProps).length > 0) {
      writeFileSync(join(__dirname, ".debug-prizepicks.json"), JSON.stringify(playerProps, null, 2));
    }
    console.log("  Raw responses saved to scripts/.debug-*.json");
    console.log("");

    console.log("Transforming data...");

    const teamMap = buildTeamMap(leagueInfoRaw);
    console.log(`  Teams: ${Object.keys(teamMap).length} teams from league info`);

    const leagueInfo = extractLeagueInfo(leagueInfoRaw, teamMap);
    const scoringKeys = Object.keys(leagueInfo.scoring);
    console.log(`  Scoring: ${scoringKeys.length} categories (${scoringKeys.join(", ")})`);

    const standings = transformStandings(standingsRaw);
    console.log(`  Standings: ${standings.length} teams`);

    const draftPicks = transformDraftPicks(draftPicksRaw, teamMap);
    const totalPicks = Object.values(draftPicks).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`  Draft picks: ${totalPicks} picks across ${Object.keys(draftPicks).length} teams`);

    const rawCsv = transformRosters(rostersRaw, playerIdsRaw, existingData.RAW_CSV, leagueInfo);
    const totalPlayers = Object.values(rawCsv).reduce((sum, csv) => sum + csv.split("\n").filter(Boolean).length, 0);
    console.log(`  Rosters: ${totalPlayers} players across ${Object.keys(rawCsv).length} teams`);

    const propsCount = Object.keys(playerProps).length;
    const adpCount = Object.keys(dynastyAdp).length;
    console.log(`  PrizePicks: ${propsCount} players with lines today`);
    console.log(`  Dynasty ADP: ${adpCount} players`);

    const appTeamMap = {};
    for (const { name, numericId } of Object.values(leagueInfo.teams)) {
      appTeamMap[numericId] = name;
    }

    const newData = {
      STANDINGS: standings,
      DRAFT_PICKS: draftPicks,
      RAW_CSV: rawCsv,
      TEAM_MAP: appTeamMap,
      LEAGUE_INFO: {
        leagueName: leagueInfo.leagueName,
        scoring: leagueInfo.scoring,
        rosterInfo: leagueInfo.rosterInfo,
      },
      // PrizePicks prop lines for today's games. Key = normalized player name.
      // Shape: { pts, reb, ast, threes, blk, stl, to, ftm, team, gameTime }
      PLAYER_PROPS: playerProps,
      // Fantrax dynasty ADP. Key = Fantrax player ID. Value = ADP rank.
      DYNASTY_ADP: dynastyAdp,
      _meta: {
        lastUpdated: new Date().toISOString(),
        leagueId: LEAGUE_ID,
        propsDate: propsCount > 0 ? new Date().toDateString() : null,
      },
    };

    writeFileSync(join(ROOT, "src/data.json"), JSON.stringify(newData, null, 2));
    console.log("");
    console.log(`src/data.json updated at ${newData._meta.lastUpdated}`);
    console.log("Run 'npm run dev' to see the changes.");

  } catch (err) {
    console.error("");
    console.error("FETCH FAILED:", err.message);
    console.error("");
    if (err.message.includes("403") || err.message.includes("401")) {
      console.error("Got an auth error. Make sure the league visibility is set to 'Public' in Fantrax.");
    }
    console.error("");
    console.error("Existing data.json was NOT modified.");
    process.exit(1);
  }
}

main();
