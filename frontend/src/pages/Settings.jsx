import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Pencil, Trash2, Wifi, WifiOff, Bell, Cpu, SlidersHorizontal, Users as UsersIcon, Check,
} from 'lucide-react'
import { api } from '../api/client'
import { usePoll } from '../hooks/usePoll'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../hooks/useToast'
import { PageHeader, Skeleton, ErrorState } from '../components/States'
import Badge, { OnlineBadge } from '../components/Badge'
import SignalBars from '../components/SignalBars'
import Modal, { ConfirmModal } from '../components/Modal'
import { fmtDateTime, relTime } from '../utils/format'

const TABS = [
  ['detection', 'Detection', SlidersHorizontal],
  ['connectivity', 'Connectivity', Wifi],
  ['notifications', 'Notifications', Bell],
  ['device', 'Device info', Cpu],
  ['users', 'Users', UsersIcon, 'admin'],
]

const HARDWARE = [
  'ESP32-WROOM-32 microcontroller',
  '2× YF-S201 hall-effect flow sensors (Zone 1 & Zone 2)',
  'Relay-controlled solenoid water valve',
  'SSD1306 0.96″ OLED display + DS1302 RTC',
  'Red LED strobe + buzzer + reset button',
  'SIM900A GSM module — proposed for SMS alerts',
]

export default function Settings() {
  const { user } = useAuth()
  const [tab, setTab] = useState('detection')
  const isAdmin = user?.role === 'admin'
  const visibleTabs = TABS.filter(([, , , role]) => !role || role === user?.role)

  return (
    <>
      <PageHeader title="Settings" sub="Device configuration, connectivity and notifications" />
      <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Settings sections">
        {visibleTabs.map(([id, label, Icon]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-sm ${
              tab === id
                ? 'border-primary font-medium text-navy dark:text-white'
                : 'border-transparent text-slate-500 hover:text-navy dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'detection' && <DetectionTab isAdmin={isAdmin} />}
      {tab === 'connectivity' && <ConnectivityTab />}
      {tab === 'notifications' && <NotificationsTab isAdmin={isAdmin} />}
      {tab === 'device' && <DeviceTab isAdmin={isAdmin} />}
      {tab === 'users' && isAdmin && <UsersTab />}
    </>
  )
}

/* ── shared bits ── */
function useSettings() {
  const { data, error, loading, refresh } = usePoll(() => api.get('/admin/settings'), 60000, [])
  return { settings: data?.settings ?? null, error, loading, refresh }
}

function SaveRow({ onSave, busy, saved, isAdmin }) {
  return (
    <div className="mt-5 flex items-center justify-end gap-3">
      {saved && (
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <Check size={13} /> Saved
        </span>
      )}
      <button className="btn-primary" onClick={onSave} disabled={busy || !isAdmin}>
        {busy ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{hint}</p>}
    </div>
  )
}

/* ── Detection thresholds ── */
function DetectionTab({ isAdmin }) {
  const toast = useToast()
  const { settings, loading } = useSettings()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings && !form) {
      setForm({
        normal_max_lpm: settings['threshold.normal_max_lpm'] ?? '',
        quiet_start: settings['threshold.quiet_start'] ?? '22:00',
        quiet_end: settings['threshold.quiet_end'] ?? '05:00',
        max_continuous_min: settings['threshold.max_continuous_min'] ?? '',
        max_burst_lpm: settings['threshold.max_burst_lpm'] ?? '',
      })
    }
  }, [settings, form])

  if (loading || !form) return <Skeleton className="h-64" />
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const save = async () => {
    setBusy(true)
    try {
      await api.put('/admin/settings', {
        'threshold.normal_max_lpm': Number(form.normal_max_lpm),
        'threshold.quiet_start': form.quiet_start,
        'threshold.quiet_end': form.quiet_end,
        'threshold.max_continuous_min': Number(form.max_continuous_min),
        'threshold.max_burst_lpm': Number(form.max_burst_lpm),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      toast.success('Thresholds saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl">
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Leak detection thresholds</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          The device trips a zone and closes the valve when flow leaves these limits.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Normal flow limit (L/min)" hint="Flow at or below this is normal demand.">
            <input type="number" step="0.1" min="0" className="input" value={form.normal_max_lpm} onChange={set('normal_max_lpm')} />
          </Field>
          <Field label="Max burst rate (L/min)" hint="Instantaneous flow above this trips immediately.">
            <input type="number" step="0.1" min="0" className="input" value={form.max_burst_lpm} onChange={set('max_burst_lpm')} />
          </Field>
          <Field label="Quiet hours start" hint="Any flow inside this window trips (night leak).">
            <input type="time" className="input" value={form.quiet_start} onChange={set('quiet_start')} />
          </Field>
          <Field label="Quiet hours end">
            <input type="time" className="input" value={form.quiet_end} onChange={set('quiet_end')} />
          </Field>
          <Field label="Max continuous flow (minutes)" hint="Uninterrupted flow longer than this trips (long leak).">
            <input type="number" min="1" className="input" value={form.max_continuous_min} onChange={set('max_continuous_min')} />
          </Field>
        </div>
        <SaveRow onSave={save} busy={busy} saved={saved} isAdmin={isAdmin} />
      </section>
      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-800 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-300">
        These values are stored on the server and exposed to the device via <code>GET /api/config</code>.
        The current firmware hard-codes its thresholds (<code>ZoneConfig</code> in <code>leak_logic.h</code>) and does
        not pull them yet — applies to the device once firmware config sync is enabled.
      </p>
    </div>
  )
}

/* ── Connectivity ── */
function ConnectivityTab() {
  const { data: status, loading, refresh } = usePoll(() => api.get('/admin/status'), 5000, [])
  if (loading) return <Skeleton className="h-64" />
  const rows = [
    ['Device', status?.device?.name ?? '—'],
    ['Device ID', status?.device?.device_id ?? '—'],
    ['Status', status ? (status.online ? 'Online' : 'Offline') : '—'],
    ['Last report', status?.last_seen ? relTime(status.last_seen) : 'never'],
    ['Wi-Fi signal (RSSI)', status?.rssi != null ? `${status.rssi} dBm` : '—'],
    ['Connection type', 'HTTP/HTTPS POST, polled commands (1 s)'],
    ['Report cadence', 'Every 5 s'],
  ]
  return (
    <div className="max-w-2xl space-y-4">
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Server link</h2>
          <div className="flex items-center gap-3">
            <SignalBars rssi={status?.rssi} />
            {status && <OnlineBadge online={status.online} />}
          </div>
        </div>
        <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="num font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <button className="btn-secondary mt-4" onClick={refresh}>Refresh</button>
      </section>
      <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
        The device uses plain HTTP/HTTPS POST with an API key header and polls for commands every
        second. TLS certificate pinning on the ESP32 is documented for production hardening.
      </p>
    </div>
  )
}

/* ── Notifications ── */
function NotificationsTab({ isAdmin }) {
  const toast = useToast()
  const { settings, refresh } = useSettings()
  const { data: recData, refresh: refreshRec } = usePoll(() => api.get('/admin/recipients'), 30000, [])
  const [modal, setModal] = useState(null) // {recipient?} | 'new'
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState(() => (typeof Notification !== 'undefined' ? Notification.permission : 'unsupported'))

  const recipients = recData?.rows ?? []
  const toggleKey = async (key) => {
    if (!isAdmin) return
    try {
      await api.put('/admin/settings', { [key]: settings[key] !== '1' })
      refresh()
    } catch (e) {
      toast.error(e.message)
    }
  }
  const askPermission = async () => {
    try {
      setPerm(await Notification.requestPermission())
    } catch { /* unsupported */ }
  }

  const saveRecipient = async (form) => {
    setBusy(true)
    try {
      if (modal?.id) {
        await api.put(`/admin/recipients/${modal.id}`, form)
      } else {
        await api.post('/admin/recipients', form)
      }
      setModal(null)
      refreshRec()
      toast.success('Recipient saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const delRecipient = async () => {
    try {
      await api.del(`/admin/recipients/${confirmDel.id}`)
      setConfirmDel(null)
      refreshRec()
      toast.success('Recipient removed')
    } catch (e) {
      toast.error(e.message)
    }
  }

  const toggles = [
    ['notify.email_enabled', 'Email alerts', 'Send email to active recipients on every new alert'],
    ['notify.on_night_flow', 'Night flow', 'Flow during quiet hours'],
    ['notify.on_long_flow', 'Long flow', 'Continuous flow past the limit'],
    ['notify.on_burst_rate', 'Burst rate', 'Flow above the maximum rate'],
  ]

  return (
    <div className="max-w-2xl space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Alert channels</h2>
        <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {toggles.map(([key, label, hint]) => (
            <div key={key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p>
              </div>
              <button
                role="switch"
                aria-checked={settings?.[key] === '1'}
                onClick={() => toggleKey(key)}
                disabled={!isAdmin}
                className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                  settings?.[key] === '1' ? 'bg-green-600' : 'bg-slate-300 dark:bg-slate-600'
                } ${!isAdmin ? 'cursor-not-allowed opacity-50' : ''}`}
                aria-label={`Toggle ${label}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${settings?.[key] === '1' ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">SMS alerts</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Planned — SIM900A GSM module (not yet wired in firmware)</p>
            </div>
            <Badge tone="amber">Planned</Badge>
          </div>
          <div className="flex items-center justify-between gap-4 py-3">
            <div>
              <p className="text-sm font-medium">Browser notifications</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {perm === 'granted' ? 'Enabled for this browser' : perm === 'denied' ? 'Blocked by the browser' : 'Optional pop-up + sound on new alerts'}
              </p>
            </div>
            {perm === 'granted' ? (
              <Badge tone="green">On</Badge>
            ) : perm !== 'unsupported' && perm !== 'denied' ? (
              <button className="btn-secondary !h-8" onClick={askPermission}>Enable</button>
            ) : (
              <Badge tone="slate">{perm === 'denied' ? 'Blocked' : 'N/A'}</Badge>
            )}
          </div>
        </div>
      </section>

      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Recipients</h2>
          {isAdmin && (
            <button className="btn-secondary !h-8" onClick={() => setModal('new')}>
              <Plus size={14} /> Add
            </button>
          )}
        </div>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {recipients.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">No recipients configured</li>
          )}
          {recipients.map((r) => (
            <li key={r.id} className="flex items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{r.name}</p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                  {[r.email, r.phone].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
              <Badge tone={r.active ? 'green' : 'slate'}>{r.active ? 'Active' : 'Off'}</Badge>
              {isAdmin && (
                <div className="flex gap-1">
                  <button className="btn-ghost !h-8 !px-2" aria-label={`Edit ${r.name}`} onClick={() => setModal(r)}>
                    <Pencil size={14} />
                  </button>
                  <button className="btn-ghost !h-8 !px-2 text-red-500" aria-label={`Delete ${r.name}`} onClick={() => setConfirmDel(r)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <RecipientModal open={!!modal} initial={modal === 'new' ? null : modal} busy={busy} onClose={() => setModal(null)} onSave={saveRecipient} />
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={delRecipient}
        title="Remove recipient?"
        body={`${confirmDel?.name} will stop receiving alert notifications.`}
        confirmLabel="Remove"
        danger
      />
    </div>
  )
}

function RecipientModal({ open, initial, busy, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', active: true })
  useEffect(() => {
    setForm({
      name: initial?.name ?? '',
      email: initial?.email ?? '',
      phone: initial?.phone ?? '',
      active: initial ? !!initial.active : true,
    })
  }, [initial, open])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit recipient' : 'Add recipient'}>
      <Field label="Name">
        <input className="input" value={form.name} onChange={set('name')} required />
      </Field>
      <div className="mt-4">
        <Field label="Email" hint="At least one of email or phone is required.">
          <input type="email" className="input" value={form.email} onChange={set('email')} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label="Phone">
          <input className="input" placeholder="09xx xxx xxxx" value={form.phone} onChange={set('phone')} />
        </Field>
      </div>
      <label className="mt-4 flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.active} onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))} />
        Active — receives notifications
      </label>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !form.name} onClick={() => onSave(form)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}

/* ── Device info ── */
function DeviceTab({ isAdmin }) {
  const toast = useToast()
  const { data: status, loading } = usePoll(() => api.get('/admin/status'), 10000, [])
  const { settings } = useSettings()
  const [form, setForm] = useState(null)
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (settings && !form) {
      setForm({ name: settings['device.name'] ?? '', location: settings['device.location'] ?? '' })
    }
  }, [settings, form])

  if (loading || !form) return <Skeleton className="h-64" />

  const save = async () => {
    setBusy(true)
    try {
      await api.put('/admin/settings', { 'device.name': form.name, 'device.location': form.location })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
      toast.success('Device info saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-4">
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Device</h2>
        <dl className="mt-4 divide-y divide-slate-100 dark:divide-slate-800">
          {[
            ['Device ID', status?.device?.device_id ?? '—'],
            ['Firmware version', status?.device?.firmware_version ?? 'not reported'],
            ['Report protocol', 'HTTP/HTTPS JSON POST · X-API-Key auth'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-center justify-between py-2.5 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
              <dd className="num font-medium">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 grid grid-cols-1 gap-4">
          <Field label="Display name">
            <input className="input" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </Field>
          <Field label="Location">
            <input className="input" value={form.location} onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))} />
          </Field>
        </div>
        <SaveRow onSave={save} busy={busy} saved={saved} isAdmin={isAdmin} />
      </section>
      <section className="card p-5">
        <h2 className="text-sm font-semibold">Hardware</h2>
        <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
          {HARDWARE.map((h) => (
            <li key={h} className="flex items-start gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
              {h}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

/* ── Users (admin) ── */
function UsersTab() {
  const toast = useToast()
  const { data, loading, error, refresh } = usePoll(() => api.get('/admin/users'), 30000, [])
  const [modal, setModal] = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [busy, setBusy] = useState(false)
  const { user: me } = useAuth()
  const rows = data?.rows ?? []

  const save = async (form) => {
    setBusy(true)
    try {
      if (modal?.id) {
        const payload = { name: form.name, role: form.role, is_active: form.is_active }
        if (form.password) payload.password = form.password
        await api.put(`/admin/users/${modal.id}`, payload)
      } else {
        await api.post('/admin/users', form)
      }
      setModal(null)
      refresh()
      toast.success('User saved')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const del = async () => {
    try {
      await api.del(`/admin/users/${confirmDel.id}`)
      setConfirmDel(null)
      refresh()
      toast.success('User deleted')
    } catch (e) {
      toast.error(e.message)
    }
  }

  if (loading) return <Skeleton className="h-64" />
  if (error) return <ErrorState onRetry={refresh} label="Could not load users" />

  return (
    <div className="max-w-2xl">
      <section className="card p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Accounts</h2>
          <button className="btn-secondary !h-8" onClick={() => setModal('new')}>
            <Plus size={14} /> Add user
          </button>
        </div>
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {rows.map((u) => (
            <li key={u.id} className="flex items-center gap-3 py-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-sky-950 dark:text-sky-300">
                {u.name[0]?.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {u.name}
                  {u.id === me?.id && <span className="ml-1.5 text-xs font-normal text-slate-400">(you)</span>}
                </p>
                <p className="truncate text-xs text-slate-500 dark:text-slate-400">{u.email}</p>
              </div>
              <Badge tone={u.role === 'admin' ? 'blue' : 'slate'}>{u.role}</Badge>
              {!u.is_active && <Badge tone="amber">Inactive</Badge>}
              <div className="flex gap-1">
                <button className="btn-ghost !h-8 !px-2" aria-label={`Edit ${u.name}`} onClick={() => setModal(u)}>
                  <Pencil size={14} />
                </button>
                {u.id !== me?.id && (
                  <button className="btn-ghost !h-8 !px-2 text-red-500" aria-label={`Delete ${u.name}`} onClick={() => setConfirmDel(u)}>
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
        <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-5 text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Staff can view the dashboard and acknowledge alerts. Admins additionally control the valve,
          edit settings and manage users. Every control action is logged with the issuing user.
        </p>
      </section>

      <UserModal open={!!modal} initial={modal === 'new' ? null : modal} busy={busy} onClose={() => setModal(null)} onSave={save} />
      <ConfirmModal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        onConfirm={del}
        title="Delete user?"
        body={`${confirmDel?.name} (${confirmDel?.email}) will lose access immediately.`}
        confirmLabel="Delete"
        danger
      />
    </div>
  )
}

function UserModal({ open, initial, busy, onClose, onSave }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'staff', is_active: true })
  useEffect(() => {
    setForm({
      name: initial?.name ?? '',
      email: initial?.email ?? '',
      password: '',
      role: initial?.role ?? 'staff',
      is_active: initial ? !!initial.is_active : true,
    })
  }, [initial, open])
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const valid = form.name && (initial || (form.email.includes('@') && form.password.length >= 8))
  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Edit user' : 'Add user'}>
      <Field label="Name"><input className="input" value={form.name} onChange={set('name')} /></Field>
      <div className="mt-4">
        <Field label="Email">
          <input type="email" className="input" value={form.email} onChange={set('email')} disabled={!!initial} />
        </Field>
      </div>
      <div className="mt-4">
        <Field label={initial ? 'New password (leave blank to keep)' : 'Password'} hint="Minimum 8 characters.">
          <input type="password" className="input" autoComplete="new-password" value={form.password} onChange={set('password')} />
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Field label="Role">
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="staff">Staff</option>
            <option value="admin">Admin</option>
          </select>
        </Field>
        <Field label="Access">
          <label className="flex h-10 items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={form.is_active} onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))} />
            Active
          </label>
        </Field>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" disabled={busy || !valid} onClick={() => onSave(form)}>
          {busy ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Modal>
  )
}
