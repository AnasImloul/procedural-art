import { describe, expect, it } from 'vitest'
import { MOOD_IDS } from '../engine/moods'
import { ASPECTS, checkScene, type Scene } from '../engine/scene'
import { type GenerateOptions, generate } from '../engine/theme'
import { THEMES } from './index'

const SEEDS = ['a1', 'b2', 'c3', 'd4']

interface Case {
  name: string
  options: GenerateOptions
}

const cases: Case[] = SEEDS.flatMap((seed) =>
  Object.entries(ASPECTS).flatMap(([aspectId, aspect]) => [
    { name: `${seed} ${aspectId} still`, options: { seed, aspect } },
    { name: `${seed} ${aspectId} pan`, options: { seed, aspect, loop: 'pan' as const } },
    { name: `${seed} ${aspectId} cycle`, options: { seed, aspect, cycle: true, hour: 7 } },
  ]),
)
const moodCases: Case[] = MOOD_IDS.map((mood) => ({ name: `m1 16:9 ${mood}`, options: { seed: 'm1', aspect: ASPECTS['16:9'], mood } }))

async function fingerprint(scene: Scene) {
  const json = JSON.stringify(scene, (_, v) => (typeof v === 'number' ? Number(v.toPrecision(10)) : v))
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(json))
  const hash = Array.from(new Uint8Array(digest).slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hash} ${scene.layers.length} layers`
}

describe.each(THEMES)('$name', (theme) => {
  it('renders every released seed exactly as before', async () => {
    const prints: Record<string, string> = {}
    for (const { name, options } of [...cases, ...moodCases]) prints[`${theme.id}/v${theme.version} ${name}`] = await fingerprint(generate(theme, options))
    expect(prints).toMatchSnapshot()
  })

  it('generates the same scene twice', () => {
    const options = { seed: 'repeat', aspect: ASPECTS['3:2'], loop: 'pan' as const }
    expect(JSON.stringify(generate(theme, options))).toBe(JSON.stringify(generate(theme, options)))
  })

  it('produces scenes whose motion loops cleanly', () => {
    for (const { name, options } of cases) {
      const loopWarnings = checkScene(generate(theme, options)).filter((w) => !w.startsWith('Low contrast'))
      expect(loopWarnings, name).toEqual([])
    }
  })
})
