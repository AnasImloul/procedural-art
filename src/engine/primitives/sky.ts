import { mix, ramp } from '../color'
import { smoothstep } from '../math'
import { MOOD_LIGHT } from '../moods'
import { rect } from '../path'
import type { Layer } from '../scene'
import type { Env } from '../theme'

export function sky(env: Env, { horizon }: { horizon: number }): Layer {
  const { skyTop, skyHorizon } = env.palette.anchors
  const boost = MOOD_LIGHT[env.palette.mood].band
  const band = { ...skyHorizon, l: skyHorizon.l - 0.03, c: skyHorizon.c * boost, h: skyHorizon.h - 8 }
  const stops = ramp(skyTop, skyHorizon, 12, (t) => t ** 1.6).map(([t, color]): [number, typeof color] => [
    t,
    boost > 1 ? mix(color, band, smoothstep((t - 0.78) / 0.22) * 0.85) : color,
  ])
  return {
    id: 'sky',
    role: 'sky',
    depth: 1,
    shapes: [
      {
        d: rect(-0.01, -0.01, env.aspect + 0.02, 1.02),
        fill: { type: 'linear', from: [0, 0], to: [0, horizon], stops },
      },
    ],
  }
}
