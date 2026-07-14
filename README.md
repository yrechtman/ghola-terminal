# The Ghola Terminal

Fantasy basketball dynasty league command center for team **tleilaxu** in **The Bene Gessirit** league.

Built for offseason roster evaluation, trade analysis, draft capital planning, and finding edge in a league where everyone thinks you're trying to fleece them.

## Prospect scouting

The **Prospect Scouting** tab contains the 28 college players selected in the first round of the 2026 NBA Draft. College and Summer League evidence stay separate by design.

- The initial focus group is Cameron Boozer, AJ Dybantsa, Caleb Wilson, and Darryn Peterson.
- College cards show counting production plus TS%, usage, and BPM.
- Summer League is a dated, provisional signal while the event is in progress.
- The full board can be searched and reordered in-session, and any four players can be selected for comparison.
- Karim López and Sergio De Larrea are excluded from this version because their pre-draft production came outside college basketball.

The cohort and current teams come from the official NBA draft board. The initial top-four college snapshot is from Sports-Reference and the Summer League notes are reconciled against NBA game coverage. Blank rows are intentional until the full provider ingest is added.

## Stack
- Vite + React
- Recharts
- Deployed on Vercel

## Changelog

- 2026-07-14: Add 28-player Prospect Scouting board with format-aware top four, separate college/Summer views, comparison controls, and live reordering.
- 2026-03-07: Add P/R/A prop lines and dynasty ADP columns to My Roster table (from PrizePicks + Fantrax ADP feeds).
- 2026-03-07: Fix Draft Capital tab — useEffect, own-pick rank bug, DRAFT_PICKS[MY_TEAM] instead of hardcoded key.
- 2026-03-07: Full legibility audit — all real data columns now white; grey reserved for decoration only.
- 2026-03-07: Legibility pass (C.dim → #999) + manual player tag overrides on My Roster.
- 2026-03-07: Replace hardcoded data with Fantrax API — scoring, team map, rosters, standings, draft picks, league info all live.
- 2026-03-07: Add Draft Center, fix Draft Capital, data feeds, and player stat joins to roadmap.
- 2026-03-07: Add auto-merge action — claude/* branches merge to main automatically.
- 2026-03-07: Remove Playwright/auth from fetch script — league is now public, no credentials needed.
- 2026-03-07: Add SessionStart hook to auto-checkout main branch on session start.
- 2026-03-07: Add GitHub Actions cron to auto-fetch Fantrax data daily.
- 2026-03-07: Fully automated Fantrax login — just add credentials to scripts/.env and run.
- 2026-03-07: Add full Fantrax API transforms for standings, draft picks, and roster composition.
- 2026-03-07: Extract data to data.json, add Fantrax API fetch script (`npm run fetch-data`).
- 2026-03-07: Remove subtitle text below header title.
- 2026-03-06: Initial commit. My Roster, League Landscape, Trade Analyzer, Draft Capital (Monte Carlo lottery sim), Free Agent placeholder.
