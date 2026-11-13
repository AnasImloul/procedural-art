import { toRgb } from '../../engine/color'
import { isAnimated, motionAt, REST } from '../../engine/motion'
import type { Layer, Scene } from '../../engine/scene'
import { drawLayers } from '../canvas'
import { GRAIN_REFERENCE_HEIGHT, grainSeeds } from '../grain'
import { PAPER_RANGE, PAPER_TILE, paperBytes } from '../paper'

const VERTEX = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`

const LAYER = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform sampler2D uMask;
uniform float uShift;
uniform float uAlpha;
uniform float uMasked;
in vec2 vUv;
out vec4 outColor;
void main() {
  float mask = uMasked > 0.5 ? texture(uMask, vec2(vUv.x, 1.0 - vUv.y)).a : 1.0;
  outColor = texture(uTex, vec2(vUv.x - uShift, 1.0 - vUv.y)) * uAlpha * mask;
}`

export const POST = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uTex;
uniform sampler2D uPaper;
uniform float uPaperAmount;
uniform vec2 uSize;
uniform float uGrain;
uniform float uCell;
uniform float uVignette;
uniform vec3 uInk;
uniform uint uSeed;
uniform uint uSeed2;
in vec2 vUv;
out vec4 outColor;

float cellNoise(uint x, uint y, uint seed) {
  uint h = x * 374761393u + y * 668265263u + seed;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0;
}

void main() {
  vec3 color = texture(uTex, vUv).rgb;
  vec2 px = vec2(gl_FragCoord.x - 0.5, uSize.y - gl_FragCoord.y - 0.5);
  float outer = length(uSize) * 0.5;
  float d = length(px + 0.5 - uSize * 0.5);
  color = mix(color, uInk, clamp((d - outer * 0.45) / (outer * 0.55), 0.0, 1.0) * uVignette);
  color *= 1.0 + (texture(uPaper, (px + 0.5) / uSize.y).r - 0.5) * ${PAPER_RANGE.toFixed(4)} * uPaperAmount;
  uvec2 cell = uvec2(floor(px / uCell));
  color += (cellNoise(cell.x, cell.y, uSeed) + cellNoise(cell.x, cell.y, uSeed2) - 1.0) * uGrain;
  outColor = vec4(color, 1.0);
}`

interface Group {
  texture: WebGLTexture
  layer?: Layer
  mask?: WebGLTexture
}

export function paperTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, PAPER_TILE, PAPER_TILE, 0, gl.RGBA, gl.UNSIGNED_BYTE, paperBytes())
  return texture
}

export function bindPaper(gl: WebGL2RenderingContext, program: WebGLProgram, texture: WebGLTexture, amount: number) {
  gl.uniform1i(gl.getUniformLocation(program, 'uTex'), 0)
  gl.uniform1i(gl.getUniformLocation(program, 'uPaper'), 1)
  gl.uniform1f(gl.getUniformLocation(program, 'uPaperAmount'), amount)
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.activeTexture(gl.TEXTURE0)
}

export function compile(gl: WebGL2RenderingContext, fragment: string): WebGLProgram {
  const program = gl.createProgram()!
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shader compile failed')
    gl.attachShader(program, shader)
  }
  gl.bindAttribLocation(program, 0, 'aPos')
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Program link failed')
  return program
}

export class Compositor {
  static create(canvas: HTMLCanvasElement, { preserveDrawingBuffer = false } = {}): Compositor | null {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: true, preserveDrawingBuffer })
    if (!gl) return null
    try {
      return new Compositor(gl)
    } catch (err) {
      console.error(err)
      return null
    }
  }

  private readonly layerProgram: WebGLProgram
  private readonly postProgram: WebGLProgram
  private readonly paper: WebGLTexture
  private readonly vao: WebGLVertexArrayObject
  private readonly scratch = document.createElement('canvas')
  private fbo: WebGLFramebuffer | null = null
  private fboTexture: WebGLTexture | null = null
  private groups: Group[] = []
  private masks = new Map<string, WebGLTexture>()
  private scene?: Scene
  private width = 0
  private height = 0

  private constructor(private readonly gl: WebGL2RenderingContext) {
    this.layerProgram = compile(gl, LAYER)
    this.postProgram = compile(gl, POST)
    this.paper = paperTexture(gl)
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const buffer = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
  }

  setScene(scene: Scene, width: number, height: number) {
    const { gl } = this
    this.releaseGroups()
    if (width !== this.width || height !== this.height || !this.fbo) this.resize(width, height)
    this.scene = scene

    let run: Layer[] = []
    const flush = () => {
      if (run.length) this.groups.push({ texture: this.rasterize(run, 1, false) })
      run = []
    }
    for (const layer of scene.layers) {
      if (!isAnimated(layer)) {
        run.push(layer)
        continue
      }
      flush()
      this.groups.push({
        texture: this.rasterize([layer], layer.role === 'fog' ? 0.5 : 1, !!layer.wrap, !!layer.clip),
        layer,
        mask: layer.clip ? this.mask(layer.clip) : undefined,
      })
    }
    flush()
    gl.bindTexture(gl.TEXTURE_2D, null)
  }

  render(t: number) {
    const { gl, scene } = this
    if (!scene || !this.fbo) return

    gl.bindVertexArray(this.vao)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.viewport(0, 0, this.width, this.height)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.layerProgram)
    const shiftLoc = gl.getUniformLocation(this.layerProgram, 'uShift')
    const alphaLoc = gl.getUniformLocation(this.layerProgram, 'uAlpha')
    const maskedLoc = gl.getUniformLocation(this.layerProgram, 'uMasked')
    gl.uniform1i(gl.getUniformLocation(this.layerProgram, 'uTex'), 0)
    gl.uniform1i(gl.getUniformLocation(this.layerProgram, 'uMask'), 1)
    for (const group of this.groups) {
      const { shift, alpha } = group.layer ? motionAt(group.layer, t) : REST
      if (alpha <= 0) continue
      gl.uniform1f(shiftLoc, shift)
      gl.uniform1f(alphaLoc, alpha)
      gl.uniform1f(maskedLoc, group.mask ? 1 : 0)
      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, group.mask ?? null)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, group.texture)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.disable(gl.BLEND)
    gl.useProgram(this.postProgram)
    const [seed, seed2] = grainSeeds(scene, t)
    const ink = toRgb(scene.palette.anchors.ink).map((v) => v / 255) as [number, number, number]
    const u = (name: string) => gl.getUniformLocation(this.postProgram, name)
    gl.uniform2f(u('uSize'), this.width, this.height)
    gl.uniform1f(u('uGrain'), scene.post.grain)
    gl.uniform1f(u('uCell'), Math.max(1, this.height / GRAIN_REFERENCE_HEIGHT))
    gl.uniform1f(u('uVignette'), scene.post.vignette)
    gl.uniform3f(u('uInk'), ...ink)
    gl.uniform1ui(u('uSeed'), seed)
    gl.uniform1ui(u('uSeed2'), seed2)
    bindPaper(gl, this.postProgram, this.paper, scene.post.paper)
    gl.bindTexture(gl.TEXTURE_2D, this.fboTexture)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  dispose() {
    const { gl } = this
    this.releaseGroups()
    if (this.fboTexture) gl.deleteTexture(this.fboTexture)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    gl.deleteProgram(this.layerProgram)
    gl.deleteProgram(this.postProgram)
    gl.deleteTexture(this.paper)
  }

  private resize(width: number, height: number) {
    const { gl } = this
    if (this.fboTexture) gl.deleteTexture(this.fboTexture)
    if (this.fbo) gl.deleteFramebuffer(this.fbo)
    this.width = width
    this.height = height
    this.fboTexture = this.createTexture(gl.CLAMP_TO_EDGE, gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    this.fbo = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTexture, 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private createTexture(wrap: number, filter: number): WebGLTexture {
    const { gl } = this
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    return texture
  }

  private mask(clip: string): WebGLTexture {
    const cached = this.masks.get(clip)
    if (cached) return cached
    const { gl, scratch } = this
    scratch.width = this.width
    scratch.height = this.height
    const ctx = scratch.getContext('2d')!
    ctx.clearRect(0, 0, this.width, this.height)
    ctx.setTransform(this.height, 0, 0, this.height, 0, 0)
    ctx.fillStyle = '#fff'
    ctx.fill(new Path2D(clip))
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    const texture = this.createTexture(gl.CLAMP_TO_EDGE, gl.LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch)
    this.masks.set(clip, texture)
    return texture
  }

  private rasterize(layers: Layer[], scale: number, wrap: boolean, ignoreClip = false): WebGLTexture {
    const { gl, scratch } = this
    const width = Math.max(1, Math.round(this.width * scale))
    const height = Math.max(1, Math.round(this.height * scale))
    scratch.width = width
    scratch.height = height
    const ctx = scratch.getContext('2d')!
    ctx.clearRect(0, 0, width, height)
    drawLayers(ctx, layers, { height, aspect: this.scene!.aspect, ignoreClip })
    const texture = this.createTexture(wrap ? gl.REPEAT : gl.CLAMP_TO_EDGE, gl.LINEAR)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scratch)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
    return texture
  }

  private releaseGroups() {
    for (const group of this.groups) this.gl.deleteTexture(group.texture)
    for (const mask of this.masks.values()) this.gl.deleteTexture(mask)
    this.groups = []
    this.masks.clear()
  }
}
