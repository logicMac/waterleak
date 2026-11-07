import { CheckCircle2, AlertTriangle, Clock, Wifi, WifiOff } from 'lucide-react'

const STYLES = {
  green: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  red: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  blue: 'bg-primary-100 text-primary-700 dark:bg-sky-950 dark:text-sky-300',
}

export default function Badge({ tone = 'slate', icon = null, children }) {
  return (
    <span className={`pill ${STYLES[tone]}`}>
      {icon}
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const map = {
    active: { tone: 'red', label: 'Active', icon: <AlertTriangle size={12} /> },
    acknowledged: { tone: 'amber', label: 'Acknowledged', icon: <Clock size={12} /> },
    resolved: { tone: 'green', label: 'Resolved', icon: <CheckCircle2 size={12} /> },
  }
  const s = map[status] || { tone: 'slate', label: status }
  return <Badge tone={s.tone} icon={s.icon}>{s.label}</Badge>
}

export function OnlineBadge({ online }) {
  return online ? (
    <Badge tone="green" icon={<Wifi size={12} />}>Online</Badge>
  ) : (
    <Badge tone="amber" icon={<WifiOff size={12} />}>Offline</Badge>
  )
}
