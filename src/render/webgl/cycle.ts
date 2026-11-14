import { type Color, toRgb } from '../../engine/color'
import { celestialAt, type Orbit } from '../../engine/compose'
import { DAY_CYCLE } from '../../engine/moods'
import type { Palette } from '../../engine/palette'
import { MOON_COLOR, MOON_GLOW } from '../../engine/primitives/sun'
import type { PostFx } from '../../engine/scene'
import { GRAIN_REFERENCE_HEIGHT, grainSeeds } from '../grain'
import type { KeyframePart, RunInfo } from '../jobs'
import { bindPaper, compile, POST, paperTexture } from './compositor'

const CROSSFADE = `#version 300 es
precision highp float;
uniform sampler2D uA;
uniform sampler2D uB;
uniform float uW;
uniform float uShift;
uniform vec2 uBandA;
uniform vec2 uBandB;
in vec2 vUv;
out vec4 outColor;
vec4 band(sampler2D tex, vec2 rows, float x, float y) {
  float h = rows.y - rows.x;
  if (h <= 0.0 || y < rows.x || y > rows.y) return vec4(0.0);
  return texture(tex, vec2(x, (y - rows.x) / h));
}
void main() {
  float x = vUv.x - uShift;
  float y = 1.0 - vUv.y;
  outColor = mix(band(uA, uBandA, x, y), band(uB, uBandB, x, y), uW);
}`

const BODY = `#version 300 es
precision highp float;
uniform vec2 uSize;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uReach;
uniform float uGlow;
uniform float uDisk;
uniform vec3 uGlowColor;
uniform vec3 uDiskColor;
out vec4 outColor;
void main() {
  vec2 px = vec2(gl_FragCoord.x, uSize.y - gl_FragCoord.y);
  float d = distance(px, uCenter);
  float t = d / uReach;
  float a = t < 0.1 ? mix(0.55, 0.4, t / 0.1)
    : t < 0.25 ? mix(0.4, 0.18, (t - 0.1) / 0.15)
    : t < 0.5 ? mix(0.18, 0.06, (t - 0.25) / 0.25)
    : t < 1.0 ? mix(0.06, 0.0, (t - 0.5) / 0.5)
    : 0.0;
  a *= uGlow;
  float disk = clamp(uRadius - d + 0.5, 0.0, 1.0) * uDisk;
  outColor = vec4(uDiskColor * disk, disk) + vec4(uGlowColor * a, a) * (1.0 - disk);
}`

export const KEYFRAME_HOURS: number[] = DAY_CYCLE.slice(0, -1).flatMap(([h0, from], i) => {
  const [h1, to] = DAY_CYCLE[i + 1]
  const n = Math.max(1, Math.ceil((h1 - h0) / (from === to ? 2.5 : 0.45)))
  return Array.from({ length: n }, (_, s) => h0 + ((h1 - h0) * s) / n)
})
const KEYFRAMES = KEYFRAME_HOURS.length
const PREVIEW_HEIGHT = 216
const wrapHour = (hour: number) => ((hour % 24) + 24) % 24

export interface CycleSource {
  key: string
  seed: string
  seconds: number
  aspect: number
  orbit: Orbit & { radius: number; glow: number }
  post: PostFx
  runs: RunInfo[]
  paletteAt(hour: number): Palette
}

export type KeyframeLoader = (hour: number, width: number, height: number) => Promise<KeyframePart[]>

interface Band {
  texture: WebGLTexture
  rows: [number, number]
}

interface Keyframe {
  backdrop: Band
  runs: Band[]
  used: number
}

const rgb = (c: Color) => toRgb(c).map((v) => v / 255) as [number, number, number]

export class CycleCompositor {
  static create(canvas: HTMLCanvasElement, { preserveDrawingBuffer = false, previews = true } = {}): CycleCompositor | null {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer })
    if (!gl) return null
    try {
      return new CycleCompositor(gl, previews)
    } catch (err) {
      console.error(err)
      return null
    }
  }

  private readonly crossfade: WebGLProgram
  private readonly body: WebGLProgram
  private readonly post: WebGLProgram
  private readonly paper: WebGLTexture
  private readonly vao: WebGLVertexArrayObject
  private fbo: WebGLFramebuffer | null = null
  private fboTexture: WebGLTexture | null = null
  private frames = new Map<number, Keyframe>()
  private previews = new Map<number, Keyframe>()
  private previewsStarted = false
  private pending = new Map<number, Promise<void>>()
  private wanted = new Set<number>()
  private source?: CycleSource
  private loader?: KeyframeLoader
  private generation = 0
  private clock = 0
  private width = 0
  private height = 0

  private constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly usePreviews: boolean,
  ) {
    this.crossfade = compile(gl, CROSSFADE)
    this.body = compile(gl, BODY)
    this.post = compile(gl, POST)
    this.paper = paperTexture(gl)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  setSource(source: CycleSource, loader: KeyframeLoader, width: number, height: number) {
    if (this.source?.key === source.key && width === this.width && height === this.height) return
    this.release()
    this.generation++
    this.source = source
    this.loader = loader
    if (width !== this.width || height !== this.height || !this.fbo) this.resize(width, height)
  }

  async prepare(hour: number): Promise<void> {
    const k = this.index(hour)
    const next = (k + 1) % KEYFRAMES
    this.wanted = new Set([k, next, (k + 2) % KEYFRAMES])
    if (this.usePreviews && !this.previewsStarted) {
      this.previewsStarted = true
      this.loadPreviews(k).catch((err) => console.error(err))
    }
    void this.load((k + 2) % KEYFRAMES)
    await Promise.all([this.load(k), this.load(next)])
  }

  render(hour: number, t: number): boolean {
    const { gl, source } = this
    if (!source || !this.fbo) return false
    const k = this.index(hour)
    const next = (k + 1) % KEYFRAMES
    const a = this.frames.get(k) ?? this.previews.get(k)
    const b = this.frames.get(next) ?? this.previews.get(next)
    void this.prepare(hour)
    if (!a || !b) return false
    a.used = b.used = ++this.clock
    const start = KEYFRAME_HOURS[k]
    const w = (wrapHour(hour) - start) / ((k + 1 < KEYFRAMES ? KEYFRAME_HOURS[k + 1] : 24) - start)
    const palette = source.paletteAt(hour)

    gl.bindVertexArray(this.vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.viewport(0, 0, this.width, this.height)
    gl.disable(gl.BLEND)
    this.drawCrossfade(a.backdrop, b.backdrop, w)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawBodies(hour, palette)
    source.runs.forEach(({ wraps, pose }, r) => {
      if (pose) {
        const u = pose.cycles * t
        if (Math.floor((u - Math.floor(u)) * pose.of) !== pose.index) return
      }
      const shift = wraps * t
      this.drawCrossfade(a.runs[r], b.runs[r], w, shift - Math.floor(shift))
    })

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.disable(gl.BLEND)
    gl.useProgram(this.post)
    const u = (name: string) => gl.getUniformLocation(this.post, name)
    const [seed, seed2] = grainSeeds({ seed: source.seed, loop: { seconds: source.seconds } }, t)
    gl.uniform2f(u('uSize'), this.width, this.height)
    gl.uniform1f(u('uGrain'), source.post.grain)
    gl.uniform1f(u('uCell'), Math.max(1, this.height / GRAIN_REFERENCE_HEIGHT))
    gl.uniform1f(u('uVignette'), source.post.vignette)
    gl.uniform3f(u('uInk'), ...rgb(palette.anchors.ink))
    gl.uniform1ui(u('uSeed'), seed)
    gl.uniform1ui(u('uSeed2'), seed2)
    bindPaper(gl, this.post, this.paper, source.post.paper)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    return true
  }

  dispose() {
    this.generation++
    this.release()
    const { gl } = this
    if (this.fboTexture) gl.deleteTexture(this.fboTexture)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    for (const p of [this.crossfade, this.body, this.post]) gl.deleteProgram(p)
    gl.deleteTexture(this.paper)
  }

  private index(hour: number) {
    const h = wrapHour(hour)
    let k = 0
    while (k < KEYFRAMES - 1 && KEYFRAME_HOURS[k + 1] <= h) k++
    return k
  }

  private load(k: number): Promise<void> {
    if (this.frames.has(k)) return Promise.resolve()
    const existing = this.pending.get(k)
    if (existing) return existing
    const generation = this.generation
    const hour = KEYFRAME_HOURS[k]
    const expected = this.source!.runs.length
    const promise = this.loader!(hour, this.width, this.height).then(([backdrop, ...runs]) => {
      this.pending.delete(k)
      if (generation !== this.generation || runs.length !== expected) {
        if (runs.length !== expected) console.warn(`Keyframe ${hour}: expected ${expected} runs, got ${runs.length}`)
        for (const part of [backdrop, ...runs]) part.bitmap.close()
        return
      }
      this.frames.set(k, { backdrop: this.upload(backdrop, false), runs: runs.map((part) => this.upload(part, true)), used: ++this.clock })
      this.evict()
    })
    this.pending.set(k, promise)
    return promise
  }

  private async loadPreviews(from: number) {
    const generation = this.generation
    const expected = this.source!.runs.length
    const height = Math.min(this.height, PREVIEW_HEIGHT)
    const width = Math.max(1, Math.round((this.width * height) / this.height))
    for (let i = 0; i < KEYFRAMES; i++) {
      const k = (from + (i % 2 ? (i + 1) / 2 : KEYFRAMES - i / 2)) % KEYFRAMES
      const [backdrop, ...runs] = await this.loader!(KEYFRAME_HOURS[k], width, height)
      if (generation !== this.generation || runs.length !== expected) {
        for (const part of [backdrop, ...runs]) part.bitmap.close()
        if (generation !== this.generation) return
        continue
      }
      this.previews.set(k, { backdrop: this.upload(backdrop, false), runs: runs.map((part) => this.upload(part, true)), used: 0 })
    }
  }

  private evict() {
    const cache = this.source!.runs.length > 3 ? 3 : 4
    while (this.frames.size > cache) {
      let oldest = -1
      let used = Infinity
      for (const [k, f] of this.frames) if (!this.wanted.has(k) && f.used < used) [oldest, used] = [k, f.used]
      if (oldest < 0) return
      this.deleteFrame(this.frames.get(oldest)!)
      this.frames.delete(oldest)
    }
  }

  private deleteFrame(f: Keyframe) {
    this.gl.deleteTexture(f.backdrop.texture)
    for (const band of f.runs) this.gl.deleteTexture(band.texture)
  }

  private upload({ bitmap, top, bottom }: KeyframePart, repeat: boolean): Band {
    const { gl } = this
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap)
    bitmap.close()
    return { texture, rows: [top, bottom] }
  }

  private drawCrossfade(a: Band, b: Band, w: number, shift = 0) {
    const { gl } = this
    gl.useProgram(this.crossfade)
    const u = (name: string) => gl.getUniformLocation(this.crossfade, name)
    gl.uniform1f(u('uShift'), shift)
    gl.uniform2f(u('uBandA'), ...a.rows)
    gl.uniform2f(u('uBandB'), ...b.rows)
    gl.uniform1i(gl.getUniformLocation(this.crossfade, 'uA'), 0)
    gl.uniform1i(gl.getUniformLocation(this.crossfade, 'uB'), 1)
    gl.uniform1f(gl.getUniformLocation(this.crossfade, 'uW'), w)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, a.texture)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, b.texture)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.activeTexture(gl.TEXTURE0)
  }

  private drawBodies(hour: number, palette: Palette) {
    const { gl, source } = this
    const { orbit } = source!
    const sky = celestialAt(hour, orbit, source!.aspect)
    const h = this.height
    const radius = orbit.radius * h
    gl.useProgram(this.body)
    const u = (name: string) => gl.getUniformLocation(this.body, name)
    gl.uniform2f(u('uSize'), this.width, this.height)
    const draw = (at: [number, number], r: number, reach: number, glow: number, disk: number, glowColor: Color, diskColor: Color) => {
      if (glow <= 0 && disk <= 0) return
      gl.uniform2f(u('uCenter'), at[0] * h, at[1] * h)
      gl.uniform1f(u('uRadius'), r)
      gl.uniform1f(u('uReach'), reach)
      gl.uniform1f(u('uGlow'), glow)
      gl.uniform1f(u('uDisk'), disk)
      gl.uniform3f(u('uGlowColor'), ...rgb(glowColor))
      gl.uniform3f(u('uDiskColor'), ...rgb(diskColor))
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    const l = palette.light
    draw(sky.sun, radius, radius * orbit.glow * l.glowReach, l.glow * sky.sunWeight, l.sunOpacity * sky.sunWeight, palette.anchors.light, palette.anchors.sun)
    const m = 1 - sky.sunWeight
    draw(sky.moon, radius * 0.8, radius * orbit.glow * 0.8, MOON_GLOW * m, m, MOON_COLOR, MOON_COLOR)
  }

  private resize(width: number, height: number) {
    const { gl } = this
    if (this.fboTexture) gl.deleteTexture(this.fboTexture)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    this.width = width
    this.height = height
    this.fboTexture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this.fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private release() {
    for (const f of [...this.frames.values(), ...this.previews.values()]) this.deleteFrame(f)
    this.frames.clear()
    this.previews.clear()
    this.previewsStarted = false
    this.pending.clear()
  }
}
