import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import ZoneCard from '../components/ZoneCard'
import FlowChart from '../components/FlowChart'
import ValvePanel from '../components/ValvePanel'
import AlertBanner from '../components/AlertBanner'
import ActivityFeed from '../components/ActivityFeed'
import KpiStrip from '../components/KpiStrip'
import SignalBars from '../components/SignalBars'
import { OnlineBadge } from '../components/Badge'
import { PageHeader, Skeleton } from '../components/States'
import { relTime } from '../utils/format'

const RANGES = [
  { id: '15m', label: '15 min' },
  { id: '1h', label: '1 hour' },
  { id: '24h', label: '24 hours' },
]

export default function Dashboard() {
  const { user } = useAuth()
  const toast = useToast()
  const isAdmin = user?.role === 'admin'
  const [range, setRange] = useState('15m')
  const [status, setStatus] = useState(null)
  const seenAlertIds = useRef(new Set())

  const statusPoll = usePoll(() => api.get('/admin/status'), 3000, [])
  const readingsPoll = usePoll(
    () => api.get(`/admin/readings?range=${range}`),
    range === '15m' ? 3000 : 15000,
    [range]
  )
  const logsPoll = usePoll(() => api.get('/admin/logs?page=1'), 8000, [])

  useEffect(() => {
    if (statusPoll.data) setStatus(statusPoll.data)
  }, [statusPoll.data])

  // Toast + optional browser notification on a *new* active alert.
  useEffect(() => {
    const alerts = status?.alerts ?? []
    for (const a of alerts) {
      if (!seenAlertIds.current.has(a.id)) {
        seenAlertIds.current.add(a.id)
        if (seenAlertIds.current.size > 0 && status) {
          toast.error(`Zone ${a.zone} tripped — ${a.reason} at ${Number(a.flow_lpm).toFixed(2)} L/min`, 9000)
          try {
            if (Notification?.permission === 'granted') {
              new Notification('LeakGuard alert', {
                body: `Zone ${a.zone} ${a.reason} — valve closed`,
              })
            }
          } catch { /* Notification unsupported */ }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.alerts])

  const loading = statusPoll.loading && !status
  const online = status?.online ?? false
  const isAdminRole = user?.role === 'admin'

  return (
    <>
      <PageHeader
        title="Control Center"
        sub={status?.device ? `${status.device.name} · ${status.device.location ?? ''}` : 'Waiting for device data'}
      >
        {status && (
          <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
            <SignalBars rssi={status.rssi} />
            <span className="num hidden sm:inline">{status.rssi ?? '—'} dBm</span>
            <OnlineBadge online={online} />
          </div>
        )}
      </PageHeader>

      {/* status strip */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
        {loading ? (
          <Skeleton className="h-4 w-64" />
        ) : (
          <>
            <span>
              Last seen:{' '}
              <span className="num font-medium text-slate-700 dark:text-slate-200">
                {status?.last_seen ? relTime(status.last_seen) : 'never'}
              </span>
            </span>
            <span>
              Valve:{' '}
              <span className={`font-medium ${status?.valve_open ? 'text-green-700 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                {status ? (status.valve_open ? 'Open' : 'Closed') : '—'}
              </span>
            </span>
            {!online && status && (
              <span className="rounded bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                Showing last known readings — device offline
              </span>
            )}
          </>
        )}
      </div>

      <AlertBanner alerts={status?.alerts} onChanged={statusPoll.refresh} />

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {loading ? (
          <>
            <Skeleton className="h-[148px]" />
            <Skeleton className="h-[148px]" />
          </>
        ) : (
          status?.zones?.map((z) => <ZoneCard key={z.zone} zone={z} online={online} />)
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <div className="mb-2 flex items-center gap-1 rounded-lg bg-slate-200/60 p-1 dark:bg-slate-800 sm:w-fit" role="tablist" aria-label="Chart range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                onClick={() => setRange(r.id)}
                className={`h-7 flex-1 rounded-md px-3 text-xs font-medium sm:flex-none ${
                  range === r.id
                    ? 'bg-white text-navy shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-navy dark:text-slate-400 dark:hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <FlowChart
            points={readingsPoll.data?.points}
            range={range}
            loading={readingsPoll.loading}
            error={readingsPoll.error}
            onRetry={readingsPoll.refresh}
          />
        </div>
        <ValvePanel status={status} isAdmin={isAdminRole} onChanged={setStatus} />
      </div>

      <div className="mt-4">
        <KpiStrip today={status?.today} online={online} />
      </div>

      <div className="mt-4">
        <ActivityFeed
          rows={logsPoll.data?.rows?.slice(0, 10)}
          loading={logsPoll.loading}
          error={logsPoll.error}
          onRetry={logsPoll.refresh}
        />
      </div>
    </>
  )
}
