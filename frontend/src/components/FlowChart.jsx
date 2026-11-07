import { useMemo } from 'react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea,
} from 'recharts'
import { fmtTime, fmtDateTime, fmtLpm } from '../utils/format'
import { EmptyState, Skeleton } from './States'

/**
 * Live flow for both zones. Zone 1 carries the accent hue, Zone 2 a neutral
 * slate; tripped spans are shaded behind the lines.
 */
export default function FlowChart({ points, range, loading, error, onRetry }) {
  const data = useMemo(
    () =>
      (points || []).map((p) => ({
        ...p,
        z1_trip: p.z1_tripped ? 1 : 0,
        z2_trip: p.z2_tripped ? 1 : 0,
      })),
    [points]
  )

  const tickFmt = (t) => {
    if (range === '7d') return fmtDateTime(t).split(',').slice(0, 1).join('')
    return fmtTime(t)
  }

  return (
    <section className="card p-5" aria-label="Live flow chart">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Live flow</h2>
        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-primary" /> Zone 1
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-[3px] w-4 rounded-full bg-slate-400 dark:bg-slate-500" /> Zone 2
          </span>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-[220px] w-full" />
      ) : error && !data.length ? (
        <div className="flex h-[220px] items-center justify-center">
          <EmptyState title="Could not load readings" hint="Retry in a moment" />
        </div>
      ) : !data.length ? (
        <div className="flex h-[220px] items-center justify-center">
          <EmptyState title="No readings in this range" hint="The device posts a report every 5 seconds" />
        </div>
      ) : (
        <div className="h-[220px] w-full">
          <ResponsiveContainer>
            <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -14 }}>
              <CartesianGrid vertical={false} stroke="currentColor" className="text-slate-200 dark:text-slate-700" strokeOpacity={0.7} />
              <XAxis
                dataKey="t"
                tickFormatter={tickFmt}
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-slate-400"
                tickLine={false}
                axisLine={false}
                minTickGap={48}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="currentColor"
                className="text-slate-400"
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => Number(v).toFixed(v >= 10 ? 0 : 1)}
                domain={[0, 'auto']}
              />
              <Tooltip
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <div className="card !rounded-lg px-3 py-2 text-xs shadow-pop">
                      <p className="mb-1 text-slate-500 dark:text-slate-400">{fmtDateTime(label)}</p>
                      {payload.map((p) => (
                        <p key={p.dataKey} className="num flex items-center gap-2">
                          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
                          {p.name}: {fmtLpm(p.value)} L/min
                        </p>
                      ))}
                    </div>
                  ) : null
                }
              />
              {/* shaded spans where a zone was tripped */}
              {data.map((p, i) =>
                p.z1_tripped || p.z2_tripped ? (
                  <ReferenceArea key={i} x1={p.t} x2={data[i + 1]?.t ?? p.t} fill="#DC2626" fillOpacity={0.06} />
                ) : null
              )}
              <Line type="linear" dataKey="z1_flow" name="Zone 1" stroke="#0EA5E9" strokeWidth={2} dot={false} isAnimationActive={false} />
              <Line type="linear" dataKey="z2_flow" name="Zone 2" stroke="#94A3B8" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}
