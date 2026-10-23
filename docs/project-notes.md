# Project Notes

## Current Status

- 2026-10-24 v2.2 supersedes the historical single-creator decisions below.
  Active contract: `docs/backend-api.md` v2.2; product correction at top of
  `docs/product-direction.md`. User is NOT a public creator. Public samples are
  fictional lin-mo, chen-yu and zhou-ning, channels 1..3.
- Repository: `https://github.com/Yi-sama/polyv-AUFD`, branch main.
  First source baseline 44e6704 pushed; env/data/uploads/logs ignored.
- Backend now enforces user-session ownership, including local requests.
  ADMIN_TOKEN is obsolete and never bypasses ownership. Cookie sessions expire
  after 12h and on server restart. Fetch with credentials; proxy without xfwd.
- New durable data: `server/data/creators/<slug>/creator.json` and private
  `account.json`. Seed login credentials are local-only
  `demo-login.local.json` beside the account. Never commit or expose these.
- Legacy personal portfolio.json is deliberately retained but not imported or
  served. The old personal slug and `/assets/poster.jpg` return 404.
- Shared Polyv library was checked again and is empty. API access verified;
  owned-video upload/playback/highlight seeking remain unverified.
- Backend v2 was started on 4317, PID 24376 observed at 04:34 local time.
  Isolated suite 32/32; live direct and 5174 proxy auth/ownership/image checks pass.
  Claude owns and is actively editing web-gpt; do not stage/revert those files.

### Historical v1 Status (Superseded)

- 2026-10-23: shared backend implemented in `server/`.
- GPT and Claude own independent frontend directories. This backend task did not edit them.
- Contract: `docs/backend-api.md`; earlier frontend `docs/api.md` draft retained with an addendum.
- Local server was restarted at `http://127.0.0.1:4317`, process 21372.
  This is an observation at handoff, not a persistent service manager.
- Previous process 26016 was no longer present and the port returned ECONNREFUSED.
  The cause of that exit is unknown; saved data remained at revision 0.
- Actual HTTP health: `status=ok`, `readOnly=false`, `polyvConfigured=true`.
- The backend loads the private account environment through local ignored
  configuration. Secrets are not copied into the project or frontend.
- Real account configuration is loaded; the account library was previously
  verified as empty, so no owned playable VID is claimed.
- Frontend visual acceptance and real account playback remain pending with the
  frontend owners.

## Environment

- Windows, Node.js v24.14.1.
- Run commands in `server/`. Use process-local `NODE_TLS_REJECT_UNAUTHORIZED=1`.
- `npm ci`, `npm test`, `npm start`, `npm run check:polyv`.
- Dependency versions are locked. Sharp upgraded to 0.35.5 after an audit finding.
- No applicable on-disk AGENTS.md or Git repository was found for the desktop project.
  User-provided operating instructions apply.

## Important Data

- `server/assets/poster.jpg`: original user poster, 1280 x 2276.
- SHA-256: `473E4C1401E2821309955F3185DF55508F93CBA8787581891D7554C2A0B372A2`.
- `server/data/portfolio.json`: revisioned public document, initialized at revision 0.
- `server/data/uploads/`: normalized uploaded images; keep with JSON backups.
- Seed has one genuine poster and one explicitly labeled official sample video.
- The original `aufd-demo/` and original workspace copy remain unchanged.
- Credentials are never in source code or frontend variables.
- `server/.env` is local/ignored and references the private external
  `POLYV_ENV_FILE`; do not commit or copy the private file.

## Decisions

- Work-centered public portfolio, anonymous browsing.
- One creator for this demo. `/api/creators/liurunsen` aliases `/api/portfolio`.
- Preserve `revision`, `profile`, `works`, `videoId`, `highlights`.
- Added computed image dimensions, safe uploads, and revision conflicts.
- No stats, timeline, generated intro film, fake projects, or multi-user account system.
- Local management only by default. Public deployment explicitly requires read-only
  mode or a strong management token. Keep Vite editing servers on loopback.
- One backend process per data directory. No distributed locking or database.
- Tokens only for videos referenced by the saved portfolio, with exact owned,
  published video checks. Unknown encryption and upstream failures fail explicitly.
- Public sample video is not evidence of the competition account working.

## Verification

- `npm test`: 21/21 passing, including exact-VID account diagnostic validation and
  unknown-encryption normalization.
- `npm audit --omit=dev --json`: zero reported vulnerabilities at verification time.
- Independent reviewer found two issues, both fixed with regression tests.
- Actual listener: health, creator data, image HEAD and official-demo token
  response verified. After loading the private account configuration,
  `GET /api/health` returned `polyvConfigured=true`; the public portfolio
  remained at revision 0 with two works.
- `npm test`: 21/21 passing after configuration loading.
- Both active Vite servers (5173 and 5174) proxy portfolio, creator-list, image and
  sample-token requests successfully. Revision-conflict PUT probes returned 409
  through both proxies and left the entire portfolio unchanged.
- UTF-8 decoding/JSON parsing: 13 source/config/contract files checked.
- Frontend visual acceptance and real Polyv playback: pending with frontend owners.

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
