import { renderToBlob, type RenderJob } from './jobs'

type WorkerMessage = { ready: boolean } | { blob: Blob } | { error: string }

interface Task {
  job: RenderJob
  resolve: (blob: Blob) => void
  reject: (err: Error) => void
}

export class CancelledError extends Error {
  constructor() {
    super('Render cancelled')
  }
}

export interface RenderHandle {
  promise: Promise<Blob>
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
    let task!: Task
    const promise = new Promise<Blob>((resolve, reject) => {
      task = { job, resolve, reject }
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
      if ('blob' in message) task?.resolve(message.blob)
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
        task.resolve(await renderToBlob(task.job))
      } catch (err) {
        task.reject(err instanceof Error ? err : new Error(String(err)))
      }
    }
    this.mainThreadRunning = false
  }
}
