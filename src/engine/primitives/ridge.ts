import { avoidTangents, periodicBump as bump } from '../geometry'
import { lerp, smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Layer, Vec } from '../scene'
import type { Env } from '../theme'
import { mountainFaces } from './faces'
import { snowCap } from './snow'

export interface RidgeOptions {
  depth: number
  baseline: number
  amplitude: number
  frequency?: number
  peak?: number
  rim?: boolean | number
  behind?: Vec[]
  light?: Vec
  faces?: number
  peakBoost?: number
  lowers?: { x: number; width: number; amount: number }[]
  snowline?: number
  dips?: { x: number; width: number; amount: number }[]
}

const wrapX = (x: number, period: number) => x - period * Math.floor(x / period)

interface Knot {
  x: number
  y: number
  k: number
  soft: number
}

function peakProfile(rng: Rng, period: number, spacing: number) {
  const count = Math.max(2, 2 * Math.round(period / spacing))
  const step = period / count
  const high = rng.chance(0.5)
  const base: Knot[] = Array.from({ length: count }, (_, i) => ({
    x: (i + rng.range(-0.3, 0.3)) * step,
    y: (i % 2 === 0) === high ? rng.range(0.55, 1) : rng.range(0, 0.4),
    k: rng.range(0.6, 1.7),
    soft: 0.3,
  }))
  const knots: Knot[] = []
  for (let i = 0; i < count; i++) {
    const a = base[i]
    knots.push(a)
    if (i < count - 1 && rng.chance(0.3)) {
      const b = base[i + 1]
      a.soft = 0.85
      knots.push({ x: lerp(a.x, b.x, rng.range(0.35, 0.65)), y: lerp(a.y, b.y, rng.range(0.45, 0.7)), k: rng.range(0.7, 1.3), soft: 0.85 })
    }
  }
  const first = knots[0]
  const last = knots[knots.length - 1]
  const ring: Knot[] = [{ ...last, x: last.x - period }, ...knots, { ...first, x: first.x + period }]
  const start = first.x
  return (x: number) => {
    const px = start + wrapX(x - start, period)
    let k = 1
    while (k < ring.length - 2 && ring[k + 1].x < px) k++
    const a = ring[k]
    const b = ring[k + 1]
    const t = (px - a.x) / (b.x - a.x)
    return lerp(a.y, b.y, lerp(t ** a.k, smoothstep(t), a.soft))
  }
}

export function ridge(
  env: Env,
  rng: Rng,
  { depth, baseline, amplitude, frequency, peak, rim, behind, light, faces = 1, peakBoost = 0.45, lowers = [], dips = [], snowline }: RidgeOptions,
): Layer {
  const period = env.aspect
  const freq = frequency ?? lerp(2.4, 1.1, depth)
  const soft = loopNoise1D(rng.fork('soft'))
  const bumps = loopNoise1D(rng.fork('bumps'))
  const detail = loopNoise1D(rng.fork('detail'))
  const rocky = loopNoise1D(rng.fork('rocky'))
  const farCalm = lerp(1, 0.5, smoothstep((depth - 0.7) / 0.3))
  const profile = peakProfile(rng.fork('peaks'), period, lerp(0.2, 0.42, depth))
  const peakiness = smoothstep((depth - 0.15) / 0.6)
  const peakX = peak ?? rng.range(0, period)
  const peakWidth = rng.range(0.25, 0.5) * period
  const samples = Math.ceil(period * lerp(520, 260, depth))

  const xs: number[] = []
  const hs: number[] = []
  for (let i = 0; i <= samples; i++) {
    const x = lerp(-0.01, period + 0.01, i / samples)
    const mask = smoothstep((rocky(x, period, { octaves: 2, frequency: 2.2 }) - 0.45) / 0.25)
    const rolling = soft(x, period, { octaves: 3, frequency: freq }) + (bumps(x, period, { octaves: 3, frequency: freq * 4 }) - 0.5) * 0.12 * mask
    const peaks = profile(x) + (detail(x, period, { octaves: 4, frequency: freq * 4, ridged: true }) - 0.5) * 0.16 * (0.2 + 1.4 * mask) * farCalm
    let envelope = 1 - peakBoost + peakBoost * bump(x, peakX, peakWidth, period)
    for (const dip of dips) envelope *= 1 - dip.amount * bump(x, dip.x, dip.width, period)
    xs.push(x)
    hs.push(lerp(rolling, peaks, peakiness) * envelope)
  }

  const min = Math.min(...hs)
  const max = Math.max(...hs)
  const edge: Vec[] = xs.map((x, i) => [x, baseline - amplitude * ((hs[i] - min) / (max - min || 1))])
  const shift = avoidTangents(edge, behind)
  for (const p of edge) {
    p[1] += shift
    for (const low of lowers) p[1] += low.amount * bump(p[0], low.x, low.width, period)
  }

  return {
    id: `ridge@${depth.toFixed(2)}`,
    role: 'terrain',
    depth,
    rim,
    edge,
    wrap: true,
    shapes: [
      { d: polygon([[edge[0][0], 1.01], ...edge, [edge[edge.length - 1][0], 1.01]]) },
      ...(snowline !== undefined ? snowCap(env, rng.fork('snow'), edge, { depth, amplitude, snowline }) : []),
      ...(light
        ? mountainFaces(env, rng.fork('faces'), edge, {
            depth,
            baseline: baseline + shift,
            amplitude,
            light,
            strength: faces * smoothstep((depth - 0.2) / 0.35),
          })
        : []),
    ],
  }
}
