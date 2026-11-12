import { lerp } from './math'
import type { Rng } from './rng'
import type { Vec } from './scene'

export type Side = 'left' | 'right'

export interface Composition {
  aspect: number
  focal: { x: number; side: Side }
  counterX: number
  scale: number
  framingSide: Side
  sunPosition(horizon: number): Vec
  depthSteps(count: number, range: { near: number; far: number }): number[]
}

const third = (rng: Rng, aspect: number, side: Side) =>
  aspect * (side === 'left' ? rng.range(0.25, 0.38) : rng.range(0.62, 0.75))

export function makeComposition(rng: Rng, aspect: number): Composition {
  const side: Side = rng.fork('side').chance(0.5) ? 'left' : 'right'
  const other: Side = side === 'left' ? 'right' : 'left'
  const x = third(rng.fork('focal'), aspect, side)
  return {
    aspect,
    focal: { x, side },
    counterX: third(rng.fork('counter'), aspect, other),
    scale: Math.min(1, aspect) ** 0.7,
    framingSide: other,
    sunPosition: (horizon) => [x, horizon - rng.fork('sun').range(0.06, 0.24)],
    depthSteps: (count, { near, far }) =>
      Array.from({ length: count }, (_, i) => lerp(far, near, count === 1 ? 1 : i / (count - 1))),
  }
}
