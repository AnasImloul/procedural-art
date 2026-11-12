import type { Color } from './color'
import type { Palette } from './palette'
import { rimLight } from './rim'

export type Vec = [number, number]

export type Paint =
  | { type: 'solid'; color: Color }
  | { type: 'linear'; from: Vec; to: Vec; stops: [number, Color][] }
  | { type: 'radial'; center: Vec; radius: number; stops: [number, Color][]; squash?: number }

export interface Shape {
  d: string
  fill?: Paint
  stroke?: { paint: Paint; width: number }
  opacity?: number
  blend?: 'normal' | 'screen' | 'multiply'
}

export type Motion =
  | { type: 'drift'; wraps: number }
  | { type: 'sway'; amount: number; cycles: number }
  | { type: 'fade'; amount: number; cycles: number; phase?: number }

export interface Layer {
  id: string
  role: 'sky' | 'celestial' | 'terrain' | 'prop' | 'fog' | 'particles' | 'light'
  depth: number
  shapes: Shape[]
  rim?: boolean | number
  edge?: Vec[]
  light?: Vec
  lightRadius?: number
  parallax?: number
  wrap?: boolean
  motion?: Motion[]
}

export type ParamValue = number | boolean

export interface PostFx {
  grain: number
  vignette: number
  bloom: number
}

export type LoopMode = 'ambient' | 'pan'

export interface Scene {
  seed: string
  aspect: number
  palette: Palette
  params: Record<string, ParamValue>
  loop: { mode: LoopMode; seconds: number }
  layers: Layer[]
  post: PostFx
  attempt: number
}

export const ASPECTS = { '16:9': 16 / 9, '3:2': 3 / 2, '1:1': 1, '9:16': 9 / 16 } as const
export type AspectId = keyof typeof ASPECTS

export const solid = (color: Color): Paint => ({ type: 'solid', color })

export function finalize(layers: Layer[], palette: Palette, outline: 'rim' | 'contour' | 'none'): Layer[] {
  const light = layers.find((l) => l.light)?.light
  return [...layers]
    .sort((a, b) => b.depth - a.depth)
    .flatMap((layer) => {
      if (layer.role !== 'terrain' && layer.role !== 'prop') return [layer]
      const fill = solid(palette.atDepth(layer.depth))
      const filled = { ...layer, shapes: layer.shapes.map((s) => (s.fill ? s : { ...s, fill })) }
      return outline === 'rim' && light && layer.rim && layer.edge ? [filled, rimLight(filled, palette, light)] : [filled]
    })
}

export function checkScene(scene: Scene): string[] {
  const terrain = scene.layers.filter((l) => l.role === 'terrain')
  const warnings: string[] = []
  for (let i = 1; i < terrain.length; i++) {
    if (terrain[i].depth === terrain[i - 1].depth) continue
    const delta = scene.palette.atDepth(terrain[i - 1].depth).l - scene.palette.atDepth(terrain[i].depth).l
    if (Math.abs(delta) < 0.04) {
      warnings.push(`Low contrast between ${terrain[i - 1].id} and ${terrain[i].id}: ΔL ${delta.toFixed(3)}`)
    }
  }
  for (const layer of scene.layers) {
    for (const m of layer.motion ?? []) {
      const count = m.type === 'drift' ? m.wraps : m.cycles
      if (!Number.isInteger(count)) warnings.push(`${layer.id}: ${m.type} must complete a whole number of cycles per loop, got ${count}`)
      if ((m.type === 'drift' || m.type === 'sway') && !layer.wrap) warnings.push(`${layer.id}: ${m.type} needs wrap: true geometry`)
    }
  }
  return warnings
}
