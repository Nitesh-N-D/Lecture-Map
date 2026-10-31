import { Link } from 'react-router-dom'
import Seo from '../components/ui/Seo'

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <Seo title="Page not found | LectureMap" noindex />
      <p className="font-display text-8xl font-semibold text-brand-600" aria-hidden="true">404</p>
      <h1 className="mt-2 text-4xl font-semibold text-slate-950">This page does not exist</h1>
      <p className="mt-3 text-sm text-slate-600">The link may be old or mistyped.</p>
      <Link className="inline-flex mt-6 items-center h-11 px-5 rounded-xl bg-primary text-sm font-semibold text-on-primary shadow-paper hover:bg-primary-hover" to="/">
        Go to the LectureMap home page
      </Link>
    </div>
  )
}
