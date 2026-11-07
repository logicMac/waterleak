import { rssiBars } from '../utils/format'

/** Wi-Fi signal bars derived from RSSI (dBm). */
export default function SignalBars({ rssi }) {
  const bars = rssiBars(rssi)
  return (
    <span className="inline-flex items-end gap-[2px]" role="img" aria-label={`Signal ${rssi ?? '—'} dBm`}>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`w-[3px] rounded-sm ${i <= bars ? 'bg-primary' : 'bg-slate-300 dark:bg-slate-600'}`}
          style={{ height: `${4 + i * 3}px` }}
        />
      ))}
    </span>
  )
}
