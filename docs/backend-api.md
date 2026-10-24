# Shared Backend Contract v2.2

Owner: backend chat. Updated 2026-10-24. These v2.2 sections supersede every
conflicting v1 section archived below. No frontend files are owned by this chat.

Latest user correction: do not use the user as a creator. Bundled public
creators are fictional and `isSample:true`. The original personal document and
poster are not imported or served. Do not describe Liu Runsen as a real creator.

## Pending Official Identity Integration

User-confirmed target on 2026-10-24: authenticate with the existing POLYV
official management account, not a second AUFD password. The v2.2 routes below
still implement local demo credentials only; this note does not change runtime
behavior or claim a completed migration. Do not submit POLYV passwords to them.

No supported external-app identity callback or verification contract has been
established. POLYV's documented backend SSO is the reverse direction, into
POLYV. Do not implement a guessed endpoint, copy official passwords, trust
caller-supplied slugs as official identity, or treat the video API key as a
user login. Frontend owner: keep demo login distinct from official login.
Evidence and required partner inputs: `docs/progress/2026-10-24-polyv-auth.md`.

## v2.2 Authentication

| Method | Path | JSON body | Success |
|---|---|---|---|
| POST | `/api/auth/join` | `{slug,name,password}` | 201 `{creator: Creator}` |
| POST | `/api/auth/login` | `{slug,password}` | 200 `{creator: Creator}` |
| POST | `/api/auth/logout` | none | 200 `{ok:true}` |
| GET | `/api/auth/me` | none | 200 `{creator: Creator}` |

- `/api/auth/me` logged out: **401 `AUTH_REQUIRED`**, not `{creator:null}`.
- Slug is immutable, lowercase `/^[a-z0-9-]{2,40}$/`; route names and
  `liurunsen` are reserved. Duplicate slug: 409 `SLUG_EXISTS`.
- Password: 8..128 chars, salted scrypt; no account fields in public responses.
- Login and join set `aufd_session`: HttpOnly, SameSite=Lax, Path=/, 12 hours,
  Secure when HTTPS PUBLIC_ORIGIN is configured.
- Login rotates current session; logout revokes it. Restart invalidates sessions.
- Fetch relative URLs with `credentials:'include'`; Vite `changeOrigin:true`,
  `xfwd:false`. Forwarded headers are not trusted.
- Wrong or missing account: identical 401 `INVALID_CREDENTIALS`.
- Authentication limited to 30 attempts per peer IP per five minutes and four
  concurrent password operations. Sessions are in memory, one backend process.
- Neither loopback nor legacy ADMIN_TOKEN grants edit access anymore.
- Public binding requires HTTPS PUBLIC_ORIGIN and HTTPS reverse proxy.
- READ_ONLY blocks joins, saves, uploads and account-library search.
- Example passwords are generated randomly and saved ONLY in ignored
  `server/data/creators/<slug>/demo-login.local.json`; do not put in frontend.

## v2.2 Public Data

```ts
interface Creator {
  slug: string; channel: number; revision: number; isSample: boolean;
  profile: {
    name: string; alias: string; title: string; role: string;
    tags: string[]; bio: string; about: string; contact: string; email: string;
    avatar: string; cover: string; updatedAt: string;
  };
  works: Work[];
  media: Record<string, {width: number; height: number}>;
}
interface CreatorSummary {
  slug: string; channel: number; isSample: boolean; profile: Creator['profile'];
  worksCount: number; // excludes official-demo video works
  featured: Work | null; // legacy compatibility
  previews: {workId:string; type:Work['type']; cover:string; width:number; height:number}[];
  previewVideo: {workId:string; videoId:string; seconds:number; isDemo:boolean} | null;
}
```

- `GET /api/creators?q=&tag=`: `{items:CreatorSummary[]}`, channel ascending.
  q matches name/alias/title case-insensitively, <=100 chars. tag is an exact
  field tag, <=30 chars. Filters combine.
- `GET /api/creators/:slug`: full Creator, or 404.
- `GET /api/tags`: `{items:{tag:string,count:number}[]}` over all creators.
  Count each creator once per tag.
- `GET /api/portfolio`: compatibility alias for **lin-mo**, not the user.
- Seeds: `lin-mo` channel 1, photography; `chen-yu` channel 2, education;
  `zhou-ning` channel 3, live-video training. Each has three illustrative photos;
  lin-mo also has an explicitly official demo video.
- All seed names and biographies are fictional. Scene images, not impersonated
  portraits, serve as avatars. Credits: `server/assets/samples/SOURCES.md`.
- Join creates an empty public page, channel 4 onward, works=[], empty
  avatar/cover and media={}. Channel never changes during save.
- `previews`: <=6, featured first then nonfeatured, stable work order.
- `previewVideo`: first video in work order, first highlight seconds or 0.
- `role` mirrors `title`. New clients use title/contact; email is optional.
- Work is as below, with optional `duration:number|null` in seconds for videos.
- Images and cover dimensions are derived from real files.

## v2.2 Owner Writes

`PUT /api/creators/:slug` with `{revision,profile,works}`.
The `/api/portfolio` alias has the same checks.

- Anonymous: 401. Another creator: **403 `OWNER_REQUIRED`**, regardless of body.
- Own save: 200 full Creator, independent revision increment.
- Stale/concurrent save: 409 `REVISION_CONFLICT` with currentRevision.
- slug/channel/isSample/media/updatedAt/isDemo are server-owned.
- Optional profile strings default empty; tags <=5 distinct values.
- Avatar/cover may be empty for a new page. Nonempty paths must exist.
- Existing image/upload, work, date and highlight limits below remain in effect.
- `POST /api/upload`, `/api/uploads`, `GET /api/polyv/videos` require login.
- `GET /api/polyv/play-token` accepts a VID only when present on a saved
  **video** work of any creator. Nonvideo VID fields do not authorize tokens.
- Polyv is a shared competition-account library, not per-user credentials.
- For a video selected from the library, PUT accepts its exact remote Polyv
  cover URL, verifies the VID belongs to the account and is published, downloads
  only that verified cover (approved Polyv hosts, no redirects, <=10 MiB), and
  normalizes it through the regular image pipeline. The saved response contains
  a local cover plus dimensions and video duration. Frontend replaces its draft
  with this response. Other remote image URLs remain invalid.
- Official demos are not proof of actual competition-account playback.

## v2.2 Images And Storage

- Valid images: `/assets/samples/<name>.jpg`, `/assets/samples/<name>.webp`,
  `/uploads/<uuid>.webp`. GET/HEAD supported. No arbitrary remote URLs.
- **`/assets/poster.jpg` and `/api/creators/liurunsen` return 404.**
- `data/creators/<slug>/creator.json`: public document.
- `data/creators/<slug>/account.json`: private salted scrypt hash.
- Creation atomically renames a directory containing both account and document.
- Save atomically renames one document; existing corrupt data stops startup.
- Legacy `data/portfolio.json` is left untouched, not imported or served.
- Keep the data directory backed up; no public routes for private files.
- Tests use isolated temporary data and mocked Polyv. Actual browser/owned-video
  verification is recorded separately in `docs/progress/2026-10-24.md`.
- Response errors remain `{error,code,currentRevision?}`; 401 added for sessions.
- Port stays 127.0.0.1:4317; `/api`, `/assets`, `/uploads` unchanged.

---

# Archived v1 (Historical, Superseded By v2.2 Above)

The following is retained as history for image and Polyv details. Its single-user,
loopback/admin, original-poster and old storage assumptions DO NOT apply.

## Connection

- Backend directory: `server/`. Node.js 24+, `npm install`, `npm start`.
- Default: `http://127.0.0.1:4317`. Port conflicts fail explicitly; no silent switch.
- One process per data directory; stop the old prototype server first.
- Vite: proxy `/api`, `/uploads`, `/assets` to the backend with `changeOrigin: true`.
- Keep `xfwd` disabled for local unauthenticated editing.
- Bind Vite to loopback during editing. No frontend code or Polyv secrets are served by this server.
- Public visitors need no login. Only editing, upload, and account-library search are restricted.
- Default local editing accepts loopback requests and local HTTP development origins.
- For deployment set `READ_ONLY=true` and `PUBLIC_ORIGIN=https://your-host`.
  Alternatively configure a strong `ADMIN_TOKEN` and send `Authorization: Bearer ...`
  on management calls. Do NOT bake this token into frontend bundles.

## Data

`GET /api/portfolio` and `GET /api/creators/liurunsen` return the SAME document:

```ts
interface Portfolio {
  slug: 'liurunsen';
  revision: number;
  profile: {
    name: string; alias: string; role: string; bio: string; about: string;
    email: string; cover: string; avatar: string; updatedAt: string;
  };
  works: Work[];
  media: Record<string, { width: number; height: number }>;
}
interface Work {
  id: string; // unique, /^[a-zA-Z0-9_-]{1,60}$/
  type: 'poster' | 'photo' | 'video';
  title: string; subtitle: string; date: string; description: string;
  cover: string; images: string[];
  featured: boolean;
  videoId: string; // VID, not a playback URL; video works require it
  isDemo: boolean;
  highlights: { title: string; seconds: number }[];
}
```

The array order is the display order. One creator in this demo, not multi-tenant.
`GET /api/creators` returns `{ items: [{slug, profile: {name,alias,role,avatar}, featured}] }`.
Unknown creator slugs return 404. No create/delete-creator API.

`PUT` either document URL with JSON `{revision, profile, works}`.
`slug`, `media`, `updatedAt`, and `isDemo` are server-owned. `profile.cover` may
be omitted (defaults to avatar), preserving the earlier frontend draft.
Success: 200, complete saved document with revision incremented by one.
Conflict: 409, `{error, code:"REVISION_CONFLICT", currentRevision}`.
Reload and reconcile; do not silently retry with a new revision.
Save is immediately public, with no drafts or publishing workflow.

Limits: 40 works, 20 images/work, 12 highlights/work. Times are integer seconds
0..86400. Dates are real YYYY-MM-DD dates or empty strings. Image URLs must
refer to existing `/assets/poster.jpg` or uploaded files, not data/remote URLs.
Text is plain text; render as text, never raw HTML. No arbitrary extra fields.

## Images

`POST /api/upload`: multipart/form-data with one file field named `file`.
`POST /api/uploads`: same multipart format, plus legacy JSON
`{ "type": "image/jpeg", "base64": "<raw base64 without data: prefix>" }`.
Both return 201 `{url, width, height}`.
Maximum original file size: 10 MiB; JPG/PNG/WebP only, <=40 megapixels,
non-animated. Files are decoded, orientation-normalized, metadata-stripped,
and stored as WebP under `/uploads/`. Filenames are server-generated.
Failed uploads do not create a public file. Original seed poster remains JPEG.
`GET` and `HEAD` are supported for images. Uploaded files persist across restarts.
Uploads are public immediately; removing a work does not delete its files.

## Polyv

`GET /api/polyv/videos?keyword=&page=1&pageSize=20` (management only)

```ts
{
  items: {
    videoId: string; title: string; cover: string;
    duration: number; status: number; playable: boolean;
    encrypted: boolean | null; createdAt: string;
  }[];
  page: number; pageSize: number; total: number; totalPages: number;
}
```

`pageSize` 1..50; keyword <=100 chars. Search covers account-owned videos;
only published statuses 60/61 are playable. Returned covers are remote thumbnail
URLs for library previews, not uploaded portfolio images. `encrypted:null`
means unknown, not unencrypted.

`GET /api/polyv/play-token?vid=<videoId>` (public)

```ts
{
  videoId: string;
  token: string | null;
  required: boolean;
  expiresAt: number | null; // Unix milliseconds
  reason: 'official-demo' | 'unencrypted' | 'encrypted';
}
```

Only VIDs in the saved public portfolio are accepted (otherwise 404).
Official sample VID returns `token:null, required:false, reason:"official-demo"`
without using account credentials. It is visibly marked `isDemo:true`, not
represented as the creator's work or proof of account integration.
Other VIDs require configured credentials and an exact owned/published match.
If encryption is unknown the endpoint returns 503 instead of pretending success.
Encrypted videos receive a short-lived token and no account secrets.
Never fall back to uncredentialed playback after a token error.
Domain restrictions, authorization passwords, and actual browser playback still
need end-to-end verification; the backend does not alter account security.

## Status And Errors

`GET /api/health`:
`{status:"ok", readOnly:boolean, polyvConfigured:boolean}`.
Configuration being present is NOT proof of valid credentials or playback.

Errors: `{error: string, code: string, currentRevision?: number}`.
400 validation, 403 access/origin/read-only, 404 missing, 409 save conflict,
413 oversized, 415 media type, 429 busy/rate limit, 502 upstream failure,
503 configuration/encryption unknown, 504 timeout, 500 local failure.
Responses never include secrets, signed requests, raw upstream errors, or stack traces.

## Frontend Integration

1. Replace mock reads with GET; use returned image URLs and `media` dimensions.
2. Keep the received revision when editing. Replace local data with PUT response.
3. Upload first, insert the returned URL, then save the document.
4. Use `videoId` for the Polyv player; request play-token before playback.
5. Explicitly show official demo/placeholder labels and actionable API errors.
6. Both frontends edit the same document. Concurrent saves intentionally conflict.
