# BlindGuide — working notes

Waterfowl hunting journal + forecast. FastAPI/Motor/MongoDB backend
(`backend/server.py`), React/Vite web app (`frontend-web/`), React Native app
(`frontend-mobile/`). Railway hosts the API, Cloudflare Pages the web app; both
auto-deploy from `main`.

## Migration-anchor data work — read the rules first

**Before gathering, extracting, or adding any migration-anchor data, read
[`backend/data/ANCHOR_RULES.md`](backend/data/ANCHOR_RULES.md).** It is not
background reading — it encodes specific failures (extracting the wrong species
for an entire dataset; averaging a 261-mile refuge into one point; single-season
anchors; uncorrected survey effort) and the acceptance thresholds that catch
them.

The three that cost the most time:

- **Validate every extraction against the source's own printed totals** before
  reporting any number. A whole analysis was once built on coot counts.
- **Run the impact test before committing.** Distant control locations must move
  0 in every bin.
- **Aim at empty regions.** The Mississippi flyway has 54 anchors; Atlantic 22,
  Pacific 15. Adding to the dense one is mostly downside.

## Deploys

`GET https://api.blindguideapp.com/api/health` returns the deployed short SHA —
check it before believing anything shipped. Both hosts land within ~60s of a
push to `main`.

After a frontend deploy, confirm the referenced bundle serves
`application/javascript` and not `text/html`: Cloudflare's SPA fallback returns
HTML with a 200 for missing assets, which the service worker can cache under a
`.js` URL and white-screen the app.

## Git

The working checkout is often on a feature branch. `git push origin main` from
another branch silently pushes the stale local `main` ref and appears to
succeed. **Verify the branch first, or work in a `git worktree` and push with
`git push origin HEAD:main`.** Confirm via `/api/health` afterwards.

Git needs `export DEVELOPER_DIR=/Library/Developer/CommandLineTools` in this
environment.

## Conventions

- No `cn`/`clsx` helper — className strings are composed inline.
- The web app is the content spec for the mobile app; read the web source rather
  than inventing mobile UI.
- Never install packages into the repo or system Python for one-off analysis —
  use a throwaway venv in the scratchpad.
