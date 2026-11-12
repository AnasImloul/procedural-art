import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality, WebMOutputFormat } from 'mediabunny'
import type { Scene } from '../engine/scene'
import { Compositor } from './webgl/compositor'

export interface VideoOptions {
  width: number
  height: number
  fps?: number
  signal?: AbortSignal
  onProgress?(progress: number): void
}

export interface VideoResult {
  blob: Blob
  extension: string
  codec: string
}

export async function exportVideo(scene: Scene, { width, height, fps = 30, signal, onProgress }: VideoOptions): Promise<VideoResult> {
  const quality = new Quality({ bitrate: Math.round(width * height * fps * 0.26) })
  const probe = { width, height, frameRate: fps, quality }
  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat()
  let codec = await getFirstEncodableVideoCodec(['avc'], probe)
  if (!codec) {
    format = new WebMOutputFormat()
    codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], probe)
  }
  if (!codec) throw new Error('This browser cannot encode video')

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const compositor = Compositor.create(canvas, { preserveDrawingBuffer: true })
  if (!compositor) throw new Error('Video export needs WebGL2')

  const output = new Output({ format, target: new BufferTarget() })
  try {
    compositor.setScene(scene, width, height)
    const source = new CanvasSource(canvas, { codec, quality, keyFrameInterval: 2 })
    output.addVideoTrack(source, { frameRate: fps })
    await output.start()

    const frames = Math.round(scene.loop.seconds * fps)
    for (let i = 0; i < frames; i++) {
      if (signal?.aborted) {
        await output.cancel()
        throw new DOMException('Video export cancelled', 'AbortError')
      }
      compositor.render(i / frames)
      await source.add(i / fps, 1 / fps)
      onProgress?.((i + 1) / frames)
    }
    source.close()
    await output.finalize()
  } finally {
    compositor.dispose()
  }

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Video export produced no data')
  return { blob: new Blob([buffer], { type: format.mimeType }), extension: format.fileExtension, codec }
}
