import { useMemo, useState } from 'react'
import { money, normalizePercent } from '../format'
import type { Deduction, Extra, LoadRow, PayType, Sheet } from '../types'
import {
  buildCsv,
  buildSheetText,
  copyToClipboard,
  downloadCsv,
  mailtoLink,
  shareCsvFile,
  shareViaSystem,
  type SheetTotals,
} from '../share'

interface Props {
  sheet: Sheet
  rows: LoadRow[]
  extras: Extra[]
  deductions: Deduction[]
  totals: SheetTotals
  onClose: () => void
}

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

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export default function ShareModal({ sheet, rows, extras, deductions, totals, onClose }: Props) {
  const [status, setStatus] = useState('')
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0
  const showMiles = payType === 'mile' || !!sheet.showMiles
  const showHours = payType === 'hour'

  const text = useMemo(
    () => buildSheetText(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )
  const csv = useMemo(
    () => buildCsv(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )

  const canSystemShare = typeof navigator.share === 'function'

  const weekTotals = useMemo(() => {
    const map = new Map<string, number>()
    let current: string | null = null
    for (const r of rows) {
      if (r.kind === 'divider') {
        current = r.id
        map.set(r.id, 0)
      } else if (current) {
        const basis =
          payType === 'mile'
            ? (r.miles ?? 0) * payRate + (r.rate ?? 0)
            : payType === 'hour'
              ? (r.hours ?? 0) * payRate + (r.rate ?? 0)
              : (r.rate ?? 0)
        map.set(current, (map.get(current) ?? 0) + basis)
      }
    }
    return map
  }, [rows, payType, payRate])

  /** Date shown only on the first load of each date group (like the paper sheet). */
  const displayDates = useMemo(() => {
    const map = new Map<string, string>()
    let last = ''
    for (const r of rows) {
      if (r.kind === 'divider') {
        last = ''
        continue
      }
      if (!rowHasContent(r)) continue
      const d = r.date.trim()
      if (d && d !== last) {
        map.set(r.id, d)
        last = d
      } else {
        map.set(r.id, '')
      }
    }
    return map
  }, [rows])

  const colCount = 6 + (showMiles ? 1 : 0) + (showHours ? 1 : 0)

  async function handleShareText() {
    const ok = await shareViaSystem(sheet.title, text)
    if (!ok) {
      const copied = await copyToClipboard(text)
      setStatus(
        copied
          ? 'Sharing is not available here — the summary was copied instead, paste it into any message.'
          : 'Sharing is not available in this browser.',
      )
    }
  }

  async function handleShareCsv() {
    const ok = await shareCsvFile(sheet, csv)
    if (!ok) {
      downloadCsv(sheet, csv)
      setStatus('File sharing is not available here — the CSV was downloaded instead.')
    }
  }

  async function handleCopy() {
    const copied = await copyToClipboard(text)
    setStatus(copied ? 'Copied. Paste it into a text, email, or WhatsApp.' : 'Copy failed.')
  }

  function handlePrint() {
    const w = window.open('', '_blank', 'noopener,noreferrer')
    if (!w) {
      setStatus('Pop-up blocked — allow pop-ups to print, or use Copy / Email instead.')
      return
    }

    const bodyRows: string[] = []
    for (const r of rows) {
      if (r.kind === 'divider') {
        bodyRows.push(`<tr class="week"><td colspan="${colCount}"><span>${escHtml(r.date || 'Week')}</span><span>${escHtml(money(weekTotals.get(r.id) ?? 0))}</span></td></tr>`)
        continue
      }
      if (!rowHasContent(r)) continue
      const dayStart = !!(displayDates.get(r.id) ?? '')
      bodyRows.push(`<tr class="${dayStart ? 'day-start' : 'load'}">
        <td class="date">${escHtml(displayDates.get(r.id) ?? '')}</td>
        <td class="mono">${escHtml(r.container)}</td>
        <td class="mono">${escHtml(r.chassis)}</td>
        <td>${escHtml(r.from)}</td>
        <td>${escHtml(r.to)}</td>
        ${showMiles ? `<td class="num">${r.miles != null ? escHtml(String(r.miles)) : ''}</td>` : ''}
        ${showHours ? `<td class="num">${r.hours != null ? escHtml(String(r.hours)) : ''}</td>` : ''}
        <td class="num">${r.rate != null ? escHtml(money(r.rate)) : ''}</td>
      </tr>`)
    }

    const summaryLines: string[] = []
    if (payType === 'mile') {
      summaryLines.push(
        `<div class="sum"><span>Miles (${totals.totalMiles.toLocaleString()} × ${escHtml(money(payRate))}/mi)</span><span>${escHtml(money(totals.totalMiles * payRate))}</span></div>`,
      )
      if (totals.gross !== 0) {
        summaryLines.push(
          `<div class="sum"><span>Loads total</span><span>${escHtml(money(totals.gross))}</span></div>`,
        )
      }
    } else if (payType === 'hour') {
      summaryLines.push(
        `<div class="sum"><span>Hours (${totals.totalHours.toLocaleString()} × ${escHtml(money(payRate))}/hr)</span><span>${escHtml(money(totals.totalHours * payRate))}</span></div>`,
      )
      if (totals.gross !== 0) {
        summaryLines.push(
          `<div class="sum"><span>Loads total</span><span>${escHtml(money(totals.gross))}</span></div>`,
        )
      }
    } else {
      summaryLines.push(
        `<div class="sum"><span>Loads total</span><span>${escHtml(money(totals.gross))}</span></div>`,
      )
      if (normalizePercent(sheet.percent) !== 100) {
        summaryLines.push(
          `<div class="sum"><span>Driver cut (${normalizePercent(sheet.percent)}%)</span><span>${escHtml(money(totals.driverShare))}</span></div>`,
        )
      }
    }
    for (const x of extras.filter((e) => e.amount || e.label)) {
      summaryLines.push(
        `<div class="sum"><span>+ ${escHtml(x.label || 'Extra')}</span><span>+${escHtml(money(x.amount))}</span></div>`,
      )
    }
    for (const d of deductions.filter((e) => e.amount || e.label)) {
      summaryLines.push(
        `<div class="sum"><span>− ${escHtml(d.label || 'Deduction')}</span><span>−${escHtml(money(d.amount))}</span></div>`,
      )
    }

    w.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escHtml(sheet.title || 'Logit')}</title>
<style>
  @page { size: portrait; margin: 0.5in; }
  * { box-sizing: border-box; }
  body {
    margin: 0 auto;
    padding: 16px;
    max-width: 700px;
    font-family: Arial, Helvetica, sans-serif;
    color: #111;
    background: #fff;
    font-size: 12px;
    line-height: 1.25;
  }
  .banner {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border: 1px solid #999;
    margin-bottom: 10px;
  }
  .banner div { padding: 8px 10px; }
  .banner .title { background: #f8d7da; font-weight: 700; border-right: 1px solid #999; }
  .banner .driver { background: #fff; }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th, td {
    border: 1px solid #b0b0b0;
    padding: 5px 6px;
    vertical-align: top;
    word-wrap: break-word;
  }
  th {
    background: #f3f3f3;
    font-weight: 700;
    text-align: left;
    font-size: 11px;
  }
  td.date { width: 12%; white-space: nowrap; font-weight: 700; }
  td.mono { font-family: Consolas, "Courier New", monospace; font-size: 11px; }
  td.num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  /* Line between every load */
  tr.load td { border-top: 1px solid #b0b0b0; }
  /* Stronger line between different days */
  tr.day-start td {
    border-top: 2.5px solid #222;
    background: #fafafa;
  }
  tr.day-start td.date { background: #eef2ff; }
  tr.week td {
    background: #dbeafe;
    font-weight: 700;
    border-top: 2.5px solid #222;
  }
  tr.week td span:last-child { float: right; }
  .summary {
    margin-top: 14px;
    max-width: 320px;
    margin-left: auto;
  }
  .sum {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 3px 0;
    border-bottom: 1px solid #ddd;
  }
  .pay {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 2px solid #111;
    font-size: 16px;
    font-weight: 700;
  }
  .foot { margin-top: 18px; color: #777; font-size: 10px; }
  @media print {
    body { padding: 0; max-width: none; }
  }
</style>
</head>
<body>
  <div class="banner">
    <div class="title">${escHtml(sheet.title || 'Logit sheet')}</div>
    <div class="driver">${sheet.driver ? `Driver: ${escHtml(sheet.driver)}` : ''}</div>
  </div>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Load</th>
        <th>Chassis</th>
        <th>Pick up</th>
        <th>Drop off</th>
        ${showMiles ? '<th>Miles</th>' : ''}
        ${showHours ? '<th>Hours</th>' : ''}
        <th>Price</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows.join('\n') || `<tr><td colspan="${colCount}">No loads</td></tr>`}
    </tbody>
  </table>
  <div class="summary">
    ${summaryLines.join('\n')}
    <div class="pay"><span>Pay</span><span>${escHtml(money(totals.net))}</span></div>
  </div>
  <p class="foot">Printed from Logit</p>
  <script>window.onload = function () { window.focus(); window.print(); }</script>
</body>
</html>`)
    w.document.close()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Send / print</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted share-hint">
          Spreadsheet layout — long ways, with lines — easy for a boss to read and keep.
        </p>

        <div className="share-preview-card share-sheet-wrap">
          <div className="share-banner">
            <div className="share-banner-title">{sheet.title || 'Logit sheet'}</div>
            <div className="share-banner-driver">{sheet.driver ? `Driver: ${sheet.driver}` : ''}</div>
          </div>

          <div className="share-table-scroll">
            <table className="share-sheet">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Load</th>
                  <th>Chassis</th>
                  <th>Pick up</th>
                  <th>Drop off</th>
                  {showMiles && <th>Miles</th>}
                  {showHours && <th>Hours</th>}
                  <th>Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  if (r.kind === 'divider') {
                    return (
                      <tr key={r.id} className="share-sheet-week">
                        <td colSpan={colCount}>
                          <span>{r.date || 'Week'}</span>
                          <strong>{money(weekTotals.get(r.id) ?? 0)}</strong>
                        </td>
                      </tr>
                    )
                  }
                  if (!rowHasContent(r)) return null
                  const dayStart = !!(displayDates.get(r.id) ?? '')
                  return (
                    <tr key={r.id} className={dayStart ? 'day-start' : 'load'}>
                      <td className="date">{displayDates.get(r.id) ?? ''}</td>
                      <td className="mono">{r.container}</td>
                      <td className="mono">{r.chassis}</td>
                      <td>{r.from}</td>
                      <td>{r.to}</td>
                      {showMiles && <td className="num">{r.miles != null ? r.miles : ''}</td>}
                      {showHours && <td className="num">{r.hours != null ? r.hours : ''}</td>}
                      <td className="num">{r.rate != null ? money(r.rate) : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="share-summary sheet-summary">
            {payType === 'mile' && (
              <div className="share-sum-line">
                <span>
                  Miles ({totals.totalMiles.toLocaleString()} × {money(payRate)}/mi)
                </span>
                <span>{money(totals.totalMiles * payRate)}</span>
              </div>
            )}
            {payType === 'hour' && (
              <div className="share-sum-line">
                <span>
                  Hours ({totals.totalHours.toLocaleString()} × {money(payRate)}/hr)
                </span>
                <span>{money(totals.totalHours * payRate)}</span>
              </div>
            )}
            {(payType === 'percent' || totals.gross !== 0) && (
              <div className="share-sum-line">
                <span>Loads total</span>
                <span>{money(totals.gross)}</span>
              </div>
            )}
            {payType === 'percent' && normalizePercent(sheet.percent) !== 100 && (
              <div className="share-sum-line">
                <span>Driver cut ({normalizePercent(sheet.percent)}%)</span>
                <span>{money(totals.driverShare)}</span>
              </div>
            )}
            {extras
              .filter((x) => x.amount || x.label)
              .map((x) => (
                <div key={x.id} className="share-sum-line extra">
                  <span>+ {x.label || 'Extra'}</span>
                  <span>+{money(x.amount)}</span>
                </div>
              ))}
            {deductions
              .filter((d) => d.amount || d.label)
              .map((d) => (
                <div key={d.id} className="share-sum-line deduction">
                  <span>− {d.label || 'Deduction'}</span>
                  <span>−{money(d.amount)}</span>
                </div>
              ))}
            <div className="share-sum-line pay">
              <span>Pay</span>
              <span>{money(totals.net)}</span>
            </div>
          </div>
        </div>

        <div className="share-actions">
          <button className="btn primary big" onClick={handlePrint}>
            Print / Save as PDF
          </button>
          <button className="btn big" onClick={handleShareText}>
            {canSystemShare ? 'Send… (SMS, email, WhatsApp)' : 'Copy summary'}
          </button>
          <div className="btn-row">
            <button className="btn" onClick={handleCopy}>
              Copy text
            </button>
            <a className="btn" href={mailtoLink(sheet, text)}>
              Email
            </a>
            <button className="btn" onClick={handleShareCsv}>
              Spreadsheet (CSV)
            </button>
          </div>
        </div>

        {status && <p className="muted share-status">{status}</p>}
      </div>
    </div>
  )
}
