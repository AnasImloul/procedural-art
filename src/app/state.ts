import { MOOD_IDS, type MoodId } from '../engine/moods'
import { ASPECTS, type AspectId, type LoopMode } from '../engine/scene'
import type { ParamOverrides } from '../engine/theme'
import { THEMES, findTheme } from '../themes'

export interface ViewState {
  theme: string
  seed: string
  aspect: AspectId
  mood?: MoodId
  loop?: LoopMode
  cycle?: boolean
  hour?: number
  version?: number
  overrides: ParamOverrides
}

export const DEFAULT_HOUR = 7

export const ASPECT_IDS = Object.keys(ASPECTS) as AspectId[]

export const EXPORT_PRESETS: Record<AspectId, { label: string; width: number; height: number }[]> = {
  '16:9': [
    { label: '1080p', width: 1920, height: 1080 },
    { label: '1440p', width: 2560, height: 1440 },
    { label: '4K', width: 3840, height: 2160 },
  ],
  '3:2': [
    { label: 'Web', width: 1800, height: 1200 },
    { label: 'Print', width: 3600, height: 2400 },
  ],
  '1:1': [
    { label: '2048', width: 2048, height: 2048 },
    { label: '4096', width: 4096, height: 4096 },
  ],
  '9:16': [
    { label: '1080×1920', width: 1080, height: 1920 },
    { label: '1440×2560', width: 1440, height: 2560 },
  ],
}

export const VIDEO_PRESETS: Record<AspectId, { label: string; width: number; height: number }[]> = {
  '16:9': [
    { label: '720p', width: 1280, height: 720 },
    { label: '1080p', width: 1920, height: 1080 },
  ],
  '3:2': [
    { label: '720p', width: 1080, height: 720 },
    { label: '1080p', width: 1620, height: 1080 },
  ],
  '1:1': [
    { label: '720', width: 720, height: 720 },
    { label: '1080', width: 1080, height: 1080 },
  ],
  '9:16': [
    { label: '720p', width: 720, height: 1280 },
    { label: '1080p', width: 1080, height: 1920 },
  ],
}

export const randomSeed = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(5))
  return Array.from(bytes, (b) => b.toString(36).padStart(2, '0')).join('').slice(0, 8)
}

export function readHash(hash: string): ViewState {
  const q = new URLSearchParams(hash.replace(/^#/, ''))
  const aspect = q.get('aspect') as AspectId | null
  const mood = q.get('mood') as MoodId | null
  const overrides: ParamOverrides = {}
  for (const [key, value] of q) {
    if (!key.startsWith('p.')) continue
    overrides[key.slice(2)] = value === 'true' ? true : value === 'false' ? false : Number(value)
  }
  return {
    theme: findTheme(q.get('theme') ?? '')?.id ?? THEMES[0].id,
    seed: q.get('seed') || randomSeed(),
    aspect: aspect && aspect in ASPECTS ? aspect : '16:9',
    mood: mood && MOOD_IDS.includes(mood) ? mood : undefined,
    loop: q.get('loop') === 'pan' ? 'pan' : undefined,
    cycle: q.get('cycle') === '1' || q.get('loop') === 'cycle' ? true : undefined,
    hour: q.has('h') ? (((Number(q.get('h')) % 24) + 24) % 24 || 0) : undefined,
    version: q.has('v') ? Number(q.get('v')) : undefined,
    overrides,
  }
}

export function toHash(state: ViewState): string {
  const theme = findTheme(state.theme)!
  const q = new URLSearchParams({ theme: theme.id, v: String(theme.version), seed: state.seed, aspect: state.aspect })
  if (state.mood) q.set('mood', state.mood)
  if (state.loop) q.set('loop', state.loop)
  if (state.cycle) q.set('cycle', '1')
  if (state.cycle && state.hour !== undefined) q.set('h', String(+state.hour.toFixed(2)))
  for (const [key, value] of Object.entries(state.overrides)) {
    if (value !== undefined) q.set(`p.${key}`, String(typeof value === 'number' ? +value.toFixed(4) : value))
  }
  return q.toString()
}
