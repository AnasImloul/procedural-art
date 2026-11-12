import type { Vec } from './scene'

const f = (n: number) => String(Math.round(n * 1e4) / 1e4)

export const rect = (x: number, y: number, w: number, h: number) =>
  `M${f(x)} ${f(y)}H${f(x + w)}V${f(y + h)}H${f(x)}Z`

export const circle = (cx: number, cy: number, r: number) =>
  `M${f(cx - r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx + r)} ${f(cy)}A${f(r)} ${f(r)} 0 1 0 ${f(cx - r)} ${f(cy)}Z`

export const polygon = (points: Vec[]) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('') + 'Z'
