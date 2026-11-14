import { mix } from '../color'
import { sampleEdge } from '../geometry'
import { smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import type { Rng } from '../rng'
import { type Layer, solid } from '../scene'
import type { Env } from '../theme'
import { grassTuft, shrub } from './plants'

export interface ScrubOptions {
  on: Layer
  size: [number, number]
  density: number
  lean: number
  tone?: number
}

export function scrub(env: Env, rng: Rng, { on, size: [sMin, sMax], density, lean, tone = 0.4 }: ScrubOptions): Layer {
  if (!on.edge) throw new Error(`scrub: layer ${on.id} has no edge`)
  const edge = on.edge
  const period = env.aspect
  const clusters = loopNoise1D(rng.fork('clusters'))
  const paths: string[] = []
  let x = 0
  while (x < period) {
    const s = rng.range(sMin, sMax)
    const p = density * smoothstep((clusters(x, period, { octaves: 2, frequency: 3 }) - 0.45) / 0.25)
    if (rng.next() < p) {
      const plant = rng.fork(`plant-${paths.length}`)
      const isShrub = plant.chance(0.3)
      const base = sampleEdge(edge, x) + s * 0.08
      for (const offset of [0, -period, period]) {
        const px = x + offset
        if (offset !== 0 && (px < -s * 2 || px > period + s * 2)) continue
        paths.push(isShrub ? shrub(plant.fork('shape'), px, base, s * 0.7) : grassTuft(plant.fork('shape'), px, base, s, lean))
      }
    }
    x += s * rng.range(0.5, 1.4)
  }
  const fill = solid(mix(env.palette.atDepth(on.depth), env.palette.anchors.ink, tone))
  return { id: `scrub@${on.depth.toFixed(2)}`, role: 'terrain', depth: on.depth, wrap: true, shapes: [{ d: paths.join(''), fill }] }
}
