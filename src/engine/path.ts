import type { Vec } from './scene'

const f = (n: number) => String(Math.round(n * 1e4) / 1e4)

export const rect = (x: number, y: number, w: number, h: number) =>
  `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`

export const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`

export const polygon = (points: Vec[]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('') + 'Z'

export function mirrorPathY(d: string, axis: number): string {
  return d.replace(/([MLHVAZ])([^MLHVAZ]*)/g, (_, cmd: string, args: string) => {
    const n = args.trim() ? args.trim().split(/[\s,]+/).map(Number) : []
    if (cmd === 'M' || cmd === 'L') return `${cmd}${f(n[0])} ${f(2 * axis - n[1])}`
    if (cmd === 'V') return `V${f(2 * axis - n[0])}`
    if (cmd === 'H') return `H${f(n[0])}`
    if (cmd === 'A') return `A${f(n[0])} ${f(n[1])} ${n[2]} ${n[3]} ${1 - n[4]} ${f(n[5])} ${f(2 * axis - n[6])}`
    return cmd
  })
}
