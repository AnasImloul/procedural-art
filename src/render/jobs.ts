import type { MoodId } from '../engine/moods'
import { ASPECTS, type AspectId, type LoopMode } from '../engine/scene'
import { generate, type ParamOverrides } from '../engine/theme'
import { findTheme } from '../themes'
import { renderScene } from './canvas'

export interface RenderJob {
  theme: string
  seed: string
  aspect: AspectId
  mood?: MoodId
  loop?: LoopMode
  overrides: ParamOverrides
  width: number
  height: number
}

export async function renderToBlob(job: RenderJob): Promise<Blob> {
  const theme = findTheme(job.theme)
  if (!theme) throw new Error(`Unknown theme: ${job.theme}`)
  const scene = generate(theme, { seed: job.seed, aspect: ASPECTS[job.aspect], mood: job.mood, loop: job.loop, overrides: job.overrides })

  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(job.width, job.height)
    renderScene(canvas.getContext('2d')!, scene, job)
    return canvas.convertToBlob({ type: 'image/png' })
  }

  const canvas = document.createElement('canvas')
  canvas.width = job.width
  canvas.height = job.height
  renderScene(canvas.getContext('2d')!, scene, job)
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png'),
  )
}
