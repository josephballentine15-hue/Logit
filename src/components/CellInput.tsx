import { useEffect, useRef, useState } from 'react'
import { registerFlusher } from '../flush'

interface Props {
  value: string
  onCommit: (value: string) => void
  className?: string
  placeholder?: string
  inputMode?: 'decimal'
  /** Show and save uppercase (container / chassis IDs). */
  autoUppercase?: boolean
}

/**
 * Local-state input so typed characters always show immediately.
 * Auto-saves while typing (debounced) and on blur, and flushes when the
 * page is hidden or the user taps Save.
 */
export default function CellInput({
  value,
  onCommit,
  className,
  placeholder,
  inputMode,
  autoUppercase,
}: Props) {
  const ref = useRef<HTMLInputElement>(null)
  const [local, setLocal] = useState(value)
  const localRef = useRef(value)
  const lastCommitted = useRef(value)
  const onCommitRef = useRef(onCommit)
  const autoUpperRef = useRef(!!autoUppercase)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focused = useRef(false)

  onCommitRef.current = onCommit
  autoUpperRef.current = !!autoUppercase
  localRef.current = local

  useEffect(() => {
    // Only sync from outside when the field isn't being edited
    if (!focused.current && value !== lastCommitted.current) {
      setLocal(value)
      localRef.current = value
      lastCommitted.current = value
    }
  }, [value])

  function commit(raw: string) {
    const next = autoUpperRef.current ? raw.toUpperCase() : raw
    if (next === lastCommitted.current) return
    lastCommitted.current = next
    onCommitRef.current(next)
  }

  function flush() {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    commit(localRef.current)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <input
      ref={ref}
      value={local}
      className={className}
      placeholder={placeholder}
      inputMode={inputMode}
      autoCapitalize={autoUppercase ? 'characters' : undefined}
      autoCorrect={autoUppercase ? 'off' : undefined}
      spellCheck={autoUppercase ? false : undefined}
      onFocus={() => {
        focused.current = true
      }}
      onChange={(e) => {
        const next = autoUppercase ? e.target.value.toUpperCase() : e.target.value
        setLocal(next)
        localRef.current = next
        if (timer.current) clearTimeout(timer.current)
        timer.current = setTimeout(() => commit(next), 400)
      }}
      onBlur={(e) => {
        focused.current = false
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
