import { type KeyframeJob, type KeyframePart, type RenderJob, renderKeyframe, renderToBlob } from './jobs'

type WorkerMessage = { ready: boolean } | { result: Blob | KeyframePart[] } | { error: string }

interface Task {
  job: RenderJob | KeyframeJob
  resolve: (result: never) => void
  reject: (err: Error) => void
}

export class CancelledError extends Error {
  constructor() {
    super('Render cancelled')
  }
}

export interface RenderHandle<T = Blob> {
  promise: Promise<T>
  cancel(): void
}

export class RenderPool {
  private queue: Task[] = []
  private idle: Worker[] = []
  private busy = new Map<Worker, Task>()
  private mainThread = false
  private mainThreadRunning = false

  constructor(size: number) {
    for (let i = 0; i < size; i++) {
      const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
      worker.onmessage = (e: MessageEvent<WorkerMessage>) => this.receive(worker, e.data)
      worker.onerror = () => {
        this.mainThread = true
        this.pump()
      }
    }
  }

  render(job: RenderJob): RenderHandle {
    return this.enqueue<Blob>(job)
  }

  keyframe(job: KeyframeJob): RenderHandle<KeyframePart[]> {
    return this.enqueue<KeyframePart[]>(job)
  }

  private enqueue<T>(job: RenderJob | KeyframeJob): RenderHandle<T> {
    let task!: Task
    const promise = new Promise<T>((resolve, reject) => {
      task = { job, resolve: resolve as (result: never) => void, reject }
    })
    this.queue.push(task)
    this.pump()
    return {
      promise,
      cancel: () => {
        const index = this.queue.indexOf(task)
        if (index >= 0) this.queue.splice(index, 1)
        task.reject(new CancelledError())
      },
    }
  }

  private receive(worker: Worker, message: WorkerMessage) {
    if ('ready' in message) {
      if (!message.ready) this.mainThread = true
      else this.idle.push(worker)
    } else {
      const task = this.busy.get(worker)
      this.busy.delete(worker)
      this.idle.push(worker)
      if ('result' in message) task?.resolve(message.result as never)
      else task?.reject(new Error(message.error))
    }
    this.pump()
  }

  private pump() {
    if (this.mainThread) {
      void this.drainOnMainThread()
      return
    }
    while (this.idle.length && this.queue.length) {
      const worker = this.idle.pop()!
      const task = this.queue.shift()!
      this.busy.set(worker, task)
      worker.postMessage({ job: task.job })
    }
  }

  private async drainOnMainThread() {
    if (this.mainThreadRunning) return
    this.mainThreadRunning = true
    while (this.queue.length) {
      const task = this.queue.shift()!
      await new Promise((r) => setTimeout(r, 0))
      try {
        const { job } = task
        task.resolve(('keyframe' in job ? await renderKeyframe(job) : await renderToBlob(job)) as never)
      } catch (err) {
        task.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    this.mainThreadRunning = false
  }
}
