import { useCallback, useEffect, useState } from 'react'

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    try {
      localStorage.setItem('lg-theme', dark ? 'dark' : 'light')
    } catch {
      /* private mode — ignore */
    }
  }, [dark])

  const toggle = useCallback(() => {
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const el = document.documentElement
      el.classList.add('theme-animating')
      setTimeout(() => el.classList.remove('theme-animating'), 400)
    }
    setDark((d) => !d)
  }, [])
  return { dark, toggle }
}
