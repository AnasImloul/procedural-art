import { mix, withAlpha } from '../color'
import { lerp } from '../math'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import { type Layer, type Paint, type Shape, solid, type Vec } from '../scene'
import type { Env } from '../theme'

export interface MesasOptions {
  depth: number
  baseline: number
  height: number
  count: [number, number]
  light: Vec
  hero?: number
}

interface Formation {
  x: number
  half: number
  height: number
  plateau: number
  cliff: number
  apron: number
  tilt: number
  tier?: { offset: number; half: number; height: number }
}

const CLIFF_FOOT = 0.3

function profile(f: Formation, dx: number): number {
  const u = Math.abs(dx) / f.half
  let h: number
  if (u <= f.plateau) h = f.height * (1 + f.tilt * (dx / f.half))
  else if (u <= f.plateau + f.cliff) h = lerp(f.height, f.height * CLIFF_FOOT, (u - f.plateau) / f.cliff)
  else if (u <= 1 + f.apron) h = f.height * CLIFF_FOOT * (1 - (u - f.plateau - f.cliff) / (1 + f.apron - f.plateau - f.cliff)) ** 2
  else h = 0
  if (f.tier) {
    const tu = Math.abs(dx - f.tier.offset) / f.tier.half
    const t = f.tier.height
    if (tu <= 0.55) h = Math.max(h, f.height + t)
    else if (tu <= 0.7) h = Math.max(h, f.height + lerp(t, t * 0.35, (tu - 0.55) / 0.15))
    else if (tu <= 1.2) h = Math.max(h, f.height + t * 0.35 * (1 - (tu - 0.7) / 0.5) ** 2)
  }
  return h
}

export function mesas(env: Env, rng: Rng, { depth, baseline, height, count: [cMin, cMax], light, hero }: MesasOptions): Layer {
  const period = env.aspect
  const wrapDx = (x: number, c: number) => x - c - period * Math.round((x - c) / period)
  const count = rng.int(cMin, cMax)
  const heroIndex = rng.int(0, count - 1)
  const formations: Formation[] = []
  let cursor = hero !== undefined ? hero - (heroIndex * period) / count : rng.range(0, period)
  for (let k = 0; k < count; k++) {
    const r = rng.fork(`mesa-${k}`)
    const big = k === heroIndex
    const half = period * (big ? r.range(0.09, 0.15) : r.range(0.025, 0.08))
    formations.push({
      x: cursor,
      half,
      height: height * (big ? r.range(0.95, 1.2) : r.range(0.4, 0.8)),
      plateau: r.range(0.5, 0.8),
      cliff: r.range(0.08, 0.16),
      apron: r.range(0.25, 0.55),
      tilt: r.range(-0.06, 0.06),
      tier: r.chance(big ? 0.45 : 0.25)
        ? { offset: half * r.range(-0.35, 0.35), half: half * r.range(0.22, 0.38), height: height * r.range(0.2, 0.4) }
        : undefined,
    })
    cursor += (period / count) * r.range(0.55, 1.45)
  }

  const ground = loopNoise1D(rng.fork('ground'))
  const erosion = loopNoise1D(rng.fork('erosion'))
  const rough = (x: number) => (erosion(x, period, { octaves: 3, frequency: 40 }) - 0.5) * height * 0.05
  const heightAt = (x: number) => {
    let h = (ground(x, period, { octaves: 3, frequency: 3 }) - 0.5) * height * 0.08
    for (const f of formations) {
      const p = profile(f, wrapDx(x, f.x))
      h = Math.max(h, p > f.height * CLIFF_FOOT ? p + rough(x) : p)
    }
    return h
  }
  const samples = Math.ceil(period * 500)
  const edge: Vec[] = Array.from({ length: samples + 1 }, (_, i) => {
    const x = lerp(-0.01, period + 0.01, i / samples)
    return [x, baseline - heightAt(x)]
  })

  const base = env.palette.atDepth(depth)
  const { ink, skyTop, light: lightColor } = env.palette.anchors
  const mood = env.palette.light
  const shadow = solid(withAlpha(mix(ink, skyTop, 0.35), 0.3))
  const lit = solid(withAlpha(lightColor, 0.14 * mood.lit))
  const band = solid(withAlpha(mix(base, ink, 0.5), 0.16))
  const bandLight = solid(withAlpha(lightColor, 0.07 * mood.lit))
  const shapes: Shape[] = [{ d: polygon([[edge[0][0], 1.01], ...edge, [edge[edge.length - 1][0], 1.01]]) }]

  const copies = (outline: Vec[], fill: Paint) => {
    const xs = outline.map(([x]) => x)
    for (const offset of [0, -period, period]) {
      if (Math.min(...xs) + offset > period + 0.01 || Math.max(...xs) + offset < -0.01) continue
      shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill })
    }
  }

  for (const f of formations) {
    const r = rng.fork(`shade-${Math.round(f.x * 1000)}`)
    const reach = f.half * (1 + f.apron)
    const sunSide = Math.sign(wrapDx(light[0], f.x)) || 1
    const top = (dx: number) => baseline - heightAt(f.x + dx)
    const side = (dir: 1 | -1) => {
      const start = dir * f.half * f.plateau
      const pts: Vec[] = []
      const steps = 24
      for (let s = 0; s <= steps; s++) {
        const dx = lerp(start, dir * reach, s / steps)
        pts.push([f.x + dx, top(dx)])
      }
      const inner = f.x + start - dir * f.half * 0.04
      return [...pts, [f.x + dir * reach, baseline + height * 0.05], [inner, baseline + height * 0.05], [inner, top(start)]] as Vec[]
    }
    copies(side(-sunSide as 1 | -1), shadow)
    copies(side(sunSide as 1 | -1), lit)

    const bands = r.int(2, 3)
    for (let b = 0; b < bands; b++) {
      const y0 = baseline - f.height * r.range(0.35, 0.85)
      const thick = f.height * r.range(0.04, 0.08)
      let lo = 0
      while (lo < reach && baseline - profile(f, -lo) < y0) lo += f.half * 0.01
      let hi = 0
      while (hi < reach && baseline - profile(f, hi) < y0) hi += f.half * 0.01
      if (lo + hi < f.half * 0.3) continue
      const left = f.x - lo
      const right = f.x + hi
      copies(
        [
          [left, y0],
          [right, y0],
          [right, y0 + thick],
          [left, y0 + thick],
        ],
        band,
      )
      copies(
        [
          [left, y0 - thick * 0.35],
          [right, y0 - thick * 0.35],
          [right, y0],
          [left, y0],
        ],
        bandLight,
      )
    }
  }

  return { id: `mesas@${depth.toFixed(2)}`, role: 'terrain', depth, rim: true, edge, wrap: true, shapes }
}
