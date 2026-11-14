import type { Scene } from '../engine/scene'
import { cyclePalette, type Theme } from '../engine/theme'
import { keyframeRuns } from '../render/jobs'
import type { CycleSource, KeyframeLoader } from '../render/webgl/cycle'
import { cyclePool } from './pools'
import type { ViewState } from './state'

export function cycleSource(theme: Theme, state: ViewState, scene: Scene): CycleSource | undefined {
  const orbit = scene.layers.find((l) => l.orbit)?.orbit
  if (!orbit) return undefined
  return {
    key: JSON.stringify([theme.id, theme.version, state.seed, state.aspect, state.loop, state.overrides]),
    seed: scene.seed,
    seconds: scene.loop.seconds,
    aspect: scene.aspect,
    orbit,
    post: scene.post,
    runs: keyframeRuns(scene).map(({ wraps, pose }) => ({ wraps, pose })),
    paletteAt: (hour) => cyclePalette(theme, state.seed, hour),
  }
}

export const cycleLoader =
  (state: Pick<ViewState, 'theme' | 'seed' | 'aspect' | 'loop' | 'overrides'>): KeyframeLoader =>
  (hour, width, height) =>
    cyclePool.keyframe({
      theme: state.theme,
      seed: state.seed,
      aspect: state.aspect,
      loop: state.loop,
      cycle: true,
      overrides: state.overrides,
      hour,
      width,
      height,
      keyframe: true,
    }).promise
