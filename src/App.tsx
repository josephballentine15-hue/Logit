import { useEffect, useState } from 'react'
import SheetList from './components/SheetList'
import SheetView from './components/SheetView'

export default function App() {
  const [sheetId, setSheetId] = useState<string | null>(
    () => localStorage.getItem('logit:lastSheet'),
  )

  useEffect(() => {
    if (sheetId) localStorage.setItem('logit:lastSheet', sheetId)
    else localStorage.removeItem('logit:lastSheet')
  }, [sheetId])

  return sheetId ? (
    <SheetView sheetId={sheetId} onBack={() => setSheetId(null)} />
  ) : (
    <SheetList onOpen={setSheetId} />
  )
}
