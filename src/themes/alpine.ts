import { lerp, smoothstep } from '@/engine/math'
import { clouds, fogBand, forest, lightShafts, ridge, sky, stars, sun, sunHaze, treeline } from '@/engine/primitives'
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
    forest: param.range(0.3, 0.9),
    framing: param.chance(0.7),
    clouds: param.range(0, 1),
    rays: param.chance(0.6),
  },

  compose({ env, loop, rng, p, palette, comp }) {
    const layers: Layer[] = [sky(env, { horizon: p.horizon })]
    if (palette.mood === 'night') layers.push(...stars(env, rng.fork('stars'), { horizon: p.horizon }))
    if (palette.mood === 'dawn') layers.push(...stars(env, rng.fork('stars'), { horizon: p.horizon, density: 0.3, brightness: 0.35 }))
    const sunAt = comp.sunPosition(p.horizon)
    layers.push(sun(env, { at: sunAt, radius: rng.fork('sun').range(0.035, 0.065) * comp.scale }))
    if (p.rays) layers.push(lightShafts(env, rng.fork('rays'), { at: sunAt, length: env.aspect * 0.7 }))

    const cloudOpacity = palette.mood === 'night' ? 0.45 : 0.9
    const cloudDirection = rng.fork('wind').chance(0.5) ? 1 : -1
    const cloudRng = rng.fork('cloud-clusters')
    const cloudClusters = Array.from({ length: cloudRng.int(1, 2) }, () => sunAt[0] + env.aspect * cloudRng.range(0.3, 0.7))
    layers.push(
      clouds(env, rng.fork('clouds-far'), {
        horizon: p.horizon,
        count: Math.round(p.clouds * 5),
        band: [0.45, 0.85],
        size: [0.12, 0.3],
        depth: 0.999,
        opacity: cloudOpacity * 0.8,
        clusters: cloudClusters,
        spread: 0.3,
        light: sunAt,
        motion: [{ type: 'sway', amount: 0.04 * cloudDirection, cycles: 1 }],
      }),
      clouds(env, rng.fork('clouds-near'), {
        horizon: p.horizon,
        count: Math.round(p.clouds * 3),
        band: [0.15, 0.55],
        size: [0.3, 0.6],
        depth: 0.998,
        opacity: cloudOpacity,
        clusters: cloudClusters,
        spread: 0.22,
        light: sunAt,
        motion: [{ type: 'drift', wraps: cloudDirection }],
      }),
    )

    const depths = comp.depthSteps(p.ridges, { near: 0.1, far: 0.95 })
    const heroIndex = depths.length >= 5 ? 1 : 0
    const heroX = comp.counterX
    let behind: Vec[] | undefined
    depths.forEach((depth, i) => {
      const near = i === depths.length - 1
      const hero = i === heroIndex
      const baseline = lerp(p.horizon, 1.02, (1 - depth) ** 1.6)
      const scale = hero ? 1.55 : rng.fork(`scale-${i}`).pick([0.45, 0.7, 0.9, 1.1])
      const amplitude = lerp(0.08, 0.28, p.peakiness) * lerp(0.45, 1, depth) * scale
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
                { x: sunAt[0], width: env.aspect * 0.1, amount: 0.35 },
              ]
            : [],
        rim: smoothstep((depth - 0.1) / 0.45),
        behind,
        light: sunAt,
      })
      layers.push(r)
      behind = r.edge
      if (i <= heroIndex + 1 && !near) {
        layers.push(sunHaze(env, { at: [sunAt[0], p.horizon], depth: depth - 0.005, radius: env.aspect * 0.45, strength: i === 0 ? 0.45 : 0.25 }))
      }

      const forested = rng.fork(`forested-${i}`)
      if (i > 0 && !near && forested.chance(0.65)) {
        const h = lerp(0.05, 0.012, depth)
        const kind = forested.weighted({ full: 3, belt: 4, patches: 2.5 })
        const reach = kind === 'full' ? forested.range(0.85, 1.05) : kind === 'belt' ? forested.range(0.25, 0.6) : forested.range(0.4, 0.8)
        layers.push(
          forest(env, rng.fork(`forest-${i}`), {
            on: r,
            treeline: baseline - amplitude * reach,
            height: [h * 0.6, h],
            density: lerp(0.6, 1.2, p.forest),
            tone: lerp(0.6, 0.32, depth),
            clearing: kind === 'patches' ? 0.55 : kind === 'full' ? 0.05 : 0.2,
          }),
        )
      }
      if (near) {
        layers.push(
          forest(env, rng.fork('near-forest'), {
            on: r,
            treeline: baseline - amplitude * 3,
            height: [0.045, 0.095],
            density: 1.1,
            tone: 0.35,
            clearing: 0.12,
          }),
        )
      }
      if (near && p.framing && loop === 'ambient') {
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
