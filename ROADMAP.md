# Ghola Terminal Roadmap

Ideas, feedback, and deferred improvements. Not prioritized — just a running log.

Once we complete something from this list, remove it as a final step to keep the roadmap up to date.

---

## UI / Aesthetics

- **Font color legibility**: Grey text is hard to read on black background. Audit all grey text and replace with higher-contrast colors — lean into the amber/green/cyan palette already in use. Goal: nothing should strain the eye.

---

## Features

- **Manual player tag overrides**: Allow manually setting/overriding tags (IRON, DUR, FRAG, YNG, SELL, etc.) on roster players instead of relying solely on auto-generated tags. Useful for tagging players based on context the algorithm can't see (e.g., marking a player as SELL even if they're young).
- **Draft Center**: Full mock draft interface — simulate upcoming dynasty drafts, track pick order, make selections, see results. Should integrate with draft capital data already in the app.
- **Fix Draft Capital tab**: Current implementation is broken — audit and repair the Monte Carlo lottery sim and any broken rendering.

---

## Data / Content

- **Additional data feeds**: Supplement Fantrax data with external sources — candidates include NBA API (official stats), Hashtag Basketball Premium, Basketball Monster. Evaluate what each provides and what's worth integrating.
- **Cross-source player stat joins**: Once additional feeds are pulling, join player stats from those sources with Fantrax roster/league data. Unified player profiles with dynasty-relevant metrics (age, stats, ADP, rankings, etc).
