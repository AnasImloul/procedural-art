import { toCss, withAlpha } from '../engine/color'
import { motionAt, REST } from '../engine/motion'
import type { Layer, Paint, Scene, Shape } from '../engine/scene'
import { cellNoise, GRAIN_REFERENCE_HEIGHT, grainSeeds } from './grain'

export type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

function toStyle(ctx: Ctx2D, paint: Paint): string | CanvasGradient {
  if (paint.type === 'solid') return toCss(paint.color)
  const gradient =
    paint.type === 'linear'
      ? ctx.createLinearGradient(paint.from[0], paint.from[1], paint.to[0], paint.to[1])
      : ctx.createRadialGradient(paint.center[0], paint.center[1], 0, paint.center[0], paint.center[1], paint.radius)
  for (const [offset, color] of paint.stops) gradient.addColorStop(offset, toCss(color))
  return gradient
}

function fillSquashed(ctx: Ctx2D, path: Path2D, paint: Extract<Paint, { type: 'radial' }>, squash: number) {
  const [cx, cy] = paint.center
  const inverse = new DOMMatrix().translate(cx, cy).scale(1, 1 / squash).translate(-cx, -cy)
  const local = new Path2D()
  local.addPath(path, inverse)
  ctx.save()
  ctx.translate(cx, cy)
  ctx.scale(1, squash)
  ctx.translate(-cx, -cy)
  ctx.fillStyle = toStyle(ctx, paint)
  ctx.fill(local)
  ctx.restore()
}

function drawShape(ctx: Ctx2D, shape: Shape, layerAlpha: number) {
  if (!shape.d) return
  const path = new Path2D(shape.d)
  ctx.globalAlpha = (shape.opacity ?? 1) * layerAlpha
  ctx.globalCompositeOperation = shape.blend && shape.blend !== 'normal' ? shape.blend : 'source-over'
  if (shape.fill?.type === 'radial' && shape.fill.squash && shape.fill.squash !== 1) {
    fillSquashed(ctx, path, shape.fill, shape.fill.squash)
  } else if (shape.fill) {
    ctx.fillStyle = toStyle(ctx, shape.fill)
    ctx.fill(path)
  }
  if (shape.stroke) {
    ctx.strokeStyle = toStyle(ctx, shape.stroke.paint)
    ctx.lineWidth = shape.stroke.width
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    ctx.stroke(path)
  }
}

export function drawLayers(
  ctx: Ctx2D,
  layers: Layer[],
  { height, aspect, t, ignoreClip = false }: { height: number; aspect: number; t?: number; ignoreClip?: boolean },
) {
  ctx.save()
  ctx.setTransform(height, 0, 0, height, 0, 0)
  for (const layer of layers) {
    const { shift, alpha } = t === undefined ? REST : motionAt(layer, t)
    if (alpha <= 0) continue
    const clipped = !!layer.clip && !ignoreClip
    if (clipped) {
      ctx.save()
      ctx.clip(new Path2D(layer.clip))
    }
    if (shift === 0) {
      for (const shape of layer.shapes) drawShape(ctx, shape, alpha)
      if (clipped) ctx.restore()
      continue
    }
    const offset = Math.round(shift * aspect * height) / height
    for (const x of [offset, offset - aspect]) {
      ctx.save()
      ctx.translate(x, 0)
      ctx.beginPath()
      ctx.rect(0, -1, aspect, 3)
      ctx.clip()
      for (const shape of layer.shapes) drawShape(ctx, shape, alpha)
      ctx.restore()
    }
    if (clipped) ctx.restore()
  }
  ctx.restore()
}

function vignette(ctx: Ctx2D, scene: Scene, width: number, height: number) {
  if (scene.post.vignette <= 0) return
  const ink = scene.palette.anchors.ink
  const outer = Math.hypot(width, height) / 2
  const gradient = ctx.createRadialGradient(width / 2, height / 2, outer * 0.45, width / 2, height / 2, outer)
  gradient.addColorStop(0, toCss(withAlpha(ink, 0)))
  gradient.addColorStop(1, toCss(withAlpha(ink, scene.post.vignette)))
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, width, height)
}

function grain(ctx: Ctx2D, scene: Scene, width: number, height: number, t: number) {
  if (scene.post.grain <= 0) return
  const [seed, seed2] = grainSeeds(scene, t)
  const cell = Math.max(1, height / GRAIN_REFERENCE_HEIGHT)
  const image = ctx.getImageData(0, 0, width, height)
  const data = image.data
  const amp = scene.post.grain * 255
  for (let py = 0; py < height; py++) {
    const cy = Math.floor(py / cell)
    for (let px = 0; px < width; px++) {
      const cx = Math.floor(px / cell)
      const n = (cellNoise(cx, cy, seed) + cellNoise(cx, cy, seed2) - 1) * amp
      const i = (py * width + px) * 4
      data[i] += n
      data[i + 1] += n
      data[i + 2] += n
    }
  }
  ctx.putImageData(image, 0, 0)
}

export function renderScene(ctx: Ctx2D, scene: Scene, { width, height, t = 0 }: { width: number; height: number; t?: number }) {
  drawLayers(ctx, scene.layers, { height, aspect: scene.aspect, t })
  vignette(ctx, scene, width, height)
  grain(ctx, scene, width, height, t)
}
