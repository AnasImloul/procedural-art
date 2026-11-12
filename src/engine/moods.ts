import { oklch, type Color } from './color'

export const ANCHOR_KEYS = ['skyTop', 'skyHorizon', 'sun', 'haze', 'mid', 'ink', 'light', 'accent'] as const
export type AnchorKey = (typeof ANCHOR_KEYS)[number]
export type Anchors = Record<AnchorKey, Color>

export const MOOD_IDS = ['dawn', 'golden', 'dusk', 'night', 'overcast'] as const
export type MoodId = (typeof MOOD_IDS)[number]

export const MOODS: Record<MoodId, Anchors> = {
  dawn: {
    skyTop: oklch(0.56, 0.07, 262),
    skyHorizon: oklch(0.86, 0.08, 25),
    sun: oklch(0.96, 0.05, 70),
    haze: oklch(0.77, 0.07, 350),
    mid: oklch(0.5, 0.09, 312),
    ink: oklch(0.27, 0.05, 270),
    light: oklch(0.92, 0.07, 45),
    accent: oklch(0.72, 0.1, 185),
  },
  golden: {
    skyTop: oklch(0.72, 0.08, 235),
    skyHorizon: oklch(0.87, 0.12, 78),
    sun: oklch(0.97, 0.06, 95),
    haze: oklch(0.8, 0.1, 68),
    mid: oklch(0.52, 0.13, 38),
    ink: oklch(0.28, 0.06, 32),
    light: oklch(0.93, 0.1, 85),
    accent: oklch(0.65, 0.11, 210),
  },
  dusk: {
    skyTop: oklch(0.32, 0.08, 285),
    skyHorizon: oklch(0.78, 0.13, 55),
    sun: oklch(0.94, 0.08, 85),
    haze: oklch(0.68, 0.1, 25),
    mid: oklch(0.42, 0.11, 345),
    ink: oklch(0.2, 0.05, 300),
    light: oklch(0.86, 0.12, 70),
    accent: oklch(0.7, 0.12, 200),
  },
  night: {
    skyTop: oklch(0.16, 0.04, 265),
    skyHorizon: oklch(0.36, 0.06, 250),
    sun: oklch(0.95, 0.02, 230),
    haze: oklch(0.44, 0.05, 245),
    mid: oklch(0.27, 0.06, 228),
    ink: oklch(0.12, 0.03, 270),
    light: oklch(0.78, 0.05, 230),
    accent: oklch(0.78, 0.12, 80),
  },
  overcast: {
    skyTop: oklch(0.7, 0.02, 235),
    skyHorizon: oklch(0.86, 0.02, 200),
    sun: oklch(0.93, 0.02, 90),
    haze: oklch(0.8, 0.02, 210),
    mid: oklch(0.54, 0.045, 172),
    ink: oklch(0.32, 0.03, 220),
    light: oklch(0.9, 0.02, 200),
    accent: oklch(0.6, 0.08, 150),
  },
}

export interface MoodLight {
  rim: number
  sunOpacity: number
  glow: number
  glowReach: number
  lit: number
  haze: number
  rays: number
  band: number
  underlit: boolean
}

export const MOOD_LIGHT: Record<MoodId, MoodLight> = {
  dawn: { rim: 0.8, sunOpacity: 1, glow: 0.9, glowReach: 1, lit: 1, haze: 0.8, rays: 0.8, band: 1.35, underlit: true },
  golden: { rim: 1, sunOpacity: 1, glow: 1, glowReach: 1, lit: 1.5, haze: 1, rays: 1, band: 1.3, underlit: true },
  dusk: { rim: 1, sunOpacity: 1, glow: 1, glowReach: 1, lit: 1.25, haze: 1, rays: 1, band: 1.6, underlit: true },
  night: { rim: 0.55, sunOpacity: 1, glow: 0.7, glowReach: 1, lit: 0.6, haze: 0.45, rays: 0, band: 1, underlit: false },
  overcast: { rim: 0.25, sunOpacity: 0.3, glow: 0.55, glowReach: 2.4, lit: 0.4, haze: 0.35, rays: 0, band: 1, underlit: false },
}
