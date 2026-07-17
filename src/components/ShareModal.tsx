import { useMemo, useState } from 'react'
import type { Deduction, Extra, LoadRow, Sheet } from '../types'
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

export default function ShareModal({ sheet, rows, extras, deductions, totals, onClose }: Props) {
  const [status, setStatus] = useState('')
  const text = useMemo(
    () => buildSheetText(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )
  const csv = useMemo(
    () => buildCsv(sheet, rows, extras, deductions, totals),
    [sheet, rows, extras, deductions, totals],
  )

  const canSystemShare = typeof navigator.share === 'function'

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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Send sheet</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <pre className="share-preview">{text}</pre>

        <div className="share-actions">
          <button className="btn primary big" onClick={handleShareText}>
            {canSystemShare ? 'Send… (SMS, email, WhatsApp)' : 'Copy summary'}
          </button>
          <button className="btn big" onClick={handleShareCsv}>
            Send as spreadsheet file (CSV)
          </button>
          <div className="btn-row">
            <button className="btn" onClick={handleCopy}>
              Copy text
            </button>
            <a className="btn" href={mailtoLink(sheet, text)}>
              Email
            </a>
            <button className="btn" onClick={() => downloadCsv(sheet, csv)}>
              Save CSV
            </button>
          </div>
        </div>

        {status && <p className="muted share-status">{status}</p>}
      </div>
    </div>
  )
}
