// A small seeded random source (mulberry32), so a town replays the same way
// from the same seed: what makes the simulation testable.

export type Rng = { next: () => number; range: (lo: number, hi: number) => number; pick: <T>(list: readonly T[]) => T }

export function createRng(seed: number): Rng {
  let s = seed >>> 0
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  return {
    next,
    range: (lo, hi) => lo + next() * (hi - lo),
    pick: list => list[Math.floor(next() * list.length)] as (typeof list)[number],
  }
}
