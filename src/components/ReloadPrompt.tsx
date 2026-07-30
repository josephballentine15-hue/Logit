import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'

/** Banner when a new Logit version is ready — tap to load it. */
export default function ReloadPrompt() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [update, setUpdate] = useState<((reload?: boolean) => Promise<void>) | null>(null)

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true)
      },
      onRegisteredSW(_url, registration) {
        // Recheck for updates when the app is opened / comes back online
        if (!registration) return
        const check = () => registration.update().catch(() => {})
        check()
        setInterval(check, 60 * 1000)
        window.addEventListener('focus', check)
        window.addEventListener('online', check)
      },
    })
    setUpdate(() => updateSW)
  }, [])

  if (!needRefresh) return null

  return (
    <div className="update-banner" role="status">
      <span>New Logit version ready</span>
      <button
        className="btn primary small"
        onClick={() => update?.(true)}
      >
        Update now
      </button>
    </div>
  )
}
