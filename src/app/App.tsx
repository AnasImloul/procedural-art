import { type CSSProperties, useCallback, useEffect, useMemo, useState } from 'react'
import { type Color, toRgb } from '../engine/color'
import { MOOD_IDS } from '../engine/moods'
import { ASPECTS, checkScene } from '../engine/scene'
import { generate } from '../engine/theme'
import { findTheme, THEMES } from '../themes'
import { cycleLoader, cycleSource } from './cycleSource'
import { Sidebar } from './Sidebar'
import { type CycleProps, Stage } from './Stage'
import { ASPECT_IDS, DEFAULT_HOUR, randomSeed, readHash, toHash, type ViewState } from './state'
import { Thumb } from './Thumb'

const STRIP_SIZE = 8
const VIEWING_KEY = 'procedural-landscapes:viewing'
const cycle = <T,>(items: readonly T[], current: T) => items[(items.indexOf(current) + 1) % items.length]
const css = (color: Color) => `rgb(${toRgb(color).join(' ')})`

const SHORTCUTS: [string, string][] = [
  ['Space', 'New seed'],
  ['← →', 'Seed history'],
  ['M', 'Next mood'],
  ['A', 'Next aspect'],
  ['T', 'Next theme'],
  ['P', 'Play or pause'],
  ['F', 'Hide or show the panel'],
]

function readViewing() {
  try {
    return localStorage.getItem(VIEWING_KEY) === '1'
  } catch {
    return false
  }
}

function Icon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function App() {
  const [state, setState] = useState<ViewState>(() => readHash(location.hash))
  const [seeds, setSeeds] = useState<{ back: string[]; forward: string[] }>({ back: [], forward: [] })
  const [strip, setStrip] = useState(() => Array.from({ length: STRIP_SIZE }, randomSeed))
  const [renderMs, setRenderMs] = useState(0)
  const [viewing, setViewing] = useState(readViewing)
  const [idle, setIdle] = useState(false)
  const [fullscreen, setFullscreen] = useState(false)

  const theme = findTheme(state.theme)!
  const scene = useMemo(
    () =>
      generate(theme, {
        seed: state.seed,
        aspect: ASPECTS[state.aspect],
        mood: state.mood,
        loop: state.loop,
        cycle: state.cycle,
        hour: state.hour ?? DEFAULT_HOUR,
        overrides: state.overrides,
      }),
    [theme, state.seed, state.aspect, state.mood, state.loop, state.cycle, state.hour, state.overrides],
  )

  useEffect(() => {
    window.history.replaceState(null, '', `#${toHash(state)}`)
  }, [state])

  useEffect(() => {
    for (const warning of checkScene(scene)) console.warn(warning)
  }, [scene])

  useEffect(() => {
    try {
      localStorage.setItem(VIEWING_KEY, viewing ? '1' : '0')
    } catch {}
  }, [viewing])

  useEffect(() => {
    if (!viewing) {
      setIdle(false)
      return
    }
    let timer = 0
    const wake = () => {
      setIdle(false)
      clearTimeout(timer)
      timer = window.setTimeout(() => setIdle(true), 2500)
    }
    wake()
    window.addEventListener('pointermove', wake)
    window.addEventListener('keydown', wake)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointermove', wake)
      window.removeEventListener('keydown', wake)
    }
  }, [viewing])

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen()
    else void document.documentElement.requestFullscreen().catch(() => {})
  }

  useEffect(() => {
    const onHash = () => setState(readHash(location.hash))
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const update = useCallback((next: Partial<ViewState>) => {
    setState((s) => ({ ...s, ...next, ...(next.theme && next.theme !== s.theme ? { overrides: {} } : {}) }))
  }, [])

  const goToSeed = (seed: string) => {
    if (seed === state.seed) return
    setSeeds((h) => ({ back: [...h.back, state.seed].slice(-100), forward: [] }))
    update({ seed, version: undefined })
  }
  const newSeed = () => goToSeed(randomSeed())
  const back = () => {
    const previous = seeds.back.at(-1)
    if (!previous) return
    setSeeds((h) => ({ back: h.back.slice(0, -1), forward: [state.seed, ...h.forward] }))
    update({ seed: previous, version: undefined })
  }
  const forward = () => {
    const next = seeds.forward[0]
    if (!next) return
    setSeeds((h) => ({ back: [...h.back, state.seed], forward: h.forward.slice(1) }))
    update({ seed: next, version: undefined })
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === ' ') newSeed()
      else if (e.key === 'ArrowLeft') back()
      else if (e.key === 'ArrowRight') forward()
      else if (e.key === 'm') update({ mood: cycle([undefined, ...MOOD_IDS], state.mood) })
      else if (e.key === 'a') update({ aspect: cycle(ASPECT_IDS, state.aspect) })
      else if (e.key === 'f') setViewing((v) => !v)
      else if (e.key === 't')
        update({
          theme: cycle(
            THEMES.map((t) => t.id),
            state.theme,
          ),
          version: undefined,
        })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stale = state.version !== undefined && state.version !== theme.version
  const source = useMemo(() => (state.cycle ? cycleSource(theme, state, scene) : undefined), [theme, state, scene])
  const { theme: themeId, seed, aspect, loop, overrides } = state
  const loader = useMemo(() => cycleLoader({ theme: themeId, seed, aspect, loop, overrides }), [themeId, seed, aspect, loop, overrides])
  const onHour = useCallback((hour: number) => update({ hour: Math.round(hour * 100) / 100 }), [update])
  const cycleProps: CycleProps | undefined = source && { source, loader, hour: state.hour ?? DEFAULT_HOUR, onHour }
  const stripHeight = 176
  const stripWidth = Math.round(stripHeight * ASPECTS[state.aspect])
  const { anchors } = scene.palette
  const glow = { '--glow-ink': css(anchors.ink), '--aspect': scene.aspect } as CSSProperties
  const meta = [state.cycle ? 'day cycle' : scene.palette.mood, state.loop === 'pan' ? 'panning' : undefined, `seed ${state.seed}`].filter(Boolean).join(' · ')

  return (
    <div className={`app${viewing ? ' is-viewing' : ''}${idle ? ' is-idle' : ''}`} style={glow}>
      <main className="stage">
        <div id="shortcuts" popover="auto" className="shortcuts">
          <h2>Keyboard shortcuts</h2>
          <dl>
            {SHORTCUTS.map(([key, action]) => (
              <div key={key}>
                <dt>
                  <kbd>{key}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        </div>
        <Stage
          scene={scene}
          cycle={cycleProps}
          onRendered={setRenderMs}
          header={
            <div className="stage-tools">
              <button type="button" className="tool" popoverTarget="shortcuts" aria-label="Keyboard shortcuts" title="Keyboard shortcuts">
                <Icon path="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.2-.8.7-.8 1.2v.6M8 11.6v.1" />
              </button>
              {document.fullscreenEnabled && (
                <button
                  type="button"
                  className="tool"
                  onClick={toggleFullscreen}
                  aria-label={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                  title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
                >
                  <Icon
                    path={fullscreen ? 'M6 2.5v3.5H2.5M10 2.5v3.5h3.5M6 13.5V10H2.5M10 13.5V10h3.5' : 'M2.5 6V2.5H6M13.5 6V2.5H10M2.5 10v3.5H6M13.5 10v3.5H10'}
                  />
                </button>
              )}
              <button
                type="button"
                className="tool"
                onClick={() => setViewing((v) => !v)}
                aria-pressed={viewing}
                aria-label={viewing ? 'Show the panel' : 'Hide the panel'}
                title={viewing ? 'Show the panel (F)' : 'Hide the panel (F)'}
              >
                <Icon path={viewing ? 'M2.5 3.5h11v9h-11zM10 3.5v9M12 7l-1 1 1 1' : 'M2.5 3.5h11v9h-11zM10 3.5v9M11 7l1 1-1 1'} />
              </button>
            </div>
          }
        >
          <footer className="caption" title={`${renderMs.toFixed(1)} ms per frame`}>
            <h2 className="caption-title">{theme.name}</h2>
            <p className="caption-meta">
              {meta}
              {stale && <span className="caption-warn"> · link made with v{state.version}</span>}
            </p>
          </footer>
          <section className="strip" aria-label="More seeds" inert={viewing}>
            <div className="strip-inner">
              <header className="section-header">
                <h2>More seeds</h2>
                <button type="button" className="text-button" onClick={() => setStrip(Array.from({ length: STRIP_SIZE }, randomSeed))}>
                  Shuffle
                </button>
              </header>
              <div className="strip-row">
                {strip.map((seed) => (
                  <Thumb
                    key={seed}
                    label={seed}
                    active={seed === state.seed}
                    job={{ ...state, seed, width: stripWidth, height: stripHeight }}
                    onSelect={() => goToSeed(seed)}
                  />
                ))}
              </div>
            </div>
          </section>
        </Stage>
      </main>

      <Sidebar
        collapsed={viewing}
        state={state}
        theme={theme}
        scene={scene}
        canGoBack={seeds.back.length > 0}
        canGoForward={seeds.forward.length > 0}
        update={update}
        goToSeed={goToSeed}
        newSeed={newSeed}
        back={back}
        forward={forward}
      />
    </div>
  )
}
