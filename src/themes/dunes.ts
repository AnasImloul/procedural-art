import { lerp, smoothstep } from '@/engine/math'
import { mix, oklch } from '@/engine/color'
import { sampleEdge } from '@/engine/geometry'
import { cloudscape, deadTree, dunes, fogBand, lightShafts, mesas, sandWisps, scrub, sky, stars, sun, sunHaze } from '@/engine/primitives'
import { solid, type Layer, type Vec } from '@/engine/scene'
import { defineTheme, param } from '@/engine/theme'

export default defineTheme({
  id: 'dunes',
  name: 'Desert Dunes',
  version: 1,
  moods: { golden: 3, dusk: 3, night: 2, dawn: 1 },
  atmosphere: { gamma: 1, maxHaze: 0.85 },
  palette: {
    overcast: {
      haze: oklch(0.8, 0.025, 75),
      mid: oklch(0.6, 0.04, 62),
      ink: oklch(0.34, 0.035, 50),
    },
  },
  outline: 'rim',
  loop: { seconds: 60, pan: { seconds: 120, speed: 6 } },
  quality: { skyline: [0.35, 0.62] },

  params: {
    horizon: param.range(0.5, 0.6),
    layers: param.int(3, 5),
    height: param.range(0.8, 1.3),
    scale: param.range(0.8, 1.25),
    haze: param.range(0.2, 0.5),
    mesas: param.chance(0.6),
    clouds: param.range(0, 0.6),
    rays: param.chance(0.5),
    scrub: param.range(0.3, 1),
    wind: param.range(0.2, 1),
    tree: param.chance(0.55),
  },

  compose({ env, loop, rng, p, palette, comp }) {
    const layers: Layer[] = [sky(env, { horizon: p.horizon })]
    if (palette.mood === 'night') layers.push(...stars(env, rng.fork('stars'), { horizon: p.horizon, density: 1.3 }))
    const sunAt = comp.sunPosition(p.horizon)
    layers.push(sun(env, { at: sunAt, radius: rng.fork('sun').range(0.04, 0.075) * comp.scale }))
    layers.push(sunHaze(env, { at: [sunAt[0], p.horizon], depth: 0.9, radius: env.aspect * 0.5, strength: 0.4 }))
    if (p.rays) layers.push(lightShafts(env, rng.fork('rays'), { at: sunAt, length: env.aspect * 0.75, strength: 0.06 }))
    layers.push(
      ...cloudscape(env, rng.fork('clouds'), {
        horizon: p.horizon,
        amount: p.clouds,
        light: sunAt,
        direction: comp.focal.side === 'left' ? -1 : 1,
      }),
    )

    let behind: Vec[] | undefined
    if (p.mesas) {
      const far = mesas(env, rng.fork('mesas'), {
        depth: 0.97,
        baseline: p.horizon + 0.01,
        height: rng.fork('mesa-height').range(0.06, 0.1),
        count: [2, 5],
        light: sunAt,
        hero: comp.focal.x + env.aspect * 0.5,
      })
      layers.push(far)
      behind = far.edge
    }

    const wind = comp.focal.side === 'left' ? 1 : -1
    const depths = comp.depthSteps(p.layers, { near: 0.08, far: 0.8 })
    const heroIndex = depths.length >= 4 ? 1 : 0
    const heroX = comp.counterX
    depths.forEach((depth, i) => {
      const hero = i === heroIndex
      const baseline = lerp(p.horizon + 0.02, 1.05, (1 - depth) ** 1.4)
      const scale = hero ? 1.5 : i === depths.length - 1 ? rng.fork('near-scale').pick([1.2, 1.5, 1.8]) : rng.fork(`scale-${i}`).pick([0.55, 0.8, 1, 1.15])
      const d = dunes(env, rng.fork(`dunes-${i}`), {
        depth,
        baseline,
        amplitude: lerp(0.22, 0.06, depth) * p.height * scale,
        spacing: lerp(1.6, 0.45, depth) * p.scale,
        wind,
        rim: lerp(0.35, 1, smoothstep(depth / 0.5)),
        behind,
        peak: hero ? heroX : undefined,
        peakBoost: hero ? 0.65 : 0.3,
        dips:
          i > heroIndex
            ? [
                { x: heroX, width: env.aspect * 0.16, amount: lerp(0.6, 0.3, i / depths.length) },
                { x: sunAt[0], width: env.aspect * 0.1, amount: 0.3 },
              ]
            : [],
      })
      layers.push(d)
      behind = d.edge
      const near = i === depths.length - 1
      if (i >= depths.length - 2) {
        layers.push(
          sandWisps(env, rng.fork(`wisps-${i}`), { on: d, wind, strength: 0.5 * p.wind, length: lerp(0.07, 0.16, 1 - depth) }),
        )
      }
      if (near) {
        layers.push(scrub(env, rng.fork('scrub'), { on: d, size: [0.03, 0.065], density: p.scrub, lean: wind * 0.35 }))
      }
      if (near && p.tree && loop === 'ambient') {
        const t = rng.fork('dead-tree')
        const x = comp.framingSide === 'left' ? env.aspect * t.range(0.06, 0.2) : env.aspect * t.range(0.8, 0.94)
        layers.push({
          id: 'dead-tree',
          role: 'terrain',
          depth,
          shapes: [
            {
              d: deadTree(t, x, sampleEdge(d.edge!, x), t.range(0.22, 0.36), wind * t.range(0.1, 0.4)),
              fill: solid(mix(palette.atDepth(depth), palette.anchors.ink, 0.45)),
            },
          ],
        })
      }
      if (i < depths.length - 1) {
        layers.push(
          fogBand(env, rng.fork(`haze-${i}`), {
            depth: depth - 0.01,
            y: baseline,
            height: lerp(0.03, 0.07, depth),
            density: p.haze * lerp(0.4, 1, depth),
            strips: 1,
          }),
        )
      }
    })

    return layers
  },
})
