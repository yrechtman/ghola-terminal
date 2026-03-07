#!/usr/bin/env node

// Fetches league data from the Fantrax API and writes to src/data.json.
//
// Usage:
//   npm run fetch-data
//
// Setup:
//   1. Copy your Fantrax session cookie from browser DevTools:
//      - Open fantrax.com while logged in
//      - DevTools > Network > any request > copy the Cookie header value
//   2. Save to scripts/.fantrax-cookie (one line, gitignored)

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LEAGUE_ID = "i4mue2axmd7ntz13";
const BASE_URL = "https://www.fantrax.com/fxea/general";

// Fantrax team ID → team name (from getLeagueInfo matchups)
const FANTRAX_TEAM_MAP = {
  "76tybywxmd7ntz1q": "tleilaxu",
  "e9xiok73md7ntz1v": "Light Years Ahead",
  "v989h0jhmd7ntz1r": "RG Kush",
  "8mrlmcglmd7ntz1w": "Team sugar boo boo",
  "k25pfgihmd7ntz1o": "cam thomas jefferson",
  "w4nzg8a8md7ntz1x": "team tall white boi",
  "fh0tyohumd7ntz1u": "team hyphen",
  "25dnc4gmmd7ntz1r": "Big Spite Guys",
  "ggn4g94lmd7ntz1t": "The Cooper Flaggots",
  "0800ycjzmd7ntz1s": "The Travel Agency",
};

// App uses numeric team IDs (2-11) for RAW_CSV keys. Map team name → numeric ID.
const TEAM_NAME_TO_NUM = {
  "tleilaxu": 2, "Light Years Ahead": 3, "RG Kush": 4,
  "Team sugar boo boo": 5, "cam thomas jefferson": 6, "team tall white boi": 7,
  "team hyphen": 8, "Big Spite Guys": 9, "The Cooper Flaggots": 10, "The Travel Agency": 11,
};

function getCookie() {
  const cookiePath = join(__dirname, ".fantrax-cookie");
  if (!existsSync(cookiePath)) {
    console.error("ERROR: No cookie file found at scripts/.fantrax-cookie");
    console.error("");
    console.error("To set up:");
    console.error("  1. Open fantrax.com in your browser while logged in");
    console.error("  2. Open DevTools > Network tab");
    console.error("  3. Click any request to fantrax.com");
    console.error("  4. Copy the full Cookie header value");
    console.error("  5. Save it to scripts/.fantrax-cookie");
    process.exit(1);
  }
  return readFileSync(cookiePath, "utf8").trim();
}

async function fantraxFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  const cookie = getCookie();
  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "Cookie": cookie,
        "User-Agent": "GholaTerminal/1.0",
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

function transformStandings(raw) {
  // raw is an array of: { teamName, totalPointsFor, teamId, gamesBack, rank, points: "14-4-0", winPercentage }
  // App expects: { rank, team, w, l, fpFor, fpAgainst, streak }
  // API doesn't provide fpAgainst or streak, so we omit those
  return raw.map(t => {
    const [w, l] = t.points.split("-").map(Number);
    return {
      rank: t.rank,
      team: t.teamName,
      w,
      l,
      fpFor: t.totalPointsFor,
      fpAgainst: 0, // not available from API
      streak: "",    // not available from API
    };
  }).sort((a, b) => a.rank - b.rank);
}

function transformDraftPicks(raw) {
  // raw.futureDraftPicks is array of: { currentOwnerTeamId, round, year, originalOwnerTeamId }
  // App expects: { [teamName]: [{ round, from? }] }
  const picks = {};

  // Initialize all teams
  Object.values(FANTRAX_TEAM_MAP).forEach(name => { picks[name] = []; });

  // Only include 2026 picks (current draft year)
  const futurePicks = raw.futureDraftPicks.filter(p => p.year === 2026);

  for (const pick of futurePicks) {
    const ownerName = FANTRAX_TEAM_MAP[pick.currentOwnerTeamId];
    const originalName = FANTRAX_TEAM_MAP[pick.originalOwnerTeamId];

    if (!ownerName || !originalName) continue;

    const entry = { round: pick.round };
    // Only include "from" if the pick was traded (current owner != original owner)
    if (ownerName !== originalName) {
      entry.from = originalName;
    }

    picks[ownerName].push(entry);
  }

  // Sort each team's picks by round
  for (const team of Object.keys(picks)) {
    picks[team].sort((a, b) => a.round - b.round);
  }

  return picks;
}

function transformRosters(rostersRaw, playerIdsRaw, existingCsv) {
  // Build a lookup from fantrax player ID → player info
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

  // Map roster status from API format to app format
  const statusMap = { ACTIVE: "Act", RESERVE: "Res", INJURED_RESERVE: "IR", MINORS: "Min" };

  // Build new RAW_CSV keyed by numeric team ID
  // We update roster composition (who's on which team, status) from API
  // but keep existing stat lines from CSV since the API doesn't provide stats
  const newCsv = {};

  // Parse existing CSV to build a lookup by player ID → stat line
  const existingStats = {};
  for (const [teamNum, csv] of Object.entries(existingCsv)) {
    for (const line of csv.split("\n").filter(Boolean)) {
      // Extract the player ID (first field, wrapped in * like *06217*)
      const match = line.match(/^\*([^*]+)\*/);
      if (match) {
        existingStats[match[1]] = line;
      }
    }
  }

  for (const [fantraxTeamId, teamData] of Object.entries(rostersRaw.rosters)) {
    const teamName = FANTRAX_TEAM_MAP[fantraxTeamId];
    if (!teamName) continue;
    const teamNum = TEAM_NAME_TO_NUM[teamName];
    if (!teamNum) continue;

    const lines = [];
    for (const item of teamData.rosterItems) {
      const playerId = item.id;
      const status = statusMap[item.status] || item.status;
      const pos = item.position || "";

      // Check if we have existing stats for this player
      if (existingStats[playerId]) {
        // Update the status and position in the existing line
        let line = existingStats[playerId];
        // Replace position (2nd field) and status (6th field)
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

        // Update position (index 1) and status (index 5)
        fields[1] = pos || fields[1];
        fields[5] = status;
        lines.push(fields.map(f => `"${f}"`).join(","));
      } else {
        // New player not in existing CSV — create a minimal line
        const info = playerLookup[playerId] || { name: `Unknown(${playerId})`, nbaTeam: "(N/A)", eligible: pos };
        // Format: ID, Pos, Name, NBA Team, Eligible, Status, Age, TotalFP, FPG, GP, then 11 stat zeros
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
    // Fetch all endpoints in parallel
    console.log("Fetching data from Fantrax API...");
    const [standingsRaw, rostersRaw, draftPicksRaw, playerIdsRaw] = await Promise.all([
      fantraxFetch("getStandings", { leagueId: LEAGUE_ID }),
      fantraxFetch("getTeamRosters", { leagueId: LEAGUE_ID }),
      fantraxFetch("getDraftPicks", { leagueId: LEAGUE_ID }),
      fantraxFetch("getPlayerIds", { sport: "NBA" }),
    ]);

    // Save debug files
    writeFileSync(join(__dirname, ".debug-standings.json"), JSON.stringify(standingsRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-rosters.json"), JSON.stringify(rostersRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-draftpicks.json"), JSON.stringify(draftPicksRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-playerids.json"), JSON.stringify(playerIdsRaw, null, 2));
    console.log("  Raw responses saved to scripts/.debug-*.json");
    console.log("");

    // Transform data
    console.log("Transforming data...");

    const standings = transformStandings(standingsRaw);
    console.log(`  Standings: ${standings.length} teams`);

    const draftPicks = transformDraftPicks(draftPicksRaw);
    const totalPicks = Object.values(draftPicks).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`  Draft picks: ${totalPicks} picks across ${Object.keys(draftPicks).length} teams`);

    const rawCsv = transformRosters(rostersRaw, playerIdsRaw, existingData.RAW_CSV);
    const totalPlayers = Object.values(rawCsv).reduce((sum, csv) => sum + csv.split("\n").filter(Boolean).length, 0);
    console.log(`  Rosters: ${totalPlayers} players across ${Object.keys(rawCsv).length} teams`);

    // Write updated data.json
    const newData = {
      STANDINGS: standings,
      DRAFT_PICKS: draftPicks,
      RAW_CSV: rawCsv,
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
    if (err.message.includes("403") || err.message.includes("quote")) {
      console.error("This likely means your cookie has expired.");
      console.error("Grab a fresh one from browser DevTools and save to scripts/.fantrax-cookie");
    }
    console.error("");
    console.error("Existing data.json was NOT modified.");
    process.exit(1);
  }
}

main();
