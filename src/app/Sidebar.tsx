import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MOOD_IDS, type MoodId } from '../engine/moods'
import type { AspectId, LoopMode, Scene } from '../engine/scene'
import type { ParamOverrides, Theme } from '../engine/theme'
import { renderSvg, type SvgMode } from '../render/svg'
import { exportVideo } from '../render/video'
import { THEMES } from '../themes'
import { exportPool, download } from './render'
import { ASPECT_IDS, EXPORT_PRESETS, VIDEO_PRESETS, type ViewState } from './state'
import { Thumb } from './Thumb'

interface SidebarProps {
  state: ViewState
  theme: Theme
  scene: Scene
  canGoBack: boolean
  canGoForward: boolean
  update(next: Partial<ViewState>): void
  goToSeed(seed: string): void
  newSeed(): void
  back(): void
  forward(): void
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="section">
      <header className="section-header">
        <h2>{title}</h2>
        {action}
      </header>
      {children}
    </section>
  )
}

function Chips<T extends string>({
  items,
  value,
  label,
  onChange,
}: {
  items: readonly T[]
  value: T
  label?: (item: T) => string
  onChange(item: T): void
}) {
  return (
    <div className="chips" role="radiogroup">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          role="radio"
          aria-checked={item === value}
          className={`chip${item === value ? ' is-active' : ''}`}
          onClick={() => onChange(item)}
        >
          {label ? label(item) : item}
        </button>
      ))}
    </div>
  )
}

function SeedField({ seed, onCommit }: { seed: string; onCommit(seed: string): void }) {
  const [draft, setDraft] = useState(seed)
  useEffect(() => setDraft(seed), [seed])
  const commit = () => {
    const next = draft.trim()
    if (next && next !== seed) onCommit(next)
    else setDraft(seed)
  }
  return (
    <input
      className="seed-input"
      value={draft}
      spellCheck={false}
      aria-label="Seed"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function Params({
  theme,
  scene,
  overrides,
  onChange,
}: {
  theme: Theme
  scene: Scene
  overrides: ParamOverrides
  onChange(overrides: ParamOverrides): void
}) {
  return (
    <div className="params">
      {Object.entries(theme.params).map(([key, spec]) => {
        const value = scene.params[key]
        const locked = overrides[key] !== undefined
        const unlock = () => {
          const { [key]: _, ...rest } = overrides
          onChange(rest)
        }
        return (
          <div key={key} className={`param${locked ? ' is-locked' : ''}`}>
            <label htmlFor={`param-${key}`}>{key}</label>
            {spec.kind === 'chance' ? (
              <input
                id={`param-${key}`}
                type="checkbox"
                checked={value as boolean}
                onChange={(e) => onChange({ ...overrides, [key]: e.target.checked })}
              />
            ) : (
              <input
                id={`param-${key}`}
                type="range"
                min={spec.min}
                max={spec.max}
                step={spec.kind === 'int' ? 1 : (spec.max - spec.min) / 200}
                value={value as number}
                onChange={(e) => onChange({ ...overrides, [key]: Number(e.target.value) })}
              />
            )}
            <output>{typeof value === 'number' ? (spec.kind === 'int' ? value : value.toFixed(2)) : value ? 'on' : 'off'}</output>
            <button
              type="button"
              className="lock"
              onClick={unlock}
              disabled={!locked}
              title={locked ? 'Locked: click to return to the seed value' : 'Follows the seed'}
              aria-label={locked ? `Unlock ${key}` : `${key} follows the seed`}
            />
          </div>
        )
      })}
    </div>
  )
}

function ExportPanel({ state, theme, scene }: { state: ViewState; theme: Theme; scene: Scene }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [video, setVideo] = useState<{ label: string; progress: number } | null>(null)
  const [message, setMessage] = useState<string>()
  const videoAbort = useRef<AbortController | null>(null)
  const baseName = `${theme.id}-v${theme.version}-${state.seed}-${scene.palette.mood}`

  const run = async ({ label, width, height }: { label: string; width: number; height: number }) => {
    setBusy(label)
    setMessage(undefined)
    try {
      const blob = await exportPool.render({ ...state, width, height }).promise
      download(blob, `${baseName}-${width}x${height}.png`)
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Export failed')
    } finally {
      setBusy(null)
    }
  }

  const exportSvg = (mode: SvgMode) => {
    const svg = renderSvg(scene, { mode })
    download(new Blob([svg], { type: 'image/svg+xml' }), `${baseName}-${mode}.svg`)
  }

  const runVideo = async ({ label, width, height }: { label: string; width: number; height: number }) => {
    const controller = new AbortController()
    videoAbort.current = controller
    setVideo({ label, progress: 0 })
    setMessage(undefined)
    try {
      const result = await exportVideo(scene, {
        width,
        height,
        signal: controller.signal,
        onProgress: (progress) => setVideo({ label, progress }),
      })
      download(result.blob, `${baseName}-${state.loop ?? 'ambient'}-${width}x${height}${result.extension}`)
      setMessage(`Saved ${result.codec.toUpperCase()} ${result.extension.slice(1).toUpperCase()}, ${scene.loop.seconds} s loop`)
    } catch (err) {
      setMessage(err instanceof DOMException && err.name === 'AbortError' ? 'Video export cancelled' : err instanceof Error ? err.message : 'Video export failed')
    } finally {
      videoAbort.current = null
      setVideo(null)
    }
  }

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(location.href)
      setMessage('Link copied')
    } catch {
      setMessage('Could not copy, use the address bar')
    }
  }

  return (
    <>
      <div className="export-grid">
        {EXPORT_PRESETS[state.aspect].map((preset) => (
          <button key={preset.label} type="button" className="button" disabled={busy !== null} onClick={() => run(preset)}>
            <span>{busy === preset.label ? 'Rendering…' : `PNG ${preset.label}`}</span>
            <small>
              {preset.width}×{preset.height}
            </small>
          </button>
        ))}
      </div>
      <div className="export-row">
        <button type="button" className="button" onClick={() => exportSvg('clean')} title="No filters or blend modes. Safe for Illustrator, Figma and plotters.">
          SVG clean
        </button>
        <button type="button" className="button" onClick={() => exportSvg('styled')} title="Adds film grain as a tiled texture that scales with the artwork.">
          SVG styled
        </button>
      </div>
      <div className="export-row">
        {VIDEO_PRESETS[state.aspect].map((preset) => (
          <button key={preset.label} type="button" className="button" disabled={video !== null} onClick={() => runVideo(preset)}>
            Video {preset.label}
          </button>
        ))}
      </div>
      {video && (
        <div className="progress" role="status">
          <div className="progress-bar">
            <span style={{ transform: `scaleX(${video.progress})` }} />
          </div>
          <span className="progress-label">{Math.round(video.progress * 100)}%</span>
          <button type="button" className="text-button" onClick={() => videoAbort.current?.abort()}>
            Cancel
          </button>
        </div>
      )}
      <button type="button" className="button button-ghost" onClick={copyLink}>
        Copy link
      </button>
      {message && (
        <p className="note" role="status">
          {message}
        </p>
      )}
    </>
  )
}

export function Sidebar({ state, theme, scene, canGoBack, canGoForward, update, goToSeed, newSeed, back, forward }: SidebarProps) {
  const locked = Object.keys(state.overrides).length
  return (
    <aside className="sidebar">
      <header className="brand">
        <h1>Procedural Landscapes</h1>
      </header>

      <Section title="Theme">
        <div className="theme-grid">
          {THEMES.map((t) => (
            <Thumb
              key={t.id}
              label={t.name}
              active={t.id === state.theme}
              job={{ theme: t.id, seed: state.seed, aspect: '16:9', mood: state.mood, loop: state.loop, overrides: {}, width: 320, height: 180 }}
              onSelect={() => update({ theme: t.id, version: undefined })}
            />
          ))}
        </div>
      </Section>

      <Section title="Seed">
        <div className="seed-row">
          <button type="button" className="icon-button" onClick={back} disabled={!canGoBack} aria-label="Previous seed" title="Previous seed (←)">
            ‹
          </button>
          <SeedField seed={state.seed} onCommit={goToSeed} />
          <button type="button" className="icon-button" onClick={forward} disabled={!canGoForward} aria-label="Next seed" title="Next seed (→)">
            ›
          </button>
        </div>
        <button type="button" className="button button-primary" onClick={newSeed}>
          New seed <kbd>Space</kbd>
        </button>
      </Section>

      <Section title="Mood">
        <Chips<'auto' | MoodId>
          items={['auto', ...MOOD_IDS]}
          value={state.mood ?? 'auto'}
          label={(m) => (m === 'auto' && !state.mood ? `auto · ${scene.palette.mood}` : m)}
          onChange={(m) => update({ mood: m === 'auto' ? undefined : m })}
        />
      </Section>

      <Section title="Aspect">
        <Chips<AspectId> items={ASPECT_IDS} value={state.aspect} onChange={(aspect) => update({ aspect })} />
      </Section>

      <Section title="Motion">
        <Chips<LoopMode>
          items={['ambient', 'pan']}
          value={state.loop ?? 'ambient'}
          onChange={(loop) => update({ loop: loop === 'pan' ? 'pan' : undefined })}
        />
      </Section>

      <Section
        title="Parameters"
        action={
          locked > 0 && (
            <button type="button" className="text-button" onClick={() => update({ overrides: {} })}>
              Unlock {locked}
            </button>
          )
        }
      >
        <Params theme={theme} scene={scene} overrides={state.overrides} onChange={(overrides) => update({ overrides })} />
      </Section>

      <Section title="Export">
        <ExportPanel state={state} theme={theme} scene={scene} />
      </Section>
    </aside>
  )
}
