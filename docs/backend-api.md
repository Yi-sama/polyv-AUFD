# Shared Backend Contract v1

Owner: backend chat. Both frontends use this contract. The earlier `api.md`
draft is retained; this document resolves its open questions.

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
