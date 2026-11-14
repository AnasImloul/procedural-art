export const GRAIN_REFERENCE_HEIGHT = 1080
export const GRAIN_FPS = 24

export function hashString(str: string): number {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619)
  return h >>> 0
}

export function cellNoise(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

export function grainSeeds(scene: { seed: string; loop: { seconds: number } }, t: number): [number, number] {
  const frames = Math.max(1, Math.round(scene.loop.seconds * GRAIN_FPS))
  const frame = Math.floor((t - Math.floor(t)) * frames)
  const seed = hashString(`${scene.seed}/grain/${frame}`)
  return [seed, (seed ^ 0x9e3779b9) >>> 0]
}
