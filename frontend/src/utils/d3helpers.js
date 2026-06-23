import * as d3 from 'd3'

export const DIFFICULTY_COLORS = {
  beginner: '#4ade80',
  intermediate: '#60a5fa',
  advanced: '#f472b6',
}

export const DIFFICULTY_RADIUS = {
  beginner: 20,
  intermediate: 28,
  advanced: 36,
}

export function createSimulation(nodes, links, width, height) {
  return d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.concept_id)
        .distance(80)
        .strength(0.5)
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(width / 2, height / 2))
    .force('collision', d3.forceCollide().radius(40))
}

export function createArrowMarker(defs, id = 'arrowhead', color = '#94a3b8') {
  defs
    .append('marker')
    .attr('id', id)
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 20)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', color)
    .attr('opacity', 0.7)
}

export function createGapArrowMarker(defs) {
  defs
    .append('marker')
    .attr('id', 'arrowhead-gap')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 24)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
    .append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', '#ef4444')
    .attr('opacity', 0.8)
}

export function truncateLabel(name, maxLen = 15) {
  return name.length > maxLen ? name.slice(0, maxLen - 1) + '…' : name
}

export function getNodeColor(difficulty, isGap, isVisited) {
  if (isGap) return '#ef4444'
  return DIFFICULTY_COLORS[difficulty] || DIFFICULTY_COLORS.intermediate
}

export function getNodeRadius(difficulty) {
  return DIFFICULTY_RADIUS[difficulty] || DIFFICULTY_RADIUS.intermediate
}

export function linkStrokeWidth(strength) {
  return 1 + Math.round(strength * 3)
}

/**
 * Topologically sort nodes by their prerequisite edges so the result reads
 * as "the order you'd actually want to learn these in" — prerequisites
 * before what depends on them. Falls back to a difficulty-tier sort for
 * any nodes left out of the topo order (disconnected nodes, or a cycle
 * the backend's DAG validation didn't fully prune).
 * Used by the "Aha Path" animated flythrough.
 */
export function topologicalLearningOrder(nodes, edges) {
  const ids = nodes.map((n) => n.concept_id)
  const idSet = new Set(ids)
  const inDegree = new Map(ids.map((id) => [id, 0]))
  const adjacency = new Map(ids.map((id) => [id, []]))

  edges.forEach((e) => {
    const from = e.from || e.source
    const to = e.to || e.target
    if (!idSet.has(from) || !idSet.has(to)) return
    adjacency.get(from).push(to)
    inDegree.set(to, (inDegree.get(to) || 0) + 1)
  })

  const difficultyRank = { beginner: 0, intermediate: 1, advanced: 2 }
  const byId = new Map(nodes.map((n) => [n.concept_id, n]))

  // Stable priority queue: among nodes with in-degree 0, prefer lower
  // difficulty first so the flythrough still "feels" like it's building
  // up from fundamentals even across independent subgraphs.
  const ready = ids.filter((id) => inDegree.get(id) === 0)
  ready.sort((a, b) => (difficultyRank[byId.get(a)?.difficulty] ?? 1) - (difficultyRank[byId.get(b)?.difficulty] ?? 1))

  const order = []
  const visited = new Set()

  while (ready.length > 0) {
    const id = ready.shift()
    if (visited.has(id)) continue
    visited.add(id)
    order.push(id)

    const neighbors = adjacency.get(id) || []
    const newlyReady = []
    neighbors.forEach((n) => {
      inDegree.set(n, inDegree.get(n) - 1)
      if (inDegree.get(n) === 0) newlyReady.push(n)
    })
    newlyReady.sort((a, b) => (difficultyRank[byId.get(a)?.difficulty] ?? 1) - (difficultyRank[byId.get(b)?.difficulty] ?? 1))
    ready.push(...newlyReady)
    ready.sort((a, b) => (difficultyRank[byId.get(a)?.difficulty] ?? 1) - (difficultyRank[byId.get(b)?.difficulty] ?? 1))
  }

  // Anything left (cycle remnants) — append sorted by difficulty
  const remaining = ids.filter((id) => !visited.has(id))
  remaining.sort((a, b) => (difficultyRank[byId.get(a)?.difficulty] ?? 1) - (difficultyRank[byId.get(b)?.difficulty] ?? 1))
  order.push(...remaining)

  return order.map((id) => byId.get(id)).filter(Boolean)
}
