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

const RULE = '────────────────────────'

function rowHasContent(r: LoadRow): boolean {
  return !!(
    r.date ||
    r.container ||
    r.chassis ||
    r.from ||
    r.to ||
    r.notes ||
    r.rate != null ||
    r.miles != null ||
    r.hours != null
  )
}

function formatLoadBlock(r: LoadRow, index: number, payType: PayType): string {
  const lines: string[] = [`${index}.  ${r.date || 'No date'}`]
  if (r.container) lines.push(`    Container:  ${r.container}`)
  if (r.chassis) lines.push(`    Chassis:    ${r.chassis}`)
  if (r.from || r.to) lines.push(`    Route:      ${r.from || '—'} → ${r.to || '—'}`)
  if (r.miles != null) lines.push(`    Miles:      ${r.miles.toLocaleString()}`)
  if (r.hours != null) lines.push(`    Hours:      ${r.hours.toLocaleString()}`)
  if (r.rate != null) lines.push(`    Rate:       ${money(r.rate)}`)
  else if (payType === 'percent') lines.push(`    Rate:       —`)
  if (r.notes) lines.push(`    Notes:      ${r.notes}`)
  return lines.join('\n')
}

/** Human-readable summary for SMS / WhatsApp / email / print. */
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

  lines.push(sheet.title || 'Logit sheet')
  if (sheet.driver) lines.push(`Driver: ${sheet.driver}`)
  lines.push('')
  lines.push(RULE)
  lines.push('LOADS')
  lines.push(RULE)
  lines.push('')

  let loadNum = 0
  let wroteAnyLoad = false
  for (const r of rows) {
    if (r.kind === 'divider') {
      lines.push('')
      lines.push(`▸ ${r.date || 'Week'}  ·  ${money(weekTotals.get(r.id) ?? 0)}`)
      lines.push('')
      continue
    }
    if (!rowHasContent(r)) continue
    loadNum += 1
    wroteAnyLoad = true
    lines.push(formatLoadBlock(r, loadNum, payType))
    lines.push('')
  }

  if (!wroteAnyLoad) {
    lines.push('(No loads yet)')
    lines.push('')
  }

  lines.push(RULE)
  lines.push('SUMMARY')
  lines.push(RULE)

  if (payType === 'mile') {
    lines.push(
      `Miles:          ${totals.totalMiles.toLocaleString()} × ${money(payRate)}/mi = ${money(totals.totalMiles * payRate)}`,
    )
    if (totals.gross !== 0) lines.push(`Loads total:    ${money(totals.gross)}`)
  } else if (payType === 'hour') {
    lines.push(
      `Hours:          ${totals.totalHours.toLocaleString()} × ${money(payRate)}/hr = ${money(totals.totalHours * payRate)}`,
    )
    if (totals.gross !== 0) lines.push(`Loads total:    ${money(totals.gross)}`)
  } else {
    lines.push(`Loads total:    ${money(totals.gross)}`)
    if (normalizePercent(sheet.percent) !== 100) {
      lines.push(
        `Driver cut:     ${normalizePercent(sheet.percent)}% = ${money(totals.driverShare)}`,
      )
    }
  }

  for (const x of extras) {
    if (!x.amount && !x.label) continue
    lines.push(`+ ${x.label || 'Extra'}:   +${money(x.amount)}`)
  }
  for (const d of deductions) {
    if (!d.amount && !d.label) continue
    lines.push(`− ${d.label || 'Deduction'}:   −${money(d.amount)}`)
  }

  lines.push('')
  lines.push(`PAY:            ${money(totals.net)}`)
  lines.push('')
  lines.push('Sent from Logit')

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
    ...(showMiles
      ? [{ header: 'Miles', get: (r: LoadRow) => (r.miles != null ? String(r.miles) : '') }]
      : []),
    ...(showHours
      ? [{ header: 'Hours', get: (r: LoadRow) => (r.hours != null ? String(r.hours) : '') }]
      : []),
  ]
  const includeNotes = !hidden.includes('notes')
  const header = [
    ...labelCols.map((c) => c.header),
    'Rate',
    ...(includeNotes ? ['Notes'] : []),
  ].join(',')
  const pad = ','.repeat(Math.max(labelCols.length - 1, 0))
  const tail = includeNotes ? ',' : ''

  const weekTotals = computeWeekTotals(sheet, rows)
  const lines = rows.map((r) => {
    if (r.kind === 'divider') {
      return [
        esc(r.date || 'Week'),
        ...Array(Math.max(labelCols.length - 1, 0)).fill(''),
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

export async function shareViaSystem(title: string, text: string): Promise<boolean> {
  if (!navigator.share) return false
  try {
    await navigator.share({ title, text })
    return true
  } catch (err) {
    return (err as DOMException)?.name === 'AbortError'
  }
}

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

export function mailtoLink(sheet: Sheet, text: string): string {
  return `mailto:?subject=${encodeURIComponent(sheet.title)}&body=${encodeURIComponent(text)}`
}
