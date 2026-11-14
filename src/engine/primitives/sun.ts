import { type Color, oklch, withAlpha } from '../color'
import type { Celestial } from '../compose'
import { circle } from '../path'
import { type Layer, type Shape, solid } from '../scene'
import type { Env } from '../theme'

export interface SunOptions {
  sky: Celestial
  radius: number
  glow?: number
}

export const MOON_COLOR = oklch(0.95, 0.02, 230)
export const MOON_GLOW = 0.7

function body([x, y]: [number, number], radius: number, reach: number, disk: Color, glowColor: Color, g: number, opacity: number): Shape[] {
  return [
    {
      d: circle(x, y, reach),
      fill: {
        type: 'radial',
        center: [x, y],
        radius: reach,
        stops: [
          [0, withAlpha(glowColor, 0.55 * g)],
          [0.1, withAlpha(glowColor, 0.4 * g)],
          [0.25, withAlpha(glowColor, 0.18 * g)],
          [0.5, withAlpha(glowColor, 0.06 * g)],
          [1, withAlpha(glowColor, 0)],
        ],
      },
    },
    { d: circle(x, y, radius), fill: solid(disk), opacity },
  ]
}

export function sun(env: Env, { sky, radius, glow = 9 }: SunOptions): Layer {
  const { sun, light } = env.palette.anchors
  const mood = env.palette.light
  const shapes: Shape[] = []
  if (sky.sunWeight > 0) {
    shapes.push(...body(sky.sun, radius, radius * glow * mood.glowReach, sun, light, mood.glow * sky.sunWeight, mood.sunOpacity * sky.sunWeight))
  }
  if (sky.sunWeight < 1) {
    const w = 1 - sky.sunWeight
    shapes.push(...body(sky.moon, radius * 0.8, radius * glow * 0.8, MOON_COLOR, MOON_COLOR, MOON_GLOW * w, w))
  }
  return {
    id: 'sun',
    role: 'celestial',
    depth: 1,
    light: sky.light,
    lightRadius: radius,
    anchor: sky.anchor,
    orbit: sky.orbit && { ...sky.orbit, radius, glow },
    shapes,
  }
}
