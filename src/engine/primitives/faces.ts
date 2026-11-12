import { mix, withAlpha, type Color } from '../color'
import { sampleEdge } from '../geometry'
import { lerp } from '../math'
import { MOOD_LIGHT } from '../moods'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface FacesOptions {
  depth: number
  baseline: number
  amplitude: number
  light: Vec
  strength?: number
  maxPeaks?: number
}

export function mountainFaces(env: Env, rng: Rng, edge: Vec[], { depth, baseline, amplitude, light, strength = 1, maxPeaks = 3 }: FacesOptions): Shape[] {
  if (strength <= 0) return []
  const period = env.aspect
  const yAt = (x: number) => sampleEdge(edge, x - period * Math.floor(x / period))
  const step = edge[1][0] - edge[0][0]
  const xs: number[] = []
  for (let x = -period * 0.5; x <= period * 1.5; x += step) xs.push(x)
  const ys = xs.map(yAt)
  const win = Math.max(3, Math.round(0.05 / step))
  const highEnough = baseline - amplitude * 0.35

  const peaks: number[] = []
  for (let i = win; i < xs.length - win; i++) {
    if (xs[i] < 0 || xs[i] >= period || ys[i] > highEnough) continue
    let isPeak = true
    for (let k = i - win; k <= i + win && isPeak; k++) if (ys[k] < ys[i]) isPeak = false
    if (isPeak && (!peaks.length || i - peaks[peaks.length - 1] > win)) peaks.push(i)
  }

  const base = env.palette.atDepth(depth)
  const { ink, skyTop, light: lightColor } = env.palette.anchors
  const shadowColor = mix(base, mix(ink, skyTop, 0.35), lerp(0.42, 0.14, depth) * strength)
  const litColor = withAlpha(lightColor, lerp(0.1, 0.04, depth) * strength * MOOD_LIGHT[env.palette.mood].lit)
  const bottom = baseline + amplitude * 0.3
  const maxReach = Math.max(0.12, amplitude * 2.2)
  const shapes: Shape[] = []

  const valleyFrom = (i: number, dir: 1 | -1) => {
    let valley = i
    for (let j = i + dir; j > 0 && j < xs.length - 1 && Math.abs(xs[j] - xs[i]) < maxReach; j += dir) {
      if (ys[j] < ys[i]) break
      if (ys[j] > ys[valley]) valley = j
    }
    return valley
  }

  const push = (outline: Vec[], fill: Shape['fill']) => {
    const minX = Math.min(...outline.map(([x]) => x))
    const maxX = Math.max(...outline.map(([x]) => x))
    for (const offset of [0, -period, period]) {
      if (minX + offset > period + 0.01 || maxX + offset < -0.01) continue
      shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill })
    }
  }

  const candidates = peaks
    .map((i) => {
      const shadowDir: 1 | -1 = light[0] < xs[i] ? 1 : -1
      const shadowValley = valleyFrom(i, shadowDir)
      const litValley = valleyFrom(i, (-shadowDir) as 1 | -1)
      return { i, shadowDir, shadowValley, litValley, drop: Math.min(ys[shadowValley], ys[litValley]) - ys[i] }
    })
    .filter((c) => c.drop >= amplitude * 0.25)
    .sort((a, b) => b.drop - a.drop)
    .slice(0, maxPeaks)

  for (const { i, shadowDir, shadowValley, litValley } of candidates) {
    const r = rng.fork(`peak-${Math.round(xs[i] * 1000)}`)
    const span = Math.abs(xs[shadowValley] - xs[i])
    const peak: Vec = [xs[i], ys[i]]
    const foot: Vec = [xs[i] + shadowDir * span * r.range(0.08, 0.4), bottom]
    const crease: Vec[] = [peak]
    const segments = 4
    for (let s = 1; s < segments; s++) {
      const t = s / segments
      const x = lerp(peak[0], foot[0], t) + r.range(-0.08, 0.08) * span
      crease.push([x, Math.max(lerp(peak[1], foot[1], t ** 0.85), yAt(x) + amplitude * 0.04)])
    }
    crease.push(foot)

    const slope = (from: number, to: number) => {
      const points: Vec[] = []
      const dir = to > from ? 1 : -1
      for (let j = from; j !== to + dir; j += dir) points.push([xs[j], ys[j]])
      return points
    }
    const fade = (color: Color): Shape['fill'] => ({
      type: 'linear',
      from: [0, peak[1]],
      to: [0, bottom],
      stops: [
        [0, color],
        [0.6, withAlpha(color, (color.a ?? 1) * 0.8)],
        [1, withAlpha(color, (color.a ?? 1) * 0.25)],
      ],
    })
    push([...crease, ...slope(shadowValley, i)], fade(shadowColor))
    push([...crease, ...slope(litValley, i)], fade(litColor))
  }
  return shapes
}
