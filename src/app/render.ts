import { useEffect, useState } from 'react'
import type { RenderJob } from '../render/jobs'
import { CancelledError, RenderPool } from '../render/pool'

const cores = navigator.hardwareConcurrency || 4
export const thumbPool = new RenderPool(Math.max(1, Math.min(3, cores - 1)))
export const exportPool = new RenderPool(1)
export const cyclePool = new RenderPool(2)

export function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value)
  const key = JSON.stringify(value)
  useEffect(() => {
    const id = setTimeout(() => setDebounced(JSON.parse(key)), ms)
    return () => clearTimeout(id)
  }, [key, ms])
  return debounced
}

export function useRenderedImage(job: RenderJob, pool: RenderPool): string | undefined {
  const [url, setUrl] = useState<string>()
  const key = JSON.stringify(job)

  useEffect(() => {
    const handle = pool.render(JSON.parse(key))
    let alive = true
    handle.promise
      .then((blob) => alive && setUrl(URL.createObjectURL(blob)))
      .catch((err) => {
        if (!(err instanceof CancelledError)) console.error(err)
      })
    return () => {
      alive = false
      handle.cancel()
    }
  }, [key, pool])

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )
  return url
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
