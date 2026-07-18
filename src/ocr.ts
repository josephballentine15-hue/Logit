import { createWorker } from 'tesseract.js'
import type { ParsedRow } from './types'

/** Characters found on dispatch sheets; restricting OCR to these improves accuracy a lot. */
const WHITELIST = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789$.,/-:%()# '

export async function ocrImage(
  image: Blob,
  onProgress?: (progress: number) => void,
): Promise<string> {
  const prepared = await preprocess(image).catch(() => image)
  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') onProgress?.(m.progress)
    },
  })
  try {
    await worker.setParameters({
      tessedit_char_whitelist: WHITELIST,
      preserve_interword_spaces: '1',
    })
    // rotateAuto fixes sideways photos; fall back to a plain pass if OSD fails
    try {
      const { data } = await worker.recognize(prepared, { rotateAuto: true })
      return data.text
    } catch {
      const { data } = await worker.recognize(prepared)
      return data.text
    }
  } finally {
    await worker.terminate()
  }
}

/** Upscale small photos and boost contrast in grayscale — Tesseract reads it far better. */
async function preprocess(image: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(image)
  const maxSide = Math.max(bitmap.width, bitmap.height)
  const scale = maxSide < 2600 ? Math.min(3, 2600 / maxSide) : 1

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')!
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
  const px = imageData.data

  // Grayscale + linear contrast stretch between the 5th and 95th percentile
  const grays = new Uint8Array(px.length / 4)
  for (let i = 0; i < grays.length; i++) {
    const o = i * 4
    grays[i] = (px[o] * 0.299 + px[o + 1] * 0.587 + px[o + 2] * 0.114) | 0
  }
  const hist = new Uint32Array(256)
  for (let i = 0; i < grays.length; i++) hist[grays[i]]++
  const total = grays.length
  let lo = 0
  let hi = 255
  for (let acc = 0, v = 0; v < 256; v++) {
    acc += hist[v]
    if (acc >= total * 0.05) {
      lo = v
      break
    }
  }
  for (let acc = 0, v = 255; v >= 0; v--) {
    acc += hist[v]
    if (acc >= total * 0.05) {
      hi = v
      break
    }
  }
  const range = Math.max(1, hi - lo)
  for (let i = 0; i < grays.length; i++) {
    const value = Math.max(0, Math.min(255, ((grays[i] - lo) * 255) / range)) | 0
    const o = i * 4
    px[o] = px[o + 1] = px[o + 2] = value
  }
  ctx.putImageData(imageData, 0, 0)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('canvas encode failed'))), 'image/png'),
  )
}

// Equipment IDs: 4 letters + 6 digits (e.g. EMHU650693). OCR often confuses
// digits with letters, so the digit part accepts look-alikes and we fix them.
const ID_RE = /\b([A-Z]{4})\s?([0-9OQDILZSBGT]{5,7})\b/g
const DIGIT_FIX: Record<string, string> = {
  O: '0',
  Q: '0',
  D: '0',
  I: '1',
  L: '1',
  Z: '2',
  S: '5',
  B: '8',
  G: '6',
  T: '7',
}
const DATE_RE = /\b(\d{1,2}\/\d{1,2}(?:\/\d{2,4})?)\b/
// $ is sometimes read as S; allow both. Also accept "$9000" (decimal point
// lost by OCR, really $90.00) and bare decimals like "110.00" even when OCR
// glued letters onto the front. Lookbehinds stop matches from starting inside
// container/chassis numbers.
const MONEY_RE =
  /(-?)\s?(?:(?<![A-Z0-9])[$S]\s?(\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?|\d{4,6})|(?<!\d)(\d{1,3}(?:,\d{3})*\.\d{2}))(?!\d)/g
const FUEL_RE = /(?<![A-Z0-9])[$S]?\s?(\d{1,3})\s*FUEL/

function fixDigits(raw: string): string {
  return raw
    .split('')
    .map((c) => DIGIT_FIX[c] ?? c)
    .join('')
}

// Looser than ID_RE: dispatch emails often split the digits with spaces or
// line breaks ("TSFZ 567 142"), and there's no OCR noise to worry about.
const EMAIL_ID_RE = /\b([A-Z]{4})[ \t-]*((?:\d[ \t\n-]*){6,7})(?!\d)/g
const SEAL_RE = /SEAL\s*#?\s*:?\s*([A-Z0-9-]{2,15})/i
const LOAD_RE = /LOAD\s*:?\s*(\d{3,6})\s*(?:LBS)?/i
const ARRIVAL_DATE_RE = /ARRIVAL\s*:?[\s\S]{0,40}?(\d{1,2}\/\d{1,2}\/\d{2,4})/i
// "RATE: 220", "PAY $220", "$220" — dispatch texts often include the money
const TEXT_RATE_RE =
  /(?:RATE|PAY(?:S|ING)?|PAID)\s*:?\s*\$?\s?(\d{1,4}(?:\.\d{1,2})?)|\$\s?(\d{1,4}(?:,\d{3})*(?:\.\d{1,2})?)/i

/**
 * Parse a dispatch email or text message (J1 interchange receipts, dispatch
 * SMS, etc.) that the user pasted. One message describes one load; issuers
 * vary, so this only relies on generic patterns: equipment IDs, dates, seal,
 * and a rate if the message includes money.
 */
export function parseEmailText(text: string): ParsedRow | null {
  const upper = text.toUpperCase()

  const ids: string[] = []
  for (const m of upper.matchAll(EMAIL_ID_RE)) {
    const id = m[1] + m[2].replace(/[^0-9]/g, '')
    if (!ids.includes(id)) ids.push(id)
  }
  if (ids.length === 0) return null

  const date = upper.match(ARRIVAL_DATE_RE)?.[1] ?? upper.match(DATE_RE)?.[1] ?? ''

  const rateMatch = text.match(TEXT_RATE_RE)
  const rate = rateMatch ? parseFloat((rateMatch[1] ?? rateMatch[2]).replace(/,/g, '')) : null

  const noteParts: string[] = []
  const seal = text.match(SEAL_RE)
  if (seal) noteParts.push(`Seal ${seal[1]}`)
  const load = text.match(LOAD_RE)
  if (load) noteParts.push(`${load[1]} lbs`)

  return {
    date,
    container: ids[0],
    chassis: ids[1] ?? '',
    from: '',
    to: '',
    rate: Number.isFinite(rate as number) ? rate : null,
    notes: noteParts.join(', '),
    include: true,
  }
}

export interface SpokenAdjustment {
  kind: 'extra' | 'deduction'
  label: string
  amount: number
}

const DEDUCTION_HINTS = [
  'GAS', 'FUEL', 'DIESEL', 'ADVANCE', 'INSURANCE', 'PARKING', 'TOLL', 'TOLLS',
  'REPAIR', 'REPAIRS', 'ESCROW', 'CASH', 'TICKET', 'FINE',
]

/**
 * Parse a spoken extra-pay/deduction like "gas 50", "detention 75",
 * "deduct advance 300" or "bonus 100".
 */
export function parseSpokenAdjustment(raw: string): SpokenAdjustment | null {
  const text = raw.toUpperCase().replace(/[$,]/g, ' ').trim()
  const amountMatch = text.match(/(\d+(?:\.\d{1,2})?)(?!.*\d)/)
  if (!amountMatch) return null
  const amount = parseFloat(amountMatch[1])

  let kind: SpokenAdjustment['kind'] | null = null
  if (/\b(DEDUCT|DEDUCTION|MINUS|TAKE\s+OFF|TAKE\s+OUT|EXPENSE|OWE)\b/.test(text)) {
    kind = 'deduction'
  } else if (/\b(EXTRA|BONUS|ADD|PLUS)\b/.test(text)) {
    kind = 'extra'
  }

  const label = text
    .replace(amountMatch[1], ' ')
    .replace(
      /\b(DEDUCT|DEDUCTION|MINUS|TAKE\s+OFF|TAKE\s+OUT|EXPENSE|OWE|EXTRA|BONUS|ADD|PLUS|DOLLARS?|BUCKS|FOR|A|AN)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim()

  if (kind === null) {
    kind = DEDUCTION_HINTS.some((w) => label.split(' ').includes(w)) ? 'deduction' : 'extra'
  }

  return {
    kind,
    label: label ? label.charAt(0) + label.slice(1).toLowerCase() : '',
    amount,
  }
}

const MONTHS: Record<string, number> = {
  JANUARY: 1, FEBRUARY: 2, MARCH: 3, APRIL: 4, MAY: 5, JUNE: 6,
  JULY: 7, AUGUST: 8, SEPTEMBER: 9, OCTOBER: 10, NOVEMBER: 11, DECEMBER: 12,
}

/**
 * Parse a spoken load, e.g. "container E M H U 650693 chassis T S F Z 567142
 * from G4 to 63rd rate 220 note 10 dollar fuel".
 */
export function parseSpokenText(raw: string): ParsedRow {
  let text = ` ${raw.toUpperCase().trim()} `
  // Speech comes back as separated letters ("E M H U") — glue whole runs
  text = text.replace(/\b(?:[A-Z]\s+)+[A-Z]\b/g, (m) => m.replace(/\s+/g, ''))
  text = text.replace(/(\d)[\s-]+(?=\d)/g, '$1')

  const ids: string[] = []
  for (const m of text.matchAll(EMAIL_ID_RE)) {
    const id = m[1] + m[2].replace(/[^0-9]/g, '')
    if (!ids.includes(id)) ids.push(id)
  }

  const STOP = '(?:CONTAINER|TRAILER|CHASSIS|FROM|TO|RATE|PAY|PAID|NOTES?|DATE)'
  const fromMatch = text.match(new RegExp(`\\bFROM\\s+(.+?)(?=\\s+${STOP}\\b|\\s*$)`))
  const toMatch = text.match(new RegExp(`\\bTO\\s+(.+?)(?=\\s+${STOP}\\b|\\s*$)`))
  const rateMatch =
    text.match(/\b(?:RATE|PAY|PAID)\s+\$?\s?(\d{1,4}(?:\.\d{1,2})?)/) ??
    text.match(/\$\s?(\d{1,4}(?:\.\d{1,2})?)/) ??
    text.match(/\b(\d{1,4}(?:\.\d{1,2})?)\s+DOLLARS?\b/)
  const noteMatch = text.match(/\bNOTES?\s+(.+?)\s*$/)

  let date = text.match(DATE_RE)?.[1] ?? ''
  if (!date) {
    const spokenDate = text.match(
      /\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+(\d{1,2})\b/,
    )
    if (spokenDate) date = `${MONTHS[spokenDate[1]]}/${spokenDate[2]}`
  }

  const clean = (s: string | undefined) =>
    (s ?? '').replace(/[.,;]+$/, '').trim()

  return {
    date,
    container: ids[0] ?? '',
    chassis: ids[1] ?? '',
    from: clean(fromMatch?.[1]),
    to: clean(toMatch?.[1]),
    rate: rateMatch ? parseFloat(rateMatch[1]) : null,
    notes: clean(noteMatch?.[1]).toLowerCase(),
    include: true,
  }
}

/** Pull equipment IDs (EMHU650693, TSFZ567142…) out of OCR text from a truck plate. */
export function extractEquipmentIds(text: string): string[] {
  const ids: string[] = []
  const upper = text.toUpperCase()
  for (const m of upper.matchAll(ID_RE)) {
    const digits = fixDigits(m[2])
    if ((m[2].match(/[0-9]/g)?.length ?? 0) >= 3) {
      const id = m[1] + digits
      if (!ids.includes(id)) ids.push(id)
    }
  }
  // Also catch space-split plates like "EMHU 650 693"
  for (const m of upper.matchAll(EMAIL_ID_RE)) {
    const id = m[1] + m[2].replace(/[^0-9]/g, '')
    if (id.length >= 10 && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/**
 * Pull load rows out of raw OCR text. Dates carry forward across lines the
 * way they do on paper sheets (one date written for a group of loads).
 */
export function parseRows(text: string): ParsedRow[] {
  const rows: ParsedRow[] = []
  let currentDate = ''

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const upper = line.toUpperCase()

    const dateMatch = upper.match(DATE_RE)
    if (dateMatch) currentDate = dateMatch[1]

    const ids: string[] = []
    for (const m of upper.matchAll(ID_RE)) {
      const digits = fixDigits(m[2])
      // Require a mostly-numeric tail so ordinary words don't slip through
      if ((m[2].match(/[0-9]/g)?.length ?? 0) >= 3) ids.push(m[1] + digits)
    }
    if (ids.length === 0) continue

    // Fuel reimbursements ("$10 FUEL") live in the Notes column — pull them
    // out first so they aren't mistaken for the rate.
    let notes = ''
    let searchable = upper
    const fuel = upper.match(FUEL_RE)
    if (fuel) {
      notes = `$${fuel[1]} FUEL`
      searchable = upper.replace(fuel[0], ' ')
    }

    const amounts: number[] = []
    for (const m of searchable.matchAll(MONEY_RE)) {
      const raw = m[2] ?? m[3]
      if (!raw) continue
      let value = parseFloat(raw.replace(/,/g, ''))
      // A per-load rate of $1000+ with no decimal point is almost always a
      // missed decimal (e.g. "$11500" for $115.00)
      if (!raw.includes('.') && value >= 1000) value /= 100
      if (Number.isFinite(value) && value !== 0) amounts.push(m[1] === '-' ? -value : value)
    }

    rows.push({
      date: currentDate,
      container: ids[0] ?? '',
      chassis: ids[1] ?? '',
      from: '',
      to: '',
      // Rate is the first money column on the sheet, so take the first match
      rate: amounts.length > 0 ? amounts[0] : null,
      notes,
      include: true,
    })
  }

  return rows
}
