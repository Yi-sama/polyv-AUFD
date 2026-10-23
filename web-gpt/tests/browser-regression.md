# Browser Regression Checklist

Run against the real Vite frontend with the local backend available.
Use browser-isolated route mocks for destructive management cases.

- Open a project, enlarge an image, then use browser Back while the lightbox is open.
  Assert there are zero dialogs and `document.body.style.overflow` is not `hidden`.
  Reopen, close just the lightbox, and assert the parent dialog is still open.
- Search for a project, open it, close it, and confirm query, filter, view and scroll position persist.
- Turn off demo content. Confirm only API-owned non-demo works are shown; no demo story/film sections.
- Open every photo story, scroll through every image, and confirm images decode at desktop and mobile widths.
- Play the official Polyv sample through a highlight. Confirm time advances and closing removes the video.
- Open Studio. Confirm presentation-only stories are not included in its editable works.
- Check 320px, 390px, 1440px and 1920px layouts, reduced motion, and missing-image recovery.
