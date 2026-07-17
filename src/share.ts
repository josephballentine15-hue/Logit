import { money, normalizePercent } from './format'
import type { Deduction, Extra, LoadRow, PayType, Sheet } from './types'

export interface SheetTotals {
  gross: number
  totalMiles: number
  totalHours: number
  driverShare: number
  extraTotal: number
  deductionTotal: number
  net: number
}

/** Human-readable summary, good for SMS / WhatsApp / email body. */
export function buildSheetText(
  sheet: Sheet,
  rows: LoadRow[],
  extras: Extra[],
  deductions: Deduction[],
  totals: SheetTotals,
): string {
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0
  const weekTotals = computeWeekTotals(sheet, rows)
  const lines: string[] = []
  lines.push(sheet.title + (sheet.driver ? ` — Driver: ${sheet.driver}` : ''))
  lines.push('')

  for (const r of rows) {
    if (r.kind === 'divider') {
      lines.push('')
      lines.push(`=== ${r.date || 'Week'} — ${money(weekTotals.get(r.id) ?? 0)} ===`)
      continue
    }
    const parts: string[] = []
    if (r.date) parts.push(r.date)
    if (r.container) parts.push(r.container)
    if (r.chassis) parts.push(`ch ${r.chassis}`)
    if (r.from || r.to) parts.push(`${r.from || '?'} > ${r.to || '?'}`)
    if (r.miles != null) parts.push(`${r.miles.toLocaleString()} mi`)
    if (r.hours != null) parts.push(`${r.hours.toLocaleString()} hr`)
    if (r.rate != null) parts.push(money(r.rate))
    else if (payType === 'percent') parts.push('—')
    if (r.notes) parts.push(`(${r.notes})`)
    lines.push(parts.join('  '))
  }

  lines.push('')
  if (payType === 'mile') {
    lines.push(
      `Miles: ${totals.totalMiles.toLocaleString()} × ${money(payRate)}/mi = ${money(totals.totalMiles * payRate)}`,
    )
    if (totals.gross !== 0) lines.push(`Loads total: ${money(totals.gross)}`)
  } else if (payType === 'hour') {
    lines.push(
      `Hours: ${totals.totalHours.toLocaleString()} × ${money(payRate)}/hr = ${money(totals.totalHours * payRate)}`,
    )
    if (totals.gross !== 0) lines.push(`Loads total: ${money(totals.gross)}`)
  } else {
    lines.push(`Loads total: ${money(totals.gross)}`)
    if (normalizePercent(sheet.percent) !== 100) {
      lines.push(`Driver ${normalizePercent(sheet.percent)}%: ${money(totals.driverShare)}`)
    }
  }
  for (const x of extras) {
    lines.push(`Extra${x.label ? ` (${x.label})` : ''}: +${money(x.amount)}`)
  }
  for (const d of deductions) {
    lines.push(`Deduction${d.label ? ` (${d.label})` : ''}: -${money(d.amount)}`)
  }
  lines.push(`PAY: ${money(totals.net)}`)
  return lines.join('\n')
}

export function buildCsv(
  sheet: Sheet,
  rows: LoadRow[],
  extras: Extra[],
  deductions: Deduction[],
  totals: SheetTotals,
): string {
  const esc = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0
  const hidden = sheet.hiddenCols ?? []

  // Mirror the visible table: label columns, then Miles/Hours, then Rate, Notes
  const showMiles = payType === 'mile' || !!sheet.showMiles
  const showHours = payType === 'hour'
  const labelCols: { header: string; get: (r: LoadRow) => string }[] = [
    { header: 'Date', get: (r) => r.date },
    ...(!hidden.includes('container')
      ? [{ header: 'Container/Trailer', get: (r: LoadRow) => r.container }]
      : []),
    ...(!hidden.includes('chassis') ? [{ header: 'Chassis', get: (r: LoadRow) => r.chassis }] : []),
    ...(!hidden.includes('from') ? [{ header: 'From', get: (r: LoadRow) => r.from }] : []),
    ...(!hidden.includes('to') ? [{ header: 'To', get: (r: LoadRow) => r.to }] : []),
    ...(showMiles ? [{ header: 'Miles', get: (r: LoadRow) => (r.miles != null ? String(r.miles) : '') }] : []),
    ...(showHours ? [{ header: 'Hours', get: (r: LoadRow) => (r.hours != null ? String(r.hours) : '') }] : []),
  ]
  const includeNotes = !hidden.includes('notes')
  const header = [
    ...labelCols.map((c) => c.header),
    'Rate',
    ...(includeNotes ? ['Notes'] : []),
  ].join(',')
  // Summary amounts line up under the Rate column
  const pad = ','.repeat(labelCols.length - 1)
  const tail = includeNotes ? ',' : ''

  const weekTotals = computeWeekTotals(sheet, rows)
  const lines = rows.map((r) => {
    if (r.kind === 'divider') {
      return [
        esc(r.date || 'Week'),
        ...Array(labelCols.length - 1).fill(''),
        (weekTotals.get(r.id) ?? 0).toFixed(2),
        ...(includeNotes ? [''] : []),
      ].join(',')
    }
    return [
      ...labelCols.map((c) => esc(c.get(r))),
      r.rate != null ? String(r.rate) : '',
      ...(includeNotes ? [esc(r.notes)] : []),
    ].join(',')
  })

  const summary = ['']
  if (payType === 'mile') {
    summary.push(
      `Miles ${totals.totalMiles.toLocaleString()} x ${payRate.toFixed(2)}/mi,${pad}${(totals.totalMiles * payRate).toFixed(2)}${tail}`,
    )
    if (totals.gross !== 0) summary.push(`Loads total,${pad}${totals.gross.toFixed(2)}${tail}`)
  } else if (payType === 'hour') {
    summary.push(
      `Hours ${totals.totalHours.toLocaleString()} x ${payRate.toFixed(2)}/hr,${pad}${(totals.totalHours * payRate).toFixed(2)}${tail}`,
    )
    if (totals.gross !== 0) summary.push(`Loads total,${pad}${totals.gross.toFixed(2)}${tail}`)
  } else {
    summary.push(`Loads total,${pad}${totals.gross.toFixed(2)}${tail}`)
    if (normalizePercent(sheet.percent) !== 100) {
      summary.push(
        `Driver ${normalizePercent(sheet.percent)}%,${pad}${totals.driverShare.toFixed(2)}${tail}`,
      )
    }
  }
  summary.push(
    ...extras.map((x) => `Extra: ${esc(x.label)},${pad}${x.amount.toFixed(2)}${tail}`),
    ...deductions.map((d) => `Deduction: ${esc(d.label)},${pad}-${d.amount.toFixed(2)}${tail}`),
    `Pay,${pad}${totals.net.toFixed(2)}${tail}`,
  )
  return [header, ...lines, ...summary].join('\n')
}

function computeWeekTotals(sheet: Sheet, rows: LoadRow[]): Map<string, number> {
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0
  const totals = new Map<string, number>()
  let current: string | null = null
  for (const r of rows) {
    if (r.kind === 'divider') {
      current = r.id
      totals.set(r.id, 0)
    } else if (current) {
      const basis =
        payType === 'mile'
          ? (r.miles ?? 0) * payRate + (r.rate ?? 0)
          : payType === 'hour'
            ? (r.hours ?? 0) * payRate + (r.rate ?? 0)
            : (r.rate ?? 0)
      totals.set(current, (totals.get(current) ?? 0) + basis)
    }
  }
  return totals
}

export function csvFileName(sheet: Sheet): string {
  return `${(sheet.title.replace(/[^\w\- ]/g, '').trim() || 'logit-sheet')}.csv`
}

/** Open the native share sheet with plain text. Returns false if unsupported. */
export async function shareViaSystem(title: string, text: string): Promise<boolean> {
  if (!navigator.share) return false
  try {
    await navigator.share({ title, text })
    return true
  } catch (err) {
    // User closing the share sheet is not a failure
    return (err as DOMException)?.name === 'AbortError'
  }
}

/** Share the CSV as a real file attachment. Returns false if unsupported. */
export async function shareCsvFile(sheet: Sheet, csv: string): Promise<boolean> {
  const file = new File([csv], csvFileName(sheet), { type: 'text/csv' })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ title: sheet.title, files: [file] })
    return true
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError'
  }
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function downloadCsv(sheet: Sheet, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = csvFileName(sheet)
  a.click()
  URL.revokeObjectURL(a.href)
}

/** mailto: fallback so "send by email" always works, even without Web Share. */
export function mailtoLink(sheet: Sheet, text: string): string {
  return `mailto:?subject=${encodeURIComponent(sheet.title)}&body=${encodeURIComponent(text)}`
}
