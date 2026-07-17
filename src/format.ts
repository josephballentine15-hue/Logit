export function money(value: number): string {
  const sign = value < 0 ? '-' : ''
  return `${sign}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

/** 0, empty, or out-of-range percent means "driver keeps everything". */
export function normalizePercent(p: number): number {
  return Number.isFinite(p) && p > 0 && p <= 100 ? p : 100
}

export function parseMoneyInput(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, '')
  if (cleaned === '' || cleaned === '-') return null
  const value = parseFloat(cleaned)
  return Number.isFinite(value) ? value : null
}
