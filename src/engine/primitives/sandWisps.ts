import { mix, withAlpha } from '../color'
import { lerp } from '../math'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Layer, Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface SandWispsOptions {
  on: Layer
  wind: 1 | -1
  strength: number
  length: number
}

export function sandWisps(env: Env, rng: Rng, { on, wind, strength, length }: SandWispsOptions): Layer {
  if (!on.edge) throw new Error(`sandWisps: layer ${on.id} has no edge`)
  const edge = on.edge
  const period = env.aspect
  const win = 6
  const shapes: Shape[] = []
  const color = mix(env.palette.anchors.light, env.palette.anchors.sun, 0.3)
  for (let i = win; i < edge.length - win; i++) {
    const [x, y] = edge[i]
    if (x < 0 || x >= period) continue
    let crest = true
    for (let k = i - win; k <= i + win && crest; k++) if (edge[k][1] < y) crest = false
    if (!crest || !rng.chance(0.7)) continue
    const streaks = rng.int(2, 4)
    for (let s = 0; s < streaks; s++) {
      const len = length * rng.range(0.5, 1)
      const lift = rng.range(-0.15, 0.05) * len
      const thick = len * rng.range(0.04, 0.075)
      const start: Vec = [x + wind * rng.range(0, 0.15) * len, y - rng.range(0, 0.3) * thick]
      const end: Vec = [start[0] + wind * len, start[1] + lift]
      const mid: Vec = [lerp(start[0], end[0], 0.4), lerp(start[1], end[1], 0.4) - thick * 0.6]
      const outline: Vec[] = [start, [mid[0], mid[1] - thick], end, [mid[0], mid[1] + thick * 0.4]]
      const fill: Shape['fill'] = {
        type: 'linear',
        from: start,
        to: end,
        stops: [
          [0, withAlpha(color, strength)],
          [0.5, withAlpha(color, strength * 0.4)],
          [1, withAlpha(color, 0)],
        ],
      }
      for (const offset of [0, -period, period]) {
        const xs = outline.map(([px]) => px + offset)
        if (offset !== 0 && (Math.max(...xs) < 0 || Math.min(...xs) > period)) continue
        shapes.push({ d: polygon(outline.map(([px, py]) => [px + offset, py])), fill: { ...fill, from: [start[0] + offset, start[1]], to: [end[0] + offset, end[1]] } })
      }
    }
  }
  const motion = rng.fork('motion')
  return {
    id: `wisps@${on.depth.toFixed(2)}`,
    role: 'fog',
    depth: on.depth - 0.002,
    wrap: true,
    shapes,
    motion: [{ type: 'fade', amount: 0.7, cycles: motion.int(3, 6), phase: motion.range(0, Math.PI * 2) }],
  }
}
