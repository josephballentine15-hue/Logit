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

export default function ShareModal({ sheet, rows, extras, deductions, totals, onClose }: Props) {
  const [status, setStatus] = useState('')
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0

  const text = useMemo(
    () => buildSheetText(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )
  const csv = useMemo(
    () => buildCsv(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )

  const canSystemShare = typeof navigator.share === 'function'

  // Week subtotals for the on-screen preview
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

  const loadNumbers = useMemo(() => {
    const map = new Map<string, number>()
    let n = 0
    for (const r of rows) {
      if (r.kind !== 'divider' && rowHasContent(r)) {
        n += 1
        map.set(r.id, n)
      }
    }
    return map
  }, [rows])

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
    const safe = (s: string) =>
      s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${safe(sheet.title)}</title>
<style>
  body { font-family: system-ui, sans-serif; max-width: 640px; margin: 24px auto; padding: 0 16px; color: #111; line-height: 1.45; }
  h1 { font-size: 22px; margin: 0 0 4px; }
  .sub { color: #555; margin-bottom: 20px; }
  h2 { font-size: 13px; letter-spacing: 0.06em; text-transform: uppercase; color: #666; border-bottom: 1px solid #ccc; padding-bottom: 6px; margin: 24px 0 12px; }
  .load { margin: 0 0 16px; padding: 0 0 12px; border-bottom: 1px solid #eee; }
  .load:last-child { border-bottom: none; }
  .load strong { display: block; margin-bottom: 4px; }
  .row { display: flex; gap: 8px; font-size: 14px; }
  .label { width: 88px; color: #666; flex-shrink: 0; }
  .week { font-weight: 700; margin: 18px 0 8px; padding: 8px 0; border-top: 2px solid #111; border-bottom: 1px solid #ccc; }
  .sum { display: flex; justify-content: space-between; font-size: 15px; margin: 4px 0; }
  .pay { font-size: 20px; font-weight: 700; margin-top: 12px; display: flex; justify-content: space-between; border-top: 2px solid #111; padding-top: 10px; }
  @media print { body { margin: 0; } }
</style></head><body>
<pre style="font-family:inherit;white-space:pre-wrap;font-size:14px">${safe(text)}</pre>
<script>window.onload=()=>{window.print();}</script>
</body></html>`)
    w.document.close()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Send sheet</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <p className="muted share-hint">
          Preview of what the other person will read. Empty fields are left out so it stays clear.
        </p>

        <div className="share-preview-card">
          <header className="share-doc-head">
            <h3>{sheet.title || 'Logit sheet'}</h3>
            {sheet.driver && <p className="share-doc-sub">Driver: {sheet.driver}</p>}
          </header>

          <h4 className="share-section-label">Loads</h4>

          {rows.map((r) => {
            if (r.kind === 'divider') {
              return (
                <div key={r.id} className="share-week">
                  <span>{r.date || 'Week'}</span>
                  <strong>{money(weekTotals.get(r.id) ?? 0)}</strong>
                </div>
              )
            }
            const n = loadNumbers.get(r.id)
            if (n == null) return null
            return (
              <article key={r.id} className="share-load">
                <strong>
                  {n}. {r.date || 'No date'}
                </strong>
                {r.container && (
                  <div className="share-field">
                    <span>Container</span>
                    <span className="mono">{r.container}</span>
                  </div>
                )}
                {r.chassis && (
                  <div className="share-field">
                    <span>Chassis</span>
                    <span className="mono">{r.chassis}</span>
                  </div>
                )}
                {(r.from || r.to) && (
                  <div className="share-field">
                    <span>Route</span>
                    <span>
                      {r.from || '—'} → {r.to || '—'}
                    </span>
                  </div>
                )}
                {r.miles != null && (
                  <div className="share-field">
                    <span>Miles</span>
                    <span>{r.miles.toLocaleString()}</span>
                  </div>
                )}
                {r.hours != null && (
                  <div className="share-field">
                    <span>Hours</span>
                    <span>{r.hours.toLocaleString()}</span>
                  </div>
                )}
                {(r.rate != null || payType === 'percent') && (
                  <div className="share-field">
                    <span>Rate</span>
                    <span>{r.rate != null ? money(r.rate) : '—'}</span>
                  </div>
                )}
                {r.notes && (
                  <div className="share-field">
                    <span>Notes</span>
                    <span>{r.notes}</span>
                  </div>
                )}
              </article>
            )
          })}

          {loadNumbers.size === 0 && <p className="muted">No loads yet.</p>}

          <h4 className="share-section-label">Summary</h4>
          <div className="share-summary">
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
          <button className="btn primary big" onClick={handleShareText}>
            {canSystemShare ? 'Send… (SMS, email, WhatsApp)' : 'Copy summary'}
          </button>
          <div className="btn-row">
            <button className="btn" onClick={handleCopy}>
              Copy text
            </button>
            <a className="btn" href={mailtoLink(sheet, text)}>
              Email
            </a>
            <button className="btn" onClick={handlePrint}>
              Print
            </button>
          </div>
          <button className="btn big" onClick={handleShareCsv}>
            Send as spreadsheet file (CSV)
          </button>
          <button className="btn" onClick={() => downloadCsv(sheet, csv)}>
            Save CSV
          </button>
        </div>

        {status && <p className="muted share-status">{status}</p>}
      </div>
    </div>
  )
}
