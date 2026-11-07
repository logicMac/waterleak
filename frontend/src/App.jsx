import { useEffect } from 'react'
import Lenis from 'lenis'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './hooks/useAuth'
import { ToastProvider } from './hooks/useToast'
import AppLayout from './layouts/AppLayout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Alerts from './pages/Alerts'
import Reports from './pages/Reports'
import Logs from './pages/Logs'
import Settings from './pages/Settings'
import About from './pages/About'

function Protected() {
  const { user, ready } = useAuth()
  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-primary" aria-label="Loading" />
      </div>
    )
  }
  return user ? <AppLayout /> : <Navigate to="/login" replace />
}

// Smooth scrolling on every page; disabled when the user prefers reduced motion.
function SmoothScroll() {
  useEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches
    const lenis = new Lenis({ lerp: 0.12, smoothWheel: !reduced })
    let raf
    const loop = (time) => {
      lenis.raf(time)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      lenis.destroy()
    }
  }, [])
  return null
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <SmoothScroll />
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/alerts" element={<Alerts />} />
              <Route path="/reports" element={<Reports />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/about" element={<About />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
