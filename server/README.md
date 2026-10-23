# Portfolio Backend

Shared backend for both frontend prototypes. The executable API contract is
`../docs/backend-api.md`. No changes to `web/` or `web-gpt/` are required here.

## Local Development

Node.js 24 or newer. From this directory:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '1'
npm.cmd ci
npm.cmd test
npm.cmd start
```

Default listener: `http://127.0.0.1:4317`.
Configure both frontend proxies for `/api`, `/assets`, and `/uploads`,
with `changeOrigin: true` and without adding forwarded headers.
Do not run the old `aufd-demo` server on the same port.

The included seed contains one real poster and one clearly labeled official
Polyv video placeholder. The placeholder is not proof of account integration.

## Account Configuration

Create a local `.env` using `.env.example`, or set `POLYV_ENV_FILE` to the
absolute path of the account agent's local environment file.
Credentials must be named `POLYV_VOD_USER_ID` and `POLYV_VOD_SECRET_KEY`.
`POLYV_TEST_VID` optionally narrows the diagnostic search.

Precedence: explicit process environment > external file > local `.env`.
External file errors stop startup. Environment values are never printed.
Configuration loads at startup; restart the service after changing it.

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED = '1'
$env:POLYV_ENV_FILE = 'C:\absolute\path\to\.env'
npm.cmd run check:polyv
```

The diagnostic queries the real account but never modifies it. It distinguishes
an API response from actual playback. Domain/password/auth restrictions still
need testing in a frontend browser. No credentials means an explicit 503,
not a fabricated video library.

## Storage And Deployment Limits

- `data/portfolio.json`: current document; `data/uploads/`: normalized images.
- Save is atomic and checks `revision`. Keep these files together when backing up.
- Existing invalid data stops startup instead of being overwritten.
- Run **one backend process per data directory**. No multi-process database lock.
- Uploaded URLs are public immediately. Upload public portfolio media only.
- Removing a work does not delete uploaded files. No automatic media cleanup.
- Stop the server before manually changing or restoring data files.
- This is a single-creator demo, not a multi-user account system.

Local edits are allowed only from loopback with an allowed origin and no
forwarded headers. Keep frontend development servers local too.
For public deployment explicitly set `READ_ONLY=true` and a valid
`PUBLIC_ORIGIN=https://your-host`; optionally set `HOST=0.0.0.0` behind your
HTTPS reverse proxy. Public portfolio/image/video routes remain anonymous.

For authenticated management, use `ADMIN_TOKEN` (at least 32 characters) and
the Authorization Bearer header. Store that token only in the owner's private
session, never in a public build or a `VITE_*` value. A remotely exposed
deployment should use HTTPS and conventional reverse-proxy request limits.

## Verification

`npm test` uses isolated temporary directories and fake Polyv responses.
It does not touch real portfolio data or prove the real account works.
Use `npm run check:polyv` for the account, then test playback in the frontend.

Official references consulted:

```text
https://help.polyv.net/vod/api/video_management/search/search_video/
https://help.polyv.net/vod/api/buildSign/
https://help.polyv.net/vod/api/playsafe/token/create_token/
https://help.polyv.net/vod/api/buildSignMd5/
```
