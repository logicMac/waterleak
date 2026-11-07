import { Droplets, ShieldAlert, ShieldCheck } from 'lucide-react'
import Badge from './Badge'
import { fmtLpm, fmtL } from '../utils/format'

/**
 * Live state for one monitored zone. When tripped the card takes a red border
 * and a soft pulsing glow so the compromised zone is instantly obvious;
 * when the device is offline the figures are greyed and never shown as live.
 */
export default function ZoneCard({ zone, online }) {
  const tripped = online && zone.tripped
  const stale = !online

  return (
    <section
      aria-label={`Zone ${zone.zone} status`}
      className={`card p-5 transition-colors ${
        tripped
          ? 'border-red-400 animate-trip-pulse dark:border-red-500'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Droplets size={16} className={zone.zone === 1 ? 'text-primary' : 'text-slate-400 dark:text-slate-500'} />
          <h2 className="text-sm font-semibold">Zone {zone.zone}</h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {zone.zone === 1 ? 'Main line' : 'Secondary line'}
          </span>
        </div>
        {tripped ? (
          <Badge tone="red" icon={<ShieldAlert size={12} />}>
            Tripped{zone.reason ? `: ${zone.reason}` : ''}
          </Badge>
        ) : (
          <Badge tone={stale ? 'slate' : 'green'} icon={<ShieldCheck size={12} />}>
            {stale ? 'No live data' : 'Normal'}
          </Badge>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-slate-500 dark:text-slate-400">Flow rate</p>
          <p
            className={`num mt-0.5 text-4xl font-semibold leading-none ${
              stale ? 'text-slate-400 dark:text-slate-500' : tripped ? 'text-red-600 dark:text-red-400' : ''
            }`}
          >
            {stale ? <span className="opacity-70">{fmtLpm(zone.flow_lpm)}</span> : fmtLpm(zone.flow_lpm)}
            <span className="ml-1.5 text-sm font-normal text-slate-400 dark:text-slate-500">L/min</span>
          </p>
          {stale && (
            <p className="mt-1 text-xs italic text-slate-400 dark:text-slate-500">last reading before offline</p>
          )}
        </div>
        <div className="text-right">
          <p className="text-xs text-slate-500 dark:text-slate-400">Since boot</p>
          <p className={`num mt-0.5 text-xl font-medium ${stale ? 'text-slate-400 dark:text-slate-500' : ''}`}>
            {fmtL(zone.total_l)}
            <span className="ml-1 text-xs font-normal text-slate-400 dark:text-slate-500">L</span>
          </p>
        </div>
      </div>
    </section>
  )
}
