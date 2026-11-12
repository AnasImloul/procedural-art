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
  height: [number, number]
  density?: number
  tone?: number
  clearing?: number
}

export function forest(env: Env, rng: Rng, { on, treeline, height: [hMin, hMax], density = 1, tone = 0.2, clearing = 0.2 }: ForestOptions): Layer {
  if (!on.edge) throw new Error(`forest: layer ${on.id} has no edge`)
  const edge = on.edge
  const period = env.aspect
  const wrap = (x: number) => x - period * Math.floor(x / period)
  const limit = loopNoise1D(rng.fork('limit'))
  const clearings = loopNoise1D(rng.fork('clearings'))
  const stature = loopNoise1D(rng.fork('stature'))
  const presence = (x: number) => density * smoothstep((clearings(x, period, { octaves: 2, frequency: 1.6 }) - clearing) / 0.3)
  const crown = (x: number) => {
    const ground = sampleEdge(edge, wrap(x))
    const line = treeline + (limit(x, period, { octaves: 3, frequency: 4 }) - 0.5) * hMax * 7
    return Math.max(ground, line) + (1 - Math.min(1, presence(x))) * hMax * 2
  }

  const samples = Math.ceil(period * 260)
  const belt: Vec[] = [[-0.01, 1.01]]
  for (let i = 0; i <= samples; i++) {
    const x = lerp(-0.01, period + 0.01, i / samples)
    belt.push([x, crown(x) + hMax * 0.04])
  }
  belt.push([period + 0.01, 1.01])

  const paths = [polygon(belt)]
  let x = 0
  while (x < period) {
    const h = rng.range(hMin, hMax) * lerp(0.6, 1.35, stature(x, period, { octaves: 2, frequency: 5 }))
    if (rng.next() < presence(x)) {
      const shape = rng.fork(`tree-${paths.length}`)
      const base = crown(x) + h * 0.15
      for (const offset of [0, -period, period]) {
        const tx = x + offset
        if (offset !== 0 && (tx < -h * 0.3 || tx > period + h * 0.3)) continue
        paths.push(pine(shape.fork('shape'), tx, base, h))
      }
    }
    x += h * rng.range(0.18, 0.32)
  }

  const { ink, skyTop } = env.palette.anchors
  const fill = solid(mix(env.palette.atDepth(on.depth), mix(ink, skyTop, 0.2), tone))
  return { id: `forest@${on.depth.toFixed(2)}`, role: 'terrain', depth: on.depth, wrap: true, shapes: [{ d: paths.join(''), fill }] }
}
