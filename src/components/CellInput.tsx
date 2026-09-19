import { useEffect, useRef } from 'react'
import { registerFlusher } from '../flush'

interface Props {
  value: string
  onCommit: (value: string) => void
  className?: string
  placeholder?: string
  inputMode?: 'decimal'
}

/**
 * Uncontrolled input that auto-saves while typing (debounced) and on blur,
 * and flushes when the page is hidden or the user taps Save — so leaving
 * the site doesn't drop half-typed cells.
 */
export default function CellInput({ value, onCommit, className, placeholder, inputMode }: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const lastCommitted = useRef(value)
  const onCommitRef = useRef(onCommit)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  onCommitRef.current = onCommit

  useEffect(() => {
    const el = ref.current
    if (!el) return
    // Only sync from outside when the field isn't being edited
    if (document.activeElement !== el && value !== lastCommitted.current) {
      el.value = value
      lastCommitted.current = value
    }
  }, [value])

  function commit(raw: string) {
    if (raw === lastCommitted.current) return
    lastCommitted.current = raw
    onCommitRef.current(raw)
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const el = ref.current
    if (el) commit(el.value)
  }

  useEffect(() => {
    const unregister = registerFlusher(flush)
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onHide)
    return () => {
      unregister()
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onHide)
      if (timer.current) clearTimeout(timer.current)
    }
    // flush closes over ref/lastCommitted; intentionally mount-once
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input
      ref={ref}
      defaultValue={value}
      className={className}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => {
        if (timer.current) clearTimeout(timer.current)
        const next = e.target.value
        timer.current = setTimeout(() => commit(next), 400)
      }}
      onBlur={(e) => {
        if (timer.current) {
          clearTimeout(timer.current)
          timer.current = null
        }
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
      }}
    />
  )
}
