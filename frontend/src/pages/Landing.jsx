import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import AuthModal from '../components/ui/AuthModal'
import UploadZone from '../components/upload/UploadZone'
import Button from '../components/ui/Button'
import toast from 'react-hot-toast'
import Seo from '../components/ui/Seo'
import Icon from '../components/ui/Icon'

const ICONS = ['upload', 'file', 'lock', 'sparkle', 'target', 'graph', 'route', 'cards', 'flame', 'download']

const WORKFLOW = [
  ['Upload', 'Add an audio, video or PDF file. Recordings are transcribed first.'],
  ['Build', 'Concepts, definitions and their dependencies are extracted into a knowledge graph with flashcards.'],
  ['Study', 'Follow a study path, take the Aha Path, and review what is due each day.'],
]

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
  const [searchParams] = useSearchParams()
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

  const authError = searchParams.get('auth_error')

  return (
    <div className="text-slate-950">
      <Seo
        title="LectureMap | Turn Lectures Into Knowledge Maps"
        description="Turn lecture audio, video and PDFs into concept graphs, study paths and spaced-repetition flashcards, built from your own material."
        path="/"
      />
      <section className="border-b surface-border atlas-hero">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-24 grid lg:grid-cols-[1.1fr_0.9fr] gap-10 lg:gap-14 items-center">
          <div>
            <p className="eyebrow">LectureMap</p>
            <h1 className="mt-4 max-w-3xl text-5xl sm:text-6xl font-semibold leading-[1.05]">
              Build a study system from the material you already have.
            </h1>
            <p className="mt-5 max-w-2xl text-base sm:text-lg leading-relaxed text-slate-700">
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
            {authError && <p role="alert" className="mt-4 text-sm text-red-700">Google sign-in could not be completed. Please try again or use email sign-in.</p>}
          </div>
          <UploadZone onSubmit={(lectureId) => navigate(`/lectures/${lectureId}`)} />
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20" aria-labelledby="how-it-works">
        <div className="max-w-2xl">
          <p className="eyebrow">How it works</p>
          <h2 id="how-it-works" className="mt-2 text-4xl font-semibold">From a recording to a map you can walk through.</h2>
        </div>
        <ol className="mt-10 grid md:grid-cols-3 gap-5">
          {WORKFLOW.map(([title, detail], index) => (
            <li key={title} className="card p-6">
              <span className="font-display text-3xl font-semibold text-brand-600" aria-hidden="true">0{index + 1}</span>
              <h3 className="mt-3 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-14 lg:pb-20 grid lg:grid-cols-2 gap-10 items-center">
        <figure className="card p-6" aria-label="Illustration of a concept graph">
          <svg viewBox="0 0 320 200" className="w-full" role="img" aria-label="Example: four concepts connected by prerequisite links, one marked as not yet studied">
            <g stroke="var(--viz-edge)" strokeWidth="1.6" fill="none">
              <path d="M50 150 120 90M120 90l80 20M200 110l70-60M200 110l40 70" />
            </g>
            <circle cx="50" cy="150" r="16" fill="var(--diff-beginner)" />
            <circle cx="120" cy="90" r="20" fill="var(--diff-intermediate)" />
            <circle cx="200" cy="110" r="18" fill="var(--diff-advanced)" />
            <circle cx="270" cy="50" r="13" fill="none" stroke="var(--viz-main)" strokeWidth="2" strokeDasharray="4 3" />
            <circle cx="240" cy="180" r="13" fill="var(--diff-intermediate)" />
          </svg>
          <figcaption className="mt-3 text-xs text-slate-600">Illustration only. Your graph is built from your own lecture.</figcaption>
        </figure>
        <div>
          <p className="eyebrow">Aha Path</p>
          <h2 className="mt-2 text-4xl font-semibold">Let the graph walk you through it.</h2>
          <p className="mt-4 text-base leading-7 text-slate-700">
            The Aha Path steps through your concept graph in prerequisite order, highlighting each concept in turn so you meet foundations before the ideas that depend on them.
          </p>
          <h3 className="mt-8 font-semibold text-slate-900">Then keep it with spaced repetition.</h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Flashcards generated from the lecture feed a daily review queue, so what you studied comes back when you are about to forget it.
          </p>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 lg:py-20 border-t surface-border">
        <div className="max-w-2xl">
          <p className="eyebrow">A complete learning workspace</p>
          <h2 className="mt-2 text-4xl font-semibold">Less note management. More durable understanding.</h2>
        </div>
        <div className="mt-10 grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-8">
          {FEATURES.map(([title, detail], index) => (
            <article key={title} className="card-interactive p-5">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-100 text-brand-700">
                <Icon name={ICONS[index % ICONS.length]} size={20} />
              </span>
              <h3 className="mt-4 font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-4 sm:px-6 pb-14">
        <div className="ink-panel max-w-6xl mx-auto rounded-3xl px-6 sm:px-10 py-12 grid md:grid-cols-3 gap-8 shadow-lift">
          <div><p className="font-display text-3xl font-semibold text-sage-50">Your source stays central.</p></div>
          <p className="text-sm leading-7 text-sage-100">Every graph, card, and study path begins with material you upload. LectureMap does not fill your workspace with sample lectures or fabricated study content.</p>
          <p className="text-sm leading-7 text-sage-100">You can download your data or delete your account from Settings. <Link to="/privacy" className="underline">Read the privacy policy</Link>. Use guest mode for a private trial, then create an account when you are ready to keep building a long-term study library.</p>
        </div>
      </section>

      <footer className="max-w-6xl mx-auto px-4 sm:px-6 py-7 flex flex-col sm:flex-row gap-3 justify-between text-sm text-slate-600">
        <span className="font-display font-semibold text-slate-900">LectureMap</span>
        <Link to="/privacy" className="hover:text-slate-900">Privacy policy</Link>
      </footer>
      <AuthModal open={Boolean(authModal)} initialMode={authModal || 'login'} onClose={() => setAuthModal(null)} />
    </div>
  )
}
