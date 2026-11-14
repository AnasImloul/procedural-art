import { lerp, smoothstep } from './math'
import type { Rng } from './rng'
import type { Vec } from './scene'

export type Side = 'left' | 'right'

export interface Orbit {
  horizon: number
  dir: 1 | -1
}

export interface Celestial {
  light: Vec
  sun: Vec
  moon: Vec
  sunWeight: number
  anchor: Vec
  orbit?: Orbit
}

export interface Composition {
  aspect: number
  focal: { x: number; side: Side }
  counterX: number
  scale: number
  framingSide: Side
  celestial(horizon: number): Celestial
  sunPosition(horizon: number): Vec
  depthSteps(count: number, range: { near: number; far: number }): number[]
}

const third = (rng: Rng, aspect: number, side: Side) => aspect * (side === 'left' ? rng.range(0.25, 0.38) : rng.range(0.62, 0.75))

export function celestialAt(hour: number, { horizon, dir }: Orbit, aspect: number): Omit<Celestial, 'anchor' | 'orbit'> {
  const h = ((hour % 24) + 24) % 24
  const arc = (s: number): Vec => [lerp(-0.08, 1.08, dir > 0 ? s : 1 - s) * aspect, horizon + 0.05 - Math.sin(Math.PI * s) * horizon * 0.78]
  const sun = arc((h - 6) / 12)
  const moon = arc(((((h - 18) % 24) + 24) % 24) / 12)
  const sunWeight = smoothstep((h - 4) / 1.5) * (1 - smoothstep((h - 18.5) / 1.5))
  return { light: sunWeight >= 0.5 ? sun : moon, sun, moon, sunWeight }
}

export function makeComposition(rng: Rng, aspect: number, hour?: number): Composition {
  const side: Side = rng.fork('side').chance(0.5) ? 'left' : 'right'
  const other: Side = side === 'left' ? 'right' : 'left'
  const x = third(rng.fork('focal'), aspect, side)
  const celestial = (horizon: number): Celestial => {
    const anchor: Vec = [x, horizon - rng.fork('sun').range(0.06, 0.24)]
    if (hour === undefined) return { light: anchor, sun: anchor, moon: anchor, sunWeight: 1, anchor }
    const orbit: Orbit = { horizon, dir: rng.fork('orbit').chance(0.5) ? 1 : -1 }
    return { ...celestialAt(hour, orbit, aspect), anchor, orbit }
  }
  return {
    aspect,
    focal: { x, side },
    counterX: third(rng.fork('counter'), aspect, other),
    scale: Math.min(1, aspect) ** 0.7,
    framingSide: other,
    celestial,
    sunPosition: (horizon) => celestial(horizon).light,
    depthSteps: (count, { near, far }) => Array.from({ length: count }, (_, i) => lerp(far, near, count === 1 ? 1 : i / (count - 1))),
  }
}
