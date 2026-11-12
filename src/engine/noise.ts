import { createNoise2D, createNoise3D } from 'simplex-noise'
import type { Rng } from './rng'

export interface Fbm {
  octaves: number
  lacunarity?: number
  gain?: number
  ridged?: boolean
}

export function noise1D(rng: Rng) {
  const n = createNoise2D(() => rng.next())
  return (x: number, { octaves, lacunarity = 2, gain = 0.5, ridged = false }: Fbm): number => {
    let sum = 0
    let amp = 1
    let freq = 1
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      const v = n(x * freq, i * 17.31)
      sum += amp * (ridged ? 1 - Math.abs(v) : v * 0.5 + 0.5)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}

export interface LoopFbm {
  octaves: number
  frequency: number
  lacunarity?: number
  gain?: number
  ridged?: boolean
}

export function loopNoise1D(rng: Rng) {
  const n = createNoise3D(() => rng.next())
  return (x: number, period: number, { octaves, frequency, lacunarity = 2, gain = 0.5, ridged = false }: LoopFbm): number => {
    const angle = (x / period) * Math.PI * 2
    const radius = (frequency * period) / (Math.PI * 2)
    const cx = Math.cos(angle) * radius
    const cy = Math.sin(angle) * radius
    let sum = 0
    let amp = 1
    let freq = 1
    let norm = 0
    for (let i = 0; i < octaves; i++) {
      const v = n(cx * freq, cy * freq, i * 17.31)
      sum += amp * (ridged ? 1 - Math.abs(v) : v * 0.5 + 0.5)
      norm += amp
      amp *= gain
      freq *= lacunarity
    }
    return sum / norm
  }
}
