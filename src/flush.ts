/** Registered by CellInput so a Save button / page leave can force-write dirty cells. */
const flushers = new Set<() => void>()

export function registerFlusher(fn: () => void): () => void {
  flushers.add(fn)
  return () => {
    flushers.delete(fn)
  }
}

export function flushAllInputs(): void {
  const active = document.activeElement as HTMLElement | null
  active?.blur?.()
  for (const fn of flushers) fn()
}
