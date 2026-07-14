import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import useStore from '../store/useStore'
import AuthModal from '../components/ui/AuthModal'
import UploadZone from '../components/upload/UploadZone'
import Button from '../components/ui/Button'
import toast from 'react-hot-toast'

export default function Landing() {
  const navigate = useNavigate()
  const { setAuth } = useStore()
  const [authModal, setAuthModal] = useState(null)

  const handleTryFree = async () => {
    try {
      const { data } = await api.guestLogin()
      setAuth(data.user, data.access_token)
      navigate('/dashboard')
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Failed to start guest session')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <section className="border-b border-slate-200 bg-gradient-to-b from-white to-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-12 lg:py-16 grid lg:grid-cols-[1.05fr_0.95fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 border border-brand-100">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500" />
              Lecture audio, video, and YouTube links
            </div>
            <h1 className="text-4xl sm:text-5xl font-bold text-slate-950 leading-tight mb-5">
              LectureMap turns lectures into connected study systems.
            </h1>
            <p className="text-base sm:text-lg text-slate-600 max-w-2xl mb-7 leading-relaxed">
              Upload a real lecture and get a concept graph, prerequisite-aware study path,
              spaced-repetition flashcards, and exports from the same source material.
            </p>
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleTryFree}
                size="lg"
              >
                Start as guest
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => setAuthModal('signup')}
              >
                Create account
              </Button>
            </div>
            <button
              onClick={() => setAuthModal('login')}
              className="mt-4 text-sm text-slate-500 hover:text-slate-700 transition-colors"
            >
              Already have an account? Sign in
            </button>
          </div>

          <div className="w-full flex justify-center lg:justify-end">
            <UploadZone onSubmit={(lectureId) => navigate(`/lectures/${lectureId}`)} />
          </div>
        </div>
      </section>

      <AuthModal
        open={!!authModal}
        initialMode={authModal || 'login'}
        onClose={() => setAuthModal(null)}
      />

      <section className="max-w-6xl mx-auto px-4 py-14">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map((feature) => (
            <article key={feature.title} className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 mb-2">
                {feature.label}
              </p>
              <h2 className="font-semibold text-slate-950 mb-2">{feature.title}</h2>
              <p className="text-sm text-slate-600 leading-relaxed">{feature.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-14 grid lg:grid-cols-3 gap-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-950 mb-3">Built for real study workflows</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              LectureMap keeps the first screen practical: add material, process it, review it,
              and export it. The product experience starts with your own lecture material.
            </p>
          </div>
          <div className="lg:col-span-2 grid sm:grid-cols-2 gap-3">
            {WORKFLOWS.map((item) => (
              <div key={item} className="bg-white border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700">
                {item}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="py-6 text-center text-xs text-slate-500">
        Copyright 2026 LectureMap. Built for learners.
      </footer>
    </div>
  )
}

const FEATURES = [
  {
    label: 'Map',
    title: 'Concept graph',
    description: 'Extract concepts and relationships from lecture material, then explore them visually.',
  },
  {
    label: 'Guide',
    title: 'Study path',
    description: 'Follow prerequisite-aware paths so foundational ideas come before advanced ones.',
  },
  {
    label: 'Review',
    title: 'Spaced repetition',
    description: 'Turn extracted concepts into review cards scheduled with SM-2 style repetition.',
  },
  {
    label: 'Export',
    title: 'Portable learning',
    description: 'Export flashcards and study material for offline review and external tools.',
  },
]

const WORKFLOWS = [
  'Upload MP3, MP4, WAV, M4A, WEBM, or OGG files.',
  'Paste standard YouTube, short, mobile, or embed links.',
  'Track processing states with clear error feedback.',
  'Open graphs, study paths, reviews, and exports from the dashboard.',
]
