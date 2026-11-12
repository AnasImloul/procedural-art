import { mix } from '../color'
import { sampleEdge } from '../geometry'
import { lerp, smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import { solid, type Layer, type Vec } from '../scene'
import type { Env } from '../theme'
import { pine } from './pine'

export interface ForestOptions {
  on: Layer
  treeline: number
  fringe: number
  height: [number, number]
  density?: number
  tone?: number
}

export function forest(env: Env, rng: Rng, { on, treeline, fringe, height: [hMin, hMax], density = 1, tone = 0.2 }: ForestOptions): Layer {
  if (!on.edge) throw new Error(`forest: layer ${on.id} has no edge`)
  const edge = on.edge
  const period = env.aspect
  const wrap = (x: number) => x - period * Math.floor(x / period)
  const ground = (x: number) => sampleEdge(edge, wrap(x))
  const limit = loopNoise1D(rng.fork('limit'))
  const clearings = loopNoise1D(rng.fork('clearings'))
  const stature = loopNoise1D(rng.fork('stature'))
  const threshold = (1 - density) * 0.75
  const presence = (x: number) => smoothstep((clearings(x, period, { octaves: 2, frequency: 1.8 }) - threshold) / 0.4)
  const line = (x: number) => treeline + (limit(x, period, { octaves: 3, frequency: 5 }) - 0.5) * fringe * 1.4
  const clearingDrop = hMax * 2.5
  const contour = (x: number) => Math.max(ground(x), line(x)) + (1 - presence(x)) * clearingDrop
  const altitude = (y: number) => smoothstep((y - (treeline - fringe)) / (2 * fringe))
  const sizeAt = (x: number) => lerp(0.6, 1.35, stature(x, period, { octaves: 2, frequency: 5 }))

  const samples = Math.ceil(period * 260)
  const belt: Vec[] = [[-0.01, 1.01]]
  for (let i = 0; i <= samples; i++) {
    const x = lerp(-0.01, period + 0.01, i / samples)
    belt.push([x, contour(x) + hMax * 0.04])
  }
  belt.push([period + 0.01, 1.01])

  const paths = [polygon(belt)]
  const plant = (x: number, base: number, h: number, key: string) => {
    const shape = rng.fork(key)
    for (const offset of [0, -period, period]) {
      const tx = x + offset
      if (offset !== 0 && (tx < -h * 0.3 || tx > period + h * 0.3)) continue
      paths.push(pine(shape.fork('shape'), tx, base, h))
    }
  }

  let x = 0
  let n = 0
  while (x < period) {
    const top = contour(x)
    const h = rng.range(hMin, hMax) * sizeAt(x) * lerp(0.55, 1, altitude(top))
    if (rng.next() < presence(x)) plant(x, top + h * 0.15, h, `tree-${n++}`)
    x += h * rng.range(0.18, 0.32)
  }

  const scattered = Math.round(period * 90 * density)
  for (let k = 0; k < scattered; k++) {
    const r = rng.fork(`scatter-${k}`)
    const sx = r.range(0, period)
    const floor = Math.max(ground(sx), line(sx))
    const ceiling = Math.max(ground(sx) + hMin, treeline - fringe)
    if (ceiling >= floor) continue
    const y = lerp(floor, ceiling, r.next() ** 1.6)
    const fade = altitude(y)
    if (r.next() > fade ** 1.2 * presence(sx)) continue
    plant(sx, y + hMin * 0.1, r.range(hMin, hMax) * lerp(0.35, 0.8, fade), `scatter-tree-${k}`)
  }

  const { ink, skyTop } = env.palette.anchors
  const fill = solid(mix(env.palette.atDepth(on.depth), mix(ink, skyTop, 0.2), tone))
  return { id: `forest@${on.depth.toFixed(2)}`, role: 'terrain', depth: on.depth, wrap: true, shapes: [{ d: paths.join(''), fill }] }
}
