import { type Color, mix } from '../color'
import { clamp, lerp } from '../math'
import type { MoodId } from '../moods'
import { loopNoise1D } from '../noise'
import { polygon } from '../path'
import type { Rng } from '../rng'
import { type Layer, type Paint, type Shape, solid, type Vec } from '../scene'
import type { Env } from '../theme'

export interface CloudscapeOptions {
  horizon: number
  amount: number
  light: Vec
  direction: 1 | -1
  anchor?: number
}

interface Recipe {
  cumulus: [number, number]
  streaks: [number, number]
  decks: [number, number]
  glow: number
  veil: number
}

const RECIPES: Record<MoodId, Recipe> = {
  golden: { cumulus: [2, 5], streaks: [0, 3], decks: [0, 0], glow: 0.35, veil: 0 },
  midday: { cumulus: [3, 6], streaks: [0, 1], decks: [0, 0], glow: 0, veil: 0 },
  dusk: { cumulus: [1, 3], streaks: [3, 7], decks: [0, 0], glow: 1, veil: 0 },
  dawn: { cumulus: [1, 4], streaks: [2, 5], decks: [0, 0], glow: 0.8, veil: 0 },
  night: { cumulus: [0, 2], streaks: [0, 2], decks: [0, 0], glow: 0, veil: 0.45 },
  overcast: { cumulus: [1, 3], streaks: [0, 0], decks: [2, 3], glow: 0, veil: 0.2 },
}

interface Tones {
  shadow: Color
  lit: Color
  hot: Color
  glow: Color
}

interface Part {
  outline: Vec[]
  fill: Paint
}

interface Item {
  altitude: number
  parts: Part[]
}

interface Lobe {
  x: number
  y: number
  r: number
}

const gaussian = (rng: Rng) => (rng.next() + rng.next() + rng.next() - 1.5) / 1.5

function cumulus(rng: Rng, cx: number, base: number, width: number, altitude: number, sunDir: number, fromBelow: boolean, t: Tones): Part[] {
  const height = width * lerp(0.11, 0.22, altitude) * rng.range(0.8, 1.15)
  const n = rng.int(5, 9)
  const lobes: Lobe[] = Array.from({ length: n }, (_, j) => {
    const u = (j + 0.5) / n
    const dome = Math.sin(Math.PI * u) ** 0.7
    const r = (width / n) * rng.range(0.85, 1.25) * (0.7 + 0.5 * dome)
    return { x: cx - width / 2 + u * width + rng.range(-0.15, 0.15) * (width / n), y: base - height * dome * 0.9 + r * 0.55, r }
  })
  for (const side of [-1, 1]) {
    const r = width * rng.range(0.08, 0.12)
    lobes.push({ x: cx + side * width * rng.range(0.5, 0.62), y: base + r * rng.range(0.35, 0.6), r })
  }
  const x0 = Math.min(...lobes.map((l) => l.x - l.r))
  const x1 = Math.max(...lobes.map((l) => l.x + l.r))
  const top = (x: number) => {
    const u = (2 * (x - cx)) / width
    let y = Math.abs(u) < 1 ? base - height * 0.45 * Math.sqrt(1 - u * u) : base
    for (const l of lobes) {
      const dx = x - l.x
      if (Math.abs(dx) < l.r) y = Math.min(y, l.y - Math.sqrt(l.r * l.r - dx * dx))
    }
    return y
  }
  const shiftX = sunDir * width * 0.05
  const shiftY = fromBelow ? height * 0.35 : 0
  const litBase = fromBelow ? base : base - height * 0.16
  const silhouette: Vec[] = [[x0, base]]
  const lit: Vec[] = [[x0, litBase]]
  const samples = 72
  for (let k = 0; k <= samples; k++) {
    const x = lerp(x0, x1, k / samples)
    silhouette.push([x, top(x)])
    lit.push([x, Math.min(litBase, Math.max(top(x), top(x - shiftX) + shiftY))])
  }
  silhouette.push([x1, base])
  lit.push([x1, litBase])
  return [
    { outline: silhouette, fill: solid(t.shadow) },
    { outline: lit, fill: solid(t.lit) },
  ]
}

function streak(rng: Rng, cx: number, y: number, width: number, sunward: number, t: Tones): Part[] {
  const thick = width * rng.range(0.01, 0.022)
  const tilt = rng.range(-0.015, 0.015)
  const phase = rng.range(0, Math.PI * 2)
  const freq = rng.range(2, 5)
  const top: Vec[] = []
  const bottom: Vec[] = []
  const under: Vec[] = []
  const samples = 48
  for (let k = 0; k <= samples; k++) {
    const u = lerp(-1, 1, k / samples)
    const taper = (1 - u * u) ** 0.9
    const x = cx + (u * width) / 2
    const yc = y + ((u * width) / 2) * tilt
    top.push([x, yc - thick * 1.2 * taper * (1 + 0.35 * Math.sin(u * freq * Math.PI + phase))])
    bottom.push([x, yc + thick * 0.45 * taper])
    under.push([x, yc + thick * 0.1 * taper])
  }
  const from: Vec = [cx - (sunward * width) / 2, y]
  const to: Vec = [cx + (sunward * width) / 2, y]
  return [
    {
      outline: [...top, ...[...bottom].reverse()],
      fill: {
        type: 'linear',
        from,
        to,
        stops: [
          [0, t.shadow],
          [1, t.lit],
        ],
      },
    },
    {
      outline: [...under, ...[...bottom].reverse()],
      fill: {
        type: 'linear',
        from,
        to,
        stops: [
          [0, t.lit],
          [1, mix(t.hot, t.glow, 0.4)],
        ],
      },
    },
  ]
}

function deck(rng: Rng, period: number, top: number, thickness: number, t: Tones): Part {
  const noise = loopNoise1D(rng.fork('top'))
  const count = Math.max(3, Math.round(period / (thickness * 1.8)))
  const lobes = Array.from({ length: count }, (_, k) => ({ x: ((k + rng.range(-0.3, 0.3)) / count) * period, r: thickness * rng.range(0.6, 1.1) }))
  const upper: Vec[] = []
  const lower: Vec[] = []
  const samples = Math.ceil(period * 120)
  for (let k = 0; k <= samples; k++) {
    const x = lerp(-0.01, period + 0.01, k / samples)
    let hang = 0
    for (const l of lobes) {
      const dx = x - l.x - period * Math.round((x - l.x) / period)
      if (Math.abs(dx) < l.r) hang = Math.max(hang, Math.sqrt(l.r * l.r - dx * dx) * 0.45)
    }
    upper.push([x, top + (noise(x, period, { octaves: 3, frequency: 4 }) - 0.5) * thickness * 0.4])
    lower.push([x, top + thickness + hang])
  }
  return {
    outline: [...upper, ...lower.reverse()],
    fill: {
      type: 'linear',
      from: [0, top - thickness * 0.2],
      to: [0, top + thickness * 1.5],
      stops: [
        [0, t.lit],
        [0.6, mix(t.lit, t.shadow, 0.5)],
        [1, t.shadow],
      ],
    },
  }
}

export function cloudscape(env: Env, rng: Rng, { horizon, amount, light: sunAt, direction, anchor = sunAt[0] }: CloudscapeOptions): Layer[] {
  const period = env.aspect
  const recipe = RECIPES[env.palette.mood]
  const { skyTop, skyHorizon, light, sun, ink } = env.palette.anchors
  const glowColor = mix(light, sun, 0.4)
  const wrapDx = (x: number, c: number) => x - c - period * Math.round((x - c) / period)
  const sunward = (x: number) => Math.sign(wrapDx(sunAt[0], x)) || 1
  const count = (range: [number, number], r: Rng) => Math.round(r.int(range[0], range[1]) * amount)

  const fromBelow = recipe.glow > 0.5
  const tonesAt = (x: number, y: number, altitude: number): Tones => {
    const sky = mix(skyTop, skyHorizon, clamp(y / horizon) ** 1.6)
    const near = Math.exp(-((wrapDx(x, sunAt[0]) / (period * 0.35)) ** 2))
    const darkSky = mix(skyTop, ink, 0.2)
    const fade = (c: Color) => mix(c, sky, clamp((1 - altitude) ** 2 * 0.55 + recipe.veil))
    if (fromBelow) {
      const lit = mix(sky, glowColor, 0.5 + 0.4 * near)
      return { shadow: fade(mix(sky, darkSky, 0.4)), lit: fade(lit), hot: fade(mix(lit, sun, 0.1 + 0.35 * near)), glow: fade(glowColor) }
    }
    const lit = mix(sky, mix(light, glowColor, recipe.glow), 0.62)
    return { shadow: fade(mix(sky, darkSky, 0.22)), lit: fade(lit), hot: fade(mix(lit, light, 0.45)), glow: fade(glowColor) }
  }

  const far: Item[] = []
  const near: Item[] = []
  const yAt = (altitude: number) => horizon * (1 - altitude)

  const clusterRng = rng.fork('clusters')
  const clusters = Array.from({ length: clusterRng.int(1, 2) }, () => ({
    x: anchor + period * clusterRng.range(0.3, 0.7),
    altitude: clusterRng.range(0.3, 0.7),
  }))
  const placed: [number, number, number, number][] = []
  const overlaps = (box: [number, number, number, number]) =>
    placed.some(([x0, y0, x1, y1]) => {
      const ox = Math.min(x1, box[2]) - Math.max(x0, box[0])
      const oy = Math.min(y1, box[3]) - Math.max(y0, box[1])
      return ox > 0 && oy > 0 && ox * oy > 0.35 * Math.min((x1 - x0) * (y1 - y0), (box[2] - box[0]) * (box[3] - box[1]))
    })
  const cumulusRng = rng.fork('cumulus')
  for (let k = 0, n = count(recipe.cumulus, cumulusRng); k < n; k++) {
    const r = cumulusRng.fork(`${k}`)
    const cluster = r.pick(clusters)
    for (let attempt = 0; attempt < 5; attempt++) {
      const altitude = clamp(cluster.altitude + gaussian(r) * 0.2 + (k === 0 ? 0.1 : 0), 0.1, 0.85)
      const width = Math.min(period * 0.5, lerp(0.16, 0.42, altitude) * r.range(0.75, 1.2) * (k === 0 ? 1.35 : 1))
      const y = Math.max(yAt(altitude), width * 0.26 + 0.03)
      const x = cluster.x + gaussian(r) * period * 0.35
      const box: [number, number, number, number] = [x - width * 0.65, y - width * 0.26, x + width * 0.65, y]
      if (overlaps(box) && attempt < 4) continue
      placed.push(box)
      const item = { altitude, parts: cumulus(r, x, y, width, altitude, sunward(x), fromBelow, tonesAt(x, y, altitude)) }
      ;(altitude >= 0.45 ? near : far).push(item)
      break
    }
  }

  const streakRng = rng.fork('streaks')
  for (let k = 0, n = count(recipe.streaks, streakRng); k < n; k++) {
    const r = streakRng.fork(`${k}`)
    const altitude = lerp(0.03, 0.45, r.next() ** 1.3)
    const x = anchor + gaussian(r) * period * 0.4
    const y = yAt(altitude)
    far.push({ altitude, parts: streak(r, x, y, lerp(0.3, 1, r.next()), sunward(x), tonesAt(x, y, altitude)) })
  }

  const deckRng = rng.fork('decks')
  for (let k = 0, n = count(recipe.decks, deckRng); k < n; k++) {
    const r = deckRng.fork(`${k}`)
    const altitude = lerp(0.3, 0.85, (k + r.range(0.2, 0.8)) / n)
    const y = yAt(altitude)
    far.push({ altitude, parts: [deck(r, period, y, lerp(0.03, 0.09, altitude), tonesAt(sunAt[0] + period / 2, y, altitude))] })
  }

  const toShapes = (items: Item[]): Shape[] =>
    items
      .sort((a, b) => a.altitude - b.altitude)
      .flatMap((item) =>
        item.parts.flatMap((part) => {
          const xs = part.outline.map(([x]) => x)
          const home = -period * Math.floor((Math.min(...xs) + Math.max(...xs)) / 2 / period)
          const minX = Math.min(...xs) + home
          const maxX = Math.max(...xs) + home
          return [home, home - period, home + period]
            .filter((offset) => offset === home || (minX + offset - home < period && maxX + offset - home > 0))
            .map((offset): Shape => {
              const shift = (p: Vec): Vec => [p[0] + offset, p[1]]
              const fill = part.fill.type === 'linear' ? { ...part.fill, from: shift(part.fill.from), to: shift(part.fill.to) } : part.fill
              return { d: polygon(part.outline.map(shift)), fill }
            })
        }),
      )

  return [
    { id: 'clouds-far', role: 'celestial', depth: 0.999, wrap: true, motion: [{ type: 'sway', amount: 0.03 * direction, cycles: 1 }], shapes: toShapes(far) },
    { id: 'clouds-near', role: 'celestial', depth: 0.998, wrap: true, motion: [{ type: 'drift', wraps: direction }], shapes: toShapes(near) },
  ]
}
