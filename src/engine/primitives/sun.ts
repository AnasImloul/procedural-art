import { withAlpha } from '../color'
import { MOOD_LIGHT } from '../moods'
import { circle } from '../path'
import { solid, type Layer, type Vec } from '../scene'
import type { Env } from '../theme'

export interface SunOptions {
  at: Vec
  radius: number
  glow?: number
}

export function sun(env: Env, { at: [x, y], radius, glow = 9 }: SunOptions): Layer {
  const { sun, light } = env.palette.anchors
  const mood = MOOD_LIGHT[env.palette.mood]
  const reach = radius * glow * mood.glowReach
  const g = mood.glow
  return {
    id: 'sun',
    role: 'celestial',
    depth: 1,
    light: [x, y],
    lightRadius: radius,
    shapes: [
      {
        d: circle(x, y, reach),
        fill: {
          type: 'radial',
          center: [x, y],
          radius: reach,
          stops: [
            [0, withAlpha(light, 0.55 * g)],
            [0.1, withAlpha(light, 0.4 * g)],
            [0.25, withAlpha(light, 0.18 * g)],
            [0.5, withAlpha(light, 0.06 * g)],
            [1, withAlpha(light, 0)],
          ],
        },
      },
      { d: circle(x, y, radius), fill: solid(sun), opacity: mood.sunOpacity },
    ],
  }
}
