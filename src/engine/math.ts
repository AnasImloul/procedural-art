export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const clamp = (x: number, min = 0, max = 1) => Math.min(max, Math.max(min, x))
export const invLerp = (a: number, b: number, x: number) => (x - a) / (b - a)
export const smoothstep = (t: number) => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}
