# BACKEND-006: Real Account Video And Final Backend Verification

Date: 2026-10-24, Asia/Shanghai. Final browser replay observed around 09:01.

## Scope And Context

- Continue backend handoff after implementation commit `4771dd8`, already
  pushed to `Yi-sama/polyv-AUFD` main, following source baseline `44e6704`.
- Read the product-direction correction and v2.2 contract. The user is not a
  platform creator; their old personal document and poster remain unserved.
- No applicable on-disk AGENTS.md, root README.md, SPEC.md or LOG-INDEX.md.
  Used the user instructions, server README, product direction, API contract,
  project notes and dated progress records.
- This final change updates backend documentation only. Claude's frontend
  files, media credits, daily-log sections and all runtime data are preserved.
  A separate journal avoids staging Claude's concurrent daily-log changes.

## Automated And HTTP Evidence

- From `server/`, `$env:NODE_TLS_REJECT_UNAUTHORIZED='1'; npm.cmd test`:
  **32 tests passed, zero failed, zero skipped**.
- With process-local `POLYV_TEST_VID` set to
  `0cf5cbb2f905e3ac62e97c0c16d1de4e_0`, `npm.cmd run check:polyv` returned
  apiVerified=true, selectedVideoPublished=true, status=61, playable=true,
  encrypted=false. Its playbackVerified=false is intentional, not a browser test.
- Health on 4317: status=ok, readOnly=false, polyvConfigured=true.
- Six public creators returned in channel order 1..6. No user name, old personal
  slug, alias or poster path was found in the public creator-list response.
- Both direct backend 4317 and frontend proxy 5175 returned:
  - `/api/creators/liurunsen`: 404.
  - `/assets/poster.jpg`: 404.
  - `/api/polyv/play-token?vid=0cf5cbb2f905e3ac62e97c0c16d1de4e_0`:
    200, required=false, token=null, reason=unencrypted.

## Independent Browser Evidence

- Anonymous route: `http://127.0.0.1:5175/he-tian/w/wmvlj3ttupaw9`.
- Saved work: isDemo=false, duration=5, highlight seconds=2, local cover
  `/uploads/a0eb949d-ef6d-450b-9d2c-fe1dd5731494.webp`.
- Clicked the visible 0:02 highlight button. Actual HTML video events:
  seeking at 2, seeked at 2, playing at 2, ended at 5.08 seconds.
- Final video state: duration=5.08, currentTime=5.08, ended=true,
  readyState=4, error=null. Zero broken images; no user identity in visible text.
- Browser console contained only three expected anonymous auth/me 401 errors.
- This verifies a real competition-account video, not the official demo VID.
  No credentials, signed media URLs or session values are recorded here.

## Attribution And Remaining Limits

- Claude's FRONTEND-002 journal reports the import of MDN's CC0 flower clip
  and the Studio search -> select -> highlight -> save workflow. This pass
  independently checked persisted results, exact account lookup, public APIs,
  playback and seeking; it did not repeat a write that would duplicate the work.
- Claude added su-wan, he-tian and jiang-he through normal join APIs.
  Their isSample=false metadata differs from the bundled seeds. Their public
  biographies and displayed labels disclose fictional examples. Data was not
  silently rewritten.
- Runtime data and uploads are ignored by Git. A clone gets the three bundled
  seeds, not these additional runtime creators or the saved real-video work;
  preserve the local data directory for the current demo.
- Servers are local development processes, not a deployment or persistent
  service manager. Leave them running for the demo.
- Encrypted-video behavior is covered by mocked regression tests, not this
  unencrypted live clip. Physical mobile interaction and final human visual
  acceptance remain pending; no claim of full frontend acceptance.

## Acceptance

- spec_check: pass for backend scope, ownership and latest identity correction.
- runtime_check: pass for isolated tests, live account/API checks and the
  independently observed anonymous playback/highlight path.
- human_check: pending for final product/visual approval and physical devices.
- overall: partially_verified for whole-product acceptance; the previous
  empty-library and real-playback blockers are closed.
- Documentation changes are scoped to this record, project notes and debug
  notes; frontend changes are not part of the backend documentation commit.
