import { type Composition, makeComposition } from './compose'
import { cycleMoods, type MoodId } from './moods'
import { type Atmosphere, blendPalettes, makePalette, type Palette, type PaletteOverrides } from './palette'
import { assessComposition, type QualityRules } from './quality'
import { Rng } from './rng'
import { finalize, type Layer, type LoopMode, type ParamValue, type PostFx, type Scene } from './scene'
import { makeWobble, type Wobble } from './wobble'

export interface Env {
  palette: Palette
  aspect: number
}

export type ParamSpec =
  | { readonly kind: 'range'; readonly min: number; readonly max: number }
  | { readonly kind: 'int'; readonly min: number; readonly max: number }
  | { readonly kind: 'chance'; readonly p: number }

export type ParamSchema = Record<string, ParamSpec>

export type ParamValues<S extends ParamSchema = ParamSchema> = {
  [K in keyof S]: S[K] extends { kind: 'chance' } ? boolean : number
}

export const param = {
  range: (min: number, max: number) => ({ kind: 'range', min, max }) as const,
  int: (min: number, max: number) => ({ kind: 'int', min, max }) as const,
  chance: (p: number) => ({ kind: 'chance', p }) as const,
}

export interface ComposeContext<P> {
  env: Env
  loop: LoopMode
  cycle: boolean
  seconds: number
  rng: Rng
  p: P
  palette: Palette
  comp: Composition
}

export interface Theme<S extends ParamSchema = ParamSchema> {
  id: string
  name: string
  version: number
  moods: Partial<Record<MoodId, number>>
  atmosphere: Atmosphere
  palette?: PaletteOverrides
  outline: 'rim' | 'contour' | 'none'
  post?: Partial<PostFx>
  loop?: { seconds: number; pan?: { seconds: number; speed: number }; cycle?: number }
  quality?: QualityRules
  params: S
  compose(ctx: ComposeContext<ParamValues<S>>): Layer[]
}

export const defineTheme = <S extends ParamSchema>(theme: Theme<S>): Theme<S> => theme

export type ParamOverrides = Partial<Record<string, ParamValue>>

export function resolveParams<S extends ParamSchema>(schema: S, rng: Rng, overrides: ParamOverrides = {}): ParamValues<S> {
  const values: Record<string, ParamValue> = {}
  for (const [key, spec] of Object.entries(schema)) {
    const r = rng.fork(key)
    const seeded = spec.kind === 'range' ? r.range(spec.min, spec.max) : spec.kind === 'int' ? r.int(spec.min, spec.max) : r.chance(spec.p)
    const override = overrides[key]
    values[key] = override !== undefined && typeof override === typeof seeded ? override : seeded
  }
  return values as ParamValues<S>
}

export interface GenerateOptions {
  seed: string
  aspect: number
  mood?: MoodId
  loop?: LoopMode
  cycle?: boolean
  hour?: number
  overrides?: ParamOverrides
}

const DEFAULT_POST: PostFx = { grain: 0, paper: 1, vignette: 0.28, bloom: 0 }
const DEFAULT_PAN = { seconds: 120, speed: 6 }
const DEFAULT_CYCLE_SECONDS = 120

export function cyclePalette(theme: Theme, seed: string, hour: number): Palette {
  const rng = new Rng(`${theme.id}/v${theme.version}/${seed}`).fork('palette')
  const { from, to, weight } = cycleMoods(hour)
  return blendPalettes(makePalette(rng, from, theme.atmosphere, theme.palette), makePalette(rng, to, theme.atmosphere, theme.palette), weight, theme.atmosphere)
}

function stillForCycle(layers: Layer[]): Layer[] {
  return layers.map((layer) =>
    layer.motion ? { ...layer, motion: layer.clip ? undefined : layer.motion.filter((m) => m.type === 'drift' || m.type === 'pose') } : layer,
  )
}

function withPan(layers: Layer[], speed: number): Layer[] {
  return layers.map((layer) =>
    layer.depth < 0.99 && layer.wrap
      ? { ...layer, motion: [...(layer.motion ?? []), { type: 'drift', wraps: -Math.max(1, Math.round((1 - layer.depth) * speed)) }] }
      : layer,
  )
}

const MAX_ATTEMPTS = 6

export function generate<S extends ParamSchema>(
  theme: Theme<S>,
  { seed, aspect, mood, loop = 'ambient', cycle = false, hour = 12, overrides }: GenerateOptions,
): Scene {
  const root = new Rng(`${theme.id}/v${theme.version}/${seed}`)
  const palette = cycle
    ? cyclePalette(theme as unknown as Theme, seed, hour)
    : makePalette(root.fork('palette'), mood ?? root.fork('mood').weighted(theme.moods), theme.atmosphere, theme.palette)
  const params = resolveParams(theme.params, root.fork('params'), overrides)
  const pan = { ...DEFAULT_PAN, ...theme.loop?.pan }
  const cycleSeconds = theme.loop?.cycle ?? DEFAULT_CYCLE_SECONDS
  const panSpeed = cycle ? (pan.speed * cycleSeconds) / pan.seconds : pan.speed
  const seconds = cycle ? cycleSeconds : loop === 'pan' ? pan.seconds : (theme.loop?.seconds ?? 12)

  const build = (layers: Layer[], wobble?: Wobble) => {
    const finished = finalize(layers, palette, theme.outline, wobble)
    return cycle ? stillForCycle(finished) : finished
  }
  let best: { scene: Scene; layers: Layer[] } | undefined
  let bestScore = Infinity
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const layout = attempt === 0 ? root : root.fork(`attempt-${attempt}`)
    const composed = theme.compose({
      env: { palette, aspect },
      loop,
      cycle,
      seconds,
      rng: layout.fork('layers'),
      p: params,
      palette,
      comp: makeComposition(layout.fork('composition'), aspect, cycle ? hour : undefined),
    })
    const panned = loop === 'pan' ? withPan(composed, panSpeed) : composed
    const scene: Scene = {
      seed: root.key,
      aspect,
      palette,
      params,
      loop: { mode: loop, cycle, seconds },
      layers: build(panned),
      post: { ...DEFAULT_POST, ...theme.post },
      attempt,
    }
    const { score } = assessComposition(scene, theme.quality)
    if (score < bestScore) {
      best = { scene, layers: panned }
      bestScore = score
    }
    if (score === 0) break
  }
  return { ...best!.scene, layers: build(best!.layers, makeWobble(root.key, aspect)) }
}
