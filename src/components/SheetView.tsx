import { useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, uid, addEmptyRow, addWeekDivider } from '../db'
import { flushAllInputs } from '../flush'
import { money, normalizePercent, parseMoneyInput } from '../format'
import { parseSpokenAdjustment } from '../ocr'
import { SpeechRec, explainSpeechError } from '../speech'
import type { LoadRow, ParsedRow, PayType, Sheet } from '../types'
import CellInput from './CellInput'
import IdScanModal, { type IdField } from './IdScanModal'
import ScanModal from './ScanModal'
import SettingsModal from './SettingsModal'
import ShareModal from './ShareModal'
import ThemeToggle from './ThemeToggle'

const EXTRA_PRESETS = ['Detention', 'Layover', 'Bonus', 'Extra stop']
const DEDUCTION_PRESETS = ['Gas', 'Advance', 'Insurance', 'Tolls', 'Parking', 'Repair']

interface Props {
  sheetId: string
  onBack: () => void
}

export default function SheetView({ sheetId, onBack }: Props) {
  const [scanning, setScanning] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')
  const [idScan, setIdScan] = useState<null | { field: IdField; rowId?: string }>(null)

  function handleSave() {
    flushAllInputs()
    setSaveMsg('Saved on this phone')
    window.setTimeout(() => setSaveMsg(''), 2000)
  }

  function handleBack() {
    flushAllInputs()
    onBack()
  }

  const sheet = useLiveQuery(() => db.sheets.get(sheetId), [sheetId])
  const rows = useLiveQuery(
    () => db.rows.where('sheetId').equals(sheetId).sortBy('order'),
    [sheetId],
  )
  const deductions = useLiveQuery(
    () => db.deductions.where('sheetId').equals(sheetId).toArray(),
    [sheetId],
  )
  const extras = useLiveQuery(
    () => db.extras.where('sheetId').equals(sheetId).toArray(),
    [sheetId],
  )

  if (!sheet || !rows || !deductions || !extras) return null

  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0

  const gross = rows.reduce((sum, r) => sum + (r.rate ?? 0), 0)
  const totalMiles = rows.reduce((sum, r) => sum + (r.miles ?? 0), 0)
  const totalHours = rows.reduce((sum, r) => sum + (r.hours ?? 0), 0)
  // Mile/hour pay: quantity × rate, plus any flat load rates entered on top
  const driverShare =
    payType === 'mile'
      ? totalMiles * payRate + gross
      : payType === 'hour'
        ? totalHours * payRate + gross
        : gross * (normalizePercent(sheet.percent) / 100)
  const extraTotal = extras.reduce((sum, e) => sum + e.amount, 0)
  const deductionTotal = deductions.reduce((sum, d) => sum + d.amount, 0)
  const net = driverShare + extraTotal - deductionTotal

  const hidden = sheet.hiddenCols ?? []
  const cols: ColFlags = {
    container: !hidden.includes('container'),
    chassis: !hidden.includes('chassis'),
    from: !hidden.includes('from'),
    to: !hidden.includes('to'),
    miles: payType === 'mile' || !!sheet.showMiles,
    hours: payType === 'hour',
    // Per-load rates are the whole point of percent pay; optional otherwise
    rate: payType === 'percent' || !hidden.includes('rate'),
    notes: !hidden.includes('notes'),
  }
  const colCount = 2 + Object.values(cols).filter(Boolean).length

  const nextOrder = rows.length > 0 ? rows[rows.length - 1].order + 1 : 0

  // Per-week subtotals: each divider collects the loads below it,
  // shown in dollars for whatever pay type the sheet uses
  const weekTotals = new Map<string, number>()
  {
    let currentDivider: string | null = null
    for (const r of rows) {
      if (r.kind === 'divider') {
        currentDivider = r.id
        weekTotals.set(r.id, 0)
      } else if (currentDivider) {
        const basis =
          payType === 'mile'
            ? (r.miles ?? 0) * payRate + (r.rate ?? 0)
            : payType === 'hour'
              ? (r.hours ?? 0) * payRate + (r.rate ?? 0)
              : (r.rate ?? 0)
        weekTotals.set(currentDivider, (weekTotals.get(currentDivider) ?? 0) + basis)
      }
    }
  }

  async function addParsedRows(parsed: ParsedRow[]) {
    let order = nextOrder
    await db.rows.bulkAdd(
      parsed.map((p) => ({
        id: uid(),
        sheetId,
        order: order++,
        date: p.date,
        container: p.container,
        chassis: p.chassis,
        from: p.from,
        to: p.to,
        rate: p.rate,
        notes: p.notes,
      })),
    )
  }

  return (
    <div className="page">
      <header className="topbar">
        <button className="btn small" onClick={handleBack}>
          ← Sheets
        </button>
        <div className="topbar-title">
          <CellInput
            className="title-input"
            value={sheet.title}
            onCommit={(v) => db.sheets.update(sheetId, { title: v })}
          />
          <div className="driver-line">
            <span className="muted">Driver:</span>
            <CellInput
              className="driver-input"
              value={sheet.driver}
              placeholder="name"
              onCommit={(v) => db.sheets.update(sheetId, { driver: v })}
            />
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div className="action-bar">
        <button className="btn primary" onClick={() => setScanning(true)}>
          + Add load (photo / email)
        </button>
        <button className="btn" onClick={() => setIdScan({ field: 'both' })}>
          📷 Scan ID
        </button>
        <button className="btn" onClick={() => addEmptyRow(sheetId, nextOrder)}>
          + Add row
        </button>
        <button className="btn" onClick={() => addWeekDivider(sheetId, nextOrder)}>
          + Week
        </button>
        <button className="btn primary" onClick={handleSave}>
          Save
        </button>
        <button className="btn" onClick={() => setSharing(true)}>
          Send
        </button>
        <button className="btn" aria-label="Sheet settings" onClick={() => setSettingsOpen(true)}>
          ⚙
        </button>
      </div>
      {saveMsg && <p className="save-toast">{saveMsg}</p>}

      <div className="table-wrap">
        <table className="loads">
          <thead>
            <tr>
              <th className="col-date">Date</th>
              {cols.container && <th className="col-id">Container/Trailer</th>}
              {cols.chassis && <th className="col-id">Chassis</th>}
              {cols.from && <th className="col-loc">From</th>}
              {cols.to && <th className="col-loc">To</th>}
              {cols.miles && <th className="col-rate">Miles</th>}
              {cols.hours && <th className="col-rate">Hours</th>}
              {cols.rate && <th className="col-rate">Rate</th>}
              {cols.notes && <th className="col-notes">Notes</th>}
              <th className="col-x"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'divider' ? (
                <DividerRow
                  key={row.id}
                  row={row}
                  subtotal={weekTotals.get(row.id) ?? 0}
                  colCount={colCount}
                />
              ) : (
                <RowEditor
                  key={row.id}
                  row={row}
                  cols={cols}
                  onScanId={(field) => setIdScan({ field, rowId: row.id })}
                />
              ),
            )}
            {rows.length === 0 && (
              <tr>
                <td colSpan={colCount} className="empty-row">
                  No loads yet — scan a photo or add a row.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <SummaryPanel
        sheet={sheet}
        gross={gross}
        totalMiles={totalMiles}
        totalHours={totalHours}
        driverShare={driverShare}
        extraTotal={extraTotal}
        deductionTotal={deductionTotal}
        net={net}
        extras={extras}
        deductions={deductions}
      />

      {scanning && (
        <ScanModal
          onClose={() => setScanning(false)}
          onAddRows={async (parsed) => {
            await addParsedRows(parsed)
            setScanning(false)
          }}
        />
      )}

      {sharing && (
        <ShareModal
          sheet={sheet}
          rows={rows}
          extras={extras}
          deductions={deductions}
          totals={{ gross, totalMiles, totalHours, driverShare, extraTotal, deductionTotal, net }}
          onClose={() => setSharing(false)}
        />
      )}

      {settingsOpen && <SettingsModal sheet={sheet} onClose={() => setSettingsOpen(false)} />}

      {idScan && (
        <IdScanModal
          field={idScan.field}
          onClose={() => setIdScan(null)}
          onResult={async (result) => {
            const targetId = idScan.rowId
            setIdScan(null)
            if (targetId) {
              await db.rows.update(targetId, result)
              return
            }
            // New load from truck plate scan
            await db.rows.add({
              id: uid(),
              sheetId,
              order: nextOrder,
              date: '',
              container: result.container ?? '',
              chassis: result.chassis ?? '',
              from: '',
              to: '',
              rate: null,
              notes: '',
            })
          }}
        />
      )}
    </div>
  )
}

/** Which columns are visible for this sheet */
interface ColFlags {
  container: boolean
  chassis: boolean
  from: boolean
  to: boolean
  miles: boolean
  hours: boolean
  rate: boolean
  notes: boolean
}

function DividerRow({
  row,
  subtotal,
  colCount,
}: {
  row: LoadRow
  subtotal: number
  colCount: number
}) {
  return (
    <tr className="divider-row">
      <td colSpan={colCount - 2}>
        <CellInput
          value={row.date}
          placeholder="Week of 6/22"
          onCommit={(v) => db.rows.update(row.id, { date: v })}
        />
      </td>
      <td className="divider-total">{money(subtotal)}</td>
      <td>
        <button
          className="row-delete"
          aria-label="Delete week divider"
          onClick={() => db.rows.delete(row.id)}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

function RowEditor({
  row,
  cols,
  onScanId,
}: {
  row: LoadRow
  cols: ColFlags
  onScanId: (field: 'container' | 'chassis') => void
}) {
  const update = (patch: Partial<LoadRow>) => db.rows.update(row.id, patch)
  return (
    <tr>
      <td>
        <CellInput value={row.date} placeholder="6/22" onCommit={(v) => update({ date: v })} />
      </td>
      {cols.container && (
        <td>
          <div className="id-cell">
            <CellInput
              value={row.container}
              className="mono"
              onCommit={(v) => update({ container: v.toUpperCase() })}
            />
            <button
              type="button"
              className="id-scan-btn"
              aria-label="Scan container from truck"
              title="Scan container from truck"
              onClick={() => onScanId('container')}
            >
              📷
            </button>
          </div>
        </td>
      )}
      {cols.chassis && (
        <td>
          <div className="id-cell">
            <CellInput
              value={row.chassis}
              className="mono"
              onCommit={(v) => update({ chassis: v.toUpperCase() })}
            />
            <button
              type="button"
              className="id-scan-btn"
              aria-label="Scan chassis from truck"
              title="Scan chassis from truck"
              onClick={() => onScanId('chassis')}
            >
              📷
            </button>
          </div>
        </td>
      )}
      {cols.from && (
        <td>
          <CellInput value={row.from} onCommit={(v) => update({ from: v })} />
        </td>
      )}
      {cols.to && (
        <td>
          <CellInput value={row.to} onCommit={(v) => update({ to: v })} />
        </td>
      )}
      {cols.miles && (
        <td>
          <CellInput
            value={row.miles != null ? String(row.miles) : ''}
            className="num"
            inputMode="decimal"
            placeholder="0"
            onCommit={(v) => update({ miles: parseMoneyInput(v) })}
          />
        </td>
      )}
      {cols.hours && (
        <td>
          <CellInput
            value={row.hours != null ? String(row.hours) : ''}
            className="num"
            inputMode="decimal"
            placeholder="0"
            onCommit={(v) => update({ hours: parseMoneyInput(v) })}
          />
        </td>
      )}
      {cols.rate && (
        <td>
          <CellInput
            value={row.rate != null ? row.rate.toFixed(2) : ''}
            className="num"
            inputMode="decimal"
            placeholder="0.00"
            onCommit={(v) => update({ rate: parseMoneyInput(v) })}
          />
        </td>
      )}
      {cols.notes && (
        <td>
          <CellInput value={row.notes} onCommit={(v) => update({ notes: v })} />
        </td>
      )}
      <td>
        <button
          className="row-delete"
          aria-label="Delete row"
          onClick={() => db.rows.delete(row.id)}
        >
          ✕
        </button>
      </td>
    </tr>
  )
}

interface SummaryProps {
  sheet: Sheet
  gross: number
  totalMiles: number
  totalHours: number
  driverShare: number
  extraTotal: number
  deductionTotal: number
  net: number
  extras: { id: string; label: string; amount: number }[]
  deductions: { id: string; label: string; amount: number }[]
}

function SummaryPanel({
  sheet,
  gross,
  totalMiles,
  totalHours,
  driverShare,
  extraTotal,
  deductionTotal,
  net,
  extras,
  deductions,
}: SummaryProps) {
  const payType: PayType = sheet.payType ?? 'percent'
  const payRate = sheet.payRate ?? 0
  return (
    <section className="summary card">
      {payType === 'mile' && (
        <div className="summary-line">
          <span>
            Miles ({totalMiles.toLocaleString()} × {money(payRate)}/mi)
          </span>
          <strong>{money(totalMiles * payRate)}</strong>
        </div>
      )}
      {payType === 'hour' && (
        <div className="summary-line">
          <span>
            Hours ({totalHours.toLocaleString()} × {money(payRate)}/hr)
          </span>
          <strong>{money(totalHours * payRate)}</strong>
        </div>
      )}
      {(payType === 'percent' || gross !== 0) && (
        <div className="summary-line">
          <span>Loads total</span>
          <strong>{money(gross)}</strong>
        </div>
      )}
      {payType === 'percent' && normalizePercent(sheet.percent) !== 100 && (
        <div className="summary-line">
          <span>Driver cut ({normalizePercent(sheet.percent)}%)</span>
          <strong>{money(driverShare)}</strong>
        </div>
      )}

      <details className="adjustments">
        <summary>
          <span>Extra pay & deductions</span>
          <span className="adj-totals">
            {extraTotal !== 0 && <span>+{money(extraTotal)}</span>}
            {deductionTotal !== 0 && <span>−{money(deductionTotal)}</span>}
            {extraTotal === 0 && deductionTotal === 0 && <span className="muted">none</span>}
          </span>
        </summary>

        <div className="adj-body">
          {payType === 'percent' && (
            <div className="summary-line pct-line">
              <span className="muted">Driver keeps</span>
              <span>
                <CellInput
                  value={String(normalizePercent(sheet.percent))}
                  className="pct-input num"
                  inputMode="decimal"
                  onCommit={(v) =>
                    db.sheets.update(sheet.id, { percent: normalizePercent(parseFloat(v)) })
                  }
                />
                % of loads
              </span>
            </div>
          )}
          {extras.map((x) => (
            <AdjustmentLine
              key={x.id}
              sign="+"
              label={x.label}
              amount={x.amount}
              placeholder="extra pay"
              onLabel={(v) => db.extras.update(x.id, { label: v })}
              onAmount={(v) => db.extras.update(x.id, { amount: v })}
              onDelete={() => db.extras.delete(x.id)}
            />
          ))}
          {deductions.map((d) => (
            <AdjustmentLine
              key={d.id}
              sign="−"
              label={d.label}
              amount={d.amount}
              placeholder="deduction"
              onLabel={(v) => db.deductions.update(d.id, { label: v })}
              onAmount={(v) => db.deductions.update(d.id, { amount: v })}
              onDelete={() => db.deductions.delete(d.id)}
            />
          ))}

          <div className="chip-row">
            <span className="chip-sign">+</span>
            {EXTRA_PRESETS.map((label) => (
              <button
                key={label}
                className="chip"
                onClick={() =>
                  db.extras.add({ id: uid(), sheetId: sheet.id, label, amount: 0 })
                }
              >
                {label}
              </button>
            ))}
            <button
              className="chip"
              onClick={() => db.extras.add({ id: uid(), sheetId: sheet.id, label: '', amount: 0 })}
            >
              other…
            </button>
          </div>
          <div className="chip-row">
            <span className="chip-sign">−</span>
            {DEDUCTION_PRESETS.map((label) => (
              <button
                key={label}
                className="chip"
                onClick={() =>
                  db.deductions.add({ id: uid(), sheetId: sheet.id, label, amount: 0 })
                }
              >
                {label}
              </button>
            ))}
            <button
              className="chip"
              onClick={() =>
                db.deductions.add({ id: uid(), sheetId: sheet.id, label: '', amount: 0 })
              }
            >
              other…
            </button>
          </div>

          <SpeakAdjustment sheetId={sheet.id} />
        </div>
      </details>

      <div className="summary-line net">
        <span>Pay</span>
        <strong>{money(net)}</strong>
      </div>
    </section>
  )
}

interface AdjustmentLineProps {
  sign: '+' | '−'
  label: string
  amount: number
  placeholder: string
  onLabel: (label: string) => void
  onAmount: (amount: number) => void
  onDelete: () => void
}

function AdjustmentLine({
  sign,
  label,
  amount,
  placeholder,
  onLabel,
  onAmount,
  onDelete,
}: AdjustmentLineProps) {
  return (
    <div className="summary-line deduction">
      <span className="deduction-edit">
        <CellInput value={label} placeholder={placeholder} onCommit={onLabel} />
        <button className="row-delete" aria-label={`Remove ${placeholder}`} onClick={onDelete}>
          ✕
        </button>
      </span>
      <span className="deduction-amount">
        {sign}{' '}
        <CellInput
          value={amount ? amount.toFixed(2) : ''}
          className="num amount-input"
          inputMode="decimal"
          placeholder="0.00"
          onCommit={(v) => onAmount(parseMoneyInput(v) ?? 0)}
        />
      </span>
    </div>
  )
}

function SpeakAdjustment({ sheetId }: { sheetId: string }) {
  const [listening, setListening] = useState(false)
  const [message, setMessage] = useState('')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recRef = useRef<any>(null)

  if (!SpeechRec) return null

  function toggle() {
    if (listening) {
      recRef.current?.stop()
      return
    }
    const rec = new SpeechRec()
    rec.lang = 'en-US'
    let done = false
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onresult = (e: any) => {
      done = true
      const transcript = e.results[0][0].transcript as string
      const adj = parseSpokenAdjustment(transcript)
      if (!adj) {
        setMessage(`Heard “${transcript}” — say a name and amount, like “gas 50”.`)
        return
      }
      const table = adj.kind === 'extra' ? db.extras : db.deductions
      table.add({ id: uid(), sheetId, label: adj.label, amount: adj.amount })
      setMessage(
        `Added ${adj.kind === 'extra' ? '+' : '−'}$${adj.amount.toFixed(2)}${adj.label ? ` ${adj.label}` : ''}`,
      )
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rec.onerror = (e: any) => {
      done = true
      setListening(false)
      const explanation = explainSpeechError(e.error)
      if (explanation) setMessage(explanation)
    }
    rec.onend = () => {
      setListening(false)
      if (!done) setMessage('Stopped listening — didn’t catch anything. Tap and speak right away.')
    }
    recRef.current = rec
    rec.start()
    setListening(true)
    setMessage('')
  }

  return (
    <div className="speak-adj">
      <button className={`btn small ${listening ? 'listening' : ''}`} onClick={toggle}>
        {listening ? '⏺ Listening…' : '🎤 Speak (“gas 50”, “detention 75”)'}
      </button>
      {message && <span className="muted">{message}</span>}
    </div>
  )
}

