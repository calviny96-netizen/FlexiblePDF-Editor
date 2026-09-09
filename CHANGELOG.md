# Changelog

## FlexiblePDF-Editor v1.1

- Fix: Markdown renderer now supports raw HTML passthrough (inline `<span>`/`<a>` and block-level `<svg>`/`<div>`/`<table>` embeds), matching CommonMark/GFM behavior. Previously all HTML was escaped, so embedded SVG charts and styled badges rendered as literal text instead of graphics.
- Fix: word/token counting strips HTML tags before counting so embedded charts no longer inflate the token estimate.
- Add: date-range field now uses a proper calendar widget (Litepicker) with quick presets (Today, Yesterday, Last 7 Days, Last 30 Days, This Month, Last Month), replacing the plain native date inputs.
- Add: per-page paper size is now fully modular — pages are auto-detected from real content height (no manual markers needed), and each detected page gets its own "override this page's size" checkbox, defaulting to the global paper size until customized.
- Fix: custom paper width/height values are used exactly as entered, no longer silently swapped based on the orientation toggle.

## FlexiblePDF-Editor v1.0

- Initial release of FlexiblePDF-Editor.
