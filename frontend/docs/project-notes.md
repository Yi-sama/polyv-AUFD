# GPT Frontend Notes

## Current Status
- Artwork-first public exhibition, compact index, filters/search, image focus/zoom,
  video playback/highlights, local studio, and API integration implemented.
- Current preview: `http://127.0.0.1:5175/`; studio: `/studio`.
- Default port 5174 was occupied at final startup; Vite chose 5175.
  Check terminal/log output on each restart. Do not stop unrelated servers.
- Backend: `http://127.0.0.1:4317`; shared contract: `../../docs/backend-api.md`.
- The official Polyv sample plays in a real browser. Account-owned videos are
  not yet verified: health reports `polyvConfigured: false`.
- User aesthetic acceptance is pending. This is a local demo, not a public deployment.

## Environment And Commands
- Windows, Node.js, React 19, TypeScript, Vite, lucide-react, native CSS.
- From `frontend/`: `npm install`, `npm run dev`, `npm run build`, `npm test`.
- Set `NODE_TLS_REJECT_UNAUTHORIZED=1` for Node network tools in this environment.
- Browser checks use `npx --yes --package @playwright/cli playwright-cli -s=aufd-gpt`.
- Screenshots: `output/playwright/`.
- Start background processes with hidden windows. Loopback binding is intentional.

## Ownership And Data
- Only `frontend/` belongs to this frontend. Do not change `server/`,
  `aufd-demo/`, or shared documentation without coordination.
- No applicable local AGENTS.md was found during intake; chat instructions apply.
- Parent project is not a Git repository. Existing contributor files were preserved.
- Both frontends use the same saved portfolio and revision. Never auto-retry a 409.
- One real poster is one work. Official samples are labeled and excluded from
  personal-work counts. No fabricated achievements, films, or duplicate projects.
- Source poster is served as `/assets/poster.jpg`. Do not identify either person
  in the poster beyond the supplied author text.
- Management UI is local-only; backend authorization remains the security boundary.
  No credentials or admin tokens are embedded in this frontend.

## Verification
- Build and three Node tests pass.
- Real backend GET, image load, sample token, SDK playback, seek-to-zero, and
  player destruction verified. Sample duration: 10.92 seconds.
- Browser-isolated mocked upload/save/409 checks pass. Shared revision remained 0
  and name remained Liu Runsen after tests. No real PUT/upload was performed.
- Error recovery, denied-token no-fallback, read-only studio, reduced motion,
  320px/390px mobile layouts and desktop layouts checked.
- Independent screenshot review completed; mobile image size, demo attribution,
  and metadata readability improved. Final focus image is 354px at 390px viewport.
- Actual account search/encrypted playback, real upload/save persistence,
  public deployment, and user aesthetic approval remain unverified.

## Durable Debug Findings
- Interrupted turns can end exec sessions, browser sessions, and dev services.
  Check current state; old PIDs/session IDs are not proof of a running service.
- In Playwright CLI, `page.request` has no baseURL; use absolute URLs.
- Native confirm dialogs need the CLI `dialog-accept` command.
- Use `login:false` for PowerShell calls; profile initialization was much slower.
- Do not animate full-screen dialog opacity: it briefly composites duplicate artwork.
- Use a clipped skip link rather than negative offscreen positioning.
