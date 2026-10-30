import { Link } from 'react-router-dom'
import Seo from '../components/ui/Seo'

export default function NotFound() {
  return (
    <div className="max-w-xl mx-auto px-4 py-24 text-center">
      <Seo title="Page not found | LectureMap" noindex />
      <p className="text-sm font-semibold text-brand-700">404</p>
      <h1 className="mt-2 text-3xl font-semibold text-slate-950">This page does not exist</h1>
      <p className="mt-3 text-sm text-slate-600">The link may be old or mistyped.</p>
      <Link className="inline-block mt-6 text-sm font-medium text-brand-700 underline" to="/">
        Go to the LectureMap home page
      </Link>
    </div>
  )
}
