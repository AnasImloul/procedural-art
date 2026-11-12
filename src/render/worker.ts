import { renderToBlob, type RenderJob } from './jobs'

self.postMessage({ ready: typeof OffscreenCanvas !== 'undefined' && typeof Path2D !== 'undefined' })

self.onmessage = async (e: MessageEvent<{ job: RenderJob }>) => {
  try {
    self.postMessage({ blob: await renderToBlob(e.data.job) })
  } catch (err) {
    self.postMessage({ error: err instanceof Error ? err.message : String(err) })
  }
}
