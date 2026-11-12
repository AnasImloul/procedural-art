import { toRgb, withAlpha, type Color } from '../engine/color'
import { motionAt } from '../engine/motion'
import type { Paint, Scene, Shape } from '../engine/scene'
import { cellNoise, GRAIN_REFERENCE_HEIGHT, grainSeeds } from './grain'

export type SvgMode = 'clean' | 'styled'

const f = (n: number) => String(Math.round(n * 1e4) / 1e4)
const hex = (color: Color) => `#${toRgb(color).map((v) => v.toString(16).padStart(2, '0')).join('')}`
const alpha = (color: Color) => +(color.a ?? 1).toFixed(4)
const escapeId = (id: string) => id.replace(/[^a-zA-Z0-9_-]/g, '-')

class Defs {
  private items: string[] = []

  gradient(paint: Exclude<Paint, { type: 'solid' }>): string {
    const id = `g${this.items.length}`
    const stops = paint.stops
      .map(([offset, color]) => {
        const a = alpha(color)
        return `<stop offset="${f(offset)}" stop-color="${hex(color)}"${a < 1 ? ` stop-opacity="${a}"` : ''}/>`
      })
      .join('')
    const geometry =
      paint.type === 'linear'
        ? `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${f(paint.from[0])}" y1="${f(paint.from[1])}" x2="${f(paint.to[0])}" y2="${f(paint.to[1])}">`
        : `<radialGradient id="${id}" gradientUnits="userSpaceOnUse" cx="${f(paint.center[0])}" cy="${f(paint.center[1])}" r="${f(paint.radius)}"${
            paint.squash && paint.squash !== 1
              ? ` gradientTransform="translate(${f(paint.center[0])} ${f(paint.center[1])}) scale(1 ${f(paint.squash)}) translate(${f(-paint.center[0])} ${f(-paint.center[1])})"`
              : ''
          }>`
    this.items.push(`${geometry}${stops}</${paint.type === 'linear' ? 'linearGradient' : 'radialGradient'}>`)
    return id
  }

  add(markup: string) {
    this.items.push(markup)
  }

  toString() {
    return this.items.length ? `<defs>${this.items.join('')}</defs>` : ''
  }
}

function paintAttrs(defs: Defs, paint: Paint, kind: 'fill' | 'stroke'): string {
  if (paint.type !== 'solid') return `${kind}="url(#${defs.gradient(paint)})"`
  const a = alpha(paint.color)
  return `${kind}="${hex(paint.color)}"${a < 1 ? ` ${kind}-opacity="${a}"` : ''}`
}

function shapeMarkup(defs: Defs, shape: Shape, mode: SvgMode): string {
  if (!shape.d) return ''
  const attrs = [shape.fill ? paintAttrs(defs, shape.fill, 'fill') : 'fill="none"']
  if (shape.stroke) {
    attrs.push(
      paintAttrs(defs, shape.stroke.paint, 'stroke'),
      `stroke-width="${f(shape.stroke.width)}"`,
      'stroke-linejoin="round"',
      'stroke-linecap="round"',
    )
  }
  if (shape.opacity !== undefined && shape.opacity < 1) attrs.push(`opacity="${f(shape.opacity)}"`)
  if (mode === 'styled' && shape.blend && shape.blend !== 'normal') attrs.push(`style="mix-blend-mode:${shape.blend}"`)
  return `<path d="${shape.d}" ${attrs.join(' ')}/>`
}

const GRAIN_TILE = 256

function grainTile(scene: Scene): string {
  const [seed, seed2] = grainSeeds(scene, 0)
  const canvas = document.createElement('canvas')
  canvas.width = GRAIN_TILE
  canvas.height = GRAIN_TILE
  const ctx = canvas.getContext('2d')!
  const image = ctx.createImageData(GRAIN_TILE, GRAIN_TILE)
  const amp = scene.post.grain * 255
  for (let y = 0; y < GRAIN_TILE; y++) {
    for (let x = 0; x < GRAIN_TILE; x++) {
      const n = (cellNoise(x, y, seed) + cellNoise(x, y, seed2) - 1) * amp
      const i = (y * GRAIN_TILE + x) * 4
      const v = n > 0 ? 255 : 0
      image.data[i] = v
      image.data[i + 1] = v
      image.data[i + 2] = v
      image.data[i + 3] = Math.min(255, Math.round((Math.abs(n) / 128) * 255))
    }
  }
  ctx.putImageData(image, 0, 0)
  return canvas.toDataURL('image/png')
}

export function renderSvg(scene: Scene, { mode, height = 1080 }: { mode: SvgMode; height?: number }): string {
  const defs = new Defs()
  const w = scene.aspect
  const body: string[] = []
  const clips = new Map<string, string>()

  for (const layer of scene.layers) {
    const shapes = layer.shapes.map((s) => shapeMarkup(defs, s, mode)).join('')
    const { alpha } = motionAt(layer, 0)
    if (alpha <= 0) continue
    let clip = ''
    if (layer.clip) {
      const id = `clip-${clips.size}`
      if (!clips.has(layer.clip)) {
        clips.set(layer.clip, id)
        defs.add(`<clipPath id="${id}"><path d="${layer.clip}"/></clipPath>`)
      }
      clip = ` clip-path="url(#${clips.get(layer.clip)})"`
    }
    if (shapes) body.push(`<g id="${escapeId(layer.id)}"${alpha < 1 ? ` opacity="${f(alpha)}"` : ''}${clip}>${shapes}</g>`)
  }

  if (scene.post.vignette > 0) {
    const ink = scene.palette.anchors.ink
    const id = defs.gradient({
      type: 'radial',
      center: [w / 2, 0.5],
      radius: Math.hypot(w, 1) / 2,
      stops: [
        [0, withAlpha(ink, 0)],
        [0.45, withAlpha(ink, 0)],
        [1, withAlpha(ink, scene.post.vignette)],
      ],
    })
    body.push(`<rect id="vignette" width="${f(w)}" height="1" fill="url(#${id})"/>`)
  }

  if (mode === 'styled' && scene.post.grain > 0) {
    const tile = f(GRAIN_TILE / GRAIN_REFERENCE_HEIGHT)
    defs.add(
      `<pattern id="grain" patternUnits="userSpaceOnUse" width="${tile}" height="${tile}">` +
        `<image href="${grainTile(scene)}" width="${tile}" height="${tile}" preserveAspectRatio="none"/>` +
        `</pattern>`,
    )
    body.push(`<rect id="grain" width="${f(w)}" height="1" fill="url(#grain)"/>`)
  }

  const width = Math.round(height * w)
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${f(w)} 1">` +
    `${defs}${body.join('')}</svg>\n`
  )
}
