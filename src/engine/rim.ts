import { mix } from './color'
import { lerp, smoothstep } from './math'
import type { Palette } from './palette'
import { solid, type Layer, type Shape, type Vec } from './scene'

const LEVELS = 4
const f = (n: number) => String(Math.round(n * 1e4) / 1e4)

export function rimLight(layer: Layer, palette: Palette, light: Vec): Layer {
  const source = layer.edge!
  const span = source[source.length - 1][0] - source[0][0] - 0.02
  const edge: Vec[] = layer.wrap
    ? [
        ...source.filter(([x]) => x - span < source[0][0] && x - span > -0.06).map(([x, y]): Vec => [x - span, y]),
        ...source,
        ...source.filter(([x]) => x + span > source[source.length - 1][0] && x + span < span + 0.06).map(([x, y]): Vec => [x + span, y]),
      ]
    : source
  const width = lerp(0.0034, 0.0012, layer.depth)
  const color = mix(palette.anchors.light, palette.atDepth(layer.depth), 0.1 + 0.45 * layer.depth)
  const strength = palette.light.rim * (typeof layer.rim === 'number' ? layer.rim : 1)
  const smooth = 3
  const period = span
  const runs: string[][] = Array.from({ length: LEVELS - 1 }, () => [])
  let current: Vec[] = []
  let currentLevel = -1

  const flush = () => {
    if (currentLevel >= 0 && current.length > 1) {
      runs[currentLevel].push(current.map(([x, y], i) => `${i ? 'L' : 'M'}${f(x)} ${f(y + width / 2)}`).join(''))
    }
    current = []
  }

  for (let i = 0; i < edge.length - 1; i++) {
    const a = edge[Math.max(0, i - smooth)]
    const b = edge[Math.min(edge.length - 1, i + 1 + smooth)]
    const dx = b[0] - a[0]
    const dy = b[1] - a[1]
    const len = Math.hypot(dx, dy) || 1
    const mx = (edge[i][0] + edge[i + 1][0]) / 2
    const my = (edge[i][1] + edge[i + 1][1]) / 2
    const dxLight = layer.wrap ? mx - light[0] - period * Math.round((mx - light[0]) / period) : mx - light[0]
    const lx = -dxLight
    const ly = light[1] - my
    const llen = Math.hypot(lx, ly) || 1
    const facing = (dy / len) * (lx / llen) + (-dx / len) * (ly / llen)
    const reach = 0.15 + 0.85 * Math.exp(-((dxLight / 0.5) ** 2))
    const v = smoothstep((facing - 0.35) / 0.55) * reach
    const level = Math.min(LEVELS - 1, Math.floor(v * LEVELS)) - 1

    if (level !== currentLevel) {
      flush()
      currentLevel = level
      if (level >= 0) current.push(edge[i])
    }
    if (level >= 0) current.push(edge[i + 1])
  }
  flush()

  const shapes: Shape[] = runs
    .map((paths, i) => ({
      d: paths.join(''),
      stroke: { paint: solid(color), width },
      opacity: ((i + 2) / LEVELS) * strength,
    }))
    .filter((s) => s.d)

  return { id: `${layer.id}:rim`, role: 'light', depth: layer.depth, wrap: layer.wrap, motion: layer.motion, shapes }
}
