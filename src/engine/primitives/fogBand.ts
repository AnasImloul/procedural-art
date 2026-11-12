import { withAlpha, type Color } from '../color'
import { lerp, smoothstep } from '../math'
import { loopNoise1D } from '../noise'
import { polygon, rect } from '../path'
import type { Rng } from '../rng'
import { solid, type Layer, type Shape, type Vec } from '../scene'
import type { Env } from '../theme'

export interface FogBandOptions {
  depth: number
  y: number
  height: number
  density: number
  strips?: number
  sway?: number
}

export function fogBand(env: Env, rng: Rng, { depth, y, height, density, strips = 2, sway = 0.035 }: FogBandOptions): Layer {
  const { haze } = env.palette.anchors
  const top = y - height
  const stops = Array.from({ length: 6 }, (_, i): [number, Color] => {
    const t = i / 5
    return [t, withAlpha(haze, density * 0.75 * smoothstep(t))]
  })
  const shapes: Shape[] = [
    { d: rect(-0.01, top, env.aspect + 0.02, 1.02 - top), fill: { type: 'linear', from: [0, top], to: [0, y], stops } },
  ]

  const samples = Math.ceil(env.aspect * 90)
  for (let s = 0; s < strips; s++) {
    const wave = loopNoise1D(rng.fork(`wave-${s}`))
    const points: Vec[] = [[-0.01, 1.02]]
    for (let i = 0; i <= samples; i++) {
      const x = lerp(-0.01, env.aspect + 0.01, i / samples)
      const w = wave(x, env.aspect, { octaves: 3, frequency: 1.8 }) - 0.5
      points.push([x, y - height * (0.2 + 0.3 * s) + w * height * 1.1])
    }
    points.push([env.aspect + 0.01, 1.02])
    shapes.push({ d: polygon(points), fill: solid(withAlpha(haze, density * 0.13)) })
  }

  const motion = rng.fork('motion')
  return {
    id: `fog@${depth.toFixed(2)}`,
    role: 'fog',
    depth,
    shapes,
    wrap: true,
    motion: [
      { type: 'sway', amount: sway * (motion.chance(0.5) ? 1 : -1), cycles: 1 },
      { type: 'fade', amount: 0.25, cycles: motion.int(1, 2), phase: motion.range(0, Math.PI * 2) },
    ],
  }
}
