// Device timestamps are "YYYY-MM-DD HH:MM:SS" in Asia/Manila (no timezone).
// Parse them as UTC+8 wall time so they display correctly in any browser TZ.

export function parseTs(s) {
  if (!s) return null
  const [d, t] = s.split(' ')
  if (!d || !t) return null
  const [Y, M, D] = d.split('-').map(Number)
  const [h, m, sec] = t.split(':').map(Number)
  return new Date(Date.UTC(Y, M - 1, D, h - 8, m, sec))
}

const dtFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const dtFullFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
})
const timeFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})
const dateFmt = new Intl.DateTimeFormat('en-PH', {
  timeZone: 'Asia/Manila',
  month: 'short',
  day: 'numeric',
})

export const fmtDateTime = (s) => (s ? dtFmt.format(parseTs(s)) : '—')
export const fmtDateTimeFull = (s) => (s ? dtFullFmt.format(parseTs(s)) : '—')
export const fmtTime = (s) => (s ? timeFmt.format(parseTs(s)) : '—')
export const fmtDateShort = (s) => (s ? dateFmt.format(parseTs(s + ' 00:00:00')) : '—')

export function relTime(s) {
  const d = parseTs(s)
  if (!d) return 'never'
  const sec = Math.max(0, Math.round((Date.now() - d.getTime()) / 1000))
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec} s ago`
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`
  return fmtDateTime(s)
}

export const fmtLpm = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const fmtL = (n) =>
  n == null ? '—' : Number(n).toLocaleString('en-PH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
export const fmtInt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-PH'))

export function rssiBars(rssi) {
  if (rssi == null) return 0
  if (rssi >= -55) return 4
  if (rssi >= -65) return 3
  if (rssi >= -75) return 2
  if (rssi >= -85) return 1
  return 0
}

export const todayPH = () => {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  return d.toISOString().slice(0, 10)
}
export const daysAgoPH = (n) => {
  const d = new Date(Date.now() + 8 * 3600 * 1000 - n * 86400 * 1000)
  return d.toISOString().slice(0, 10)
}
