function cyrb128(str: string): [number, number, number, number] {
  let h1 = 1779033703
  let h2 = 3144134277
  let h3 = 1013904242
  let h4 = 2773480762
  for (let i = 0; i < str.length; i++) {
    const k = str.charCodeAt(i)
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067)
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233)
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213)
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179)
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067)
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233)
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213)
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179)
  h1 ^= h2 ^ h3 ^ h4
  h2 ^= h1
  h3 ^= h1
  h4 ^= h1
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0]
}

function sfc32(a: number, b: number, c: number, d: number) {
  return () => {
    a |= 0
    b |= 0
    c |= 0
    d |= 0
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = b ^ (b >>> 9)
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return (t >>> 0) / 4294967296
  }
}

export class Rng {
  readonly key: string
  private readonly gen: () => number

  constructor(key: string) {
    this.key = key
    this.gen = sfc32(...cyrb128(key))
    for (let i = 0; i < 12; i++) this.gen()
  }

  fork(name: string): Rng {
    return new Rng(`${this.key}/${name}`)
  }

  next(): number {
    return this.gen()
  }

  range(min: number, max: number): number {
    return min + (max - min) * this.gen()
  }

  int(min: number, max: number): number {
    return Math.floor(this.range(min, max + 1))
  }

  chance(p: number): boolean {
    return this.gen() < p
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.gen() * items.length)]
  }

  weighted<K extends string>(weights: Partial<Record<K, number>>): K {
    const entries = (Object.entries(weights) as [K, number][]).filter(([, w]) => w > 0)
    let roll = this.gen() * entries.reduce((sum, [, w]) => sum + w, 0)
    for (const [key, w] of entries) {
      roll -= w
      if (roll < 0) return key
    }
    return entries[entries.length - 1][0]
  }
}
