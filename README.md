# The Ghola Terminal

Fantasy basketball dynasty league command center for team **tleilaxu** in **The Bene Gessirit** league.

Built for offseason roster evaluation, trade analysis, draft capital planning, and finding edge in a league where everyone thinks you're trying to fleece them.

## Prospect scouting

The **Prospect Scouting** tab contains the 28 college players selected in the first round of the 2026 NBA Draft. College and Summer League evidence stay separate by design.

- The initial focus group is Cameron Boozer, AJ Dybantsa, Caleb Wilson, and Darryn Peterson.
- All 28 college profiles include counting stats plus TS%, usage, assist/turnover rates, steal/block rates, shot profile, free-throw rate, role, and opponent-quality splits where available.
- The selected-prospect comparison is a dense, horizontally scrollable table with matching College and Las Vegas stat structures.
- A persistent **FP EQ** column applies the league's exact fantasy scoring weights to each College or Las Vegas per-game box score.
- A persistent **Avail%** column shows player games divided by team games for the selected sample, highlighting missed time in both college and Summer League.
- A separate Counting / Advanced toggle changes the statistical lens without hiding player identity, sample size, FP EQ, or Avail%.
- The July 14 Las Vegas snapshot contains the 16 cohort players with captured event samples; missing rows render as no sample rather than zeroes.
- The full board can be searched and reordered in-session, and any four players can be selected for comparison.
- Karim López and Sergio De Larrea are excluded from this version because their pre-draft production came outside college basketball.

The cohort and current teams come from the official NBA draft board. College profiles come from College Hoops Data and can be refreshed with `npm run fetch-prospects`. Summer League stats refresh automatically from RealGM every six hours through July 20 and can be refreshed manually with `npm run fetch-summer` after installing Chromium once with `npx playwright install chromium`.

## Stack
- Vite + React
- Recharts
- Deployed on Vercel

## Changelog

- 2026-07-14: Add headless Summer League ingestion and a six-hour GitHub Actions refresh through the end of the event.
- 2026-07-14: Remove prospect status cards, narrative guidance, mode label, and explanatory footnotes for a data-first layout.
- 2026-07-14: Add persistent college and Summer League availability percentages using team games as the denominator.
- 2026-07-14: Add persistent fantasy-point equivalency using league scoring, ingest college shot makes/attempts, and add Counting / Advanced metric views.
- 2026-07-14: Replace prospect comparison cards with a richer side-by-side table covering shooting lines, creation, rebounding, defensive rates, role, and opponent-quality splits.
- 2026-07-14: Load college production and translation rates for all 28 prospects, add 16-player Las Vegas snapshot, match Summer League cards to the college layout, and add the Translation Lens.
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
