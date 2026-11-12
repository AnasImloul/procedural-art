import { mix, type Color } from './color'
import { clamp } from './math'
import { ANCHOR_KEYS, MOODS, type AnchorKey, type Anchors, type MoodId } from './moods'
import type { Rng } from './rng'

const MID = 0.45

export interface Atmosphere {
  gamma: number
  maxHaze: number
}

export type PaletteOverrides = Partial<Record<MoodId, Partial<Record<AnchorKey, Color>>>>

export interface Palette {
  mood: MoodId
  anchors: Anchors
  atDepth(depth: number): Color
}

export function makePalette(rng: Rng, mood: MoodId, atmosphere: Atmosphere, overrides?: PaletteOverrides): Palette {
  const hueShift = rng.fork('hue').range(-8, 8)
  const anchors = {} as Anchors
  for (const key of ANCHOR_KEYS) {
    const base = overrides?.[mood]?.[key] ?? MOODS[mood][key]
    const r = rng.fork(key)
    anchors[key] = {
      l: clamp(base.l + r.range(-0.03, 0.03), 0.04, 0.97),
      c: base.c * r.range(0.9, 1.1),
      h: (base.h + hueShift + 360) % 360,
      a: base.a,
    }
  }
  return {
    mood,
    anchors,
    atDepth: (depth) => {
      const a = atmosphere.maxHaze * clamp(depth) ** atmosphere.gamma
      return a < MID ? mix(anchors.ink, anchors.mid, a / MID) : mix(anchors.mid, anchors.haze, (a - MID) / (1 - MID))
    },
  }
}
