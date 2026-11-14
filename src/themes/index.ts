import type { Theme } from '../engine/theme'

const modules = import.meta.glob<Theme>(['./*.ts', '!./index.ts', '!./*.test.ts'], { eager: true, import: 'default' })

export const THEMES: Theme[] = Object.values(modules).sort((a, b) => a.id.localeCompare(b.id))

export const findTheme = (id: string) => THEMES.find((t) => t.id === id)
