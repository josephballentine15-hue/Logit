import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, createSheet, deleteSheet, setSheetArchived } from '../db'
import { money } from '../format'
import type { Sheet } from '../types'
import ThemeToggle from './ThemeToggle'

interface Props {
  onOpen: (id: string) => void
}

export default function SheetList({ onOpen }: Props) {
  const [creating, setCreating] = useState(false)
  const [title, setTitle] = useState('')
  const [driver, setDriver] = useState(() => localStorage.getItem('logit:driver') ?? '')

  const allSheets = useLiveQuery(() => db.sheets.orderBy('createdAt').reverse().toArray())
  const sheets = allSheets?.filter((s) => !s.archived)
  const archived = allSheets?.filter((s) => s.archived) ?? []
  const totals = useLiveQuery(async () => {
    const rows = await db.rows.toArray()
    const map: Record<string, number> = {}
    for (const r of rows) {
      if (r.rate != null) map[r.sheetId] = (map[r.sheetId] ?? 0) + r.rate
    }
    return map
  })

  async function handleCreate() {
    const name = title.trim() || defaultTitle()
    const drv = driver.trim()
    localStorage.setItem('logit:driver', drv)
    const id = await createSheet(name, drv)
    onOpen(id)
  }

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="" width={30} height={30} />
          <h1>Logit</h1>
        </div>
        <ThemeToggle />
      </header>

      <main className="list-main">
        {creating ? (
          <div className="card new-sheet">
            <h2>New sheet</h2>
            <label>
              Sheet name
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={defaultTitle()}
                autoFocus
              />
            </label>
            <label>
              Driver
              <input
                value={driver}
                onChange={(e) => setDriver(e.target.value)}
                placeholder="Driver name"
              />
            </label>
            <div className="btn-row">
              <button className="btn primary" onClick={handleCreate}>
                Create
              </button>
              <button className="btn" onClick={() => setCreating(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="btn primary big" onClick={() => setCreating(true)}>
            + New sheet
          </button>
        )}

        {sheets && sheets.length === 0 && !creating && (
          <p className="empty-hint">
            No sheets yet. Create one for the week, then snap a photo of your paper log or add
            loads by hand.
          </p>
        )}

        <ul className="sheet-list">
          {sheets?.map((s) => (
            <SheetItem key={s.id} sheet={s} total={totals?.[s.id] ?? 0} onOpen={onOpen} />
          ))}
        </ul>

        {archived.length > 0 && (
          <details className="archive-section">
            <summary>
              Archived <span className="muted">({archived.length})</span>
            </summary>
            <ul className="sheet-list">
              {archived.map((s) => (
                <SheetItem key={s.id} sheet={s} total={totals?.[s.id] ?? 0} onOpen={onOpen} />
              ))}
            </ul>
          </details>
        )}
      </main>
    </div>
  )
}

function SheetItem({
  sheet,
  total,
  onOpen,
}: {
  sheet: Sheet
  total: number
  onOpen: (id: string) => void
}) {
  return (
    <li className="card sheet-item" onClick={() => onOpen(sheet.id)}>
      <div className="sheet-item-info">
        <strong>{sheet.title}</strong>
        <span className="muted">
          {sheet.driver ? `Driver: ${sheet.driver} · ` : ''}
          {new Date(sheet.createdAt).toLocaleDateString()}
        </span>
      </div>
      <div className="sheet-item-side">
        <span className="sheet-total">{money(total)}</span>
        {sheet.archived ? (
          <>
            <button
              className="btn small"
              onClick={(e) => {
                e.stopPropagation()
                setSheetArchived(sheet.id, false)
              }}
            >
              Restore
            </button>
            <button
              className="btn danger small"
              onClick={(e) => {
                e.stopPropagation()
                if (confirm(`Delete "${sheet.title}" and all its loads? This can't be undone.`))
                  deleteSheet(sheet.id)
              }}
            >
              Delete
            </button>
          </>
        ) : (
          <button
            className="btn small"
            title="Move to archive (keeps all data)"
            onClick={(e) => {
              e.stopPropagation()
              setSheetArchived(sheet.id, true)
            }}
          >
            Archive
          </button>
        )}
      </div>
    </li>
  )
}

function defaultTitle(): string {
  return `Week of ${new Date().toLocaleDateString()}`
}
