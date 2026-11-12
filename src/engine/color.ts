import { clamp, lerp } from './math'

export interface Color {
  l: number
  c: number
  h: number
  a?: number
}

type Vec3 = [number, number, number]

export const oklch = (l: number, c: number, h: number, a = 1): Color => ({ l, c, h, a })

export const withAlpha = (color: Color, a: number): Color => ({ ...color, a })

function toLab({ l, c, h }: Color): Vec3 {
  const rad = (h * Math.PI) / 180
  return [l, c * Math.cos(rad), c * Math.sin(rad)]
}

function fromLab([l, a, b]: Vec3, alpha: number): Color {
  let h = (Math.atan2(b, a) * 180) / Math.PI
  if (h < 0) h += 360
  return { l, c: Math.hypot(a, b), h, a: alpha }
}

export function mix(x: Color, y: Color, t: number): Color {
  const a = toLab(x)
  const b = toLab(y)
  return fromLab([lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)], lerp(x.a ?? 1, y.a ?? 1, t))
}

export function ramp(from: Color, to: Color, steps = 8, ease: (t: number) => number = (t) => t): [number, Color][] {
  return Array.from({ length: steps }, (_, i) => {
    const t = i / (steps - 1)
    return [t, mix(from, to, ease(t))]
  })
}

function linearRgb(color: Color): Vec3 {
  const [L, a, b] = toLab(color)
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
}

const inGamut = (rgb: Vec3) => rgb.every((v) => v >= -1e-4 && v <= 1 + 1e-4)

const encode = (v: number) => {
  const x = clamp(v)
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055))
}

export function toRgb(color: Color): Vec3 {
  let rgb = linearRgb(color)
  if (!inGamut(rgb)) {
    let lo = 0
    let hi = color.c
    for (let i = 0; i < 12; i++) {
      const mid = (lo + hi) / 2
      if (inGamut(linearRgb({ ...color, c: mid }))) lo = mid
      else hi = mid
    }
    rgb = linearRgb({ ...color, c: lo })
  }
  return [encode(rgb[0]), encode(rgb[1]), encode(rgb[2])]
}

export function toCss(color: Color): string {
  const [r, g, b] = toRgb(color)
  const a = color.a ?? 1
  return a >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${+a.toFixed(4)})`
}
