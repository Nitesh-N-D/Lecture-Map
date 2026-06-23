import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as d3 from 'd3'
import { api } from '../api/client'
import useStore from '../store/useStore'
import AuthModal from '../components/ui/AuthModal'
import toast from 'react-hot-toast'

// Demo graph data simulating a CS algorithms lecture
const DEMO_NODES = [
  { concept_id: 'arrays', name: 'Arrays', difficulty: 'beginner', definition: 'Ordered collection of elements with index-based access', x: 200, y: 300 },
  { concept_id: 'pointers', name: 'Pointers', difficulty: 'beginner', definition: 'Memory addresses enabling direct memory access', x: 400, y: 200 },
  { concept_id: 'recursion', name: 'Recursion', difficulty: 'intermediate', definition: 'Function that calls itself with a base case', x: 600, y: 300 },
  { concept_id: 'sorting', name: 'Sorting', difficulty: 'intermediate', definition: 'Algorithms to arrange elements in order', x: 150, y: 480 },
  { concept_id: 'binary_search', name: 'Binary Search', difficulty: 'intermediate', definition: 'O(log n) search on sorted arrays', x: 350, y: 480 },
  { concept_id: 'linked_list', name: 'Linked List', difficulty: 'intermediate', definition: 'Chain of nodes connected via pointers', x: 550, y: 200 },
  { concept_id: 'trees', name: 'Trees', difficulty: 'advanced', definition: 'Hierarchical data structure with parent-child nodes', x: 700, y: 400 },
  { concept_id: 'bst', name: 'BST', difficulty: 'advanced', definition: 'Binary Search Tree with ordered node placement', x: 700, y: 250 },
  { concept_id: 'dfs', name: 'DFS', difficulty: 'advanced', definition: 'Depth-first traversal using recursion or stack', x: 850, y: 350 },
]

const DEMO_EDGES = [
  { source: 'arrays', target: 'sorting' },
  { source: 'arrays', target: 'binary_search' },
  { source: 'pointers', target: 'linked_list' },
  { source: 'linked_list', target: 'trees' },
  { source: 'recursion', target: 'dfs' },
  { source: 'trees', target: 'bst' },
  { source: 'trees', target: 'dfs' },
  { source: 'binary_search', target: 'bst' },
]

const DIFF_COLORS = { beginner: '#4ade80', intermediate: '#60a5fa', advanced: '#f472b6' }
const DIFF_RADIUS = { beginner: 18, intermediate: 24, advanced: 30 }

function DemoGraph() {
  const svgRef = useRef(null)

  useEffect(() => {
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()
    const W = 960, H = 520

    const defs = svg.append('defs')
    defs.append('marker').attr('id', 'demo-arrow')
      .attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#94a3b8').attr('opacity', 0.6)

    const g = svg.append('g')
    const nodes = DEMO_NODES.map(n => ({ ...n }))
    const links = DEMO_EDGES.map(e => ({ ...e }))

    const link = g.append('g').selectAll('line').data(links).join('line')
      .attr('stroke', '#94a3b8').attr('stroke-opacity', 0.4).attr('stroke-width', 1.5)
      .attr('marker-end', 'url(#demo-arrow)')

    const nodeG = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('transform', d => `translate(${d.x},${d.y})`)

    nodeG.append('circle')
      .attr('r', d => DIFF_RADIUS[d.difficulty])
      .attr('fill', d => DIFF_COLORS[d.difficulty])
      .attr('fill-opacity', 0.85)
      .attr('stroke', '#fff').attr('stroke-width', 2)

    nodeG.append('text').attr('text-anchor', 'middle')
      .attr('dy', d => DIFF_RADIUS[d.difficulty] + 13)
      .attr('font-size', '10px').attr('fill', '#475569').attr('font-weight', '500')
      .text(d => d.name)

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.concept_id).distance(90).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(W / 2, H / 2))
      .force('collide', d3.forceCollide(40))

    sim.on('tick', () => {
      link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
          .attr('x2', d => d.target.x).attr('y2', d => d.target.y)
      nodeG.attr('transform', d => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, [])

  return (
    <svg ref={svgRef} viewBox="0 0 960 520" className="w-full h-full" />
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const { setAuth, isAuthenticated } = useStore()
  const [authModal, setAuthModal] = useState(null) // null | 'login' | 'signup'

  const handleTryFree = async () => {
    try {
      const { data } = await api.guestLogin()
      setAuth(data.user, data.access_token)
      navigate('/dashboard')
    } catch {
      toast.error('Failed to start guest session')
    }
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <section className="max-w-5xl mx-auto px-4 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-brand-50 text-brand-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-6 border border-brand-100">
          <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
          No signup needed — try it instantly
        </div>
        <h1 className="text-5xl font-bold text-slate-900 leading-tight mb-5">
          Turn any lecture into a<br />
          <span className="text-brand-600">knowledge map</span>
        </h1>
        <p className="text-lg text-slate-500 max-w-xl mx-auto mb-8">
          The only tool that shows you <strong>how concepts connect</strong> — and exactly what to learn first. Upload audio, get an interactive graph in minutes.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleTryFree}
            className="bg-brand-600 text-white px-6 py-3 rounded-xl font-semibold text-sm hover:bg-brand-700 transition-colors shadow-sm"
          >
            Try with your lecture — no signup →
          </button>
          <button
            onClick={() => setAuthModal('signup')}
            className="border border-slate-200 text-slate-700 px-6 py-3 rounded-xl font-semibold text-sm hover:bg-slate-50 transition-colors"
          >
            Sign up free
          </button>
        </div>
        <button
          onClick={() => setAuthModal('login')}
          className="mt-4 text-sm text-slate-400 hover:text-slate-600 transition-colors"
        >
          Already have an account? Sign in
        </button>
      </section>

      <AuthModal
        open={!!authModal}
        initialMode={authModal || 'login'}
        onClose={() => setAuthModal(null)}
      />

      {/* Demo graph */}
      <section className="max-w-5xl mx-auto px-4 mb-20">
        <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden shadow-inner" style={{ height: '420px' }}>
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-200 bg-white">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
              Live demo — MIT 6.006: Introduction to Algorithms
            </span>
            <span className="ml-auto text-xs text-slate-400">9 concepts · 8 prerequisite edges</span>
          </div>
          <DemoGraph />
        </div>
        <p className="text-center text-xs text-slate-400 mt-2">
          Arrows show prerequisite direction: master Arrays before Binary Search
        </p>
      </section>

      {/* Features */}
      <section className="max-w-5xl mx-auto px-4 mb-20">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">Everything Anki can't do</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-slate-50 rounded-xl p-5 border border-slate-200">
              <div className="text-2xl mb-3">{f.icon}</div>
              <h3 className="font-semibold text-slate-900 mb-1">{f.title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Comparison table */}
      <section className="max-w-4xl mx-auto px-4 mb-24">
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-8">How we compare</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-semibold text-slate-600">Feature</th>
                {['LectureMap', 'Mindgrasp', 'Anki', 'Notion AI'].map(t => (
                  <th key={t} className={`py-3 px-4 font-semibold ${t === 'LectureMap' ? 'text-brand-600' : 'text-slate-500'}`}>{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((row, i) => (
                <tr key={i} className={`border-b border-slate-100 ${i % 2 === 0 ? 'bg-slate-50/50' : ''}`}>
                  <td className="py-3 px-4 text-slate-700">{row.feature}</td>
                  {row.values.map((v, j) => (
                    <td key={j} className={`py-3 px-4 text-center ${j === 0 ? 'text-brand-600' : 'text-slate-400'}`}>
                      {v === true ? '✓' : v === false ? '–' : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 py-16 px-4 text-center">
        <h2 className="text-3xl font-bold text-white mb-3">Start mapping your knowledge</h2>
        <p className="text-brand-200 mb-6 text-sm">No credit card. No signup. Just upload and learn.</p>
        <button
          onClick={handleTryFree}
          className="bg-white text-brand-700 px-8 py-3 rounded-xl font-semibold text-sm hover:bg-brand-50 transition-colors"
        >
          Try LectureMap free →
        </button>
      </section>

      <footer className="py-6 text-center text-xs text-slate-400">
        © 2024 LectureMap · Built for learners
      </footer>
    </div>
  )
}

const FEATURES = [
  {
    icon: '🕸️',
    title: 'Concept Dependency Graph',
    desc: 'See exactly which concepts depend on others. D3-powered force graph with directional arrows showing prerequisite → dependent relationships.',
  },
  {
    icon: '🔴',
    title: 'Knowledge Gap Detection',
    desc: 'As you study, gaps light up in red — prerequisite concepts you haven\'t mastered yet but need for topics you\'re trying to learn.',
  },
  {
    icon: '🔁',
    title: 'Prerequisite-Ordered Review',
    desc: 'Flashcard review queue follows the dependency graph — you\'ll always review fundamentals before advanced concepts.',
  },
  {
    icon: '🔗',
    title: 'Cross-Lecture Concept Linking',
    desc: 'Upload multiple lectures and LectureMap automatically links shared concepts across graphs, building your full knowledge topology.',
  },
]

const COMPARISON = [
  { feature: 'Audio/video upload', values: [true, true, false, false] },
  { feature: 'Concept graph visualization', values: [true, false, false, false] },
  { feature: 'Prerequisite detection', values: [true, false, false, false] },
  { feature: 'Gap detection', values: [true, false, false, false] },
  { feature: 'Spaced repetition (SM-2)', values: [true, false, true, false] },
  { feature: 'Anki export', values: [true, false, 'native', false] },
  { feature: 'Cross-lecture linking', values: [true, false, false, false] },
  { feature: 'Free tier', values: ['✓ generous', '✓ limited', '✓ full', '✓ limited'] },
]
