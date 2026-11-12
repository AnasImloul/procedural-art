import { lerp, smoothstep } from '@/engine/math'
import { birds, cloudscape, fogBand, forest, lake, lightShafts, ridge, sky, stars, sun, sunHaze, treeline } from '@/engine/primitives'
import type { Layer, Vec } from '@/engine/scene'
import { defineTheme, param } from '@/engine/theme'

export default defineTheme({
  id: 'alpine',
  name: 'Alpine Forest',
  version: 1,
  moods: { golden: 3, dusk: 3, dawn: 2, night: 1, overcast: 1 },
  atmosphere: { gamma: 0.85, maxHaze: 0.9 },
  outline: 'rim',
  loop: { seconds: 60, pan: { seconds: 120, speed: 6 } },

  params: {
    horizon: param.range(0.56, 0.66),
    ridges: param.int(4, 6),
    peakiness: param.range(0.4, 0.9),
    fog: param.range(0.35, 0.8),
    forest: param.range(0.4, 1),
    treeline: param.range(0.35, 0.8),
    snow: param.range(0, 1),
    framing: param.chance(0.7),
    clouds: param.range(0, 1),
    rays: param.chance(0.6),
    lake: param.chance(0.35),
    birds: param.chance(0.5),
  },

  compose({ env, loop, cycle, seconds, rng, p, palette, comp }) {
    const layers: Layer[] = [sky(env, { horizon: p.horizon })]
    if (palette.mood === 'night') layers.push(...stars(env, rng.fork('stars'), { horizon: p.horizon }))
    if (palette.mood === 'dawn') layers.push(...stars(env, rng.fork('stars'), { horizon: p.horizon, density: 0.3, brightness: 0.35 }))
    const heavens = comp.celestial(p.horizon)
    const sunAt = heavens.light
    layers.push(sun(env, { sky: heavens, radius: rng.fork('sun').range(0.035, 0.065) * comp.scale }))
    if (p.rays && !cycle) layers.push(lightShafts(env, rng.fork('rays'), { at: sunAt, length: env.aspect * 0.7 }))

    const cloudDirection = rng.fork('wind').chance(0.5) ? 1 : -1
    layers.push(...cloudscape(env, rng.fork('clouds'), { horizon: p.horizon, amount: p.clouds, light: sunAt, direction: cloudDirection, anchor: comp.focal.x }))
    if (p.birds && (cycle || palette.mood !== 'night')) {
      const visible = palette.mood !== 'night'
      layers.push(...birds(env, rng.fork('birds'), { horizon: p.horizon, anchor: comp.focal.x, direction: cloudDirection, seconds, visible }))
    }

    const depths = comp.depthSteps(p.ridges, { near: 0.1, far: 0.95 })
    const heroIndex = depths.length >= 5 ? 1 : 0
    const heroX = comp.counterX
    const lakeIndex = p.lake && loop !== 'pan' && depths.length >= 4 ? Math.max(heroIndex, depths.length - 3) : -1
    const lakeRng = rng.fork('lake')
    const lakeX = comp.focal.x + lakeRng.range(-0.08, 0.08) * env.aspect
    const lakeWidth = env.aspect * lakeRng.range(0.45, 0.75)
    let behind: Vec[] | undefined
    depths.forEach((depth, i) => {
      const near = i === depths.length - 1
      const hero = i === heroIndex
      const baseline = lerp(p.horizon, 1.02, (1 - depth) ** 1.6)
      const scale = hero ? 1.55 : rng.fork(`scale-${i}`).pick([0.45, 0.7, 0.9, 1.1])
      const unit = lerp(0.08, 0.28, p.peakiness) * lerp(0.45, 1, depth)
      const amplitude = unit * scale
      const treelineY = baseline - p.treeline * unit
      const snowlineY = baseline - lerp(1.5, 0.75, p.snow) * unit
      const r = ridge(env, rng.fork(`ridge-${i}`), {
        depth,
        baseline,
        amplitude,
        peak: hero ? heroX : undefined,
        peakBoost: hero ? 0.8 : 0.45,
        dips:
          i > heroIndex
            ? [
                { x: heroX, width: env.aspect * 0.16, amount: lerp(0.65, 0.35, i / depths.length) },
                { x: comp.focal.x, width: env.aspect * 0.1, amount: 0.35 },
              ]
            : [],
        rim: smoothstep((depth - 0.1) / 0.45),
        lowers:
          lakeIndex >= 0 && i > lakeIndex
            ? [{ x: lakeX, width: lakeWidth * 0.42, amount: lerp(0.08, 0.2, (i - lakeIndex) / (depths.length - lakeIndex)) }]
            : [],
        behind,
        light: sunAt,
        snowline: !near && p.snow > 0.05 ? snowlineY : undefined,
      })
      layers.push(r)
      behind = r.edge
      if (i === lakeIndex) {
        layers.push(...lake(env, lakeRng.fork('water'), { x: lakeX, width: lakeWidth, waterline: baseline + 0.004, depth: depth - 0.012, glitter: sunAt[0] }))
      }
      if (i === Math.min(heroIndex + 1, depths.length - 2)) {
        layers.push(sunHaze(env, { at: [sunAt[0], p.horizon], depth: depth - 0.005, radius: env.aspect * 0.45, strength: 0.5 }))
      }

      if (i > 0 && !near) {
        const h = lerp(0.05, 0.012, depth)
        layers.push(
          forest(env, rng.fork(`forest-${i}`), {
            on: r,
            treeline: treelineY,
            fringe: unit * 0.22,
            height: [h * 0.6, h],
            density: p.forest,
            tone: lerp(0.6, 0.32, depth),
          }),
        )
      }
      if (near) {
        layers.push(
          forest(env, rng.fork('near-forest'), {
            on: r,
            treeline: baseline - amplitude * 3,
            fringe: 0.01,
            height: [0.045, 0.095],
            density: lerp(0.75, 1, p.forest),
            tone: 0.35,
          }),
        )
      }
      if (near && p.framing && loop !== 'pan') {
        layers.push(
          treeline(env, rng.fork('framing'), { on: r, height: [0.28, 0.5], density: 0.85, side: comp.framingSide, reach: 0.28 }),
        )
      }
      if (near && p.framing && loop === 'pan') {
        layers.push(treeline(env, rng.fork('framing'), { on: r, height: [0.14, 0.32], density: 0.3 }))
      }
      if (!near) {
        layers.push(
          fogBand(env, rng.fork(`fog-${i}`), {
            depth: depth - 0.01,
            y: baseline,
            height: lerp(0.05, 0.12, depth),
            density: p.fog * lerp(0.5, 1, depth),
          }),
        )
      }
    })

    return layers
  },
})
