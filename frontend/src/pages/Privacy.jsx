import { useEffect } from 'react'
import { Link } from 'react-router-dom'

export default function Privacy() {
  useEffect(() => {
    document.title = 'Privacy Policy | LectureMap'
  }, [])

  return (
    <article className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16 text-slate-700">
      <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">LectureMap</p>
      <h1 className="mt-3 text-3xl sm:text-4xl font-semibold text-slate-950">Privacy policy</h1>
      <p className="mt-3 text-sm text-slate-500">Last updated: July 23, 2026</p>
      <div className="mt-10 space-y-8 text-sm leading-7">
        <section><h2 className="text-lg font-semibold text-slate-950">What we process</h2><p className="mt-2">LectureMap processes the files you upload, their extracted text, and the study material generated from them. Account details are limited to the information used to sign in.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-950">How files are used</h2><p className="mt-2">Files are used to produce your transcript or document text, concept graph, flashcards, and exports. Guest records are deleted when you sign out. Files for registered accounts remain associated with that account until you delete the lecture.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-950">Service providers</h2><p className="mt-2">A deployment may use configured storage, database, graph, and AI providers to deliver the service. Those providers process only the data needed for their part of the workflow.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-950">Your choices</h2><p className="mt-2">You can delete a lecture from the dashboard. This removes its associated flashcards and study records from the application database. Do not upload material you are not permitted to process.</p></section>
        <section><h2 className="text-lg font-semibold text-slate-950">Contact</h2><p className="mt-2">For privacy questions, contact the operator of the deployment where you use LectureMap.</p></section>
      </div>
      <Link to="/" className="inline-block mt-10 text-sm font-medium text-brand-700 hover:text-brand-800">Return to LectureMap</Link>
    </article>
  )
}
