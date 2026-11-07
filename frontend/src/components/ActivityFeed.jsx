import { Link } from 'react-router-dom'
import {
  Siren, RotateCcw, Lock, LockOpen, TerminalSquare, Info, LogIn,
} from 'lucide-react'
import { relTime } from '../utils/format'
import { EmptyState, ErrorState, Skeleton } from './States'

const ICONS = {
  alert: <Siren size={14} className="text-red-500" />,
  reset: <RotateCcw size={14} className="text-amber-500" />,
  valve_closed: <Lock size={14} className="text-red-500" />,
  valve_opened: <LockOpen size={14} className="text-green-600" />,
  command: <TerminalSquare size={14} className="text-primary" />,
  system: <Info size={14} className="text-slate-400" />,
  login: <LogIn size={14} className="text-slate-400" />,
}

export default function ActivityFeed({ rows, loading, error, onRetry }) {
  return (
    <section className="card p-5" aria-label="Recent activity">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Activity</h2>
        <Link to="/logs" className="text-xs font-medium text-primary hover:underline">
          View all
        </Link>
      </div>
      {loading ? (
        <ul className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <li key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-4 rounded-full" />
              <Skeleton className="h-4 flex-1" />
              <Skeleton className="h-3 w-12" />
            </li>
          ))}
        </ul>
      ) : error && !rows?.length ? (
        <ErrorState onRetry={onRetry} label="Could not load activity" />
      ) : !rows?.length ? (
        <EmptyState title="No activity yet" hint="Device events and commands appear here" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-2.5">
              <span className="shrink-0">{ICONS[r.type] ?? ICONS.system}</span>
              <p className="min-w-0 flex-1 truncate text-sm text-slate-700 dark:text-slate-200" title={r.message}>
                {r.message}
              </p>
              <time className="num shrink-0 text-xs text-slate-400 dark:text-slate-500">
                {relTime(r.occurred_at)}
              </time>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
