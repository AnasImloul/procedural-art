import { sampleEdge } from './geometry'
import { clamp } from './math'
import type { Layer, Scene } from './scene'

export interface QualityRules {
  skyline?: [number, number]
  sunVisible?: number
  layerVisible?: number
}

export interface QualityReport {
  score: number
  issues: string[]
}

const DEFAULT_RULES: Required<QualityRules> = { skyline: [0.22, 0.5], sunVisible: 0.45, layerVisible: 0.2 }

export function assessComposition(scene: Scene, rules: QualityRules = {}): QualityReport {
  const { skyline: [top, bottom], sunVisible, layerVisible } = { ...DEFAULT_RULES, ...rules }
  const terrain = scene.layers.filter((l): l is Layer & { edge: NonNullable<Layer['edge']> } => l.role === 'terrain' && !!l.edge)
  if (!terrain.length) return { score: 0, issues: [] }

  const xs = Array.from({ length: Math.ceil(scene.aspect / 0.01) + 1 }, (_, i) => Math.min(scene.aspect, i * 0.01))
  const heights = terrain.map((l) => xs.map((x) => sampleEdge(l.edge, x)))
  const skyline = xs.map((_, i) => Math.min(...heights.map((h) => h[i])))
  const issues: string[] = []
  let score = 0

  const highest = Math.min(...skyline)
  if (highest < top || highest > bottom) {
    score += Math.abs(highest < top ? top - highest : highest - bottom) * 10
    issues.push(`skyline peak at ${highest.toFixed(2)}, expected ${top} to ${bottom}`)
  }

  const sun = scene.layers.find((l) => l.light && l.lightRadius)
  if (sun?.light && sun.lightRadius) {
    const [sx, sy] = sun.anchor ?? sun.light
    const r = sun.lightRadius
    const sky = Math.min(...terrain.map((l) => sampleEdge(l.edge, sx)))
    const visible = clamp((sky - (sy - r)) / (2 * r))
    if (visible < sunVisible) {
      score += (sunVisible - visible) * 4
      issues.push(`sun ${Math.round(visible * 100)}% visible`)
    }
  }

  for (let k = 0; k < terrain.length - 1; k++) {
    let shown = 0
    for (let i = 0; i < xs.length; i++) {
      let nearest = Infinity
      for (let n = k + 1; n < terrain.length; n++) if (terrain[n].depth < terrain[k].depth) nearest = Math.min(nearest, heights[n][i])
      if (heights[k][i] < nearest - 0.006) shown++
    }
    const fraction = shown / xs.length
    if (fraction < layerVisible) {
      score += (layerVisible - fraction) * 3
      issues.push(`${terrain[k].id} only ${Math.round(fraction * 100)}% visible`)
    }
  }
  return { score, issues }
}
