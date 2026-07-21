# Prospect Scouting Handoff

This is the canonical handoff for the Prospect Scouting feature. Read this file before changing the prospect board or its data feeds in a new session.

## Current scope

- The cohort is all 60 players selected in the 2026 NBA Draft.
- The six international prospects without NCAA production remain on the board with draft metadata and Summer League results where available; their College sample renders as missing.
- College and NBA Summer League are separate samples. They share a visual structure but are never blended into a composite score.
- The default four-player comparison is Cameron Boozer, AJ Dybantsa, Caleb Wilson, and Darryn Peterson.
- The board can be searched, reordered with the arrow controls, and used to select up to four comparison players. Its order is saved in browser storage and restored after a page reload; newly ingested prospects are appended without disturbing the saved order.
- The scouting board has a direct, reload-safe route at `/prospect-scouting`.
- The interface is deliberately data-first. Do not restore narrative cards, mode labels, methodology disclaimers, or large blocks of explanatory copy to the page.

## Start a new session here

```bash
git status
git log --oneline -5
npm ci
npm run lint
npm run build
```

Then inspect the most recent Summer League refresh:

```bash
gh run list --workflow fetch-summer-league.yml --limit 5
```

The relevant implementation and data files are:

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Prospect tables, toggles, formulas, formatting, and in-session board state |
| `src/prospects.json` | The 60-player cohort, initial priority order, college profiles, and team-game denominators |
| `src/summer-league.json` | Current Summer League profiles and team-game denominators |
| `scripts/fetch-prospects.js` | College Hoops Data ingestion |
| `scripts/fetch-summer-league.js` | ESPN Summer League game-level box score ingestion |
| `.github/workflows/fetch-summer-league.yml` | Scheduled and manual Summer League refresh |
| `.github/workflows/fetch-fantrax.yml` | Fantrax refresh; shares a concurrency lock with the Summer League workflow |
| `src/data.json` | Live league scoring settings used by FP EQ |

## Interface contract

There are two independent toggles:

- **Sample:** College or Summer
- **Metrics:** Counting or Advanced

Player, FP EQ, Avail%, sample size, and identifying information remain visible when the metric view changes.

The Counting view emphasizes the fantasy box score: minutes, points, rebounds, assists, steals, blocks, turnovers, stocks, shooting makes/attempts, percentages, and fouls.

The College Advanced view shows TS%, eFG%, USG%, AST%, TOV%, ORB%, DRB%, STL%, BLK%, 3PAr, FTr, role, and top-50-opponent production where available.

The Summer Advanced view shows TS%, eFG%, AST:TO, 3PAr, FTr, and per-40 points, rebounds, assists, stocks, and turnovers. Summer League source tables do not currently provide the same rate-stat depth as the college source.

## Metrics to prioritize for dynasty fantasy

These are statistical translation signals, not measures of contribution to winning.

1. **Minutes and role:** production only matters if the player can earn and sustain an NBA role.
2. **Usage paired with TS%:** identifies players who created meaningful volume without collapsing in efficiency.
3. **AST% and TOV% together:** better evidence of creation and decision-making than assists per game alone.
4. **STL%, BLK%, and stocks per 40:** defensive events are unusually valuable in this league's scoring and can reveal fantasy upside independent of scoring role.
5. **3PAr, FTr, and shooting volume:** shot profile and attempts are more informative than a small-sample percentage by itself.
6. **ORB% and DRB%:** role-adjusted rebounding translates better than raw rebounds across different team paces and minutes.
7. **Age, sample size, and availability:** treat the same rate differently for a younger player, a tiny sample, or a player who repeatedly missed games.
8. **Performance against strong opponents:** use the top-50 split as a pressure test, not as a replacement for the full-season sample.

BPM, PER, win shares, plus-minus, offensive/defensive rating, and PIE are not headline fields. They mix in team strength, lineups, or winning impact and are weaker direct predictors of a fantasy stat line.

## FP EQ

FP EQ applies the league's live scoring weights to a player's per-game box score in the selected sample. It is always visible.

```text
FP EQ =
  2 * FGM
- 1 * FGA
+ 1 * 3PM
+ 1 * FTM
- 1 * FTA
+ 1 * PTS
+ 1 * REB
+ 2 * AST
+ 4 * STL
+ 4 * BLK
- 2 * TOV
```

The app reads these weights from `src/data.json`. The formula above is also the fallback in `src/App.jsx` if live league scoring is absent. FP EQ is context for what a player produced under this league's settings; it is not a projection of NBA fantasy points.

## Availability

```text
Avail% = player games played / team games in the selected sample
```

- College team-game denominators come from College Hoops Data team pages.
- Summer League team-game denominators are counted from completed ESPN event schedules.
- A player without a captured Summer League row receives 0% only when the player's NBA team has a known event-game denominator.
- If no reliable denominator exists, the interface shows a dash.

The color thresholds are:

| Availability | Color |
| --- | --- |
| 97.5% or higher | Green |
| 90% to 97.4% | Cyan |
| 75% to 89.9% | Amber |
| Below 75% | Red |

This is a descriptive availability measure. It does not distinguish injury, rest, roster status, or a coaching decision.

## Refresh college data

```bash
npm run fetch-prospects
```

The script reads College Hoops Data player and team pages, updates the 54 NCAA profiles, skips the six international prospects without NCAA samples, and writes `src/prospects.json`. Player-page HTML can be supplied from a cache for development:

```bash
node scripts/fetch-prospects.js --cache /path/to/player-html-cache
```

Team pages are still fetched live when a player-page cache is used. The script fails rather than writing a profile when required college stats or team games cannot be found.

## Refresh Summer League data

```bash
npm run fetch-summer
```

The script scans completed games from ESPN's California, Salt Lake City, and Las Vegas Summer League feeds. It aggregates game-level box scores into one All Summer Events sample, normalizes common name and team variants, and matches players to `src/prospects.json`.

The default event start date is July 3, 2026. Override it when working on another event:

```bash
SUMMER_LEAGUE_START_DATE=2027-07-02 npm run fetch-summer
```

Safety checks prevent a partial or blocked response from overwriting good data:

- The feeds must contain at least 10 completed games.
- The refresh must match at least eight prospects, or the size of the previous dataset if it contained fewer than eight.
- The output file is written only after all feed scans and validation succeed.

The number of matched prospect profiles changes as players enter or leave the event. Missing profiles render as missing samples; they are not populated with invented zero counting stats.

## Summer League automation

`.github/workflows/fetch-summer-league.yml` runs at 00:15, 06:15, 12:15, and 18:15 UTC. Scheduled ingestion is date-gated through July 20, 2026; manual runs remain available after that date.

Trigger and inspect it from a terminal:

```bash
gh workflow run fetch-summer-league.yml --ref main
gh run list --workflow fetch-summer-league.yml --limit 5
gh run view <run-id> --log
```

When `src/summer-league.json` changes, the workflow commits and pushes the refreshed file directly to `main`. If nothing changed, it exits without a commit. It shares the `main-data-refresh` concurrency group with the Fantrax workflow so the two data jobs do not push simultaneously.

For a future Summer League, update both:

1. The `SUMMER_LEAGUE_START_DATE` default in `scripts/fetch-summer-league.js`.
2. The event-window cutoff in `.github/workflows/fetch-summer-league.yml`.

## Known limitations and next work

- ESPN's public JSON feeds are not a documented API, so schema changes can require parser updates.
- Summer League is a small and unstable sample. The dashboard keeps it separate from college for that reason.
- Summer advanced metrics are currently derived from traditional averages, so they do not yet include game-level USG%, AST%, TOV%, rebound rates, or possession estimates.
- College provider coverage can be incomplete for very short samples; missing values remain dashes.
- Availability does not yet include injury reason or expected games missed.
- Board reordering is browser-state only.
- There is intentionally no blended overall prospect score.

The most useful next data improvement is official game-level Summer League box scores with possession inputs. That would support matching college-style rate metrics, consistency measures, and event-by-event splits without changing the separation between samples.

## Before committing changes

```bash
npm run lint
npm run build
git diff --check
git status --short
```

Work directly on `main`, update the README changelog, commit the intended files, and push to GitHub.
