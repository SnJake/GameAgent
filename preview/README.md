# DB GameAgent — UI Preview Kit

5 production-grade UI styles, 3 themes each, 5 interface languages. End users can switch style/theme/language right from the chat header.

## Try it

Open `preview/index.html` in a browser (or serve the folder via any static server). The launcher shows all 5 styles; click any card to enter that style. Inside, the header has three selectors:

- **Style** — Atlas · Halo · Pulse · Synth · Atelier
- **Theme** — Dark · Graphite · Light
- **Language** — EN · RU · ZH · JA · KO

Default language is **EN**. User's style, theme, and language are saved to `localStorage` and restored across reloads.

## File layout

```
preview/
├── index.html      ← launcher (entry point, lists 5 styles)
├── atlas.html      ← Style 1 — warm editorial (Anthropic Claude-inspired)
├── halo.html       ← Style 2 — spatial glass (visionOS-inspired)
├── pulse.html      ← Style 3 — dense pro-tool (Linear/Vercel-inspired)
├── synth.html      ← Style 4 — AI dev-tool (Cursor/v0-inspired)
├── atelier.html    ← Style 5 — editorial gradient (Stripe/Notion-inspired)
├── shared.js       ← i18n dictionary + mock data + helpers
├── panels.js       ← resizable side panels (drag handles)
└── panels.css      ← splitter visuals
```

Every `*.html` is self-contained: one `<style>` block with all CSS for that style, the markup, and one `<script>` block that wires up state. All 5 files share `shared.js` and `panels.js`.

## How users switch style/theme/language

Three `<select>` elements live in the header of every variant (`#style-select`, `#lang-select`, plus the segmented `.theme-toggle*` buttons). The keys used in localStorage:

| Key | Value |
|---|---|
| `preview-style` | one of `atlas.html`, `halo.html`, `pulse.html`, `synth.html`, `atelier.html` |
| `preview-theme` | `dark` · `graphite` · `light` |
| `preview-lang` | `en` · `ru` · `zh` · `ja` · `ko` |
| `preview-panels-v2` | per-variant column widths + collapsed states |

Theme is applied via `data-theme="…"` on `<html>`, language via `data-lang="…"`. Variant-specific CSS keys off `:root[data-theme="…"]`.

## Integrating into a real app (React / Vite)

The reference app uses `src/main.jsx` + `src/styles.css`. To bring a style in:

1. **Pick a base style** — copy its inline `<style>` block from e.g. `atlas.html` into `src/styles.css` (or as a CSS module).
2. **Port the markup** — translate the `<main class="app">` block into JSX. The class names and `data-panel` / `data-collapse-panel` / `data-i18n` attributes work as-is.
3. **Wire state** — `data-theme` and `data-lang` go on `<html>` (or any common ancestor). Use the existing fields in `main.jsx` (`provider`, `model`, `memory`, `tools`, `wikiSearch`, `endfieldWikiSearch`, `webSearch`, `temperature`, `retrievalLimit`, `maxContextChars`, `maxHistoryMessages`) — same mock fields are already mapped 1:1.
4. **Resizable panels** — drop in `panels.js` and call `PREVIEW_PANELS.setup({ root: '.app', key: 'atlas' })` after first paint. Add `data-panel="sidebar" data-initial="304" data-min="220" data-max="480"` etc. to your aside/section elements.
5. **i18n** — keep the dictionary structure from `shared.js` (`I18N[lang][key]`). Replace mock chat data with real chats from your store.

### Supporting multi-style at runtime

If you want users to switch between all 5 styles inside the app:

- Build each style's CSS as a separate stylesheet (or CSS module).
- Load only the currently selected style based on `localStorage.getItem('preview-style')`.
- On style change, swap stylesheets and persist the choice.

Each style is fully scoped — there are no global selectors that would conflict across styles. The shared parts (i18n keys, mock data shape, `data-panel` attributes, `data-theme` / `data-lang` data attributes) are stable.

## Themes and tokens

Every style declares its own palette via CSS custom properties on `:root[data-theme="…"]`. A typical block looks like:

```css
:root[data-theme="dark"] {
  --bg: …;
  --panel: …;
  --border: …;
  --text: …;
  --accent: …;
  --user-bubble: …;
  /* … */
}
```

Themes are interchangeable per style. No code paths assume a specific theme.

## Languages

`shared.js` exposes `I18N` with five locales. Any element with `data-i18n="key"` gets translated when `applyLang()` runs. Any attribute (e.g. placeholder) can use `data-i18n-attr="placeholder:placeholderKey"`.

Adding a sixth language is just adding one more entry to `I18N`.

## What end users can do, out of the box

- Pick any of 5 visual styles
- Switch between Dark / Graphite / Light at any time
- Switch interface language between 5 locales
- Drag the borders between sidebar / chat / inspector panels to resize
- Double-click a splitter to reset that panel to its default width
- Collapse either sidebar via the toggle in the header
- Everything above persists between reloads

## Browser support

Modern Chromium / Firefox / Safari. Uses CSS container queries, `backdrop-filter`, `-webkit-line-clamp`, and pointer events. No build step required for the preview kit itself.
