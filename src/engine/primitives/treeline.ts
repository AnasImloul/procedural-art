import type { Side } from '../compose'
import { sampleEdge } from '../geometry'
import { lerp, smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import type { Rng } from '../rng'
import type { Layer } from '../scene'
import type { Env } from '../theme'
import { pine } from './pine'

export interface TreelineOptions {
  on: Layer
  height: [number, number]
  density: number
  side?: Side
  reach?: number
}

export function treeline(env: Env, rng: Rng, { on, height: [hMin, hMax], density, side, reach = 0.3 }: TreelineOptions): Layer {
  if (!on.edge) throw new Error(`treeline: layer ${on.id} has no edge`)
  const edge = on.edge
  const period = env.aspect
  const cluster = loopNoise1D(rng.fork('cluster'))
  const paths: string[] = []

  let x = 0
  while (x < period) {
    const fromSide = side === 'left' ? x / period : side === 'right' ? 1 - x / period : 0
    const sideFalloff = side ? 1 - smoothstep(fromSide / reach) : 1
    const scale = side ? lerp(1, 0.45, Math.min(1, fromSide / reach)) : 1
    const h = rng.range(hMin, hMax) * scale
    const p = density * sideFalloff * smoothstep((cluster(x, period, { octaves: 2, frequency: 3 }) - 0.3) / 0.35)
    if (rng.next() < p) {
      const tree = rng.fork(`tree-${paths.length}`)
      const reachX = h * 0.3
      const ground = sampleEdge(edge, x) + h * 0.05
      for (const offset of [0, -period, period]) {
        const tx = x + offset
        if (offset !== 0 && (tx < -reachX || tx > period + reachX)) continue
        paths.push(pine(tree.fork('shape'), tx, ground, h))
      }
    }
    x += Math.max(0.002, h * rng.range(0.12, 0.3))
  }

  return { id: `trees@${on.depth.toFixed(2)}`, role: 'terrain', depth: on.depth, wrap: true, shapes: [{ d: paths.join('') }] }
}
