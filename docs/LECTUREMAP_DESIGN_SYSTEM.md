# LectureMap Design System ("Synaptic Atlas")

**Scope delivered:** an accessibility-first foundation and the highest-impact screens. A complete visual re-skin of every page was not done. This is not a WCAG 2.2 AA conformance claim: axe scans (A and AA rule tags) found no serious or critical violations on the landing and lecture pages, and nothing else was audited.

## Tokens (`src/index.css`)
- Surfaces and text via CSS variables. `--text-tertiary` was darkened from `#94a3b8` (2.6:1 on white) to `#64748b` (about 4.8:1).
- `--focus-ring` (indigo, 3px outline, 2px offset) on every `:focus-visible`.
- Atlas accents `--atlas-ink`, `--atlas-glow`, `--atlas-teal`, and an `.atlas-hero` gradient on the landing hero.
- `prefers-reduced-motion: reduce` collapses all animation and transition durations.

## Patterns implemented
- **Skip link** to a focusable `#main-content`.
- **Concept state is never colour-only.** The list uses a glyph plus words (Studied, Mastered, Blocked by prerequisite, Not studied). The D3 graph uses glyphs, a dashed outline for blocked nodes and an `aria-label` that includes the status.
- **Text alternative to the graph:** a "Concepts" tab (`ConceptList`) ordered by lecture time, showing prerequisites ("Builds on"). It is keyboard operable and usable on small screens.
- **Tabs** use `tablist`, `tab` and `tabpanel` roles with `aria-selected`, and scroll horizontally on narrow screens.
- **Sign-in dialog** has `role="dialog"`, `aria-modal`, a label, Escape to close, and errors announced with `role="alert"`.
- **Upload zone** is keyboard operable (`role="button"`, Enter and Space).
- **Failure recovery:** a failed lecture shows the reason and a "Retry processing" button.

## Not done
- Restyle of the dashboard, review, study-path and knowledge-map pages.
- Focus trapping inside dialogs.
- Arrow-key tab navigation.
- Keyboard navigation of graph nodes.
- Contrast measurement of every colour pair.
- Screen-reader testing.
- Dark mode.
- Aha Path controls and persistence.
