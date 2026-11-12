import { renderKeyframe, renderToBlob, type KeyframeJob, type RenderJob } from './jobs'

self.postMessage({ ready: typeof OffscreenCanvas !== 'undefined' && typeof Path2D !== 'undefined' })

self.onmessage = async (e: MessageEvent<{ job: RenderJob | KeyframeJob }>) => {
  const { job } = e.data
  try {
    if ('keyframe' in job) {
      const bitmaps = await renderKeyframe(job)
      self.postMessage({ result: bitmaps }, { transfer: bitmaps })
    } else {
      self.postMessage({ result: await renderToBlob(job) })
    }
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
