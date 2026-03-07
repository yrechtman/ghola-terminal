# The Ghola Terminal

Fantasy basketball dynasty league command center for team **tleilaxu** in **The Bene Gessirit** league.

Built for offseason roster evaluation, trade analysis, draft capital planning, and finding edge in a league where everyone thinks you're trying to fleece them.

## Stack
- Vite + React
- Recharts
- Deployed on Vercel

## Changelog

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
