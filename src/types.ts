/** How the driver gets paid: percent of load rates, per mile, or hourly */
export type PayType = 'percent' | 'mile' | 'hour'

/** Columns the user can hide to fit their kind of trucking */
export type ToggleCol = 'container' | 'chassis' | 'from' | 'to' | 'rate' | 'notes'

export interface Sheet {
  id: string
  title: string
  driver: string
  /** Driver's percentage of the gross, e.g. 40 */
  percent: number
  /** Defaults to 'percent' when missing (older sheets) */
  payType?: PayType
  /** Dollars per mile or per hour, used when payType is 'mile' or 'hour' */
  payRate?: number
  /** Show the Miles column even when not paid per mile */
  showMiles?: boolean
  /** Columns hidden by the user in sheet settings */
  hiddenCols?: ToggleCol[]
  createdAt: number
  /** Archived sheets are hidden from the main list but kept forever */
  archived?: boolean
}

export interface LoadRow {
  id: string
  sheetId: string
  order: number
  /** Divider rows split the sheet into weeks; their label lives in `date` */
  kind?: 'divider'
  date: string
  container: string
  chassis: string
  from: string
  to: string
  /** Dollars; negative values allowed for adjustments */
  rate: number | null
  miles?: number | null
  hours?: number | null
  notes: string
}

export interface Deduction {
  id: string
  sheetId: string
  label: string
  amount: number
}

/** Extra pay on top of the driver's cut (bonus, detention, layover…) */
export interface Extra {
  id: string
  sheetId: string
  label: string
  amount: number
}

export interface ScanPhoto {
  id: string
  sheetId: string
  blob: Blob
  createdAt: number
}

/** A row extracted from a photo, before the user confirms it */
export interface ParsedRow {
  date: string
  container: string
  chassis: string
  from: string
  to: string
  rate: number | null
  notes: string
  include: boolean
}
