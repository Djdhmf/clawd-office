// Where everything in the office is, for the room the panel gives it: the
// full building when the panel is large, fewer floors when it is medium, one
// strip when small. Positions are in pixels; one terminal cell is 1 x 2.

export const TOP = 5
export const FLOOR_H = 17
const MAX_FLOOR_H = 26
const MAX_TOP = 12
const STREET_H = 6
const SHAFT = 22

export type Size = 'large' | 'medium' | 'small'
export type RoomName = 'Main office' | 'Agent workshop' | 'Team room' | 'Sessions' | 'Library' | 'Break room' | 'Kitchen'
export type StationName =
  | 'chute' | 'telescope' | 'inbox' | 'board' | 'desk' | 'console' | 'phone' | 'shelf' | 'catalog' | 'tube'
  | 'kanban' | 'couch' | 'tv' | 'pingpong' | 'coffee' | 'cooler' | 'fridge' | 'books'

export type Room = {
  name: RoomName
  floor: number
  x0: number
  x1: number
  /** Where a crab stands to use each thing in the room. */
  stations: Partial<Record<StationName, number>>
  /** Seats for real crabs (subagents, sessions), at least 11 px apart. */
  desks: number[]
  /** Standing spots for background crabs, at least 11 px apart. */
  spots: number[]
}
export type Floor = { index: number; top: number; standY: number; rooms: Room[] }
export type Layout = {
  size: Size
  width: number
  height: number
  /** Each floor's height in pixels: 17, taller where the panel has room. */
  floorH: number
  floors: Floor[]
  /** The elevator shaft's width; 0 where there is one floor. */
  shaftW: number
  /** Where crabs queue for the elevator. */
  waitX: number
  tube?: { x: number; floors: [number, number] }
  street: { y: number; doorX: number }
}

// Each floor's rooms and where each ends, as a fraction of the floor past the shaft.
const PLANS: Record<Size, [RoomName, number][][]> = {
  large: [
    [['Main office', 1]],
    [['Agent workshop', 0.73], ['Team room', 1]],
    [['Sessions', 0.6], ['Library', 1]],
    [['Break room', 0.655], ['Kitchen', 1]],
  ],
  medium: [[['Main office', 1]], [['Agent workshop', 0.6], ['Sessions', 1]], [['Break room', 1]]],
  small: [[['Main office', 0.5], ['Agent workshop', 1]]],
}

// The main office's stations, left to right, as fractions of its inside.
const MAIN: [StationName, number][] = [
  ['chute', 0], ['telescope', 0.0875], ['inbox', 0.175], ['board', 0.275], ['desk', 0.4125],
  ['console', 0.575], ['phone', 0.6875], ['shelf', 0.8], ['catalog', 0.9125], ['tube', 0.9625],
]

export function chooseLayout(columns: number, rows: number): Layout {
  const width = columns
  const height = rows * 2
  const fits = (floors: number) => height >= TOP + floors * FLOOR_H + STREET_H
  const size: Size = columns >= 100 && fits(4) ? 'large' : columns >= 70 && fits(3) ? 'medium' : 'small'
  const shaftW = size === 'small' ? 0 : SHAFT
  const span = width - shaftW
  // A tall panel gets taller floors, then a little more sky; the street keeps the rest.
  const count = PLANS[size].length
  const minTop = size === 'small' ? 3 : TOP
  const floorH = Math.max(FLOOR_H, Math.min(MAX_FLOOR_H, Math.floor((height - minTop - STREET_H) / count)))
  const top = Math.max(minTop, Math.min(MAX_TOP, height - STREET_H - count * floorH))

  const floors = PLANS[size].map((plan, index): Floor => {
    const floorTop = top + index * floorH
    let x0 = shaftW
    const rooms = plan.map(([name, end]): Room => {
      const x1 = Math.round(shaftW + end * span)
      const room = furnish(name, index, x0, x1, plan.map(([n]) => n))
      x0 = x1

      return room
    })

    return { index, top: floorTop, standY: floorTop + floorH - 1, rooms }
  })
  const lastStand = floors[floors.length - 1]?.standY ?? top + floorH - 1

  return {
    size,
    width,
    height,
    floorH,
    floors,
    shaftW,
    waitX: shaftW + 5,
    ...(size === 'large' ? { tube: { x: width - 4, floors: [0, 2] as [number, number] } } : {}),
    street: { y: lastStand + 1, doorX: width - 4 },
  }
}

// A room's stations, desks and spots, from its kind and its neighbours.
function furnish(name: RoomName, floor: number, x0: number, x1: number, onFloor: RoomName[]): Room {
  const lo = x0 + 4
  const hi = x1 - 5
  const at = (f: number) => Math.round(lo + f * (hi - lo))
  const every = (from: number, step: number) => {
    const out: number[] = []
    for (let x = from; x <= hi; x += step) out.push(x)

    return out
  }
  const stations: Room['stations'] = {}
  let desks: number[] = []

  if (name === 'Main office') for (const [s, f] of MAIN) stations[s] = at(f)
  if (name === 'Agent workshop' || name === 'Sessions') desks = every(lo + 6, 18)
  if (name === 'Agent workshop' && !onFloor.includes('Team room')) stations.kanban = at(0.92)
  if (name === 'Team room') { stations.kanban = at(0.5); stations.desk = at(0.3) }
  if (name === 'Library') { stations.books = at(0.4); stations.shelf = at(0.15) }
  if (name === 'Break room') {
    stations.couch = at(0.1)
    stations.tv = at(0.35)
    stations.pingpong = at(0.6)
    if (!onFloor.includes('Kitchen')) { stations.coffee = at(0.8); stations.books = at(0.95) }
  }
  if (name === 'Kitchen') { stations.coffee = at(0.15); stations.cooler = at(0.35); stations.fridge = at(0.85) }

  return { name, floor, x0, x1, stations, desks, spots: every(lo + 2, 12) }
}
