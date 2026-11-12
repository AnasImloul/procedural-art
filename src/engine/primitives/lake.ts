import { mix, withAlpha } from '../color'
import { lerp } from '../math'
import { polygon, rect } from '../path'
import type { Rng } from '../rng'
import { solid, type Layer, type Shape, type Vec } from '../scene'
import type { Env } from '../theme'

export interface LakeOptions {
  x: number
  width: number
  waterline: number
  depth: number
  glitter?: number
}

export function lake(env: Env, rng: Rng, { x, width, waterline, depth, glitter = x }: LakeOptions): Layer[] {
  const { light, skyTop, ink } = env.palette.anchors
  const half = width / 2
  const right: Vec[] = []
  const left: Vec[] = []
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2)
    const dy = (1.02 - waterline) * (1 - Math.cos(a))
    right.push([x + half + width * 0.3 * Math.sin(a), waterline + dy])
    left.unshift([x - half - width * 0.3 * Math.sin(a), waterline + dy])
  }
  const clip = polygon([...left, ...right])

  const surface: Shape[] = [
    {
      d: clip,
      fill: {
        type: 'linear',
        from: [0, waterline],
        to: [0, waterline + 0.2],
        stops: [
          [0, withAlpha(mix(skyTop, ink, 0.3), 0.18)],
          [1, withAlpha(mix(skyTop, ink, 0.4), 0.55)],
        ],
      },
    },
    { d: rect(x - half - width * 0.02, waterline - 0.0012, width * 1.04, 0.0024), fill: solid(withAlpha(light, 0.5)) },
  ]

  const groups: Shape[][] = [[], [], []]
  const count = Math.round(width * 70)
  for (let i = 0; i < count; i++) {
    const t = rng.next() ** 1.6
    const y = waterline + 0.008 + t * 0.2
    const spread = half * (1 + t * 0.5)
    const nearGlitter = rng.chance(0.45)
    const cx = nearGlitter ? glitter + (rng.next() + rng.next() - 1) * width * 0.12 : x + rng.range(-1, 1) * spread
    const len = rng.range(0.008, 0.05) * (nearGlitter ? 0.8 : 1) * lerp(0.7, 1.3, t)
    const thick = lerp(0.0012, 0.0028, t)
    const alpha = (nearGlitter ? rng.range(0.3, 0.65) : rng.range(0.1, 0.3)) * (1 - t * 0.5)
    groups[Math.floor(rng.next() * groups.length)].push({ d: rect(cx - len / 2, y, len, thick), fill: solid(withAlpha(light, alpha)) })
  }

  const motion = rng.fork('motion')
  return [
    { id: 'lake', role: 'water', depth, clip, lake: { waterline }, shapes: surface },
    ...groups.map(
      (shapes, g): Layer => ({
        id: `lake-ripples-${g}`,
        role: 'water',
        depth: depth - 0.0001 * (g + 1),
        clip,
        shapes,
        motion: [{ type: 'fade', amount: 0.7, cycles: motion.int(4, 9), phase: motion.range(0, Math.PI * 2) }],
      }),
    ),
  ]
}
