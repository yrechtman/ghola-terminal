# CLAUDE.md

## How to work in this repo

### Git workflow
- Push directly to `main`. No branches, no PRs, no merge requests.
- Commit frequently with clear, short commit messages.
- Never ask for permission to push. Just push.

### README as changelog
- Every time you push changes, update the `## Changelog` section at the bottom of `README.md` with a one-line entry: date, what changed.
- Keep entries reverse chronological (newest first).
- Don't be verbose. One line per push.

### Tech stack
- Vite + React (single page app)
- Recharts for charts/visualizations
- All app code lives in `src/App.jsx` (single file for now, split when it gets unwieldy)
- No Tailwind compiler -- use inline styles only
- No localStorage, no sessionStorage, no backend, no API calls
- All data is baked into the app as constants

### What this project is
The Ghola Terminal is a fantasy basketball dynasty league command center for team "tleilaxu" in a 10-team Fantrax dynasty league called "The Bene Gessirit." Bloomberg terminal aesthetic: black background, amber/green/cyan accents, monospace fonts, dense data tables.

### Deployment
- Hosted on Vercel, auto-deploys from `main`
- Every push to main triggers a deploy
- No environment variables needed
