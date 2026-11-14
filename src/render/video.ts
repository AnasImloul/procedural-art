import { BufferTarget, CanvasSource, getFirstEncodableVideoCodec, Mp4OutputFormat, Output, Quality, WebMOutputFormat } from 'mediabunny'
import type { Scene } from '../engine/scene'
import { Compositor } from './webgl/compositor'
import { CycleCompositor, type CycleSource, type KeyframeLoader } from './webgl/cycle'

export interface VideoOptions {
  width: number
  height: number
  fps?: number
  compatible?: boolean
  signal?: AbortSignal
  onProgress?(progress: number): void
}

export interface VideoResult {
  blob: Blob
  extension: string
  codec: string
}

async function encode(
  canvas: HTMLCanvasElement,
  { width, height, fps = 30, compatible, signal, onProgress }: VideoOptions,
  frames: number,
  draw: (frame: number) => void | Promise<void>,
): Promise<VideoResult> {
  const quality = new Quality({ bitrate: Math.round(width * height * fps * 0.26) })
  const probe = { width, height, frameRate: fps, quality }
  let format: Mp4OutputFormat | WebMOutputFormat = new Mp4OutputFormat()
  let codec = await getFirstEncodableVideoCodec(compatible ? ['avc'] : ['hevc', 'avc'], probe)
  if (!codec) {
    format = new WebMOutputFormat()
    codec = await getFirstEncodableVideoCodec(['vp9', 'vp8'], probe)
  }
  if (!codec) throw new Error('This browser cannot encode video')

  const output = new Output({ format, target: new BufferTarget() })
  const source = new CanvasSource(canvas, { codec, quality, keyFrameInterval: 2 })
  output.addVideoTrack(source, { frameRate: fps })
  await output.start()
  for (let i = 0; i < frames; i++) {
    if (signal?.aborted) {
      await output.cancel()
      throw new DOMException('Video export cancelled', 'AbortError')
    }
    await draw(i)
    await source.add(i / fps, 1 / fps)
    onProgress?.((i + 1) / frames)
  }
  source.close()
  await output.finalize()

  const buffer = output.target.buffer
  if (!buffer) throw new Error('Video export produced no data')
  return { blob: new Blob([buffer], { type: format.mimeType }), extension: format.fileExtension, codec }
}

function exportCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

export async function exportVideo(scene: Scene, options: VideoOptions): Promise<VideoResult> {
  const canvas = exportCanvas(options.width, options.height)
  const compositor = Compositor.create(canvas, { preserveDrawingBuffer: true })
  if (!compositor) throw new Error('Video export needs WebGL2')
  try {
    compositor.setScene(scene, options.width, options.height)
    const frames = Math.round(scene.loop.seconds * (options.fps ?? 30))
    return await encode(canvas, options, frames, (i) => compositor.render(i / frames))
  } finally {
    compositor.dispose()
  }
}

export async function exportCycleVideo(
  source: CycleSource,
  loader: KeyframeLoader,
  options: VideoOptions & { startHour: number },
): Promise<VideoResult> {
  const canvas = exportCanvas(options.width, options.height)
  const compositor = CycleCompositor.create(canvas, { preserveDrawingBuffer: true })
  if (!compositor) throw new Error('Video export needs WebGL2')
  try {
    compositor.setSource({ ...source, key: `${source.key}/export` }, loader, options.width, options.height)
    const frames = Math.round(source.seconds * (options.fps ?? 30))
    const offset = options.startHour / 24
    return await encode(canvas, options, frames, async (i) => {
      const t = (offset + i / frames) % 1
      await compositor.prepare(t * 24)
      compositor.render(t * 24, t)
    })
  } finally {
    compositor.dispose()
  }
}
