import type { Layer } from './scene'

export interface MotionState {
  shift: number
  alpha: number
}

export const REST: MotionState = { shift: 0, alpha: 1 }

const TAU = Math.PI * 2

export const isAnimated = (layer: Layer) => !!layer.motion?.length

export function motionAt(layer: Layer, t: number): MotionState {
  if (!layer.motion) return REST
  let shift = 0
  let alpha = 1
  for (const m of layer.motion) {
    if (m.type === 'drift') shift += m.wraps * t
    else if (m.type === 'sway') shift += m.amount * Math.sin(TAU * m.cycles * t)
    else alpha *= 1 - (m.amount * (1 - Math.cos(TAU * m.cycles * t + (m.phase ?? 0)))) / 2
  }
  return { shift: layer.wrap ? shift - Math.floor(shift) : 0, alpha }
}
