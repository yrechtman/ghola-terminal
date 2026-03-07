#!/usr/bin/env node

// Fetches league data from the Fantrax API and writes to src/data.json.
//
// The league is public — no login required.
//
// Usage:
//   npm run fetch-data

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LEAGUE_ID = "i4mue2axmd7ntz13";
const BASE_URL = "https://www.fantrax.com/fxea/general";

// ============================================================
// API FETCHING
// ============================================================

async function fantraxFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
  } catch (err) {
    throw new Error(`${endpoint}: network error (${err.cause?.code || err.message}). Is fantrax.com reachable?`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

// ============================================================
// TRANSFORMS
// ============================================================

// Build team ID → name map from getLeagueInfo response
function buildTeamMap(leagueInfoRaw) {
  const teamMap = {};
  if (leagueInfoRaw.teamInfo) {
    for (const [teamId, info] of Object.entries(leagueInfoRaw.teamInfo)) {
      teamMap[teamId] = info.name;
    }
  }
  return teamMap;
}

// Extract scoring weights from getLeagueInfo response
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

// Extract league metadata from getLeagueInfo
function extractLeagueInfo(leagueInfoRaw, teamMap) {
  const info = {
    leagueName: leagueInfoRaw.leagueName || "The Bene Gessirit",
    scoring: extractScoring(leagueInfoRaw),
    teams: {},
    rosterInfo: null,
  };

  // Build teams object: fantraxId → { name, id (numeric) }
  let numericId = 2;
  for (const [fantraxId, name] of Object.entries(teamMap)) {
    info.teams[fantraxId] = { name, numericId };
    numericId++;
  }

  // Roster constraints
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
    if (ownerName !== originalName) {
      entry.from = originalName;
    }
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

  // Parse existing CSV to build a lookup by player ID → stat line
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
    console.log("Fetching data from Fantrax API...");
    const [standingsRaw, rostersRaw, draftPicksRaw, playerIdsRaw, leagueInfoRaw] = await Promise.all([
      fantraxFetch("getStandings", { leagueId: LEAGUE_ID }),
      fantraxFetch("getTeamRosters", { leagueId: LEAGUE_ID }),
      fantraxFetch("getDraftPicks", { leagueId: LEAGUE_ID }),
      fantraxFetch("getPlayerIds", { sport: "NBA" }),
      fantraxFetch("getLeagueInfo", { leagueId: LEAGUE_ID }),
    ]);

    writeFileSync(join(__dirname, ".debug-standings.json"), JSON.stringify(standingsRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-rosters.json"), JSON.stringify(rostersRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-draftpicks.json"), JSON.stringify(draftPicksRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-playerids.json"), JSON.stringify(playerIdsRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-leagueinfo.json"), JSON.stringify(leagueInfoRaw, null, 2));
    console.log("  Raw responses saved to scripts/.debug-*.json");
    console.log("");

    console.log("Transforming data...");

    // Build team map from league info (no more hardcoded team names)
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

    // Build TEAM_MAP (numericId → name) for the app
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
      _meta: {
        lastUpdated: new Date().toISOString(),
        leagueId: LEAGUE_ID,
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
      console.error("Got an auth error even though the league is public.");
      console.error("Make sure the league visibility is set to 'Public' in Fantrax league settings.");
    }
    console.error("");
    console.error("Existing data.json was NOT modified.");
    process.exit(1);
  }
}

main();
