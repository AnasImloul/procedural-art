import { mix, type Color } from './color'
import { clamp, lerp } from './math'
import { ANCHOR_KEYS, MOOD_LIGHT, MOODS, type AnchorKey, type Anchors, type MoodId, type MoodLight } from './moods'
import type { Rng } from './rng'

const MID = 0.45
const MUTE = { chroma: 0.78, contrast: 0.9, lift: 0.03 }

export interface Atmosphere {
  gamma: number
  maxHaze: number
}

export type PaletteOverrides = Partial<Record<MoodId, Partial<Record<AnchorKey, Color>>>>

export interface Palette {
  mood: MoodId
  anchors: Anchors
  light: MoodLight
  atDepth(depth: number): Color
}

export function makePalette(rng: Rng, mood: MoodId, atmosphere: Atmosphere, overrides?: PaletteOverrides): Palette {
  const hueShift = rng.fork('hue').range(-8, 8)
  const anchors = {} as Anchors
  for (const key of ANCHOR_KEYS) {
    const base = overrides?.[mood]?.[key] ?? MOODS[mood][key]
    const r = rng.fork(key)
    const l = clamp(base.l + r.range(-0.03, 0.03), 0.04, 0.97)
    anchors[key] = {
      l: clamp(0.5 + (l - 0.5) * MUTE.contrast + MUTE.lift, 0.04, 0.97),
      c: base.c * r.range(0.9, 1.1) * MUTE.chroma,
      h: (base.h + hueShift + 360) % 360,
      a: base.a,
    }
  }
  return paletteFrom(mood, anchors, MOOD_LIGHT[mood], atmosphere)
}

function paletteFrom(mood: MoodId, anchors: Anchors, light: MoodLight, atmosphere: Atmosphere): Palette {
  return {
    mood,
    anchors,
    light,
    atDepth: (depth) => {
      const a = atmosphere.maxHaze * clamp(depth) ** atmosphere.gamma
      return a < MID ? mix(anchors.ink, anchors.mid, a / MID) : mix(anchors.mid, anchors.haze, (a - MID) / (1 - MID))
    },
  }
}

export function blendPalettes(a: Palette, b: Palette, w: number, atmosphere: Atmosphere): Palette {
  const anchors = {} as Anchors
  for (const key of ANCHOR_KEYS) anchors[key] = mix(a.anchors[key], b.anchors[key], w)
  const light = {} as MoodLight
  for (const key of Object.keys(a.light) as (keyof MoodLight)[]) {
    const x = a.light[key]
    const y = b.light[key]
    ;(light as unknown as Record<string, number | boolean>)[key] = typeof x === 'number' && typeof y === 'number' ? lerp(x, y, w) : w < 0.5 ? x : y
  }
  return paletteFrom(w < 0.5 ? a.mood : b.mood, anchors, light, atmosphere)
}
