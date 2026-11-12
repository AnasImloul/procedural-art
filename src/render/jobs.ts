import type { MoodId } from '../engine/moods'
import { ASPECTS, type AspectId, type Layer, type LoopMode, type Scene } from '../engine/scene'
import { generate, type ParamOverrides } from '../engine/theme'
import { findTheme } from '../themes'
import { drawLayers, renderScene, type Ctx2D } from './canvas'

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

export interface KeyframeRun {
  layers: Layer[]
  wraps: number
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
    const last = runs[runs.length - 1]
    if (last && last.wraps === wraps) last.layers.push(layer)
    else runs.push({ layers: [layer], wraps })
  }
  return runs
}

function sceneFor(job: RenderJob): Scene {
  const theme = findTheme(job.theme)
  if (!theme) throw new Error(`Unknown theme: ${job.theme}`)
  return generate(theme, { seed: job.seed, aspect: ASPECTS[job.aspect], mood: job.mood, loop: job.loop, cycle: job.cycle, hour: job.hour, overrides: job.overrides })
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
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png'),
  )
}

export async function renderKeyframe(job: KeyframeJob): Promise<ImageBitmap[]> {
  const scene = sceneFor(job)
  const parts = [scene.layers.filter(isBackdrop), ...keyframeRuns(scene).map((run) => run.layers)]
  const { canvas, ctx } = canvasFor(job.width, job.height)
  const bitmaps: ImageBitmap[] = []
  for (const layers of parts) {
    ctx.clearRect(0, 0, job.width, job.height)
    drawLayers(ctx, layers, { height: job.height, aspect: scene.aspect, t: 0 })
    bitmaps.push(await createImageBitmap(canvas, { premultiplyAlpha: 'premultiply' }))
  }
  return bitmaps
}
