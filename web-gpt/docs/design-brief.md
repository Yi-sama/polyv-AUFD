# AUFD: An Edited Collection

Owner: GPT frontend chat. Scope: web-gpt only.

## Product
Public, artwork-first portfolio. A visitor identifies the creator, browses work,
opens it without losing context, views real media, and optionally contacts the creator.
The studio belongs to the owner, not the visitor. No intro movie or animation task.

## Direction (2026-10-24)
The user rejected the first sparse media-list implementation. Treat a portfolio
as authored projects and visual stories, not files plus an enlarged cover.
Visitors first see a curated three-project spread, then an editorial photo story,
a complete searchable index, a Polyv film entry, and concise creator/contact details.
Each project opens a full reading view: context, metadata, large image sequence,
captions, source credits, optional video, image zoom, and next-project navigation.
Keep the previous page's scroll, filters, and search when returning.

## Tokens
- Paper: #fafaf7; ink: #22251f; secondary ink: #6d7168.
- Pale green editorial band: #edf0e6; lime detail: #dbf16e.
- Original blue/orange poster supplies the strongest color, not UI decoration.
- Chinese: Microsoft YaHei UI / PingFang SC; Latin: Arial.
- No negative tracking or viewport-scaled type.
- Narrow screens become a readable vertical exhibition; original media is not cropped in focus.

## Motion
Short opacity/position transitions on focusing and filtering, not autoplay spectacle.
Reduced-motion behavior must preserve every action. Native dialog semantics and focus return.

## Boundaries
One real poster is one work. No invented accomplishments, counters, client brands or
duplicated poster crops misrepresented as separate projects. Official video samples are labeled.
The user authorized internet images. Eight credited Unsplash photographs form three
explicitly marked demo stories. They are read-only presentation data, excluded from
the shared API document and Studio saves. Source manifest: public/demo-media/SOURCES.md.
Do not pretend stock subjects are Liu Runsen or that demo events belong to him.
Use the shared backend contract in ../docs/backend-api.md (project root).
Never edit server/, web/ (Claude), or shared docs without coordinating.

## Verification
Real desktop and mobile screenshots; focus/back navigation; filters/index; upload/save;
conflict response; loading/error states; SDK/token failure transparency. Independent
visual review may assess screenshots only, at most two improvement rounds.
