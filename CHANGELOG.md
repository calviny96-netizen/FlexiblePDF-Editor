# Changelog

## FlexiblePDF-Editor v1.4

- Fix: documents with an embedded `<svg>` chart (or any block whose height was measured via `offsetTop`, which isn't reliably defined on SVG root elements in every engine) could silently produce a single unpaginated page no matter how long the content was — one `NaN` height from the SVG block poisoned every subsequent running-total addition, which made every later "does this fit the page" comparison evaluate to `false` forever (`NaN > x` is always false), so the page never split and a long table simply overflowed and got clipped. Block height measurement now uses `getBoundingClientRect()`, which works uniformly for both HTML and SVG elements, instead of the `offsetTop` delta.

## FlexiblePDF-Editor v1.3

- Fix: numeric fields (paper width/height, margins, font size, per-page overrides) no longer re-render on every keystroke. Editing "29.7" into "32.5" by deleting and retyping digits was applying (and briefly falling back to a default) after each character, before the user finished typing. These fields now commit on blur or Enter instead.
- Fix: the 20px gap between page previews wasn't actually being applied — it was set on `.preview-area`, whose only direct child is the `#pages` wrapper, not the individual page sheets, so the flex `gap` had no visible effect. Moved it to `#pages` where the page sheets actually live.
- Fix: exported PDF file size was excessive (reported up to hundreds of MB for many-page documents). Page rasterization now uses JPEG instead of lossless PNG and a 1.5x scale instead of 2x, cutting file size by roughly 2-3x in testing with no meaningful loss of legibility.

## FlexiblePDF-Editor v1.2

- Fix: long tables no longer jump to the next page as one indivisible block (which produced near-blank pages and stranded headings). Tables now split at row boundaries, repeating the header row on each continuation page, the way a real document editor paginates a table.
- Fix: headings are no longer left orphaned alone (or nearly alone) at the bottom of a page — pagination now checks that at least some of the heading's following content fits alongside it, pushing the heading forward to the next page otherwise.

## FlexiblePDF-Editor v1.1

- Fix: Markdown renderer now supports raw HTML passthrough (inline `<span>`/`<a>` and block-level `<svg>`/`<div>`/`<table>` embeds), matching CommonMark/GFM behavior. Previously all HTML was escaped, so embedded SVG charts and styled badges rendered as literal text instead of graphics.
- Fix: word/token counting strips HTML tags before counting so embedded charts no longer inflate the token estimate.
- Add: date-range field now uses a proper calendar widget (Litepicker) with quick presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month), replacing the plain native date inputs.
- Add: per-page paper size is now fully modular — pages are auto-detected from real content height (no manual markers needed), and each detected page gets its own "override this page's size" checkbox, defaulting to the global paper size until customized.
- Fix: custom paper width/height values are used exactly as entered, no longer silently swapped based on the orientation toggle.

## FlexiblePDF-Editor v1.0

- Initial release of FlexiblePDF-Editor.
