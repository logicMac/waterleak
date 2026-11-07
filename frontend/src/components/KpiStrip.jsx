import { fmtL, fmtLpm, fmtInt } from '../utils/format'

/**
 * Today's figures — one container split by hairlines (not four icon tiles).
 */
export default function KpiStrip({ today, online }) {
  const cells = [
    { label: 'Zone 1 today', value: fmtL(today?.z1_l), unit: 'L' },
    { label: 'Zone 2 today', value: fmtL(today?.z2_l), unit: 'L' },
    { label: 'Peak flow today', value: fmtLpm(today?.peak_lpm), unit: 'L/min' },
    { label: 'Trips today', value: fmtInt(today?.trips), unit: '' },
  ]
  return (
    <section
      aria-label="Today's totals"
      className={`card grid grid-cols-2 divide-x divide-y divide-slate-100 dark:divide-slate-800 sm:grid-cols-4 sm:divide-y-0 ${
        !online ? 'opacity-80' : ''
      }`}
    >
      {cells.map((c) => (
        <div key={c.label} className="px-5 py-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">{c.label}</p>
          <p className="num mt-1 text-2xl font-medium">
            {c.value}
            {c.unit && <span className="ml-1 text-sm font-normal text-slate-400 dark:text-slate-500">{c.unit}</span>}
          </p>
        </div>
      ))}
    </section>
  )
}
