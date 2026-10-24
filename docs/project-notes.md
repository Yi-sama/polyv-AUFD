# Project Notes

## Current Status

- Latest authentication target (2026-10-24): the user confirmed reuse of POLYV
  official management accounts. Current v2.2 login remains a separate local
  demo, not official SSO. Do not enter official passwords into the demo form.
  Public backend SSO documentation describes the opposite direction, into
  POLYV; the external-app identity contract and partner provisioning are still
  missing. Integration is blocked, not implemented. Investigation and exact
  partner checklist: `docs/progress/2026-10-24-polyv-auth.md`.
- 2026-10-24 v2.2 supersedes the historical single-creator decisions.
  Active contract: `docs/backend-api.md` v2.2; product correction at top of
  `docs/product-direction.md`. User is NOT a public creator. Public samples are
  fictional lin-mo, chen-yu and zhou-ning, channels 1..3. Claude added fictional
  su-wan, he-tian and jiang-he through join, channels 4..6. Their biographies
  disclose fictional status; isSample remains false because they joined normally.
- Repository: `https://github.com/Yi-sama/polyv-AUFD`, branch main.
  Source baseline 44e6704 and backend implementation 4771dd8 pushed;
  env/data/uploads/logs ignored.
- Backend now enforces user-session ownership, including local requests.
  ADMIN_TOKEN is obsolete and never bypasses ownership. Cookie sessions expire
  after 12h and on server restart. Fetch with credentials; proxy without xfwd.
- New durable data: `server/data/creators/<slug>/creator.json` and private
  `account.json`. Seed login credentials are local-only
  `demo-login.local.json` beside the account. Never commit or expose these.
- Legacy personal portfolio.json is deliberately retained but not imported or
  served. The old personal slug and `/assets/poster.jpg` return 404.
- Shared Polyv library now contains a published, unencrypted account video:
  `0cf5cbb2f905e3ac62e97c0c16d1de4e_0`, saved on he-tian as
  `wmvlj3ttupaw9`. Independent anonymous browser checks verified actual playback
  and a 2-second highlight seek, followed by normal completion at 5.08 seconds.
  Earlier empty-library findings are historical, not a current blocker.
- Backend is reachable on 4317; current frontend is on 5175. These are local
  development processes, not managed services or a public deployment.
  Isolated suite 32/32; live direct and proxy privacy/playback checks pass.
  Claude owns and is actively editing frontend; do not stage/revert those files.
- Final evidence: `docs/progress/2026-10-24-backend-verification.md`.
  Frontend visual acceptance and physical touch-device testing remain separate.
  Earlier v1 observations are retained in the dated progress logs.

## Environment

- Windows, Node.js v24.14.1.
- Run commands in `server/`. Use process-local `NODE_TLS_REJECT_UNAUTHORIZED=1`.
- `npm ci`, `npm test`, `npm start`, `npm run check:polyv`.
- Dependency versions are locked. Sharp upgraded to 0.35.5 after an audit finding.
- No applicable on-disk AGENTS.md, root README.md, SPEC.md or LOG-INDEX.md.
  User-provided operating instructions apply; use `server/README.md`,
  `docs/product-direction.md`, the active contract and dated progress logs.
- The supplied `../docs/product-direction.md` does not exist. The actual file
  is inside the repository at `docs/product-direction.md`.

## Important Data

- `server/data/creators/<slug>/creator.json`: current public document.
- `account.json` and `demo-login.local.json` beside it: private local account
  data; never return them through an API or commit them.
- `server/data/uploads/`: normalized uploaded images; keep with JSON backups.
- `server/data/portfolio.json` and `server/assets/poster.jpg`: historical
  personal assets, retained but not imported or served by v2.2.
- Seed images are credited in `server/assets/samples/SOURCES.md`; Claude's added
  runtime media is described in `docs/sample-media-credits.md`.
- Real account video cover:
  `/uploads/a0eb949d-ef6d-450b-9d2c-fe1dd5731494.webp`.
- The original `aufd-demo/` and original workspace copy remain unchanged.
- Credentials are never in source code or frontend variables.
- `server/.env` is local/ignored and references the private external
  `POLYV_ENV_FILE`; do not commit or copy the private file.

## Decisions

- Multi-creator work-centered platform, anonymous browsing, owner-only editing.
- `/api/portfolio` aliases lin-mo; the old personal creator route returns 404.
- Preserve `revision`, `profile`, `works`, `videoId`, `highlights`.
- Added computed image dimensions, safe uploads, and revision conflicts.
- Fictional examples must be disclosed; do not impersonate the user or real
  creators. Do not silently change the three joined examples' server-owned flag.
- No stats, timeline, generated intro film, admin UI or password recovery.
- Keep development servers on loopback. Public deployment needs the active
  contract's HTTPS/origin requirements; legacy ADMIN_TOKEN grants no privileges.
- One backend process per data directory. No distributed locking or database.
- Tokens only for videos referenced by saved creator video works, with exact owned,
  published video checks. Unknown encryption and upstream failures fail explicitly.
- Public sample video is not evidence of the competition account working.

## Verification

- `npm.cmd test` with process-local TLS verification enabled: 32/32 pass.
  Covers ownership, sessions, isolated persistence, revisions, private-data
  exclusion, uploads, Polyv and remote-cover boundaries.
- `npm.cmd run check:polyv` with the exact VID: apiVerified=true,
  selectedVideoPublished=true, status=61, encrypted=false. Its
  playbackVerified=false is intentional: CLI diagnostics do not inspect browsers.
- Direct 4317 and proxy 5175: real-video playback endpoint 200 with
  reason=unencrypted; old personal creator and poster both 404.
- Anonymous browser: actual video seeking/seeked/playing at 2 seconds, ended at
  5.08 seconds, error=null, readyState=4, zero broken images. The only console
  errors were expected unauthenticated `/api/auth/me` 401 responses.
- Final backend record separates automated tests, independent browser evidence,
  Claude-reported authoring workflow and still-pending human acceptance.

## Durable Debug Findings

- Busboy emits `partsLimit` at the configured count; a limit of 1 rejects a valid
  single-part upload when that event is treated as a violation. Use 2 together
  with `files=1`, `fields=0` and reject additional parts.
- Node 24 fetch rewrites Host. Security tests must use `http.get` to send a
  genuinely different Host value.
- Avoid repeated-group base64 validation regexes on multi-megabyte input.
  Bounded alphabet checks plus canonical decode/encode comparison are used.
- Explicit shell environment > external env file > local template. Sequential
  `loadEnvFile` calls cannot implement this precedence because values already set win.
