import { useEffect } from 'react'

const SITE_URL = (import.meta.env.VITE_SITE_URL || '').replace(/\/$/, '')

function setMeta(selector, attrs) {
  let el = document.head.querySelector(selector)
  if (!el) {
    el = document.createElement(selector.startsWith('link') ? 'link' : 'meta')
    document.head.appendChild(el)
  }
  Object.entries(attrs).forEach(([key, value]) => el.setAttribute(key, value))
}

/**
 * Per-route metadata for the single-page app. Search engines that run JavaScript
 * see these values; private pages are marked noindex so they never appear in results.
 */
export default function Seo({ title, description, path, noindex = false }) {
  useEffect(() => {
    document.title = title
    setMeta('meta[name="robots"]', { name: 'robots', content: noindex ? 'noindex, nofollow' : 'index, follow' })
    if (description) {
      setMeta('meta[name="description"]', { name: 'description', content: description })
      setMeta('meta[property="og:description"]', { property: 'og:description', content: description })
      setMeta('meta[name="twitter:description"]', { name: 'twitter:description', content: description })
    }
    setMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    setMeta('meta[name="twitter:title"]', { name: 'twitter:title', content: title })
    // Private pages get no canonical so they are never consolidated onto a public URL.
    const canonical = document.head.querySelector('link[rel="canonical"]')
    if (noindex) {
      canonical?.remove()
    } else {
      const origin = SITE_URL || window.location.origin
      setMeta('link[rel="canonical"]', { rel: 'canonical', href: `${origin}${path ?? window.location.pathname}` })
      setMeta('meta[property="og:url"]', { property: 'og:url', content: `${origin}${path ?? window.location.pathname}` })
    }
  }, [title, description, path, noindex])
  return null
}
