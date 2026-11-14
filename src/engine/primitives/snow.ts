import { mix } from '../color'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import { type Shape, solid, type Vec } from '../scene'
import type { Env } from '../theme'

export interface SnowOptions {
  depth: number
  amplitude: number
  snowline: number
}

export function snowCap(env: Env, rng: Rng, edge: Vec[], { depth, amplitude, snowline }: SnowOptions): Shape[] {
  const period = env.aspect
  const { light, sun, haze } = env.palette.anchors
  const fill = solid(mix(mix(light, sun, 0.25), haze, depth * 0.5))
  const jag = loopNoise1D(rng.fork('jag'))
  const boundary = (x: number) => snowline + (jag(x, period, { octaves: 3, frequency: 12 }) - 0.5) * amplitude * 0.18
  const shapes: Shape[] = []
  let run: Vec[] = []
  let under: Vec[] = []
  const flush = () => {
    if (run.length > 2) {
      const outline = [...run, ...under.reverse()]
      const xs = outline.map(([x]) => x)
      for (const offset of [0, -period, period]) {
        if (offset !== 0 && (Math.min(...xs) + offset > period + 0.01 || Math.max(...xs) + offset < -0.01)) continue
        shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill })
      }
    }
    run = []
    under = []
  }
  for (const [x, y] of edge) {
    const b = boundary(x)
    if (y < b) {
      run.push([x, y])
      under.push([x, b])
    } else flush()
  }
  flush()
  return shapes
}
