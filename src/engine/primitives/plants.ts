import { circle, polygon } from '../path'
import type { Rng } from '../rng'
import type { Vec } from '../scene'

export function grassTuft(rng: Rng, x: number, base: number, height: number, lean: number): string {
  const blades = rng.int(5, 9)
  const paths: string[] = []
  for (let i = 0; i < blades; i++) {
    const spread = (i / (blades - 1) - 0.5) * 1.6
    const h = height * rng.range(0.55, 1) * (1 - Math.abs(spread) * 0.35)
    const tipX = x + (spread * 0.45 + lean * rng.range(0.4, 0.9)) * h
    const w = height * 0.035
    const bx = x + spread * height * 0.12
    const midX = (bx + tipX) / 2 + lean * h * 0.08
    paths.push(
      polygon([
        [bx - w, base],
        [midX, base - h * 0.55],
        [tipX, base - h],
        [midX + w * 0.6, base - h * 0.5],
        [bx + w, base],
      ]),
    )
  }
  return paths.join('')
}

export function shrub(rng: Rng, x: number, base: number, size: number): string {
  const paths: string[] = []
  const lobes = rng.int(3, 5)
  for (let i = 0; i < lobes; i++) {
    const u = (i / (lobes - 1 || 1) - 0.5) * 2
    const r = size * rng.range(0.28, 0.42) * (1 - Math.abs(u) * 0.3)
    paths.push(circle(x + u * size * 0.45, base - r * rng.range(0.7, 1.1), r))
  }
  paths.push(
    polygon([
      [x - size * 0.6, base + size * 0.05],
      [x + size * 0.6, base + size * 0.05],
      [x + size * 0.5, base - size * 0.15],
      [x - size * 0.5, base - size * 0.15],
    ]),
  )
  return paths.join('')
}

function branch(rng: Rng, from: Vec, angle: number, length: number, width: number, depth: number, out: string[]) {
  const dir: Vec = [Math.cos(angle), Math.sin(angle)]
  const to: Vec = [from[0] + dir[0] * length, from[1] + dir[1] * length]
  const n: Vec = [-dir[1], dir[0]]
  const tip = width * 0.62
  out.push(
    polygon([
      [from[0] + n[0] * width, from[1] + n[1] * width],
      [to[0] + n[0] * tip, to[1] + n[1] * tip],
      [to[0] - n[0] * tip, to[1] - n[1] * tip],
      [from[0] - n[0] * width, from[1] - n[1] * width],
    ]),
    circle(to[0], to[1], tip),
  )
  if (depth === 0 || width < 0.0006) return
  const children = rng.chance(0.25) ? 3 : 2
  for (let c = 0; c < children; c++) {
    const side = children === 2 ? (c === 0 ? -1 : 1) : c - 1
    const turn = side * rng.range(0.25, 0.7) + rng.range(-0.15, 0.15)
    branch(rng, to, angle + turn, length * rng.range(0.6, 0.82), tip, depth - 1, out)
  }
}

export function deadTree(rng: Rng, x: number, base: number, height: number, lean: number): string {
  const out: string[] = []
  const trunk = height * 0.42
  branch(rng, [x, base + height * 0.02], -Math.PI / 2 + lean * 0.25, trunk, height * 0.035, 5, out)
  return out.join('')
}
