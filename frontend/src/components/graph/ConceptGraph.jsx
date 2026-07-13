import { useRef, useEffect, useState, useCallback } from 'react'
import * as d3 from 'd3'
import {
  createSimulation,
  createArrowMarker,
  createGapArrowMarker,
  truncateLabel,
  getNodeColor,
  getNodeRadius,
  linkStrokeWidth,
  topologicalLearningOrder,
  DIFFICULTY_COLORS,
} from '../../utils/d3helpers'
import useStore from '../../store/useStore'

// Reads the live --text-secondary / --surface-card CSS var so D3-drawn SVG
// text and tooltip fills follow the active CSS variables without a full re-render
// wiring scheme — cheap to call, only invoked on (re)build of the graph.
function cssVar(name, fallback) {
  if (typeof window === 'undefined') return fallback
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

export default function ConceptGraph({ data, onNodeSelect, lectureId }) {
  const svgRef = useRef(null)
  const simulationRef = useRef(null)
  const containerRef = useRef(null)
  const nodeSelRef = useRef(null)
  const ahaTimeoutRef = useRef(null)
  const [dims, setDims] = useState({ width: 800, height: 600 })
  const [filterDiff, setFilterDiff] = useState('all')
  const [gapCount, setGapCount] = useState(0)
  const [ahaPlaying, setAhaPlaying] = useState(false)
  const [ahaIndex, setAhaIndex] = useState(-1)
  const [ahaOrder, setAhaOrder] = useState([])
  const { visitedNodes, gapNodes } = useStore()

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setDims({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    ro.observe(containerRef.current)
    return () => ro.disconnect()
  }, [])

  const fitToScreen = useCallback(() => {
    if (!svgRef.current) return
    const svg = d3.select(svgRef.current)
    svg.transition().duration(600).call(
      d3.zoom().transform,
      d3.zoomIdentity
    )
  }, [])

  // ── "Aha Path" flythrough ─────────────────────────────────────────────
  // Walks the graph in topological (prerequisite-first) order, panning the
  // camera to each node in sequence and briefly highlighting it. This is
  // the single most distinctive feature in the app: it turns a static
  // dependency diagram into a guided "here's the order you'd actually
  // learn this in" tour — something no flashcard app or note tool offers.
  const stopAhaPath = useCallback(() => {
    setAhaPlaying(false)
    setAhaIndex(-1)
    if (ahaTimeoutRef.current) {
      clearTimeout(ahaTimeoutRef.current)
      ahaTimeoutRef.current = null
    }
    if (nodeSelRef.current) {
      nodeSelRef.current.select('.aha-ring').remove()
    }
  }, [])

  const playAhaPath = useCallback(() => {
    if (!data || !svgRef.current || ahaOrder.length === 0) return
    setAhaPlaying(true)

    const svg = d3.select(svgRef.current)
    const zoom = d3.zoom().scaleExtent([0.3, 3]).on('zoom', (event) => {
      svg.select('.zoom-layer').attr('transform', event.transform)
    })

    let i = 0
    const step = () => {
      if (i >= ahaOrder.length) {
        stopAhaPath()
        return
      }
      const target = ahaOrder[i]
      setAhaIndex(i)

      if (target.x != null && target.y != null) {
        const scale = 1.4
        const tx = dims.width / 2 - target.x * scale
        const ty = dims.height / 2 - target.y * scale
        svg.transition().duration(700).ease(d3.easeCubicInOut).call(
          zoom.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale)
        )
      }

      // Pulse ring on the active node
      if (nodeSelRef.current) {
        nodeSelRef.current.select('.aha-ring').remove()
        nodeSelRef.current
          .filter((d) => d.concept_id === target.concept_id)
          .append('circle')
          .attr('class', 'aha-ring')
          .attr('r', getNodeRadius(target.difficulty) + 6)
          .attr('fill', 'none')
          .attr('stroke', '#4f46e5')
          .attr('stroke-width', 3)
          .attr('opacity', 0)
          .transition().duration(250)
          .attr('opacity', 1)
          .transition().delay(900).duration(400)
          .attr('opacity', 0)
      }

      i += 1
      ahaTimeoutRef.current = setTimeout(step, 1500)
    }
    step()
  }, [data, ahaOrder, dims, stopAhaPath])

  useEffect(() => () => { if (ahaTimeoutRef.current) clearTimeout(ahaTimeoutRef.current) }, [])

  useEffect(() => {
    if (!data || !svgRef.current) return

    const { nodes: rawNodes, edges: rawEdges } = data
    const { width, height } = dims

    // Filter nodes by difficulty
    const nodes = filterDiff === 'all'
      ? rawNodes.map((n) => ({ ...n }))
      : rawNodes.filter((n) => n.difficulty === filterDiff).map((n) => ({ ...n }))

    const nodeIds = new Set(nodes.map((n) => n.concept_id))
    const links = rawEdges
      .filter((e) => nodeIds.has(e.from || e.source) && nodeIds.has(e.to || e.target))
      .map((e) => ({
        source: e.from || e.source,
        target: e.to || e.target,
        strength: e.strength || 0.5,
        isGap: gapNodes.has(e.from || e.source),
      }))

    // Count gap nodes
    const gaps = nodes.filter((n) => gapNodes.has(n.concept_id))
    setGapCount(gaps.length)

    // Compute the prerequisite-first learning order for the Aha Path
    setAhaOrder(topologicalLearningOrder(nodes, rawEdges))

    // Theme-aware colors read once per (re)build
    const labelColor = cssVar('--text-secondary', '#475569')
    const tooltipBg = cssVar('--surface-card', '#ffffff')
    const tooltipTitle = cssVar('--text-primary', '#0f172a')
    const tooltipBody = cssVar('--text-tertiary', '#94a3b8')
    const tooltipBorder = cssVar('--surface-border', '#e2e8f0')
    const linkColor = '#94a3b8'

    // Clear previous
    const svg = d3.select(svgRef.current)
    svg.selectAll('*').remove()

    // Zoom behavior — wraps content in a dedicated .zoom-layer group so
    // the Aha Path flythrough can drive the same transform via d3.zoom.transform
    const zoomLayer = svg.append('g').attr('class', 'zoom-layer')
    const zoom = d3.zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => {
        zoomLayer.attr('transform', event.transform)
      })
    svg.call(zoom)

    // Arrow markers
    const defs = svg.append('defs')
    createArrowMarker(defs, 'arrowhead', linkColor)
    createGapArrowMarker(defs)

    // Glow filter for gaps
    const filter = defs.append('filter').attr('id', 'glow')
    filter.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'coloredBlur')
    const feMerge = filter.append('feMerge')
    feMerge.append('feMergeNode').attr('in', 'coloredBlur')
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

    const g = zoomLayer

    // ── Links ──────────────────────────────────────────────────────────────
    const link = g.append('g').attr('class', 'links')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', (d) => d.isGap ? '#ef4444' : linkColor)
      .attr('stroke-width', (d) => linkStrokeWidth(d.strength))
      .attr('stroke-opacity', (d) => d.isGap ? 0.8 : 0.5)
      .attr('marker-end', (d) => d.isGap ? 'url(#arrowhead-gap)' : 'url(#arrowhead)')

    // ── Node groups ────────────────────────────────────────────────────────
    const node = g.append('g').attr('class', 'nodes')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .attr('tabindex', 0)
      .attr('role', 'button')
      .attr('aria-label', (d) => `${d.name} (${d.difficulty})`)
      .call(
        d3.drag()
          .on('start', (event, d) => {
            if (!event.active) simulationRef.current.alphaTarget(0.3).restart()
            d.fx = d.x
            d.fy = d.y
          })
          .on('drag', (event, d) => {
            d.fx = event.x
            d.fy = event.y
          })
          .on('end', (event, d) => {
            if (!event.active) simulationRef.current.alphaTarget(0)
            d.fx = null
            d.fy = null
          })
      )
      .on('click', (event, d) => {
        event.stopPropagation()
        onNodeSelect && onNodeSelect(d)
      })
      .on('keydown', (event, d) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          onNodeSelect && onNodeSelect(d)
        }
      })

    nodeSelRef.current = node

    // Outer pulsing ring for gap nodes
    node.filter((d) => gapNodes.has(d.concept_id))
      .append('circle')
      .attr('r', (d) => getNodeRadius(d.difficulty) + 8)
      .attr('fill', 'none')
      .attr('stroke', '#ef4444')
      .attr('stroke-width', 2)
      .attr('stroke-opacity', 0.6)
      .attr('class', 'gap-ring')
      .style('animation', 'pulseRing 2s ease infinite')

    // Main circle
    node.append('circle')
      .attr('r', (d) => getNodeRadius(d.difficulty))
      .attr('fill', (d) => getNodeColor(d.difficulty, gapNodes.has(d.concept_id), visitedNodes.has(d.concept_id)))
      .attr('fill-opacity', (d) => visitedNodes.has(d.concept_id) ? 1.0 : 0.75)
      .attr('stroke', (d) => gapNodes.has(d.concept_id) ? '#dc2626' : '#fff')
      .attr('stroke-width', (d) => gapNodes.has(d.concept_id) ? 2.5 : 1.5)
      .attr('filter', (d) => gapNodes.has(d.concept_id) ? 'url(#glow)' : null)

    // Visited checkmark
    node.filter((d) => visitedNodes.has(d.concept_id))
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', '12px')
      .attr('fill', '#fff')
      .attr('pointer-events', 'none')
      .text('✓')

    // Label below node
    node.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', (d) => getNodeRadius(d.difficulty) + 14)
      .attr('font-size', '11px')
      .attr('fill', labelColor)
      .attr('pointer-events', 'none')
      .attr('font-weight', '500')
      .text((d) => truncateLabel(d.name))

    // Tooltip group
    const tooltip = svg.append('g')
      .attr('class', 'tooltip')
      .attr('display', 'none')
      .attr('pointer-events', 'none')

    const tooltipRect = tooltip.append('rect')
      .attr('fill', tooltipBg)
      .attr('stroke', tooltipBorder)
      .attr('stroke-width', 1)
      .attr('rx', 6)
      .attr('ry', 6)
      .attr('opacity', 0.97)

    const tooltipName = tooltip.append('text')
      .attr('x', 10).attr('y', 18)
      .attr('font-size', '12px')
      .attr('font-weight', '600')
      .attr('fill', tooltipTitle)

    const tooltipDef = tooltip.append('text')
      .attr('x', 10).attr('y', 34)
      .attr('font-size', '10px')
      .attr('fill', tooltipBody)

    node
      .on('mouseenter focus', function (event, d) {
        const [mx, my] = d3.pointer(event, svg.node())
        const defText = d.definition
          ? d.definition.slice(0, 60) + (d.definition.length > 60 ? '…' : '')
          : ''
        tooltipName.text(d.name)
        tooltipDef.text(defText)
        const tw = Math.max(tooltipName.node().getComputedTextLength(), tooltipDef.node().getComputedTextLength()) + 20
        tooltipRect.attr('width', tw).attr('height', 46)
        tooltip
          .attr('display', null)
          .attr('transform', `translate(${mx + 12},${my - 28})`)
      })
      .on('mouseleave blur', () => tooltip.attr('display', 'none'))

    // ── Simulation ─────────────────────────────────────────────────────────
    const simulation = createSimulation(nodes, links, width, height)
    simulationRef.current = simulation

    simulation.on('tick', () => {
      link
        .attr('x1', (d) => d.source.x)
        .attr('y1', (d) => d.source.y)
        .attr('x2', (d) => d.target.x)
        .attr('y2', (d) => d.target.y)

      node.attr('transform', (d) => `translate(${d.x},${d.y})`)
    })

    return () => {
      simulation.stop()
      stopAhaPath()
    }
  }, [data, dims, filterDiff, visitedNodes, gapNodes])

  const diffCounts = {
    all: data?.nodes?.length || 0,
    beginner: data?.nodes?.filter((n) => n.difficulty === 'beginner').length || 0,
    intermediate: data?.nodes?.filter((n) => n.difficulty === 'intermediate').length || 0,
    advanced: data?.nodes?.filter((n) => n.difficulty === 'advanced').length || 0,
  }

  return (
    <div className="flex flex-col h-full">
      {/* Controls bar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b surface-border surface-card flex-wrap transition-colors">
        {/* Gap banner */}
        {gapCount > 0 && (
          <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 text-xs px-2.5 py-1 rounded-full font-medium">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            {gapCount} knowledge gap{gapCount !== 1 ? 's' : ''} detected
          </div>
        )}

        {/* Aha Path flythrough */}
        {ahaOrder.length > 1 && (
          ahaPlaying ? (
            <button
              onClick={stopAhaPath}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium bg-brand-600 text-white transition-all"
            >
              <span className="w-1.5 h-1.5 bg-white rounded-sm" />
              Stop tour ({ahaIndex + 1}/{ahaOrder.length})
            </button>
          ) : (
            <button
              onClick={playAhaPath}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium border surface-border text-secondary hover:border-brand-300 transition-all"
              title="Animated flythrough in prerequisite-first learning order"
            >
              ▶ Aha Path
            </button>
          )
        )}

        {/* Difficulty filter */}
        <div className="flex items-center gap-1 ml-auto">
          {['all', 'beginner', 'intermediate', 'advanced'].map((d) => (
            <button
              key={d}
              onClick={() => setFilterDiff(d)}
              className={`text-xs px-2.5 py-1 rounded-full transition-all ${
                filterDiff === d
                  ? 'bg-brand-600 text-white'
                  : 'surface-card border surface-border text-secondary hover:border-brand-300'
              }`}
            >
              {d === 'all' ? `All (${diffCounts.all})` : `${d[0].toUpperCase() + d.slice(1)} (${diffCounts[d]})`}
            </button>
          ))}
        </div>

        {/* Legend */}
        <div className="hidden lg:flex items-center gap-3 text-xs text-secondary">
          {Object.entries(DIFFICULTY_COLORS).map(([key, color]) => (
            <span key={key} className="flex items-center gap-1">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: color }} />
              {key}
            </span>
          ))}
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-full inline-block bg-red-400" />
            gap
          </span>
        </div>

        {/* Stats */}
        <span className="text-xs text-tertiary">
          {data?.nodes?.length || 0} nodes · {data?.edges?.length || 0} edges
        </span>

        {/* Fit to screen */}
        <button
          onClick={fitToScreen}
          className="text-xs px-2.5 py-1 surface-card border surface-border rounded text-secondary hover:border-brand-300 transition-colors"
        >
          Fit ↗
        </button>
      </div>

      {/* Active Aha Path node banner */}
      {ahaPlaying && ahaIndex >= 0 && ahaOrder[ahaIndex] && (
        <div className="px-4 py-2 bg-brand-50 border-b border-brand-100 flex items-center gap-2 animate-fade-in">
          <span className="text-xs font-semibold text-brand-700">
            {ahaIndex + 1}. {ahaOrder[ahaIndex].name}
          </span>
          <span className="text-xs text-brand-500">
            {ahaOrder[ahaIndex].definition?.slice(0, 80)}
          </span>
        </div>
      )}

      {/* Graph canvas */}
      <div ref={containerRef} className="flex-1 relative overflow-hidden surface-bg transition-colors">
        <style>{`
          @keyframes pulseRing {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          .gap-ring { transform-origin: center; transform-box: fill-box; }
        `}</style>
        <svg
          ref={svgRef}
          width={dims.width}
          height={dims.height}
          className="w-full h-full"
        />
        {(!data || data.nodes?.length === 0) && (
          <div className="absolute inset-0 flex items-center justify-center text-tertiary text-sm">
            No graph data yet
          </div>
        )}
      </div>
    </div>
  )
}
