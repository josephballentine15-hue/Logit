import { db } from '../db'
import { parseMoneyInput } from '../format'
import type { PayType, Sheet, ToggleCol } from '../types'

const COL_LABELS: Record<ToggleCol, string> = {
  container: 'Container/Trailer',
  chassis: 'Chassis',
  from: 'From',
  to: 'To',
  rate: 'Rate ($ per load)',
  notes: 'Notes',
}

const PAY_OPTIONS: { value: PayType; label: string; hint: string }[] = [
  { value: 'percent', label: 'Per load', hint: 'paid from load rates (flat or % cut)' },
  { value: 'mile', label: 'Per mile', hint: 'pay = miles × rate per mile' },
  { value: 'hour', label: 'Hourly', hint: 'pay = hours × hourly rate' },
]

interface Props {
  sheet: Sheet
  onClose: () => void
}

export default function SettingsModal({ sheet, onClose }: Props) {
  const payType: PayType = sheet.payType ?? 'percent'
  const hidden = sheet.hiddenCols ?? []

  function setPayType(next: PayType) {
    db.sheets.update(sheet.id, { payType: next })
  }

  function toggleCol(col: ToggleCol) {
    const next = hidden.includes(col) ? hidden.filter((c) => c !== col) : [...hidden, col]
    db.sheets.update(sheet.id, { hiddenCols: next })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>Sheet settings</h2>
          <button className="row-delete" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        <h3 className="settings-heading">How do you get paid?</h3>
        <div className="pay-options">
          {PAY_OPTIONS.map((opt) => (
            <label key={opt.value} className={`pay-option ${payType === opt.value ? 'selected' : ''}`}>
              <input
                type="radio"
                name="paytype"
                checked={payType === opt.value}
                onChange={() => setPayType(opt.value)}
              />
              <span>
                <strong>{opt.label}</strong>
                <span className="muted"> — {opt.hint}</span>
              </span>
            </label>
          ))}
        </div>

        {payType !== 'percent' && (
          <label className="pay-rate-line">
            {payType === 'mile' ? 'Rate per mile' : 'Hourly rate'}
            <span className="pay-rate-input">
              $
              <input
                key={sheet.payRate ?? ''}
                defaultValue={sheet.payRate ? String(sheet.payRate) : ''}
                inputMode="decimal"
                placeholder={payType === 'mile' ? '0.65' : '28.00'}
                onBlur={(e) =>
                  db.sheets.update(sheet.id, { payRate: parseMoneyInput(e.target.value) ?? 0 })
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                }}
              />
              {payType === 'mile' ? '/mile' : '/hour'}
            </span>
          </label>
        )}

        {payType === 'percent' && (
          <label className="checkbox-line">
            <input
              type="checkbox"
              checked={!!sheet.showMiles}
              onChange={(e) => db.sheets.update(sheet.id, { showMiles: e.target.checked })}
            />
            Also track miles per load
          </label>
        )}

        <h3 className="settings-heading">Columns</h3>
        <p className="muted settings-hint">
          Turn off the ones you don't use. Hidden columns keep their data.
        </p>
        <div className="col-toggles">
          {(Object.keys(COL_LABELS) as ToggleCol[]).map((col) => (
            <label key={col} className="checkbox-line">
              <input
                type="checkbox"
                checked={!hidden.includes(col)}
                onChange={() => toggleCol(col)}
                disabled={col === 'rate' && payType === 'percent'}
              />
              {COL_LABELS[col]}
            </label>
          ))}
        </div>

        <p className="muted settings-hint">New sheets start with the same setup.</p>
      </div>
    </div>
  )
}
