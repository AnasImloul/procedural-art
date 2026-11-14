import { mix, withAlpha } from '../color'
import { avoidTangents, periodicBump } from '../geometry'
import { lerp, smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Layer, Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface DunesOptions {
  depth: number
  baseline: number
  amplitude: number
  spacing: number
  wind: 1 | -1
  shade?: number
  rim?: boolean | number
  behind?: Vec[]
  peak?: number
  peakBoost?: number
  dips?: { x: number; width: number; amount: number }[]
}

interface Knot {
  u: number
  h: number
  crest: boolean
}

export function dunes(
  env: Env,
  rng: Rng,
  { depth, baseline, amplitude, spacing, wind, shade = 0.22, rim, behind, peak, peakBoost = 0.3, dips = [] }: DunesOptions,
): Layer {
  const period = env.aspect
  const count = Math.max(1, Math.round(period / spacing))
  const weights = Array.from({ length: count }, () => rng.range(0.6, 1.5))
  const total = weights.reduce((a, b) => a + b, 0)
  const phase = rng.range(0, period / count)
  const knots: Knot[] = []
  let u = phase
  for (let i = 0; i < count; i++) {
    const width = (period * weights[i]) / total
    knots.push({ u, h: rng.range(0, 0.25), crest: false })
    knots.push({ u: u + width * rng.range(0.62, 0.78), h: rng.range(0.55, 1), crest: true })
    u += width
  }
  const peakX = peak ?? rng.range(0, period)
  const peakWidth = rng.range(0.25, 0.45) * period
  const envelope = (x: number) => {
    let e = 1 - peakBoost + peakBoost * periodicBump(x, peakX, peakWidth, period)
    for (const dip of dips) e *= 1 - dip.amount * periodicBump(x, dip.x, dip.width, period)
    return e
  }
  const ring: Knot[] = [
    { ...knots[knots.length - 1], u: knots[knots.length - 1].u - period },
    ...knots,
    { ...knots[0], u: knots[0].u + period },
    { ...knots[1], u: knots[1].u + period },
  ]

  const ripple = loopNoise1D(rng.fork('ripple'))
  const heightAt = (u: number) => {
    let uu = u - period * Math.floor((u - ring[1].u) / period)
    if (uu < ring[0].u) uu += period
    let k = 0
    while (k < ring.length - 2 && ring[k + 1].u < uu) k++
    const a = ring[k]
    const b = ring[k + 1]
    const t = (uu - a.u) / (b.u - a.u)
    const e = b.crest ? lerp(t, smoothstep(t), 0.6) : 1 - (1 - t) ** 2.2
    return lerp(a.h, b.h, e) + (ripple(u, period, { octaves: 2, frequency: 5 }) - 0.5) * 0.015
  }
  const toX = (u: number) => (wind === 1 ? u : period - u)
  const toU = (x: number) => (wind === 1 ? x : period - x)

  const samples = Math.ceil(period * lerp(420, 220, depth))
  const edge: Vec[] = []
  for (let i = 0; i <= samples; i++) {
    const x = lerp(-0.01, period + 0.01, i / samples)
    edge.push([x, baseline - amplitude * heightAt(toU(x)) * envelope(x)])
  }
  const shift = avoidTangents(edge, behind)
  for (const p of edge) p[1] += shift
  const yAt = (u: number) => baseline + shift - amplitude * heightAt(u) * envelope(toX(u))

  const base = env.palette.atDepth(depth)
  const top = baseline + shift - amplitude
  const shapes: Shape[] = [
    {
      d: polygon([[edge[0][0], 1.01], ...edge, [edge[edge.length - 1][0], 1.01]]),
      fill: {
        type: 'linear',
        from: [0, top],
        to: [0, baseline + shift + amplitude * 0.6],
        stops: [
          [0, mix(base, env.palette.anchors.light, shade)],
          [0.55, base],
          [1, mix(base, env.palette.anchors.ink, shade * 0.5)],
        ],
      },
    },
  ]

  const ink = env.palette.anchors.ink
  const shadowAlpha = 0.26 * (1 - depth * 0.6)
  for (let i = 1; i < knots.length; i += 2) {
    const crestU = knots[i].u
    const troughU = i + 1 < knots.length ? knots[i + 1].u : knots[0].u + period
    const steps = 24
    const lee: Vec[] = Array.from({ length: steps + 1 }, (_, s) => {
      const u = lerp(crestU, troughU, s / steps)
      return [toX(u), yAt(u)]
    })
    const crest = lee[0]
    const trough = lee[steps]
    const bottom = trough[1] + amplitude * 0.7
    const outline: Vec[] = [...lee, [trough[0], bottom], [lerp(crest[0], trough[0], 0.12), bottom]]
    const fill: Shape['fill'] = {
      type: 'linear',
      from: [0, crest[1]],
      to: [0, bottom],
      stops: [
        [0, withAlpha(ink, shadowAlpha)],
        [0.6, withAlpha(ink, shadowAlpha * 0.6)],
        [1, withAlpha(ink, 0)],
      ],
    }
    const xs = outline.map(([x]) => x)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    for (const offset of [0, -period, period]) {
      if (minX + offset > period || maxX + offset < 0) continue
      shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill })
    }
  }

  return { id: `dunes@${depth.toFixed(2)}`, role: 'terrain', depth, rim, edge, wrap: true, shapes }
}
