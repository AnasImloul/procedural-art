import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Scene } from '../engine/scene'
import { renderScene } from '../render/canvas'
import { Compositor } from '../render/webgl/compositor'
import { CycleCompositor, type CycleSource, type KeyframeLoader } from '../render/webgl/cycle'

export interface CycleProps {
  source: CycleSource
  loader: KeyframeLoader
  hour: number
  onHour(hour: number): void
}

interface StageProps {
  scene: Scene
  cycle?: CycleProps
  onRendered(ms: number): void
}

export const clock = (hour: number) => {
  const minutes = Math.round((((hour % 24) + 24) % 24) * 60) % 1440
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {playing ? <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" /> : <path d="M4.5 2.5v11l9-5.5z" fill="currentColor" />}
    </svg>
  )
}

export function Stage({ scene, cycle, onRendered }: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const cycleCanvasRef = useRef<HTMLCanvasElement>(null)
  const cycleCompositorRef = useRef<CycleCompositor | null | undefined>(undefined)
  const cycleRef = useRef(cycle)
  cycleRef.current = cycle
  const sliderRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const compositorRef = useRef<Compositor | null | undefined>(undefined)
  const timeRef = useRef(0)
  const startRef = useRef(0)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [pausedAt, setPausedAt] = useState(0)
  const [glActive, setGlActive] = useState(false)
  const [cycleActive, setCycleActive] = useState(false)
  const [scrubbing, setScrubbingState] = useState(false)
  const scrubbingRef = useRef(false)
  const committingRef = useRef(false)
  const commitTimer = useRef(0)
  const loopMs = scene.loop.seconds * 1000
  const isCycle = !!cycle
  const cycleKey = cycle?.source.key

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }))
    observer.observe(wrapRef.current!)
    return () => {
      observer.disconnect()
      compositorRef.current?.dispose()
      cycleCompositorRef.current?.dispose()
    }
  }, [])

  const size = useMemo(() => {
    if (!box.width || !box.height) return null
    const cssHeight = Math.min(box.height, box.width / scene.aspect)
    const cssWidth = cssHeight * scene.aspect
    const dpr = window.devicePixelRatio || 1
    return { cssWidth, cssHeight, width: Math.round(cssWidth * dpr), height: Math.round(cssHeight * dpr) }
  }, [box, scene.aspect])

  const seconds = scene.loop.seconds
  const setScrubbing = useCallback((value: boolean) => {
    scrubbingRef.current = value
    setScrubbingState(value)
  }, [])

  const showTime = useCallback(
    (t: number) => {
      if (sliderRef.current) sliderRef.current.value = String(t)
      if (labelRef.current) labelRef.current.textContent = isCycle ? clock(t * 24) : `${(t * seconds).toFixed(1)} / ${seconds} s`
    },
    [isCycle, seconds],
  )

  useEffect(() => {
    if (!size) return
    for (const canvas of [canvasRef.current!, glCanvasRef.current!, cycleCanvasRef.current!]) {
      canvas.style.width = `${size.cssWidth}px`
      canvas.style.height = `${size.cssHeight}px`
    }
  }, [size])

  useEffect(() => {
    if (isCycle) timeRef.current = (cycleRef.current!.hour % 24) / 24
  }, [isCycle])

  useEffect(() => {
    if (!size || (playing && !(isCycle && !cycleActive))) return
    if (!playing && scrubbingRef.current && !committingRef.current) return
    const canvas = canvasRef.current!
    canvas.width = size.width
    canvas.height = size.height
    const started = performance.now()
    const t = isCycle ? (((cycleRef.current!.hour % 24) + 24) % 24) / 24 : pausedAt
    renderScene(canvas.getContext('2d')!, scene, { width: size.width, height: size.height, t })
    onRendered(performance.now() - started)
    if (!playing) showTime(isCycle ? (cycleRef.current!.hour % 24) / 24 : pausedAt)
    if (committingRef.current) {
      committingRef.current = false
      setScrubbing(false)
    }
  }, [playing, scene, size, pausedAt, onRendered, isCycle, cycleActive, showTime, setScrubbing])

  const startCycle = useCallback(() => {
    const canvas = cycleCanvasRef.current!
    if (cycleCompositorRef.current === undefined) cycleCompositorRef.current = CycleCompositor.create(canvas)
    const compositor = cycleCompositorRef.current
    if (!compositor || !size) return null
    const { source, loader } = cycleRef.current!
    const scale = source.runs.length > 3 ? Math.min(1, 1080 / size.height) : 1
    const width = Math.round(size.width * scale)
    const height = Math.round(size.height * scale)
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
    compositor.setSource(source, loader, width, height)
    return compositor
  }, [size])

  // biome-ignore lint/correctness/useExhaustiveDependencies: cycleKey restarts playback when the cycle source changes; the source itself is read through cycleRef so mood or hour changes don't restart it
  useEffect(() => {
    if (!playing || !size || !isCycle) return
    const compositor = startCycle()
    if (!compositor) return
    startRef.current = performance.now() - timeRef.current * loopMs
    let ready = false
    let frame = 0
    let frames = 0
    let total = 0
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startRef.current) / loopMs
      const t = elapsed - Math.floor(elapsed)
      timeRef.current = t
      const started = performance.now()
      if (compositor.render(t * 24, t) && !ready) {
        ready = true
        setCycleActive(true)
      }
      total += performance.now() - started
      if (++frames === 30) {
        onRendered(total / frames)
        frames = 0
        total = 0
      }
      showTime(t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(frame)
      setCycleActive(false)
    }
  }, [playing, size, isCycle, cycleKey, loopMs, onRendered, showTime, startCycle])

  useEffect(() => {
    if (playing || !scrubbing || !isCycle) return
    const compositor = startCycle()
    if (!compositor) return
    let frame = 0
    const tick = () => {
      const t = timeRef.current
      if (compositor.render(t * 24, t)) setCycleActive(true)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, scrubbing, isCycle, startCycle])

  useEffect(() => () => clearTimeout(commitTimer.current), [])

  useEffect(() => {
    if (!playing || !size || isCycle) return
    const glCanvas = glCanvasRef.current!
    if (compositorRef.current === undefined) compositorRef.current = Compositor.create(glCanvas)
    const compositor = compositorRef.current
    const canvas = canvasRef.current!
    if (compositor) {
      glCanvas.width = size.width
      glCanvas.height = size.height
      compositor.setScene(scene, size.width, size.height)
    } else {
      canvas.width = size.width
      canvas.height = size.height
    }
    setGlActive(!!compositor)
    const ctx = canvas.getContext('2d')!
    startRef.current = performance.now() - timeRef.current * loopMs

    let frame = 0
    let frames = 0
    let total = 0
    const tick = (now: number) => {
      const elapsed = Math.max(0, now - startRef.current) / loopMs
      const t = elapsed - Math.floor(elapsed)
      timeRef.current = t
      const started = performance.now()
      if (compositor) compositor.render(t)
      else renderScene(ctx, scene, { width: size.width, height: size.height, t })
      total += performance.now() - started
      if (++frames === 30) {
        onRendered(total / frames)
        frames = 0
        total = 0
      }
      showTime(t)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, scene, size, loopMs, onRendered, isCycle, showTime])

  const toggle = () => {
    clearTimeout(commitTimer.current)
    committingRef.current = false
    setScrubbing(false)
    if (playing) {
      if (isCycle) cycleRef.current!.onHour(timeRef.current * 24)
      else setPausedAt(timeRef.current)
    }
    setPlaying(!playing)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'p' || e.target instanceof HTMLInputElement || e.metaKey || e.ctrlKey || e.altKey) return
      e.preventDefault()
      toggle()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const commitHour = (t: number) => {
    const cycleProps = cycleRef.current!
    if (Math.round(t * 2400) / 100 === cycleProps.hour) {
      setScrubbing(false)
      return
    }
    committingRef.current = true
    cycleProps.onHour(t * 24)
  }

  const scrub = (t: number) => {
    timeRef.current = t
    if (playing) startRef.current = performance.now() - t * loopMs
    else if (isCycle) {
      committingRef.current = false
      setScrubbing(true)
      showTime(t)
      clearTimeout(commitTimer.current)
      commitTimer.current = window.setTimeout(() => commitHour(t), 200)
    } else setPausedAt(t)
  }

  const cycleVisible = isCycle && cycleActive && (playing || scrubbing)

  return (
    <div className="stage-view">
      <div className="stage-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} hidden={isCycle ? cycleVisible : playing && glActive} />
        <canvas ref={glCanvasRef} hidden={!(playing && !isCycle && glActive)} />
        <canvas ref={cycleCanvasRef} hidden={!cycleVisible} />
      </div>
      <div className="transport">
        <button type="button" className="icon-button" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause (P)' : 'Play (P)'}>
          <PlayIcon playing={playing} />
        </button>
        <input
          ref={sliderRef}
          type="range"
          min={0}
          max={1}
          step={0.0005}
          defaultValue={0}
          aria-label={isCycle ? 'Time of day' : 'Time'}
          onChange={(e) => scrub(Number(e.target.value))}
        />
        <span ref={labelRef} className="transport-time" />
      </div>
    </div>
  )
}
