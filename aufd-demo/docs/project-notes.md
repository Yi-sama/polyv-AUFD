# Project Notes

## Current Status

- Existing prototype copied here on 2026-10-23. This is not a finished application.
- GPT owns future backend work. Claude owns future frontend work.
- No migration to the proposed web/server layout has been performed.
- Frontend styling, derived cover images, and tests referenced by package scripts are not yet implemented.
- The Polyv SDK sample VID is present, but actual playback and the competition account have not been verified.

## Environment

- Node.js backend with file-based JSON persistence.
- Runtime data will be created under `data/`.
- Dependencies were not copied. Install with `npm install` when continuing development.
- The server binds to loopback only. There is no production authentication; do not expose the editor API publicly.

## Important Data

- `public/assets/poster.jpg` is the user's original uploaded poster.
- Existing source files were copied unchanged, with SHA-256 equality verified.
- The original workspace copy was retained.

## Next Boundary

Agree on `docs/api.md` and the new project structure before splitting the frontend and backend.
