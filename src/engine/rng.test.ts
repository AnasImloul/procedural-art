import { describe, expect, it } from 'vitest'
import { Rng } from './rng'

const draw = (rng: Rng, n = 8) => Array.from({ length: n }, () => rng.next())

describe('Rng', () => {
  it('produces the same sequence for the same key', () => {
    expect(draw(new Rng('alpine/v1/a1'))).toEqual(draw(new Rng('alpine/v1/a1')))
  })

  it('produces different sequences for different keys', () => {
    expect(draw(new Rng('alpine/v1/a1'))).not.toEqual(draw(new Rng('alpine/v1/a2')))
  })

  it('forks streams that do not depend on how much the parent was used', () => {
    const fresh = new Rng('seed')
    const used = new Rng('seed')
    draw(used, 100)
    expect(draw(fresh.fork('clouds'))).toEqual(draw(used.fork('clouds')))
  })

  it('keeps values in range', () => {
    const rng = new Rng('range')
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-2, 3)
      expect(v).toBeGreaterThanOrEqual(-2)
      expect(v).toBeLessThan(3)
      const n = rng.int(1, 4)
      expect(Number.isInteger(n) && n >= 1 && n <= 4).toBe(true)
    }
  })

  it('never picks a zero-weight option', () => {
    const rng = new Rng('weighted')
    for (let i = 0; i < 500; i++) expect(rng.weighted({ a: 1, b: 0, c: 2 })).not.toBe('b')
  })
})
