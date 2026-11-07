import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export default function Modal({ open, onClose, title, children, wide = false }) {
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    ref.current?.querySelector('input, select, button:not([data-close])')?.focus()
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-navy/40 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}
    >
      <div
        ref={ref}
        data-lenis-prevent
        className={`card max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 shadow-pop animate-fade-up sm:rounded-b-card ${
          wide ? 'sm:max-w-2xl' : 'sm:max-w-md'
        }`}
      >
        <div className="mb-4 flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            data-close
            aria-label="Close dialog"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmModal({ open, onClose, onConfirm, title, body, confirmLabel, danger = false, busy = false }) {
  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={title}>
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{body}</p>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className={danger ? 'btn-danger' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Sending…' : confirmLabel}
        </button>
      </div>
    </Modal>
  )
}
