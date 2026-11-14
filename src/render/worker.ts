import { type KeyframeJob, type RenderJob, renderKeyframe, renderToBlob } from './jobs'

self.postMessage({ ready: typeof OffscreenCanvas !== 'undefined' && typeof Path2D !== 'undefined' })

self.onmessage = async (e: MessageEvent<{ job: RenderJob | KeyframeJob }>) => {
  const { job } = e.data
  try {
    if ('keyframe' in job) {
      const parts = await renderKeyframe(job)
      self.postMessage({ result: parts }, { transfer: parts.map((part) => part.bitmap) })
    } else {
      self.postMessage({ result: await renderToBlob(job) })
    }
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
