// Pixels to terminal cells: two pixel rows to a text row with half blocks,
// text laid over cells, and neighbouring cells drawn alike merged into runs.
import type { Pixels } from './sprites'

/** One terminal cell: a glyph, its colour and the colour behind it. */
export type Cell = { ch: string; fg?: string; bg?: string; bold?: boolean }

/** `▀` paints the top pixel over the bottom one; `▄` the bottom alone. */
export function halfBlocks(px: Pixels): Cell[][] {
  const width = Math.max(0, ...px.map(row => row.length))
  const rows: Cell[][] = []
  for (let y = 0; y < px.length; y += 2) {
    const cells: Cell[] = []
    for (let x = 0; x < width; x++) {
      const top = px[y]?.[x]
      const bottom = px[y + 1]?.[x]
      if (top === undefined && bottom === undefined) cells.push({ ch: ' ' })
      else if (top === undefined) cells.push({ ch: '▄', fg: bottom })
      else if (bottom === undefined) cells.push({ ch: '▀', fg: top })
      else if (top === bottom) cells.push({ ch: '█', fg: top })
      else cells.push({ ch: '▀', fg: top, bg: bottom })
    }
    rows.push(cells)
  }

  return rows
}

/** Lays `text` over row `row` from column `col`, clipped to the row; `bg` paints behind it. */
export function writeText(cells: Cell[][], row: number, col: number, text: string, fg: string, bold = false, bg?: string): void {
  const line = cells[row]
  if (!line) return
  ;[...text].forEach((ch, i) => {
    const at = col + i
    if (at < 0 || at >= line.length) return
    const cell: Cell = { ch, fg }
    if (bold) cell.bold = true
    if (bg) cell.bg = bg
    line[at] = cell
  })
}

/** Adjacent cells drawn alike, merged into one run each. */
export function runs(row: Cell[]): Cell[] {
  const out: Cell[] = []
  for (const cell of row) {
    const last = out[out.length - 1]
    if (last && last.fg === cell.fg && last.bg === cell.bg && !!last.bold === !!cell.bold) last.ch += cell.ch
    else out.push({ ...cell })
  }

  return out
}
