import { describe, expect, it } from 'vitest'
import { loopNoise1D } from './noise'
import { Rng } from './rng'

describe('loopNoise1D', () => {
  it('repeats exactly over its period so pan loops are seamless', () => {
    const period = 16 / 9
    const noise = loopNoise1D(new Rng('loop'))
    for (const x of [0, 0.1, 0.77, 1.5]) {
      for (const options of [
        { octaves: 3, frequency: 3 },
        { octaves: 5, frequency: 40, ridged: true },
      ]) {
        // simplex-noise has ~1e-4 jumps at its cell boundaries, far below a pixel once scaled
        expect(noise(x + period, period, options)).toBeCloseTo(noise(x, period, options), 3)
      }
    }
  })

  it('stays within 0 to 1', () => {
    const noise = loopNoise1D(new Rng('bounds'))
    for (let i = 0; i < 500; i++) {
      const v = noise(i / 97, 1.5, { octaves: 4, frequency: 6 })
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
})
