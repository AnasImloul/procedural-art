import type { MoodId } from '../engine/moods'
import { ASPECTS, type AspectId, type Layer, type LoopMode, type Scene } from '../engine/scene'
import { generate, type ParamOverrides } from '../engine/theme'
import { findTheme } from '../themes'
import { type Ctx2D, drawLayers, renderScene } from './canvas'

export interface RenderJob {
  theme: string
  seed: string
  aspect: AspectId
  mood?: MoodId
  loop?: LoopMode
  cycle?: boolean
  hour?: number
  overrides: ParamOverrides
  width: number
  height: number
}

export interface RunInfo {
  wraps: number
  pose?: { cycles: number; index: number; of: number }
}

export interface KeyframeRun extends RunInfo {
  layers: Layer[]
}

export interface KeyframePart {
  bitmap: ImageBitmap
  top: number
  bottom: number
}

export interface KeyframeJob extends RenderJob {
  keyframe: true
}

export const isBackdrop = (layer: Layer) => layer.role === 'sky' || layer.id.startsWith('stars')
export const isCelestialBody = (layer: Layer) => layer.id === 'sun' || layer.id.startsWith('sun:')

export function keyframeRuns(scene: Scene): KeyframeRun[] {
  const runs: KeyframeRun[] = []
  for (const layer of scene.layers) {
    if (isBackdrop(layer) || isCelestialBody(layer)) continue
    const wraps = layer.wrap ? (layer.motion ?? []).reduce((sum, m) => sum + (m.type === 'drift' ? m.wraps : 0), 0) : 0
    const motion = layer.motion?.find((m) => m.type === 'pose')
    const pose = motion?.type === 'pose' ? { cycles: motion.cycles, index: motion.index, of: motion.of } : undefined
    const last = runs[runs.length - 1]
    if (last && last.wraps === wraps && JSON.stringify(last.pose) === JSON.stringify(pose)) last.layers.push(layer)
    else runs.push({ layers: [layer], wraps, pose })
  }
  return runs
}

function paintedRows(ctx: Ctx2D, width: number, height: number): [number, number] {
  const data = ctx.getImageData(0, 0, width, height).data
  const painted = (y: number) => {
    for (let i = y * width * 4 + 3, end = i + width * 4; i < end; i += 4) if (data[i] !== 0) return true
    return false
  }
  let top = 0
  while (top < height && !painted(top)) top++
  let bottom = height
  while (bottom > top && !painted(bottom - 1)) bottom--
  return [Math.max(0, top - 1), Math.min(height, bottom + 1)]
}

function sceneFor(job: RenderJob): Scene {
  const theme = findTheme(job.theme)
  if (!theme) throw new Error(`Unknown theme: ${job.theme}`)
  return generate(theme, {
    seed: job.seed,
    aspect: ASPECTS[job.aspect],
    mood: job.mood,
    loop: job.loop,
    cycle: job.cycle,
    hour: job.hour,
    overrides: job.overrides,
  })
}

function canvasFor(width: number, height: number): { canvas: OffscreenCanvas | HTMLCanvasElement; ctx: Ctx2D } {
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height)
    return { canvas, ctx: canvas.getContext('2d')! }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return { canvas, ctx: canvas.getContext('2d')! }
}

export async function renderToBlob(job: RenderJob): Promise<Blob> {
  const scene = sceneFor(job)
  const { canvas, ctx } = canvasFor(job.width, job.height)
  renderScene(ctx, scene, job)
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' })
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png'))
}

export async function renderKeyframe(job: KeyframeJob): Promise<KeyframePart[]> {
  const scene = sceneFor(job)
  const parts = [scene.layers.filter(isBackdrop), ...keyframeRuns(scene).map((run) => run.layers)]
  const { canvas, ctx } = canvasFor(job.width, job.height)
  const out: KeyframePart[] = []
  for (const [p, layers] of parts.entries()) {
    ctx.clearRect(0, 0, job.width, job.height)
    drawLayers(ctx, layers, { height: job.height, aspect: scene.aspect })
    const [top, bottom] = p === 0 ? [0, job.height] : paintedRows(ctx, job.width, job.height)
    const bitmap =
      bottom > top
        ? await createImageBitmap(canvas, 0, top, job.width, bottom - top, { premultiplyAlpha: 'premultiply' })
        : await createImageBitmap(new ImageData(1, 1))
    out.push({ bitmap, top: top / job.height, bottom: bottom > top ? bottom / job.height : 0 })
  }
  return out
}
