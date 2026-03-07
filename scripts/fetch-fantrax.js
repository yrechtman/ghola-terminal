#!/usr/bin/env node

// Fetches league data from the Fantrax API and writes to src/data.json.
//
// Usage:
//   npm run fetch-data
//
// First-time setup:
//   npm run fetch-data --setup
//   (Opens a browser to log into Fantrax and saves session for reuse)
//
// Subsequent runs just use the saved session:
//   npm run fetch-data

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LEAGUE_ID = "i4mue2axmd7ntz13";
const BASE_URL = "https://www.fantrax.com/fxea/general";
const AUTH_STATE_PATH = join(__dirname, ".fantrax-auth");

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

// ============================================================
// AUTH: Playwright-based login with saved session
// ============================================================

async function getPlaywrightCookies() {
  let chromium;
  try {
    ({ chromium } = await import("playwright"));
  } catch {
    console.error("ERROR: Playwright not installed. Run:");
    console.error("  npm install -D playwright");
    console.error("  npx playwright install chromium");
    process.exit(1);
  }

  const isSetup = process.argv.includes("--setup");
  const hasAuth = existsSync(AUTH_STATE_PATH);

  if (!hasAuth && !isSetup) {
    console.log("No saved session found. Running first-time login...");
    console.log("A browser window will open — log into Fantrax, then close it.");
    console.log("");
  }

  if (isSetup || !hasAuth) {
    // Interactive login: open visible browser, let user log in
    console.log("Opening browser for Fantrax login...");
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    await page.goto("https://www.fantrax.com/login");
    console.log("Log into Fantrax in the browser window.");
    console.log("Once you see your league page, press Enter here to continue...");

    // Wait for user to press Enter
    await new Promise(resolve => {
      process.stdin.setRawMode?.(false);
      process.stdin.resume();
      process.stdin.once("data", resolve);
    });

    // Save the auth state (cookies + localStorage)
    await context.storageState({ path: AUTH_STATE_PATH });
    await browser.close();
    console.log("Session saved to scripts/.fantrax-auth");
    console.log("");
  }

  // Load saved session and extract cookies
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: AUTH_STATE_PATH });

  // Navigate to Fantrax to ensure cookies are fresh / activate the session
  const page = await context.newPage();
  try {
    await page.goto("https://www.fantrax.com/fantasy/league/" + LEAGUE_ID + "/home", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
  } catch {
    // Timeout is OK — we just need the cookies from the redirect chain
  }

  const cookies = await context.cookies("https://www.fantrax.com");
  await browser.close();

  if (!cookies.length) {
    console.error("ERROR: No cookies captured. Session may have expired.");
    console.error("Run: npm run fetch-data -- --setup");
    process.exit(1);
  }

  // Format as Cookie header string
  return cookies.map(c => `${c.name}=${c.value}`).join("; ");
}

// Fallback: read cookie from file (old method)
function getFileCookie() {
  const cookiePath = join(__dirname, ".fantrax-cookie");
  if (!existsSync(cookiePath)) return null;
  return readFileSync(cookiePath, "utf8").trim();
}

async function getCookie() {
  // Try file-based cookie first (faster, no browser needed)
  const fileCookie = getFileCookie();
  if (fileCookie) {
    console.log("  Using cookie from scripts/.fantrax-cookie");
    return fileCookie;
  }

  // Fall back to Playwright
  console.log("  Using Playwright for authentication...");
  return getPlaywrightCookies();
}

// ============================================================
// API FETCHING
// ============================================================

let _cookie = null;

async function fantraxFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

  if (!_cookie) _cookie = await getCookie();

  let res;
  try {
    res = await fetch(url.toString(), {
      headers: {
        "Cookie": _cookie,
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

function transformDraftPicks(raw) {
  const picks = {};
  Object.values(FANTRAX_TEAM_MAP).forEach(name => { picks[name] = []; });

  const futurePicks = raw.futureDraftPicks.filter(p => p.year === 2026);

  for (const pick of futurePicks) {
    const ownerName = FANTRAX_TEAM_MAP[pick.currentOwnerTeamId];
    const originalName = FANTRAX_TEAM_MAP[pick.originalOwnerTeamId];
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

function transformRosters(rostersRaw, playerIdsRaw, existingCsv) {
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
  for (const [teamNum, csv] of Object.entries(existingCsv)) {
    for (const line of csv.split("\n").filter(Boolean)) {
      const match = line.match(/^\*([^*]+)\*/);
      if (!match) {
        // Try quoted format: "*ID*"
        const qMatch = line.match(/^"?\*([^*]+)\*"?/);
        if (qMatch) existingStats[qMatch[1]] = line;
      } else {
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
    const [standingsRaw, rostersRaw, draftPicksRaw, playerIdsRaw] = await Promise.all([
      fantraxFetch("getStandings", { leagueId: LEAGUE_ID }),
      fantraxFetch("getTeamRosters", { leagueId: LEAGUE_ID }),
      fantraxFetch("getDraftPicks", { leagueId: LEAGUE_ID }),
      fantraxFetch("getPlayerIds", { sport: "NBA" }),
    ]);

    writeFileSync(join(__dirname, ".debug-standings.json"), JSON.stringify(standingsRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-rosters.json"), JSON.stringify(rostersRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-draftpicks.json"), JSON.stringify(draftPicksRaw, null, 2));
    writeFileSync(join(__dirname, ".debug-playerids.json"), JSON.stringify(playerIdsRaw, null, 2));
    console.log("  Raw responses saved to scripts/.debug-*.json");
    console.log("");

    console.log("Transforming data...");

    const standings = transformStandings(standingsRaw);
    console.log(`  Standings: ${standings.length} teams`);

    const draftPicks = transformDraftPicks(draftPicksRaw);
    const totalPicks = Object.values(draftPicks).reduce((sum, arr) => sum + arr.length, 0);
    console.log(`  Draft picks: ${totalPicks} picks across ${Object.keys(draftPicks).length} teams`);

    const rawCsv = transformRosters(rostersRaw, playerIdsRaw, existingData.RAW_CSV);
    const totalPlayers = Object.values(rawCsv).reduce((sum, csv) => sum + csv.split("\n").filter(Boolean).length, 0);
    console.log(`  Rosters: ${totalPlayers} players across ${Object.keys(rawCsv).length} teams`);

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
      console.error("Cookie/session expired. Re-run with --setup to log in again:");
      console.error("  npm run fetch-data -- --setup");
    }
    console.error("");
    console.error("Existing data.json was NOT modified.");
    process.exit(1);
  }
}

main();
