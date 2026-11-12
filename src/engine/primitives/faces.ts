import { mix, withAlpha, type Color } from '../color'
import { sampleEdge } from '../geometry'
import { clamp, lerp } from '../math'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface FacesOptions {
  depth: number
  baseline: number
  amplitude: number
  light: Vec
  strength?: number
}

interface Extremum {
  i: number
  kind: 'peak' | 'col'
}

interface Fold {
  kind: 'ridge' | 'valley'
  origin: number
  line: Vec[]
}

function alternatingExtrema(ys: number[], window: number, prominence: number): Extremum[] {
  const raw: Extremum[] = []
  for (let i = window; i < ys.length - window; i++) {
    let peak = true
    let col = true
    for (let k = i - window; k <= i + window; k++) {
      if (ys[k] < ys[i]) peak = false
      if (ys[k] > ys[i]) col = false
    }
    const kind = peak ? 'peak' : col ? 'col' : undefined
    if (!kind) continue
    const last = raw[raw.length - 1]
    if (last && last.kind === kind) {
      if ((kind === 'peak' && ys[i] < ys[last.i]) || (kind === 'col' && ys[i] > ys[last.i])) last.i = i
    } else raw.push({ i, kind })
  }
  for (;;) {
    let weakest = -1
    let weakestDrop = prominence
    for (let k = 0; k < raw.length - 1; k++) {
      const drop = Math.abs(ys[raw[k].i] - ys[raw[k + 1].i])
      if (drop < weakestDrop) {
        weakestDrop = drop
        weakest = k
      }
    }
    if (weakest < 0) break
    raw.splice(weakest, 2)
    for (let k = 1; k < raw.length; k++) {
      if (raw[k].kind !== raw[k - 1].kind) continue
      const keepLater = raw[k].kind === 'peak' ? ys[raw[k].i] < ys[raw[k - 1].i] : ys[raw[k].i] > ys[raw[k - 1].i]
      raw.splice(keepLater ? k - 1 : k, 1)
      k--
    }
  }
  return raw
}

export function mountainFaces(env: Env, rng: Rng, edge: Vec[], { depth, baseline, amplitude, light, strength = 1 }: FacesOptions): Shape[] {
  if (strength <= 0) return []
  const period = env.aspect
  const ground = (x: number) => sampleEdge(edge, x - period * Math.floor(x / period))
  const cells = Math.max(8, Math.round(period / (edge[1][0] - edge[0][0])))
  const step = period / cells
  const xs: number[] = []
  for (let n = -Math.floor(cells / 2); n <= Math.ceil(cells * 1.5); n++) xs.push(n * step)
  const cell = (i: number) => ((Math.round(xs[i] / step) % cells) + cells) % cells
  const ys = xs.map(ground)
  const bottom = baseline + amplitude * 0.35
  const sunward = (x: number) => {
    const dx = light[0] - x
    return Math.sign(dx - period * Math.round(dx / period)) || 1
  }
  const found = alternatingExtrema(ys, Math.max(2, Math.round(0.012 / step)), amplitude * 0.12)
  const canonical = found.filter((e) => xs[e.i] >= 0 && xs[e.i] < period).map((e) => ({ n: cell(e.i), kind: e.kind }))
  if (canonical.length > 1 && canonical[0].kind === canonical[canonical.length - 1].kind) canonical.pop()
  const m = canonical.length
  if (m < 2) return []
  const at = (k: number) => {
    const wrap = Math.floor(k / m)
    const e = canonical[k - wrap * m]
    const x = e.n * step + wrap * period
    return { x, y: ground(x), kind: e.kind, n: e.n }
  }

  const endOf = (k: number) => {
    const e = at(k)
    const r = rng.fork(`lean-${e.n}`)
    const lean = -sunward(e.x) * (e.kind === 'peak' ? r.range(0.1, 0.28) : r.range(0.14, 0.32))
    const shift = lean * (bottom - e.y)
    const neighbor = at(k + (shift > 0 ? 1 : -1))
    return e.x + Math.sign(shift) * Math.min(Math.abs(shift), Math.abs(neighbor.x - e.x) * 0.45)
  }

  const foldOf = (k: number): Fold => {
    const e = at(k)
    const r = rng.fork(`fold-${e.n}`)
    const ex = endOf(k)
    const room = Math.min(ex - endOf(k - 1), endOf(k + 1) - ex)
    const line: Vec[] = [[e.x, e.y + 0.0008]]
    const kinks = 3
    for (let s = 1; s <= kinks; s++) {
      const t = s / (kinks + 1)
      const x = lerp(e.x, ex, t) + r.range(-0.12, 0.12) * room * t
      line.push([x, Math.max(lerp(e.y, bottom, t), ground(x) + 0.0015)])
    }
    line.push([ex, Math.max(bottom, ground(ex) + 0.002)])
    return { kind: e.kind === 'peak' ? 'ridge' : 'valley', origin: k, line }
  }
  const folds: Fold[] = Array.from({ length: m + 1 }, (_, k) => foldOf(k))

  const { ink, skyTop, light: lightColor } = env.palette.anchors
  const mood = env.palette.light
  const shadowColor = mix(ink, skyTop, 0.35)
  const far = lerp(1, 0.7, clamp((depth - 0.35) / 0.65))
  const shapes: Shape[] = []

  const push = (outline: Vec[], color: Color, top: number) => {
    const a = color.a ?? 1
    const fill: Shape['fill'] = {
      type: 'linear',
      from: [0, top],
      to: [0, bottom],
      stops: [
        [0, color],
        [0.6, withAlpha(color, a * 0.9)],
        [1, withAlpha(color, 0)],
      ],
    }
    for (const offset of [0, -period, period]) shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill })
  }

  for (let k = 0; k < m; k++) {
    const left = folds[k]
    const right = folds[k + 1]
    const lx = left.line[0][0]
    const rx = right.line[0][0]
    const cx = (lx + rx) / 2
    const silhouette: Vec[] = []
    for (let x = lx; x < rx; x += step) silhouette.push([x, ground(x)])
    silhouette.push([rx, ground(rx)])
    const outline = [...silhouette, ...right.line.slice(1), ...[...left.line].reverse().slice(0, -1)]
    const side = left.kind === 'ridge' ? 1 : -1
    const rise = Math.abs(ground(rx) - ground(lx)) / Math.max(1e-6, rx - lx)
    const facing = side * clamp(0.45 + rise * 0.6, 0.45, 1)
    const lit = facing * sunward(cx)
    const top = Math.min(ground(lx), ground(rx))
    if (lit > 0.7) push(outline, withAlpha(lightColor, 0.22 * mood.lit * strength * far), top)
    else if (lit > 0) push(outline, withAlpha(lightColor, 0.1 * mood.lit * strength * far), top)
    else if (lit > -0.7) push(outline, withAlpha(shadowColor, 0.28 * strength * far), top)
    else push(outline, withAlpha(shadowColor, 0.45 * strength * far), top)
  }
  return shapes
}
