import type { RenderJob } from '../render/jobs'
import { thumbPool, useDebounced, useRenderedImage } from './pools'

interface ThumbProps {
  job: RenderJob
  label: string
  active?: boolean
  onSelect(): void
}

export function Thumb({ job, label, active, onSelect }: ThumbProps) {
  const url = useRenderedImage(useDebounced(job, 180), thumbPool)
  return (
    <button
      type="button"
      className={`thumb${active ? ' is-active' : ''}`}
      style={{ aspectRatio: `${job.width} / ${job.height}` }}
      onClick={onSelect}
      aria-pressed={active}
      title={label}
    >
      {url ? <img src={url} alt="" draggable={false} /> : <span className="thumb-loading" />}
      <span className="thumb-label">{label}</span>
    </button>
  )
}
