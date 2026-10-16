// The office's crabs and their accessories, painted pixel by pixel onto a
// canvas: Claude Code's classic 8-bit crab (9 x 6, small eyes, arms out,
// four legs, no blush or mouth) with hats and props that say who it is or
// what it is doing. Ported from docs/mockup/crab-town-v5.html.

/** Rows of pixels, `undefined` clear. */
export type Pixels = (string | undefined)[][]

export const CRAB = { body: '#D97757', shade: '#B9583B', eye: '#1A1412', w: 9, h: 6 } as const

export function blank(width: number, height: number): Pixels {
  return Array.from({ length: height }, () => Array<string | undefined>(width).fill(undefined))
}

/** Paints a box onto the canvas, clipped; fractional sizes paint at least a pixel. */
export function paint(canvas: Pixels, x: number, y: number, w: number, h: number, c: string | undefined): void {
  const x0 = Math.round(x)
  const y0 = Math.round(y)
  const x1 = x0 + Math.max(1, Math.round(w))
  const y1 = y0 + Math.max(1, Math.round(h))
  for (let j = Math.max(0, y0); j < y1; j++) {
    const row = canvas[j]
    if (!row) break
    for (let i = Math.max(0, x0); i < Math.min(x1, row.length); i++) row[i] = c
  }
}

/** Copies `sprite` onto `canvas` at (x, y), its clear pixels left alone. */
export function stamp(canvas: Pixels, sprite: Pixels, x: number, y: number): void {
  sprite.forEach((row, j) =>
    row.forEach((c, i) => {
      const target = canvas[y + j]
      if (c !== undefined && target && x + i >= 0 && x + i < target.length) target[x + i] = c
    }),
  )
}

const BODY = ['.OOOOOOO.', '.OEOOOEO.', 'OOOOOOOOO', '.OOOOOOS.']
const LEGS = [
  ['.O.O.O.O.', '.O.O.O.O.'],
  ['.O.O.O.O.', '..O.O.O.O'],
  ['.O.O.O.O.', '.O.O.O.O.'],
  ['.O.O.O.O.', 'O.O.O.O..'],
]

export type Accessory =
  | 'crown' | 'miner' | 'plan' | 'hard' | 'detective' | 'wizard' | 'teamcap' | 'librarian' | 'headphones' | 'scarf'
  | 'beanie' | 'party' | 'bandage' | 'shoes' | 'mug' | 'book' | 'rulebook' | 'dictionary' | 'report' | 'letter'
  | 'capsule' | 'newspaper' | 'notebook' | 'clipboard' | 'magnifier' | 'binoculars' | 'toolbox' | 'wrench' | 'hammer'
  | 'megaphone' | 'alarmclock' | 'phone' | 'spellbook' | 'blueprint' | 'map' | 'sign' | 'stop' | 'bell' | 'stampOk'
  | 'stampNo' | 'broom' | 'parcel' | 'box' | 'juggle' | 'wave' | 'think' | 'eyes'

type Draw = (x: number, y: number, t: number, d: 1 | -1, crown: string) => void

// Each accessory drawn relative to the body's top-left.
function accessories(canvas: Pixels): Record<Accessory, Draw> {
  const rect = (x: number, y: number, w: number, h: number, c: string) => paint(canvas, x, y, w, h, c)
  const px = (x: number, y: number, c: string) => paint(canvas, x, y, 1, 1, c)
  const hand = (x: number, d: number) => (d > 0 ? x + 9 : x - 2)
  const held = (fill: (bx: number, y: number, t: number, d: 1 | -1) => void): Draw => (x, y, t, d) => fill(hand(x, d), y, t, d)
  const OR = CRAB.body

  return {
    crown: (x, y, _t, _d, crown) => { rect(x + 2, y - 2, 5, 2, crown); px(x + 2, y - 3, crown); px(x + 4, y - 3, crown); px(x + 6, y - 3, crown); px(x + 4, y - 1, '#D9534F') },
    miner: (x, y, _t, d) => { rect(x + 1, y - 2, 7, 2, '#7A4A2A'); rect(x, y - 1, 9, 1, '#5C3720'); rect(d > 0 ? x + 6 : x + 1, y - 2, 2, 1, '#FFF3B0') },
    plan: (x, y, t) => { rect(x + 1, y - 2, 7, 2, '#2E9E6A'); rect(x + 3, y - 2, 3, 1, '#F2F2F2'); rect(x + 9, y - 6, 1, 7, '#AAAAAA'); rect(x + 10, y - 6 + (Math.floor(t / 5) % 2), 3, 2, '#FFFFFF') },
    hard: (x, y) => { rect(x + 1, y - 2, 7, 2, '#E8B83A'); rect(x, y - 1, 9, 1, '#C9971F'); px(x + 4, y - 2, '#F6D77A') },
    detective: (x, y) => { rect(x + 1, y - 2, 7, 2, '#6B5440'); rect(x, y - 1, 9, 1, '#4B3A2C'); rect(x + 2, y - 2, 5, 1, '#3A2C20') },
    wizard: (x, y) => { rect(x + 2, y - 2, 5, 2, '#5B3FA0'); rect(x + 3, y - 4, 3, 2, '#5B3FA0'); px(x + 4, y - 5, '#5B3FA0'); px(x + 3, y - 2, '#E8C15A') },
    teamcap: (x, y) => { rect(x + 1, y - 2, 7, 2, '#D9534F'); rect(x + 6, y - 1, 3, 1, '#B03A36') },
    librarian: (x, y) => { rect(x + 2, y - 2, 5, 2, '#6B3A5A'); px(x + 4, y - 3, '#6B3A5A'); rect(x + 1, y + 1, 3, 1, '#2A211D'); rect(x + 5, y + 1, 3, 1, '#2A211D') },
    headphones: (x, y) => { rect(x + 1, y - 1, 7, 1, '#2A2A2A'); rect(x, y, 1, 2, '#D97757'); rect(x + 8, y, 1, 2, '#D97757') },
    scarf: (x, y) => { rect(x + 1, y + 2, 7, 1, '#3E6AA8'); rect(x + 6, y + 3, 1, 2, '#3E6AA8') },
    beanie: (x, y) => { rect(x + 1, y - 2, 7, 2, '#2E9E6A'); px(x + 4, y - 3, '#E8C15A') },
    party: (x, y) => { rect(x + 3, y - 2, 3, 2, '#E85A9A'); px(x + 4, y - 3, '#E85A9A'); px(x + 4, y - 4, '#E8C15A') },
    bandage: (x, y) => { rect(x + 1, y - 1, 7, 1, '#F5F5F5'); px(x + 6, y - 1, '#D9534F') },
    shoes: (x, y) => { rect(x, y + 5, 3, 1, '#E8C15A'); rect(x + 6, y + 5, 3, 1, '#E8C15A') },
    mug: held((bx, y, t) => { rect(bx, y + 1, 2, 2, '#F5F5F5'); if (Math.floor(t / 5) % 2) px(bx, y - 1, '#888888') }),
    book: held((bx, y) => { rect(bx, y, 2, 3, '#3E6AA8'); px(bx, y + 1, '#E8C15A') }),
    rulebook: held((bx, y) => { rect(bx, y, 2, 3, '#B03A36'); px(bx, y + 1, '#F5EEDC') }),
    dictionary: held((bx, y) => { rect(bx, y, 3, 3, '#777777'); px(bx + 1, y + 1, '#E8C15A') }),
    report: held((bx, y) => { rect(bx, y, 2, 3, '#F5EEDC'); px(bx, y + 1, '#888888') }),
    letter: held((bx, y) => { rect(bx, y, 3, 2, '#F5EEDC'); px(bx + 1, y, '#D97757') }),
    capsule: held((bx, y) => { rect(bx, y, 2, 3, '#E8C15A'); px(bx, y + 1, '#B08D57') }),
    newspaper: held((bx, y) => { rect(bx, y, 3, 2, '#DDDDDD'); rect(bx, y, 3, 1, '#555555') }),
    notebook: held((bx, y, t) => { rect(bx, y, 2, 3, '#2E9E6A'); px(bx + (t % 2), y + 1, '#F5EEDC') }),
    clipboard: held((bx, y) => { rect(bx, y, 2, 3, '#B08D57'); rect(bx, y + 1, 2, 1, '#F5EEDC') }),
    magnifier: held((bx, y, _t, d) => { rect(bx, y - 1, 2, 2, '#9FD3E8'); px(bx + (d > 0 ? -1 : 2), y + 1, '#6B5440') }),
    binoculars: held((bx, y) => { rect(bx, y, 1, 2, '#333333'); rect(bx + 1, y, 1, 2, '#333333') }),
    toolbox: held((bx, y) => { rect(bx - 1, y + 1, 4, 2, '#D9534F'); rect(bx, y, 2, 1, '#888888') }),
    wrench: held((bx, y) => { rect(bx, y, 1, 3, '#AAAAAA'); px(bx + 1, y, '#AAAAAA') }),
    hammer: held((bx, y, t) => { rect(bx, y, 1, 3, '#8A6A4A'); rect(bx - 1, y - (t % 4 < 2 ? 1 : 0), 3, 1, '#777777') }),
    megaphone: held((bx, y) => { rect(bx, y, 2, 2, '#E8C15A'); rect(bx + 2, y - 1, 1, 4, '#E8C15A') }),
    alarmclock: held((bx, y, t) => { rect(bx, y, 3, 3, '#D9534F'); px(bx + 1, y + 1, '#FFFFFF'); if (t % 4 < 2) { px(bx - 1, y - 1, '#FFFFFF'); px(bx + 3, y - 1, '#FFFFFF') } }),
    phone: (x, y, _t, d) => { rect(d > 0 ? x + 8 : x, y, 1, 3, '#D9534F') },
    spellbook: held((bx, y, t) => { rect(bx, y, 3, 2, '#5B3FA0'); if (t % 3) px(bx + 1, y - 1 - (t % 2), '#E8C15A'); if (t % 4 < 2) px(bx + 2, y - 2, '#C9B6F2') }),
    blueprint: (x, y) => { rect(x - 1, y + 1, 11, 3, '#3E6AA8'); rect(x, y + 2, 4, 1, '#9FD3E8'); rect(x + 5, y + 2, 3, 1, '#9FD3E8') },
    map: (x, y) => { rect(x - 1, y + 1, 11, 3, '#E8D7A0'); rect(x + 1, y + 2, 3, 1, '#2E9E6A'); px(x + 7, y + 2, '#D9534F') },
    sign: (x, y) => { rect(x + 3, y - 7, 1, 5, '#8A6A4A'); rect(x + 1, y - 9, 5, 3, '#F5EEDC'); px(x + 3, y - 8, '#D97757') },
    stop: (x, y) => { rect(x + 3, y - 6, 1, 5, '#8A6A4A'); rect(x + 1, y - 10, 5, 4, '#D9534F'); rect(x + 2, y - 9, 3, 1, '#FFFFFF') },
    bell: (x, y, t) => { rect(x + 9, y - 3, 1, 3, OR); rect(x + 9, y - 5, 2, 2, '#E8C15A'); if (t % 4 < 2) { px(x + 12, y - 6, '#FFFFFF'); px(x + 7, y - 6, '#FFFFFF') } },
    stampOk: (x, y) => { rect(x + 3, y - 6, 3, 3, '#2E9E6A'); px(x + 4, y - 5, '#FFFFFF') },
    stampNo: (x, y) => { rect(x + 3, y - 6, 3, 3, '#D9534F'); px(x + 3, y - 6, '#FFFFFF'); px(x + 5, y - 4, '#FFFFFF') },
    broom: (x, y, t, d) => { const bx = d > 0 ? x + 9 : x - 1; rect(bx, y - 2, 1, 6, '#8A6A4A'); rect(bx - 1 + (t % 2), y + 4, 3, 1, '#E8C15A') },
    parcel: held((bx, y) => { rect(bx, y, 3, 3, '#B08D57'); rect(bx, y + 1, 3, 1, '#8A6A3A') }),
    box: held((bx, y) => { rect(bx - 1, y - 1, 4, 4, '#B08D57') }),
    juggle: (x, y, t) => { for (let i = 0; i < 3; i++) { const a = t / 3 + i * 2.1; px(x + 4 + Math.cos(a) * 3, y - 3 + Math.sin(a) * 2, ['#D9534F', '#7FD1A8', '#E8C15A'][i] ?? '#FFFFFF') } },
    wave: (x, y, t, d) => { if (Math.floor(t / 4) % 2) rect(d > 0 ? x + 9 : x - 1, y - 2, 1, 3, OR) },
    think: (x, y, t) => { px(x + 8, y - 2, '#DDDDDD'); rect(x + 9, y - 5, 4, 2, '#DDDDDD'); px(x + 10 + (Math.floor(t / 4) % 2), y - 4, '#555555') },
    eyes: (x, y, t) => { px(x + 2 + (Math.floor(t / 6) % 2), y + 1, '#FFFFFF') },
  }
}

/** Every accessory's name. */
export const ACCESSORIES = Object.keys(accessories(blank(1, 1))) as Accessory[]

export type CrabPose = {
  /** The 4-step leg cycle; 0 standing. */
  legsPhase: 0 | 1 | 2 | 3
  blink: boolean
  dir: 1 | -1
  acc: readonly Accessory[]
  /** The animation clock, in ticks. */
  t: number
  /** Pixels up (negative) for a hop. */
  hop?: number
  /** The crown's colour, by model. */
  crown?: string
}

/** Paints a crab with its body's top-left at (x, y), then its accessories. */
export function drawCrab(canvas: Pixels, x: number, y: number, pose: CrabPose): void {
  const top = y + (pose.hop ?? 0)
  const rows = [...BODY, ...(LEGS[pose.legsPhase] ?? [])]
  rows.forEach((row, j) => [...row].forEach((ch, i) => {
    const ix = pose.dir < 0 ? CRAB.w - 1 - i : i
    const c = ch === 'O' ? CRAB.body : ch === 'S' ? CRAB.shade : ch === 'E' ? (pose.blink ? CRAB.body : CRAB.eye) : undefined
    if (c) paint(canvas, x + ix, top + j, 1, 1, c)
  }))
  if (pose.blink) {
    paint(canvas, x + 1, top + 2, 1, 1, CRAB.eye)
    paint(canvas, x + 7, top + 2, 1, 1, CRAB.eye)
  }
  const draw = accessories(canvas)
  for (const a of pose.acc) draw[a](x, top, pose.t, pose.dir, pose.crown ?? '#E8C15A')
}
