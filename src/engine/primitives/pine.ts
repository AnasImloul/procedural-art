import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Vec } from '../scene'

export function pine(rng: Rng, x: number, base: number, height: number): string {
  const tiers = rng.int(6, 10)
  const top = base - height
  const crown = height * 0.92
  const trunk = height * 0.025
  const sides: Record<1 | -1, Vec[]> = { 1: [], [-1]: [] }
  const lean = rng.range(-0.03, 0.03) * height

  for (let i = 0; i < tiers; i++) {
    const t = (i + 1) / tiers
    const y = top + crown * t
    const w = height * 0.19 * t ** 0.85
    const droop = height * 0.018 * rng.range(0.5, 1.5)
    for (const side of [1, -1] as const) {
      const tip = w * rng.range(0.75, 1.2)
      const cx = x + lean * (1 - t)
      sides[side].push([cx + side * tip, y + droop])
      if (i < tiers - 1) sides[side].push([cx + side * tip * rng.range(0.3, 0.5), y - droop * 0.2])
    }
  }

  const apex: Vec = [x + lean, top]
  const right = [...sides[1], [x + trunk, top + crown], [x + trunk, base]] as Vec[]
  const left = [...sides[-1], [x - trunk, top + crown], [x - trunk, base]] as Vec[]
  return polygon([apex, ...right, ...left.reverse()])
}
