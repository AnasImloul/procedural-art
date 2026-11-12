import { mix } from '../color'
import { MOOD_LIGHT } from '../moods'
import { polygon } from '../path'
import type { Rng } from '../rng'
import type { Layer, Motion, Shape, Vec } from '../scene'
import type { Env } from '../theme'

export interface CloudsOptions {
  horizon: number
  count: number
  band: [number, number]
  size: [number, number]
  depth: number
  motion: Motion[]
  opacity?: number
  clusters?: number[]
  spread?: number
  light?: Vec
}

interface Lobe {
  x: number
  r: number
}

export function clouds(env: Env, rng: Rng, { horizon, count, band, size, depth, motion, opacity = 0.9, clusters, spread = 0.35, light: sunAt }: CloudsOptions): Layer {
  const { skyTop, skyHorizon, light, haze, sun } = env.palette.anchors
  const underlit = MOOD_LIGHT[env.palette.mood].underlit
  const shapes: Shape[] = []

  for (let i = 0; i < count; i++) {
    const width = rng.range(size[0], size[1])
    const cx = clusters?.length
      ? rng.pick(clusters) + (rng.next() + rng.next() - 1) * spread * env.aspect
      : rng.range(0, env.aspect)
    const base = rng.range(band[0], band[1]) * horizon
    const lobeCount = rng.int(6, 11)
    const lobes: Lobe[] = Array.from({ length: lobeCount }, (_, j) => {
      const u = (j + 0.5) / lobeCount
      const taper = Math.sin(Math.PI * u) ** 0.8
      return {
        x: cx - width / 2 + u * width + rng.range(-0.4, 0.4) * (width / lobeCount),
        r: width * (0.05 + rng.range(0.6, 1.2) * 0.13 * taper),
      }
    })
    const x0 = Math.min(...lobes.map((l) => l.x - l.r))
    const x1 = Math.max(...lobes.map((l) => l.x + l.r))
    const samples = 64
    const outline: Vec[] = [[x0, base]]
    let top = base
    for (let k = 0; k <= samples; k++) {
      const x = x0 + ((x1 - x0) * k) / samples
      let y = base
      for (const l of lobes) {
        const dx = x - l.x
        if (Math.abs(dx) < l.r) y = Math.min(y, base - Math.sqrt(l.r * l.r - dx * dx) * 0.55)
      }
      top = Math.min(top, y)
      outline.push([x, y])
    }
    outline.push([x1, base])

    const sky = mix(skyTop, skyHorizon, Math.min(1, base / horizon) ** 1.6)
    const dx = sunAt ? cx - sunAt[0] - env.aspect * Math.round((cx - sunAt[0]) / env.aspect) : env.aspect
    const near = Math.exp(-((dx / (env.aspect * 0.35)) ** 2))
    const glow = mix(light, sun, 0.4)
    const fill: Shape['fill'] = underlit
      ? {
          type: 'linear',
          from: [0, top],
          to: [0, base],
          stops: [
            [0, mix(sky, skyTop, 0.25)],
            [0.55, mix(sky, glow, 0.25 + 0.3 * near)],
            [1, mix(sky, glow, 0.5 + 0.45 * near)],
          ],
        }
      : {
          type: 'linear',
          from: [0, top],
          to: [0, base],
          stops: [
            [0, mix(sky, light, 0.55)],
            [1, mix(sky, haze, 0.35)],
          ],
        }
    for (const offset of [0, -env.aspect, env.aspect]) {
      if (offset !== 0 && (x0 + offset > env.aspect || x1 + offset < 0)) continue
      shapes.push({ d: polygon(outline.map(([x, y]) => [x + offset, y])), fill, opacity })
    }
  }

  return { id: `clouds@${depth.toFixed(3)}`, role: 'celestial', depth, wrap: true, motion, shapes }
}
