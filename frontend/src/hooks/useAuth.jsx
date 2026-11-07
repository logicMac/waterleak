import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, setCsrf } from '../api/client'

const AuthCtx = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api
      .get('/admin/auth/me')
      .then((d) => {
        setUser(d.user)
        setCsrf(d.csrf_token)
      })
      .catch(() => setUser(null))
      .finally(() => setReady(true))
  }, [])

  const login = useCallback(async (email, password) => {
    const d = await api.post('/admin/auth/login', { email, password })
    setUser(d.user)
    setCsrf(d.csrf_token)
    return d.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await api.post('/admin/auth/logout')
    } finally {
      setUser(null)
      setCsrf(null)
    }
  }, [])

  return <AuthCtx.Provider value={{ user, ready, login, logout }}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  return useContext(AuthCtx)
}
