import type { Vec } from './scene'

export function sampleEdge(edge: Vec[], x: number): number {
  if (x <= edge[0][0]) return edge[0][1]
  const last = edge[edge.length - 1]
  if (x >= last[0]) return last[1]
  let lo = 0
  let hi = edge.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (edge[mid][0] <= x) lo = mid
    else hi = mid
  }
  const [x0, y0] = edge[lo]
  const [x1, y1] = edge[hi]
  return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0)
}

export function tangentScore(edge: Vec[], behind: Vec[], threshold = 0.01): number {
  let score = 0
  for (let i = 1; i < edge.length - 1; i++) {
    const y = edge[i][1]
    if (y > edge[i - 1][1] || y > edge[i + 1][1]) continue
    if (Math.abs(y - sampleEdge(behind, edge[i][0])) < threshold) score++
  }
  return score
}

export function avoidTangents(edge: Vec[], behind: Vec[] | undefined, steps = [0, 0.012, -0.012, 0.024, -0.024]): number {
  if (!behind) return 0
  let best = steps[0]
  let bestScore = Infinity
  for (const dy of steps) {
    const score = tangentScore(
      edge.map(([x, y]) => [x, y + dy]),
      behind,
    )
    if (score < bestScore) {
      best = dy
      bestScore = score
    }
  }
  return best
}

export function periodicBump(x: number, center: number, width: number, period: number): number {
  const dx = x - center - period * Math.round((x - center) / period)
  return Math.exp(-((dx / width) ** 2))
}
