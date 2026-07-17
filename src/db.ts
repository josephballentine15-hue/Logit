import Dexie, { type EntityTable } from 'dexie'
import type { Sheet, LoadRow, Deduction, Extra, ScanPhoto } from './types'

const db = new Dexie('logit') as Dexie & {
  sheets: EntityTable<Sheet, 'id'>
  rows: EntityTable<LoadRow, 'id'>
  deductions: EntityTable<Deduction, 'id'>
  extras: EntityTable<Extra, 'id'>
  photos: EntityTable<ScanPhoto, 'id'>
}

db.version(1).stores({
  sheets: 'id, createdAt',
  rows: 'id, sheetId, order',
  deductions: 'id, sheetId',
  photos: 'id, sheetId, createdAt',
})

db.version(2).stores({
  extras: 'id, sheetId',
})

export function uid(): string {
  return crypto.randomUUID()
}

export async function createSheet(title: string, driver: string): Promise<string> {
  const id = uid()
  // Inherit setup (pay type, columns…) from the newest sheet so drivers
  // only have to configure things once
  const prev = await db.sheets.orderBy('createdAt').reverse().first()
  await db.sheets.add({
    id,
    title,
    driver,
    percent: prev?.percent ?? 100,
    payType: prev?.payType,
    payRate: prev?.payRate,
    showMiles: prev?.showMiles,
    hiddenCols: prev?.hiddenCols,
    createdAt: Date.now(),
  })
  return id
}

export async function setSheetArchived(id: string, archived: boolean): Promise<void> {
  await db.sheets.update(id, { archived })
}

export async function deleteSheet(id: string): Promise<void> {
  await db.transaction(
    'rw',
    [db.sheets, db.rows, db.deductions, db.extras, db.photos],
    async () => {
      await db.rows.where('sheetId').equals(id).delete()
      await db.deductions.where('sheetId').equals(id).delete()
      await db.extras.where('sheetId').equals(id).delete()
      await db.photos.where('sheetId').equals(id).delete()
      await db.sheets.delete(id)
    },
  )
}

export async function addEmptyRow(sheetId: string, order: number): Promise<void> {
  await db.rows.add({
    id: uid(),
    sheetId,
    order,
    date: '',
    container: '',
    chassis: '',
    from: '',
    to: '',
    rate: null,
    notes: '',
  })
}

export async function addWeekDivider(sheetId: string, order: number): Promise<void> {
  const label = `Week of ${new Date().toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
  })}`
  await db.rows.add({
    id: uid(),
    sheetId,
    order,
    kind: 'divider',
    date: label,
    container: '',
    chassis: '',
    from: '',
    to: '',
    rate: null,
    notes: '',
  })
}

export { db }
