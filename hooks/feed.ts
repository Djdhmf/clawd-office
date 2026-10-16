// The events the office has yet to act out, numbered in order and bounded:
// while the office is closed only the last 100 are kept, so nothing grows.
import type { OfficeEvent } from './events'

export const FEED_MAX = 100

export type Feed = {
  push: (ev: Omit<OfficeEvent, 'seq'>) => OfficeEvent
  /** The kept events numbered above `seq`, oldest first. */
  since: (seq: number) => OfficeEvent[]
  /** The newest event's number; 0 before any. */
  last: () => number
}

export function createFeed(max = FEED_MAX): Feed {
  let seq = 0
  let kept: OfficeEvent[] = []

  return {
    push: ev => {
      const numbered = { ...ev, seq: ++seq }
      kept.push(numbered)
      if (kept.length > max) kept = kept.slice(-max)

      return numbered
    },
    since: from => kept.filter(ev => ev.seq > from),
    last: () => seq,
  }
}
