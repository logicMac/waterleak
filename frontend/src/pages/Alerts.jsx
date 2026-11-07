import { useMemo, useState } from 'react'
import { Download, X } from 'lucide-react'
import { api } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { useToast } from '../hooks/useToast'
import { PageHeader, EmptyState, ErrorState, Skeleton } from '../components/States'
import { StatusBadge } from '../components/Badge'
import Pagination from '../components/Pagination'
import { fmtDateTimeFull, fmtDateTime, fmtLpm, relTime } from '../utils/format'

const TYPE_LABEL = {
  'NIGHT FLOW': 'Night flow',
  'LONG FLOW': 'Long flow',
  'BURST RATE': 'Burst rate',
}

export default function Alerts() {
  const toast = useToast()
  const [filters, setFilters] = useState({ status: '', zone: '', from: '', to: '' })
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState(null)

  const qs = useMemo(() => {
    const p = new URLSearchParams()
    Object.entries(filters).forEach(([k, v]) => v && p.set(k, v))
    p.set('page', page)
    return p.toString()
  }, [filters, page])

  const { data, error, loading, refresh } = usePoll(() => api.get(`/admin/alerts?${qs}`), 8000, [qs])
  const rows = data?.rows ?? []

  const set = (k) => (e) => {
    setPage(1)
    setFilters((f) => ({ ...f, [k]: e.target.value }))
  }

  const acknowledge = async (a) => {
    try {
      await api.post(`/admin/alerts/${a.id}/acknowledge`)
      toast.success(`Alert #${a.id} acknowledged`)
      setSelected(null)
      refresh()
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <>
      <PageHeader title="Alerts" sub="Every leak trip recorded by the device">
        <a href={`/api/admin/alerts/export.csv?${qs.replace(/&?page=\d+/, '')}`} className="btn-secondary" download>
          <Download size={15} /> Export CSV
        </a>
      </PageHeader>

      {/* filters */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <select className="input !h-9 sm:w-40" value={filters.status} onChange={set('status')} aria-label="Filter by status">
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
        </select>
        <select className="input !h-9 sm:w-32" value={filters.zone} onChange={set('zone')} aria-label="Filter by zone">
          <option value="">All zones</option>
          <option value="1">Zone 1</option>
          <option value="2">Zone 2</option>
        </select>
        <input type="date" className="input !h-9 sm:w-40" value={filters.from} onChange={set('from')} aria-label="From date" />
        <input type="date" className="input !h-9 sm:w-40" value={filters.to} onChange={set('to')} aria-label="To date" />
      </div>

      <div className="card overflow-hidden">
        {loading ? (
          <div className="space-y-2 p-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : error && !rows.length ? (
          <div className="p-4"><ErrorState onRetry={refresh} label="Could not load alerts" /></div>
        ) : !rows.length ? (
          <div className="p-4"><EmptyState title="No alerts match these filters" hint="Trips appear here the moment the device reports them" /></div>
        ) : (
          <>
            {/* desktop table */}
            <table className="hidden w-full md:table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800">
                  <th className="th">Time</th>
                  <th className="th">Zone</th>
                  <th className="th">Reason</th>
                  <th className="th text-right">Flow</th>
                  <th className="th">Status</th>
                  <th className="th">Acknowledged by</th>
                  <th className="th"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 dark:divide-slate-800/60">
                {rows.map((a) => (
                  <tr key={a.id} className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" onClick={() => setSelected(a)}>
                    <td className="td num whitespace-nowrap">{fmtDateTime(a.occurred_at)}</td>
                    <td className="td num">Zone {a.zone}</td>
                    <td className="td">{TYPE_LABEL[a.reason] ?? a.reason}</td>
                    <td className="td num text-right">{fmtLpm(a.flow_lpm)} L/min</td>
                    <td className="td"><StatusBadge status={a.status} /></td>
                    <td className="td text-slate-500 dark:text-slate-400">{a.acknowledged_by_name ?? '—'}</td>
                    <td className="td text-right text-xs font-medium text-primary">Details</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* mobile cards */}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800 md:hidden">
              {rows.map((a) => (
                <li key={a.id}>
                  <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setSelected(a)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Zone {a.zone} · {TYPE_LABEL[a.reason] ?? a.reason}</p>
                      <p className="num mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                        {fmtDateTime(a.occurred_at)} · {fmtLpm(a.flow_lpm)} L/min
                      </p>
                    </div>
                    <StatusBadge status={a.status} />
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={data.page} pages={data.pages} total={data.total} onPage={setPage} />
          </>
        )}
      </div>

      {/* detail drawer */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-navy/40" role="dialog" aria-modal="true" aria-label="Alert detail" onMouseDown={(e) => e.target === e.currentTarget && setSelected(null)}>
          <div data-lenis-prevent className="absolute inset-y-0 right-0 w-full max-w-sm overflow-y-auto bg-white p-5 shadow-pop animate-fade-up dark:bg-navy sm:border-l sm:border-slate-200 dark:sm:border-slate-800">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold">Zone {selected.zone} — {TYPE_LABEL[selected.reason] ?? selected.reason}</h2>
                <p className="num mt-0.5 text-sm text-slate-500 dark:text-slate-400">{fmtDateTimeFull(selected.occurred_at)}</p>
              </div>
              <button onClick={() => setSelected(null)} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>

            <div className="mt-4"><StatusBadge status={selected.status} /></div>

            <dl className="mt-5 space-y-3 text-sm">
              {[
                ['Flow when tripped', `${fmtLpm(selected.flow_lpm)} L/min`],
                ['Device', selected.device_id],
                ['Acknowledged by', selected.acknowledged_by_name ?? '—'],
                ['Resolved at', selected.resolved_at ? fmtDateTimeFull(selected.resolved_at) : '—'],
                ['Resolved via', selected.resolved_source ?? '—'],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4">
                  <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                  <dd className="num text-right font-medium">{v}</dd>
                </div>
              ))}
            </dl>

            {selected.status === 'active' && (
              <button className="btn-primary mt-6 w-full" onClick={() => acknowledge(selected)}>
                Acknowledge alert
              </button>
            )}
            <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
              Acknowledging marks the alert as seen by staff. The zone stays tripped until the device is reset.
            </p>
          </div>
        </div>
      )}
    </>
  )
}
