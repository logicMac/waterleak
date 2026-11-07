import { Link } from 'react-router-dom'
import { Siren } from 'lucide-react'
import { fmtDateTime, fmtLpm } from '../utils/format'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'

/**
 * Persistent banner while any alert is active (a zone tripped).
 * Acknowledge marks it seen; the trip itself clears on reset.
 */
export default function AlertBanner({ alerts, onChanged }) {
  const toast = useToast()
  if (!alerts?.length) return null
  const a = alerts[0]

  const ack = async () => {
    try {
      await api.post(`/admin/alerts/${a.id}/acknowledge`)
      toast.success('Alert acknowledged')
      onChanged?.()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div
      role="alert"
      className="card flex flex-wrap items-center gap-3 border-red-300 bg-red-50 px-4 py-3 dark:border-red-900 dark:bg-red-950/50"
    >
      <Siren size={18} className="shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-red-800 dark:text-red-200">
          Zone {a.zone} tripped — {a.reason}
        </p>
        <p className="text-xs text-red-700/80 dark:text-red-300/80">
          {fmtLpm(a.flow_lpm)} L/min at {fmtDateTime(a.occurred_at)} · valve closed automatically
        </p>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={ack} className="btn h-8 border border-red-300 bg-white px-3 text-xs text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-transparent dark:text-red-300 dark:hover:bg-red-900/50">
          Acknowledge
        </button>
        <Link to="/alerts" className="btn h-8 px-3 text-xs font-medium text-red-700 underline-offset-2 hover:underline dark:text-red-300">
          View alerts
        </Link>
      </div>
    </div>
  )
}
