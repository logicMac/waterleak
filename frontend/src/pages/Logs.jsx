import { useMemo, useState } from 'react'
import { Download, Search } from 'lucide-react'
import { api } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { PageHeader, EmptyState, ErrorState, Skeleton } from '../components/States'
import Badge from '../components/Badge'
import Pagination from '../components/Pagination'
import { fmtDateTime } from '../utils/format'

const TYPES = [
  ['', 'All types'],
  ['alert', 'Alert'],
  ['reset', 'Reset'],
  ['valve_closed', 'Valve closed'],
  ['valve_opened', 'Valve opened'],
  ['command', 'Command'],
  ['system', 'System'],
  ['login', 'Login'],
]

const TYPE_TONE = {
  alert: 'red',
  reset: 'amber',
  valve_closed: 'red',
  valve_opened: 'green',
  command: 'blue',
  system: 'slate',
  login: 'slate',
}

export default function Logs() {
  const [filters, setFilters] = useState({ type: '', from: '', to: '', q: '' })
  const [page, setPage] = useState(1)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v))
    p.set('page', page)
    return p.toString()
  }, [filters, page])

  const { data, error, loading, refresh } = usePoll(() => api.get(`/admin/logs?${qs}`), 8000, [qs])
  const rows = data?.rows ?? []

  const set = (k) => (e) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: e.target.value }))
  }

  return (
    <>
      <PageHeader title="Activity logs" sub="Device events, remote commands and sign-ins">
        <a href={`/api/admin/logs/export.csv?${qs.replace(/&?page=\d+/, '')}`} className="btn-secondary" download>
          <Download size={15} /> Export CSV
        </a>
      </PageHeader>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <div className="relative col-span-2 sm:col-span-1 sm:w-64">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="input !h-9 !pl-9"
            placeholder="Search messages…"
            value={filters.q}
            onChange={set('q')}
            aria-label="Search log messages"
          />
        </div>
        <select className="input !h-9 sm:w-40" value={filters.type} onChange={set('type')} aria-label="Filter by type">
          {TYPES.map(([v, l]) => (
            <option key={v} value={v}>{l}</option>
          ))}
        </select>
        <input type="date" className="input !h-9 sm:w-40" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input type="date" className="input !h-9 sm:w-40" value={filters.to} onChange={set('to')} aria-label="To date" />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : error && !rows.length ? (
          <div className="p-4"><ErrorState onRetry={refresh} label="Could not load logs" /></div>
        ) : !rows.length ? (
          <div className="p-4"><EmptyState title="No log entries match" hint="Alerts, resets and commands are recorded here" /></div>
        ) : (
          <>
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="th">Time</th>
                  <th className="th">Type</th>
                  <th className="th">Source</th>
                  <th className="th">Message</th>
                  <th className="th">User</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="td num whitespace-nowrap">{fmtDateTime(r.occurred_at)}</td>
                    <td className="td"><Badge tone={TYPE_TONE[r.type] ?? 'slate'}>{r.type.replace('_', ' ')}</Badge></td>
                    <td className="td text-slate-500 dark:text-slate-400">{r.source ?? '—'}</td>
                    <td className="td max-w-[420px] truncate" title={r.message}>{r.message}</td>
                    <td className="td text-slate-500 dark:text-slate-400">{r.user_name ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {rows.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone={TYPE_TONE[r.type] ?? 'slate'}>{r.type.replace('_', ' ')}</Badge>
                    <time className="num shrink-0 text-xs text-slate-400">{fmtDateTime(r.occurred_at)}</time>
                  </div>
                  <p className="mt-1.5 text-sm">{r.message}</p>
                  <p className="mt-0.5 text-xs text-slate-400">{r.source ?? ''}{r.user_name ? ` · ${r.user_name}` : ''}</p>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </div>
    </>
  )
}
