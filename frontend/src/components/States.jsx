import { AlertTriangle, Inbox } from 'lucide-react'

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} aria-hidden="true" />
}

export function EmptyState({ title, hint, icon }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
      <span className="text-slate-400 dark:text-slate-500">{icon ?? <Inbox size={20} />}</span>
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{title}</p>
      {hint && <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

export function ErrorState({ onRetry, label = 'Could not load this section' }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-4 py-4 text-sm text-slate-600 dark:border-slate-700 dark:text-slate-300">
      <AlertTriangle size={15} className="shrink-0 text-amber-500" />
      <span className="flex-1">{label}.</span>
      {onRetry && (
        <button onClick={onRetry} className="font-medium text-primary hover:underline">
          Retry
        </button>
      )}
    </div>
  )
}

export function PageHeader({ title, sub, children }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{sub}</p>}
      </div>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  )
}
