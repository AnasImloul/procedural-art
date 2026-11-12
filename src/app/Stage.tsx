import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Scene } from '../engine/scene'
import { renderScene } from '../render/canvas'
import { Compositor } from '../render/webgl/compositor'

interface StageProps {
  scene: Scene
  onRendered(ms: number): void
}

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function PlayIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      {playing ? (
        <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />
      ) : (
        <path d="M4.5 2.5v11l9-5.5z" fill="currentColor" />
      )}
    </svg>
  )
}

export function Stage({ scene, onRendered }: StageProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const sliderRef = useRef<HTMLInputElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const compositorRef = useRef<Compositor | null | undefined>(undefined)
  const timeRef = useRef(0)
  const startRef = useRef(0)
  const [box, setBox] = useState({ width: 0, height: 0 })
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  const [pausedAt, setPausedAt] = useState(0)
  const [glActive, setGlActive] = useState(false)
  const loopMs = scene.loop.seconds * 1000

  useLayoutEffect(() => {
    const observer = new ResizeObserver(([entry]) =>
      setBox({ width: entry.contentRect.width, height: entry.contentRect.height }),
    )
    observer.observe(wrapRef.current!)
    return () => {
      observer.disconnect()
      compositorRef.current?.dispose()
    }
  }, [])

  const size = useMemo(() => {
    if (!box.width || !box.height) return null
    const cssHeight = Math.min(box.height, box.width / scene.aspect)
    const cssWidth = cssHeight * scene.aspect
    const dpr = window.devicePixelRatio || 1
    return { cssWidth, cssHeight, width: Math.round(cssWidth * dpr), height: Math.round(cssHeight * dpr) }
  }, [box, scene.aspect])

  const showTime = (t: number) => {
    if (sliderRef.current) sliderRef.current.value = String(t)
    if (labelRef.current) labelRef.current.textContent = `${(t * scene.loop.seconds).toFixed(1)} / ${scene.loop.seconds} s`
  }

  useEffect(() => {
    if (!size) return
    for (const canvas of [canvasRef.current!, glCanvasRef.current!]) {
      canvas.style.width = `${size.cssWidth}px`
      canvas.style.height = `${size.cssHeight}px`
    }
  }, [size])

  useEffect(() => {
    if (playing || !size) return
    const canvas = canvasRef.current!
    canvas.width = size.width
    canvas.height = size.height
    const started = performance.now()
    renderScene(canvas.getContext('2d')!, scene, { width: size.width, height: size.height, t: pausedAt })
    onRendered(performance.now() - started)
    showTime(pausedAt)
  }, [playing, scene, size, pausedAt, onRendered])

  useEffect(() => {
    if (!playing || !size) return
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
  }, [playing, scene, size, loopMs, onRendered])

  const toggle = () => {
    if (playing) setPausedAt(timeRef.current)
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

  const scrub = (t: number) => {
    timeRef.current = t
    if (playing) startRef.current = performance.now() - t * loopMs
    else setPausedAt(t)
  }

  return (
    <div className="stage-view">
      <div className="stage-canvas" ref={wrapRef}>
        <canvas ref={canvasRef} hidden={playing && glActive} />
        <canvas ref={glCanvasRef} hidden={!(playing && glActive)} />
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
          aria-label="Time"
          onChange={(e) => scrub(Number(e.target.value))}
        />
        <span ref={labelRef} className="transport-time" />
      </div>
    </div>
  )
}
