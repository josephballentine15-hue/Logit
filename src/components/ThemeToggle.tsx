import { useState } from 'react'
import { applyTheme, initialTheme, type Theme } from '../theme'

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(initialTheme)

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    applyTheme(next)
    setTheme(next)
  }

  return (
    <button
      className="btn small theme-toggle"
      onClick={toggle}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      {theme === 'dark' ? '☀' : '☾'}
    </button>
  )
}
