import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import * as d3 from 'd3'
import { api } from '../api/client'
import { getNodeRadius, truncateLabel } from '../utils/d3helpers'
import toast from 'react-hot-toast'

// A distinct, deterministic color per lecture so the merged map reads as
// "islands of lectures bridged by shared concepts" rather than one blob.
const LECTURE_PALETTE = [
  '#60a5fa', '#f472b6', '#4ade80', '#fbbf24', '#a78bfa',
  '#fb923c', '#34d399', '#f87171', '#38bdf8', '#c084fc',
]

function colorForLecture(lectureId, lectureIds) {
  const idx = lectureIds.indexOf(lectureId)
  return LECTURE_PALETTE[idx % LECTURE_PALETTE.length]
}

export default function AllLecturesGraph() {
  const svgRef = useRef(null)
  const containerRef = useRef(null)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dims, setDims] = useState({ width: 900, height: 600 })

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const { data } = await api.getKnowledgeMap()
        setData(data)
      } catch {
        toast.error('Failed to load knowledge map')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({ width: entry.contentRect.width, height: entry.contentRect.height })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    if (!data || !svgRef.current || data.nodes.length === 0) return

    const { width, height } = dims
    const lectureIds = (data.lectures || []).map((l) => l.id)

    const nodes = data.nodes.map((n) => ({ ...n }))
    const nodeIds = new Set(nodes.map((n) => n.concept_id))

    const prereqLinks = data.edges
      .filter((e) => nodeIds.has(e.from) && nodeIds.has(e.to))
      .map((e) => ({ source: e.from, target: e.to, strength: e.strength, kind: 'prereq' }))

    const bridgeLinks = (data.bridges || [])
      .filter((b) => nodeIds.has(b.from) && nodeIds.has(b.to))
      .map((b) => ({ source: b.from, target: b.to, kind: 'bridge' }))

    const links = [...prereqLinks, ...bridgeLinks]

    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    const zoom = d3.zoom().scaleExtent([0.2, 3]).on('zoom', (e) => g.attr('transform', e.transform))
    svg.call(zoom)

    const defs = svg.append('defs')
    defs.append('marker').attr('id', 'merged-arrow')
      .attr('viewBox', '0 -5 10 10').attr('refX', 20).attr('refY', 0)
      .attr('markerWidth', 6).attr('markerHeight', 6).attr('orient', 'auto')
      .append('path').attr('d', 'M0,-5L10,0L0,5').attr('fill', '#94a3b8').attr('opacity', 0.6)

    const g = svg.append('g')

    // Bridge links — dashed, gold, no arrowhead (bidirectional concept identity, not prerequisite)
    const bridgeSel = g.append('g').selectAll('line').data(bridgeLinks).join('line')
      .attr('stroke', '#f59e0b')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '4 3')
      .attr('stroke-opacity', 0.7)

    // Prerequisite links
    const prereqSel = g.append('g').selectAll('line').data(prereqLinks).join('line')
      .attr('stroke', '#94a3b8')
      .attr('stroke-width', (d) => 1 + Math.round((d.strength || 0.5) * 2))
      .attr('stroke-opacity', 0.45)
      .attr('marker-end', 'url(#merged-arrow)')

    const node = g.append('g').selectAll('g').data(nodes).join('g')
      .attr('cursor', 'pointer')
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) sim.alphaTarget(0.3).restart()
            d.fx = d.x; d.fy = d.y
          })
          .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
          .on('end', (event, d) => {
            if (!event.active) sim.alphaTarget(0)
            d.fx = null; d.fy = null
          })
      )

    node.append('circle')
      .attr('r', (d) => getNodeRadius(d.difficulty) * 0.8)
      .attr('fill', (d) => colorForLecture(d.lecture_id, lectureIds))
      .attr('fill-opacity', (d) => d.is_visited ? 1 : 0.7)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getNodeRadius(d.difficulty) * 0.8 + 12)
      .attr('font-size', '9px')
      .attr('fill', 'var(--text-secondary, #475569)')
      .attr('pointer-events', 'none')
      .text((d) => truncateLabel(d.name, 14))

    node.append('title').text((d) => `${d.name}\n${d.lecture_title}`)

    const sim = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.concept_id).distance((d) => d.kind === 'bridge' ? 140 : 70).strength(0.4))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collide', d3.forceCollide(30))

    sim.on('tick', () => {
      prereqSel.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
               .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      bridgeSel.attr('x1', (d) => d.source.x).attr('y1', (d) => d.source.y)
               .attr('x2', (d) => d.target.x).attr('y2', (d) => d.target.y)
      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => sim.stop()
  }, [data, dims])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-56px)]">
        <div className="flex flex-col items-center gap-3 text-tertiary">
          <div className="w-8 h-8 border-2 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <p className="text-sm">Merging your lectures into one map…</p>
        </div>
      </div>
    )
  }

  if (!data || data.nodes.length === 0) {
    return (
      <div className="max-w-lg mx-auto px-4 py-20 text-center text-tertiary">
        <p className="text-4xl mb-4">🧩</p>
        <p className="font-medium text-primary mb-2">Nothing to merge yet</p>
        <p className="text-sm">
          Once you have two or more completed lectures, LectureMap automatically
          links shared concepts across them into one unified knowledge map.
        </p>
        <Link to="/dashboard" className="inline-block mt-4 text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  const bridgeCount = data.bridges?.length || 0

  return (
    <div className="flex flex-col h-[calc(100vh-56px)]">
      <div className="px-4 py-3 border-b surface-border surface-card flex items-center gap-4 shrink-0">
        <div>
          <h1 className="text-base font-semibold text-primary">Your Knowledge Map</h1>
          <p className="text-xs text-tertiary mt-0.5">
            {data.lecture_count} lectures · {data.nodes.length} concepts ·{' '}
            {bridgeCount > 0 ? (
              <span className="text-amber-600 font-medium">{bridgeCount} shared-concept bridges</span>
            ) : (
              'no overlapping concepts yet'
            )}
          </p>
        </div>

        {/* Lecture legend */}
        <div className="ml-auto flex items-center gap-3 flex-wrap max-w-md">
          {(data.lectures || []).slice(0, 6).map((l, i) => (
            <span key={l.id} className="flex items-center gap-1.5 text-xs text-secondary">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ background: LECTURE_PALETTE[i % LECTURE_PALETTE.length] }}
              />
              <span className="truncate max-w-[100px]">{l.title}</span>
            </span>
          ))}
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative surface-bg overflow-hidden">
        <svg ref={svgRef} width={dims.width} height={dims.height} className="w-full h-full" />
        {bridgeCount > 0 && (
          <div className="absolute bottom-4 left-4 surface-card border surface-border rounded-lg px-3 py-2 text-xs text-secondary flex items-center gap-2">
            <span className="w-4 border-t-2 border-dashed border-amber-500" />
            Shared concept across lectures
          </div>
        )}
      </div>
    </div>
  )
}
