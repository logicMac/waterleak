import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Poll `fn` every `ms` while the tab is visible.
 * Returns { data, error, loading, refresh }. `loading` is only true before the
 * first successful response — refreshes keep showing the last good data.
 */
export function usePoll(fn, ms, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(true)
  const fnRef = useRef(fn)
  fnRef.current = fn

  const run = useCallback(async () => {
    try {
      const d = await fnRef.current()
      setData(d)
      setError(null)
    } catch (e) {
      setError(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    setLoading(true)
    run()
    const id = setInterval(() => {
      if (!document.hidden) run()
    }, ms)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])

  return { data, error, loading, refresh: run }
}
