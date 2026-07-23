import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import AuthModal from '../components/ui/AuthModal'
import UploadZone from '../components/upload/UploadZone'
import Button from '../components/ui/Button'
import toast from 'react-hot-toast'

const FEATURES = [
  ['Audio and video upload', 'Bring recordings in common lecture formats up to 200MB.'],
  ['PDF ingestion', 'Turn selectable PDF text into the same structured study material.'],
  ['Private workspace', 'Each account and guest session only sees its own lectures.'],
  ['Speech transcription', 'Whisper turns recorded lectures into source text.'],
  ['Concept extraction', 'Gemini identifies concepts, definitions, and their dependencies.'],
  ['Knowledge graphs', 'Explore how ideas connect instead of reviewing notes in isolation.'],
  ['Study paths', 'Follow prerequisite-aware routes from foundations to target concepts.'],
  ['Flashcard generation', 'Create review prompts directly from your lecture material.'],
  ['Spaced repetition', 'Keep a focused daily review queue as your workload grows.'],
  ['Exports', 'Take your study material to Anki or a printable PDF.'],
]

export default function Landing() {
  const navigate = useNavigate()
  const { setAuth } = useStore()
  const [authModal, setAuthModal] = useState(null)

  const startGuestSession = async () => {
    try {
      const { data } = await api.guestLogin()
      setAuth(data.user, data.access_token)
      navigate('/dashboard')
    } catch (error) {
      toast.error(error.response?.data?.detail || 'Unable to start a guest session')
    }
  }

  return (
    <div className="bg-white text-slate-950">
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">LectureMap</p>
            <h1 className="mt-4 max-w-3xl text-4xl sm:text-5xl font-semibold leading-tight">
              Build a study system from the material you already have.
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-600">
              LectureMap converts your recordings and PDFs into a connected knowledge map, focused review cards, and a clear plan for what to study next.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button size="lg" onClick={startGuestSession}>Start as guest</Button>
              <Button size="lg" variant="outline" onClick={() => setAuthModal('signup')}>Create account</Button>
            </div>
            <div className="mt-5 flex items-center gap-4 text-sm text-slate-600">
              <Button type="button" variant="ghost" size="sm" className="h-auto px-0 hover:text-brand-700" onClick={() => setAuthModal('login')}>Sign in</Button>
              <Link className="hover:text-brand-700" to="/privacy">Privacy</Link>
            </div>
          </div>
          <UploadZone onSubmit={(lectureId) => navigate(`/lectures/${lectureId}`)} />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-medium text-brand-700">A complete learning workspace</p>
          <h2 className="mt-2 text-3xl font-semibold">Less note management. More durable understanding.</h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
          {FEATURES.map(([title, detail], index) => (
            <article key={title} className="border-t border-slate-200 pt-4">
              <p className="text-xs font-semibold text-brand-700">{String(index + 1).padStart(2, '0')}</p>
              <h3 className="mt-2 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 grid md:grid-cols-3 gap-8">
          <div><p className="text-2xl font-semibold">Your source stays central.</p></div>
          <p className="text-sm leading-6 text-slate-600">Every graph, card, and study path begins with material you upload. LectureMap does not fill your workspace with sample lectures or fabricated study content.</p>
          <p className="text-sm leading-6 text-slate-600">Use guest mode for a private trial, then create an account when you are ready to keep building a long-term study library.</p>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row gap-3 justify-between text-sm text-slate-500">
        <span>LectureMap</span>
        <Link to="/privacy" className="hover:text-slate-900">Privacy policy</Link>
      </footer>
      <AuthModal open={Boolean(authModal)} initialMode={authModal || 'login'} onClose={() => setAuthModal(null)} />
    </div>
  )
}
