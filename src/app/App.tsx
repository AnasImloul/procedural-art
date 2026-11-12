import { useCallback, useEffect, useMemo, useState } from 'react'
import { MOOD_IDS } from '../engine/moods'
import { ASPECTS, checkScene } from '../engine/scene'
import { generate } from '../engine/theme'
import { THEMES, findTheme } from '../themes'
import { cycleLoader, cycleSource } from './cycle'
import { Sidebar } from './Sidebar'
import { clock, Stage, type CycleProps } from './Stage'
import { ASPECT_IDS, DEFAULT_HOUR, randomSeed, readHash, toHash, type ViewState } from './state'
import { Thumb } from './Thumb'

const STRIP_SIZE = 8
const cycle = <T,>(items: readonly T[], current: T) => items[(items.indexOf(current) + 1) % items.length]

export function App() {
  const [state, setState] = useState<ViewState>(() => readHash(location.hash))
  const [seeds, setSeeds] = useState<{ back: string[]; forward: string[] }>({ back: [], forward: [] })
  const [strip, setStrip] = useState(() => Array.from({ length: STRIP_SIZE }, randomSeed))
  const [renderMs, setRenderMs] = useState(0)

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
      else if (e.key === 't') update({ theme: cycle(THEMES.map((t) => t.id), state.theme), version: undefined })
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const stale = state.version !== undefined && state.version !== theme.version
  const source = useMemo(() => (state.cycle ? cycleSource(theme, state, scene) : undefined), [theme, state, scene])
  const loader = useMemo(() => cycleLoader(state), [state.theme, state.seed, state.aspect, state.loop, state.overrides])
  const onHour = useCallback((hour: number) => update({ hour: Math.round(hour * 100) / 100 }), [update])
  const cycleProps: CycleProps | undefined = source && { source, loader, hour: state.hour ?? DEFAULT_HOUR, onHour }
  const stripHeight = 176
  const stripWidth = Math.round(stripHeight * ASPECTS[state.aspect])

  return (
    <div className="app">
      <main className="stage">
        <Stage scene={scene} cycle={cycleProps} onRendered={setRenderMs} />
        <footer className="hud">
          <span>
            {theme.name} v{theme.version}
          </span>
          <span>{state.seed}</span>
          <span>{scene.palette.mood}</span>
          {state.cycle && <span>{clock(state.hour ?? DEFAULT_HOUR)}</span>}
          <span>{state.aspect}</span>
          <span>{renderMs.toFixed(0)} ms</span>
          {stale && <span className="hud-warn">link made with v{state.version}</span>}
          <span className="hud-keys">space · ← → · m · a · t · p</span>
        </footer>
      </main>

      <section className="strip" aria-label="More seeds">
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
      </section>

      <Sidebar
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
