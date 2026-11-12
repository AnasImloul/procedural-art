import { mix, withAlpha } from '../color'
import { MOOD_LIGHT } from '../moods'
import { rect } from '../path'
import type { Layer, Vec } from '../scene'
import type { Env } from '../theme'

export interface SunHazeOptions {
  at: Vec
  depth: number
  radius: number
  strength?: number
  squash?: number
}

export function sunHaze(env: Env, { at: [x, y], depth, radius, strength = 0.5, squash = 0.35 }: SunHazeOptions): Layer {
  const { light, skyHorizon } = env.palette.anchors
  const color = mix(light, skyHorizon, 0.4)
  const a = strength * MOOD_LIGHT[env.palette.mood].haze
  return {
    id: `sun-haze@${depth.toFixed(3)}`,
    role: 'fog',
    depth,
    shapes: [
      {
        d: rect(-0.01, -0.01, env.aspect + 0.02, 1.02),
        fill: {
          type: 'radial',
          center: [x, y],
          radius,
          squash,
          stops: [
            [0, withAlpha(color, a)],
            [0.3, withAlpha(color, a * 0.55)],
            [0.65, withAlpha(color, a * 0.15)],
            [1, withAlpha(color, 0)],
          ],
        },
      },
    ],
  }
}
