# LectureMap - Forest Intelligence Design System

Status: **foundation and colour system implemented; page-level redesign is partial** (see "Not done").

## Themes
Two complete themes, selected with `data-theme` on `<html>`: **Sage Light** and **Forest Dark**.
- Preference is `light`, `dark` or system (default). Stored under `lecturemap-theme` in `localStorage`.
- An inline script in `frontend/index.html` applies the theme before first paint (no flash) and sets `theme-color`.
- `src/lib/theme.js`, `src/lib/useTheme.js` and `ThemeToggle` (navbar) manage it. The system preference is followed live while no explicit choice is stored.

## Tokens (`src/index.css`, `src/styles/scales.css`)
| Token | Sage Light | Forest Dark |
|---|---|---|
| `--background` | #F3F8F1 | #102A22 |
| `--background-secondary` | #E5F0E5 | #15382B |
| `--surface` / `--surface-elevated` | #FFFFFF | #183A2D / #1D4937 |
| `--surface-muted` | #EDF4EB | #214D3B |
| `--primary` | #1D4937 (hover #286347, active #15382B) | #78A98A (hover #9BC5A5) |
| `--accent` / `--accent-soft` | #78A98A / #DCEBDD | #B9D6BF / #24493A |
| `--border` | #D5E2D5 | #2F5E49 |
| `--text-primary` | #17251D | #F3F8F1 |
| `--text-secondary` | #3F5046 | #B9CBBB |

Deviation: light `--text-secondary` is #3F5046, not the brief's #65756A, to keep AA contrast on every surface. Dark `--accent-soft`, `--border` and `--text-primary` were not specified in the brief and were chosen here.

- `scales.css` is generated (brand, accent, slate, plus red/amber/emerald/violet for status). Each dark scale mirrors the light one, so existing `text-*` / `bg-*` classes stay legible in both themes. Tailwind reads them as `rgb(var(--c-...) / <alpha>)`.
- Semantic action colours: `bg-primary text-on-primary`, `bg-accent-500 text-on-accent`, `bg-danger text-on-danger`.
- Always-dark panel (`.ink-panel`) uses the fixed `sage-*` scale.
- Visualisation tokens `--viz-*` and `--diff-*` drive the graph, charts, heatmap and review ratings. Difficulty uses the forest family only (light sage / mid green / deep green, inverted in dark). Red is reserved for knowledge gaps. Status is also shown with glyphs and words, never colour alone.
- Remaining non-brand hues are semantic only: red (errors, gaps), amber (processing and blocked-prerequisite warnings), green.

## Type
Fraunces (display serif, h1/h2) and Figtree (body), self-hosted through `@fontsource-variable`.

## Dialogs
`components/ui/Modal.jsx`: rendered in a portal on `<body>`; the backdrop scrolls, the panel is capped at the viewport height and scrolls internally; focus trap, Escape, backdrop click, focus restore, body scroll lock. Root cause of the old clipping: a `fixed inset-0 flex items-center` overlay with no overflow handling, so a tall dialog was centred beyond the top edge. `AuthModal` uses it (two-pane on desktop, single column on mobile, show/hide password).

## Not done
- Landing page recomposition (new hero, example graph, Aha Path / privacy sections).
- Dedicated Aha Path, dashboard data panels, lecture workspace and settings redesign, theme control in Settings.
- `CommandPalette` still uses its own overlay rather than `Modal`.
- Favicon, og-image and manifest colours.
- Measured contrast for every colour pair (axe passes on landing, privacy, 404 and the auth dialog in both themes).
