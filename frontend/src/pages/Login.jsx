import { useState } from 'react'
import { useNavigate, Navigate } from 'react-router-dom'
import { Droplets, AlertTriangle } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'

export default function Login() {
  const { user, ready, login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  if (ready && user) return <Navigate to="/" replace />

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await login(email.trim(), password)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.status === 429 ? err.message : 'Invalid email or password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-white shadow-card">
            <Droplets size={28} strokeWidth={2.2} />
          </span>
          <h1 className="mt-4 text-2xl font-semibold">LeakGuard</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Water leak detection &amp; alert system — Schola de San Jose, Polomolok
          </p>
        </div>

        <form onSubmit={submit} className="card p-6" noValidate={false}>
          <label htmlFor="email" className="label">Email</label>
          <input
            id="email"
            type="email"
            className="input"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password" className="label mt-4">Password</label>
          <input
            id="password"
            type="password"
            className="input"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-950/60 dark:text-red-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}

          <button type="submit" className="btn-primary mt-5 w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-500">
          Authorized staff and administrators only
        </p>
      </div>
    </div>
  )
}
