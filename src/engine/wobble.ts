import { Rng } from './rng'
import type { Vec } from './scene'

const OCTAVES: [number, number][] = [
  [90, 1],
  [260, 0.3],
]

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function periodicNoise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells
  const fy = y * cells
  const xi = Math.floor(fx)
  const yi = Math.floor(fy)
  const u = fx - xi
  const v = fy - yi
  const su = u * u * (3 - 2 * u)
  const sv = v * v * (3 - 2 * v)
  const x0 = ((xi % cells) + cells) % cells
  const x1 = (x0 + 1) % cells
  const a = hash(x0, yi, seed)
  const b = hash(x1, yi, seed)
  const c = hash(x0, yi + 1, seed)
  const d = hash(x1, yi + 1, seed)
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv
}

export type Wobble = (p: Vec) => Vec

export function makeWobble(seed: string, period: number, amplitude = 0.0022): Wobble {
  const rng = new Rng(`${seed}/wobble`)
  const sx = Math.floor(rng.next() * 2 ** 31)
  const sy = Math.floor(rng.next() * 2 ** 31)
  const octaves = OCTAVES.map(([freq, amp]) => ({ cells: Math.max(1, Math.round(freq * period)), amp }))
  const offset = (x: number, y: number, seed: number) =>
    octaves.reduce((sum, o) => sum + (periodicNoise(x / period, y / period, o.cells, seed + o.cells) - 0.5) * 2 * o.amp, 0)
  return ([x, y]) => [x + offset(x, y, sx) * amplitude, y + offset(x, y, sy) * amplitude]
}
