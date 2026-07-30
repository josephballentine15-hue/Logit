import { useEffect, useState } from 'react'
import ReloadPrompt from './components/ReloadPrompt'
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

  return (
    <>
      <ReloadPrompt />
      {sheetId ? (
        <SheetView sheetId={sheetId} onBack={() => setSheetId(null)} />
      ) : (
        <SheetList onOpen={setSheetId} />
      )}
    </>
  )
}
