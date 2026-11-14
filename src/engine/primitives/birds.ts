import { mix } from '../color'
import { lerp } from '../math'
import { polygon } from '../path'
import type { Rng } from '../rng'
import { type Layer, solid, type Vec } from '../scene'
import type { Env } from '../theme'

export interface BirdsOptions {
  horizon: number
  anchor: number
  direction: 1 | -1
  seconds: number
  count?: [number, number]
  visible?: boolean
}

const FRAMES = [1, 0.2, -0.4, 0.2]

function bird([x, y]: Vec, span: number, lift: number, facing: 1 | -1): string {
  const half = span / 2
  const t = span * 0.05
  const tip = (side: 1 | -1): Vec => [x + side * half, y - span * 0.28 * lift + span * 0.04]
  const elbow = (side: 1 | -1): Vec => [x + side * half * 0.45, y - span * (0.12 * lift + 0.07)]
  const [lt, rt] = [tip(-1), tip(1)]
  const [le, re] = [elbow(-1), elbow(1)]
  const nose: Vec = [x + facing * span * 0.05, y - t * 0.2]
  return polygon([lt, le, nose, re, rt, [re[0], re[1] + t], [x, y + t * 1.3], [le[0], le[1] + t]])
}

export function birds(env: Env, rng: Rng, { horizon, anchor, direction, seconds, count = [5, 11], visible = true }: BirdsOptions): Layer[] {
  const period = env.aspect
  const { ink, skyTop, skyHorizon } = env.palette.anchors
  const altitude = rng.range(0.4, 0.8)
  const y0 = horizon * (1 - altitude)
  const span = lerp(0.012, 0.024, altitude) * rng.range(0.85, 1.15)
  const x0 = anchor + period * rng.range(0.12, 0.35) * (rng.chance(0.5) ? 1 : -1)
  const n = rng.int(count[0], count[1])
  const vee = rng.chance(0.55)
  const spacing = span * rng.range(1.6, 2.4)
  const crossings = Math.max(1, Math.round(seconds / 15))
  const flaps = Math.round(seconds * 2.5)

  const flock: { at: Vec; scale: number }[] = Array.from({ length: n }, (_, j) => {
    if (vee) {
      const rank = Math.ceil(j / 2)
      const side = j % 2 === 0 ? 1 : -1
      return {
        at: [x0 - direction * rank * spacing * rng.range(0.85, 1.15), y0 + side * rank * spacing * 0.55 + rng.range(-0.3, 0.3) * span],
        scale: rng.range(0.85, 1.1),
      }
    }
    return { at: [x0 + rng.range(-3, 3) * spacing, y0 + rng.range(-1.2, 1.2) * spacing], scale: rng.range(0.7, 1.15) }
  })

  const sky = mix(skyTop, skyHorizon, Math.min(1, y0 / horizon) ** 1.6)
  const fill = solid(mix(ink, sky, 0.3))
  return FRAMES.map((_, frame): Layer => {
    const paths: string[] = []
    flock.forEach(({ at, scale }, j) => {
      const lift = FRAMES[(frame + j) % FRAMES.length]
      for (const offset of [0, -period, period]) {
        const x = at[0] + offset
        if (offset !== 0 && (x < -span || x > period + span)) continue
        paths.push(bird([x, at[1]], span * scale, lift, direction))
      }
    })
    return {
      id: `birds-${frame}`,
      role: 'particles',
      depth: 0.995,
      wrap: true,
      motion: [
        { type: 'drift', wraps: direction * crossings },
        { type: 'pose', cycles: flaps, index: frame, of: FRAMES.length },
      ],
      shapes: visible ? [{ d: paths.join(''), fill }] : [],
    }
  })
}
