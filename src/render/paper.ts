export const PAPER_TILE = 512
const RANGE = 0.25

function hash(x: number, y: number, seed: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + seed) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function noise(x: number, y: number, cells: number, seed: number): number {
  const fx = x * cells
  const fy = y * cells
  const xi = Math.floor(fx)
  const yi = Math.floor(fy)
  const u = fx - xi
  const v = fy - yi
  const su = u * u * (3 - 2 * u)
  const sv = v * v * (3 - 2 * v)
  const wrap = (n: number) => ((n % cells) + cells) % cells
  const [x0, x1, y0, y1] = [wrap(xi), wrap(xi + 1), wrap(yi), wrap(yi + 1)]
  const a = hash(x0, y0, seed)
  const b = hash(x1, y0, seed)
  const c = hash(x0, y1, seed)
  const d = hash(x1, y1, seed)
  return a + (b - a) * su + (c - a) * sv + (a - b - c + d) * su * sv
}

let tile: Float32Array | undefined

export function paperTile(): Float32Array {
  if (tile) return tile
  tile = new Float32Array(PAPER_TILE * PAPER_TILE)
  for (let y = 0; y < PAPER_TILE; y++) {
    for (let x = 0; x < PAPER_TILE; x++) {
      const u = x / PAPER_TILE
      const v = y / PAPER_TILE
      const blot = noise(u, v, 4, 11) * 0.6 + noise(u, v, 9, 23) * 0.4 - 0.5
      const tooth = noise(u, v, 110, 37) * 0.6 + noise(u, v, 230, 41) * 0.4 - 0.5
      tile[y * PAPER_TILE + x] = blot * 0.072 + tooth * 0.022
    }
  }
  return tile
}

export function paperBytes(): Uint8Array {
  const t = paperTile()
  const out = new Uint8Array(t.length * 4)
  for (let i = 0; i < t.length; i++) {
    const v = Math.round((0.5 + t[i] / RANGE) * 255)
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v
    out[i * 4 + 3] = 255
  }
  return out
}

export const PAPER_RANGE = RANGE
