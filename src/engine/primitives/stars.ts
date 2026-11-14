import { circle } from '../path'
import type { Rng } from '../rng'
import { type Layer, type Shape, solid } from '../scene'
import type { Env } from '../theme'

export interface StarsOptions {
  horizon: number
  density?: number
  brightness?: number
  groups?: number
}

export function stars(env: Env, rng: Rng, { horizon, density = 1, brightness = 1, groups = 3 }: StarsOptions): Layer[] {
  const buckets: string[][][] = Array.from({ length: groups }, () => [[], [], [], []])
  const count = Math.round(280 * env.aspect * density)
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, env.aspect)
    const y = horizon * 0.95 * rng.next() ** 1.4
    const r = 0.0007 + rng.next() ** 8 * 0.0024
    const b = rng.range(0.2, 1) * (1 - (y / horizon) ** 2)
    buckets[Math.floor(rng.next() * groups)][Math.min(3, Math.floor(b * 4))].push(circle(x, y, r))
  }
  const twinkle = rng.fork('twinkle')
  return buckets.map((group, g) => {
    const shapes: Shape[] = group
      .map((paths, i) => ({ d: paths.join(''), fill: solid(env.palette.anchors.sun), opacity: ((i + 1) / 4) * brightness }))
      .filter((s) => s.d)
    return {
      id: `stars-${g}`,
      role: 'particles',
      depth: 1,
      shapes,
      motion: [{ type: 'fade', amount: 0.6, cycles: twinkle.int(6, 14), phase: twinkle.range(0, Math.PI * 2) }],
    }
  })
}
