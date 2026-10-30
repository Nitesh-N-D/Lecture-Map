# SEO Implementation

LectureMap is a client-rendered Vite SPA, so metadata is set in the browser. Crawlers that execute JavaScript see per-route values; crawlers that do not see the defaults in `index.html`.

## What exists

- `index.html`: default title, description, canonical, Open Graph, Twitter card, `SoftwareApplication` JSON-LD, icons, manifest (pre-existing).
- `src/components/ui/Seo.jsx`: sets title, description, `og:` and `twitter:` text, `robots`, canonical and `og:url` per route. Used by the landing page (`/`), `/privacy`, the 404 page, and automatically by every signed-in page through `Layout`.
- **Private pages are `noindex, nofollow`** and have their canonical link removed: dashboard, lectures, study path, review, knowledge map, settings.
- Unknown URLs render a 404 page with `noindex`. Note: a static host still answers 200 for them because of the SPA rewrite, so this is a soft 404.
- `public/robots.txt` allows `/` and `/privacy`, disallows all app paths and `/auth/`, and points to the sitemap.
- `public/sitemap.xml` lists `/` and `/privacy`.
- Canonical origin: `VITE_SITE_URL` if set, otherwise the current origin.

## Required before launch

- The static files (`index.html` canonical/OG URLs, `robots.txt`, `sitemap.xml`) are hard-coded to `https://lecture-map.vercel.app`. Replace them if the production domain differs.
- `lastmod` in `sitemap.xml` is a fixed date; update it when public pages change.

## Not done

- Server-side rendering or prerendering (meta tags for non-JS crawlers stay at the defaults).
- Structured data beyond the single `SoftwareApplication` block.
- Real 404 status codes (needs host-level handling or SSR).
- Validation with Google Search Console / Lighthouse; nothing here was measured in a browser.
