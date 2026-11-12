import { mix, withAlpha } from '../color'
import { lerp } from '../math'
import { MOOD_LIGHT } from '../moods'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Layer, Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface LightShaftsOptions {
  at: Vec
  length: number
  count?: number
  strength?: number
  depth?: number
}

export function lightShafts(env: Env, rng: Rng, { at, length, count = 7, strength = 0.07, depth = 0.9995 }: LightShaftsOptions): Layer {
  const a = strength * MOOD_LIGHT[env.palette.mood].rays
  const color = mix(env.palette.anchors.light, env.palette.anchors.sun, 0.5)
  const shapes: Shape[] = []
  if (a > 0) {
    for (let k = 0; k < count; k++) {
      const angle = (lerp(-168, -12, (k + rng.range(0.2, 0.8)) / count) * Math.PI) / 180
      const half = (rng.range(0.8, 2.6) * Math.PI) / 180
      const reach = length * rng.range(0.6, 1)
      const point = (t: number): Vec => [at[0] + Math.cos(angle + t) * reach, at[1] + Math.sin(angle + t) * reach]
      shapes.push({
        d: polygon([at, point(-half), point(half)]),
        fill: {
          type: 'radial',
          center: at,
          radius: reach,
          stops: [
            [0, withAlpha(color, a * rng.range(0.6, 1))],
            [0.35, withAlpha(color, a * 0.45)],
            [1, withAlpha(color, 0)],
          ],
        },
      })
    }
  }
  const motion = rng.fork('motion')
  return {
    id: 'light-shafts',
    role: 'celestial',
    depth,
    shapes,
    motion: [{ type: 'fade', amount: 0.5, cycles: motion.int(1, 2), phase: motion.range(0, Math.PI * 2) }],
  }
}
