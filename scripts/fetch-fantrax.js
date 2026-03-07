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
//
// The script hits these undocumented Fantrax endpoints:
//   - getTeamRosters (player stats per team)
//   - getStandings (W-L records, rank)
//   - getDraftPicks (pick ownership)

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const LEAGUE_ID = "i4mue2axmd7ntz13";
const BASE_URL = "https://www.fantrax.com/fxea/general";

// Team IDs to names mapping (must match the app)
const TEAM_MAP = {
  2: "tleilaxu", 3: "Light Years Ahead", 4: "RG Kush",
  5: "Team sugar boo boo", 6: "cam thomas jefferson", 7: "team tall white boi",
  8: "team hyphen", 9: "Big Spite Guys", 10: "The Cooper Flaggots", 11: "The Travel Agency"
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
  const res = await fetch(url.toString(), {
    headers: {
      "Cookie": cookie,
      "User-Agent": "GholaTerminal/1.0",
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${endpoint} failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return res.json();
}

async function fetchStandings() {
  console.log("Fetching standings...");
  const raw = await fantraxFetch("getStandings", { leagueId: LEAGUE_ID });

  // Log raw response shape for discovery
  console.log("  Standings response keys:", Object.keys(raw));
  writeFileSync(join(__dirname, ".debug-standings.json"), JSON.stringify(raw, null, 2));
  console.log("  Raw response saved to scripts/.debug-standings.json");

  return raw;
}

async function fetchTeamRosters() {
  console.log("Fetching team rosters...");
  const raw = await fantraxFetch("getTeamRosters", { leagueId: LEAGUE_ID });

  console.log("  Rosters response keys:", Object.keys(raw));
  writeFileSync(join(__dirname, ".debug-rosters.json"), JSON.stringify(raw, null, 2));
  console.log("  Raw response saved to scripts/.debug-rosters.json");

  return raw;
}

async function fetchDraftPicks() {
  console.log("Fetching draft picks...");
  const raw = await fantraxFetch("getDraftPicks", { leagueId: LEAGUE_ID });

  console.log("  Draft picks response keys:", Object.keys(raw));
  writeFileSync(join(__dirname, ".debug-draftpicks.json"), JSON.stringify(raw, null, 2));
  console.log("  Raw response saved to scripts/.debug-draftpicks.json");

  return raw;
}

async function main() {
  console.log("=== Ghola Terminal Data Fetcher ===");
  console.log(`League ID: ${LEAGUE_ID}`);
  console.log("");

  // Load existing data as fallback
  const existingData = JSON.parse(readFileSync(join(ROOT, "src/data.json"), "utf8"));

  try {
    // Fetch all endpoints (run in parallel)
    const [standingsRaw, rostersRaw, draftPicksRaw] = await Promise.all([
      fetchStandings(),
      fetchTeamRosters(),
      fetchDraftPicks(),
    ]);

    console.log("");
    console.log("Raw data fetched successfully.");
    console.log("");
    console.log("NEXT STEPS:");
    console.log("  The raw API responses have been saved to scripts/.debug-*.json");
    console.log("  Inspect these files to understand the response shape, then update");
    console.log("  the transform functions in this script to map them to the app's");
    console.log("  expected data format.");
    console.log("");
    console.log("  Once transforms are built, this script will write directly to src/data.json.");

  } catch (err) {
    console.error("");
    console.error("FETCH FAILED:", err.message);
    console.error("");
    if (err.message.includes("403")) {
      console.error("This likely means your cookie has expired.");
      console.error("Grab a fresh one from browser DevTools and save to scripts/.fantrax-cookie");
    }
    console.error("");
    console.error("Existing data.json was NOT modified.");
    process.exit(1);
  }
}

main();
