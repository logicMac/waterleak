import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react'

const ToastCtx = createContext(null)

let idSeq = 0

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef({})

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const push = useCallback(
    (message, type = 'info', ms = 5000) => {
      const id = ++idSeq
      setToasts((t) => [...t.slice(-3), { id, message, type }])
      timers.current[id] = setTimeout(() => dismiss(id), ms)
    },
    [dismiss]
  )

  const toast = {
    info: (m, ms) => push(m, 'info', ms),
    success: (m, ms) => push(m, 'success', ms),
    error: (m, ms) => push(m, 'error', ms ?? 7000),
  }

  const icons = {
    info: <Info size={16} className="text-primary" />,
    success: <CheckCircle2 size={16} className="text-green-600" />,
    error: <AlertTriangle size={16} className="text-red-600" />,
  }

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        aria-live="polite"
        className="fixed bottom-20 right-4 z-50 flex w-[min(92vw,360px)] flex-col gap-2 md:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="card flex animate-fade-up items-start gap-2.5 border-l-2 border-l-slate-400 p-3 shadow-pop dark:border-l-slate-500"
            style={t.type === 'error' ? { borderLeftColor: '#DC2626' } : t.type === 'success' ? { borderLeftColor: '#16A34A' } : undefined}
          >
            <span className="mt-0.5 shrink-0">{icons[t.type]}</span>
            <p className="flex-1 text-sm leading-5">{t.message}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

export function useToast() {
  return useContext(ToastCtx)
}
