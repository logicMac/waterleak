import { useCallback, useEffect, useRef, useState } from 'react'
import { Lock, LockOpen, RotateCcw, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import Badge from './Badge'
import { ConfirmModal } from './Modal'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'

const CONFIRM = {
  close_valve: {
    title: 'Close the water valve?',
    body: 'The main valve at the device will be commanded to close on its next poll (within about a second). Flow in both zones will stop.',
    label: 'Close valve',
    danger: true,
  },
  open_valve: {
    title: 'Open the water valve?',
    body: 'The main valve will be commanded to open. Only do this after the line has been checked.',
    label: 'Open valve',
  },
  reset: {
    title: 'Reset the system?',
    body: 'Clears all tripped zones, resolves active alerts and reopens the valve — same as holding the device button for 2 seconds.',
    label: 'Reset system',
  },
}

const STAGE_LABEL = {
  sending: 'Sending…',
  waiting: 'Sent — waiting for device…',
  delivered: 'Delivered — running on device…',
  executed: 'Executed',
  expired: 'Expired — device never picked it up',
  failed: 'Failed',
}

/**
 * Valve control with a real command lifecycle: the UI tracks the queued
 * command through pending → delivered → executed (confirmed by the next
 * status poll) or expired.
 */
export default function ValvePanel({ status, isAdmin, onChanged }) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(null)
  const [task, setTask] = useState(null) // {cmd, id, stage}
  const pollRef = useRef(null)

  const valveOpen = !!status?.valve_open
  const tripped = status?.zones?.some((z) => z.tripped)
  const online = !!status?.online
  const busy = !!task && !['executed', 'expired', 'failed'].includes(task.stage)

  const stopPolling = () => {
    clearInterval(pollRef.current)
    pollRef.current = null
  }
  useEffect(() => stopPolling, [])

  const expectedOutcome = useCallback(
    (cmd) => {
      if (cmd === 'close_valve') return (s) => s.valve_open === false
      if (cmd === 'open_valve') return (s) => s.valve_open === true
      return (s) => s.valve_open === true && !s.zones.some((z) => z.tripped)
    },
    []
  )

  const send = async (cmd) => {
    setConfirming(null)
    setTask({ cmd, stage: 'sending' })
    try {
      const d = await api.post('/admin/control', { command: cmd })
      const id = d.command_id
      setTask({ cmd, id, stage: 'waiting' })
      const started = Date.now()
      pollRef.current = setInterval(async () => {
        try {
          const c = await api.get(`/admin/commands/${id}`)
          const s = c.command.status
          if (s === 'delivered') {
            setTask((t) => (t?.stage === 'delivered' || t?.stage === 'executed' ? t : { ...t, stage: 'delivered' }))
            const st = await api.get('/admin/status')
            onChanged?.(st)
            if (expectedOutcome(cmd)(st)) {
              stopPolling()
              setTask({ cmd, id, stage: 'executed' })
              toast.success(`${CONFIRM[cmd].label} confirmed on device`)
            } else if (Date.now() - started > 15000) {
              stopPolling()
              setTask({ cmd, id, stage: 'executed' })
              toast.info('Command delivered — awaiting state confirmation')
            }
          } else if (s === 'expired') {
            stopPolling()
            setTask({ cmd, id, stage: 'expired' })
            toast.error('Command expired before the device picked it up')
          } else if (Date.now() - started > 40000) {
            stopPolling()
            setTask({ cmd, id, stage: 'failed' })
            toast.error('Command stayed pending too long')
          }
        } catch {
          /* transient — keep polling */
        }
      }, 1000)
    } catch (e) {
      setTask({ cmd, stage: 'failed' })
      toast.error(e.message)
    }
  }

  const buttons = [
    {
      cmd: 'close_valve',
      label: 'Close valve',
      icon: <Lock size={15} />,
      cls: 'btn-danger',
      disabled: !online || valveOpen === false,
      hint: !online ? 'Device is offline' : valveOpen === false ? 'Valve already closed' : null,
    },
    {
      cmd: 'open_valve',
      label: 'Open valve',
      icon: <LockOpen size={15} />,
      cls: 'btn-secondary',
      disabled: !online || !!tripped || valveOpen === true,
      hint: !online ? 'Device is offline' : tripped ? 'Blocked while a zone is tripped — use Reset' : valveOpen ? 'Valve already open' : null,
    },
    {
      cmd: 'reset',
      label: 'Reset system',
      icon: <RotateCcw size={15} />,
      cls: 'btn-primary',
      disabled: !online,
      hint: !online ? 'Device is offline' : null,
    },
  ]

  return (
    <section className="card p-5" aria-label="Valve control">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Valve control</h2>
        <Badge tone={valveOpen ? 'green' : 'red'} icon={valveOpen ? <LockOpen size={12} /> : <Lock size={12} />}>
          {status ? (valveOpen ? 'Open' : 'Closed') : '—'}
        </Badge>
      </div>

      {/* big state indicator */}
      <div className="mt-4 flex items-center gap-3">
        <span
          className={`relative flex h-12 w-12 items-center justify-center rounded-full ${
            valveOpen
              ? 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
              : 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
          }`}
        >
          {valveOpen ? <LockOpen size={22} /> : <Lock size={22} />}
        </span>
        <div>
          <p className="text-lg font-semibold leading-6">{valveOpen ? 'Water flowing' : 'Water stopped'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {online ? 'Main solenoid valve, live' : 'Last known state — device offline'}
          </p>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Staff accounts can view and acknowledge alerts. Valve control requires an admin.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {buttons.map((b) => (
          <div key={b.cmd} className="flex flex-col">
            <button
              className={b.cls}
              disabled={busy || !isAdmin || b.disabled}
              onClick={() => setConfirming(b.cmd)}
              aria-describedby={`hint-${b.cmd}`}
            >
              {b.icon}
              {b.label}
            </button>
            <span id={`hint-${b.cmd}`} className="mt-1 min-h-[14px] text-center text-[11px] leading-4 text-slate-400 dark:text-slate-500">
              {b.hint ?? ''}
            </span>
          </div>
        ))}
      </div>

      {task && (
        <div
          role="status"
          className={`mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${
            task.stage === 'executed'
              ? 'bg-green-50 text-green-800 dark:bg-green-950/60 dark:text-green-300'
              : task.stage === 'expired' || task.stage === 'failed'
                ? 'bg-red-50 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                : 'bg-sky-50 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300'
          }`}
        >
          {task.stage === 'executed' ? (
            <CheckCircle2 size={15} />
          ) : task.stage === 'expired' || task.stage === 'failed' ? (
            <XCircle size={15} />
          ) : (
            <Loader2 size={15} className="animate-spin" />
          )}
          <span className="flex-1">
            <span className="font-medium capitalize">{task.cmd.replace('_', ' ')}</span>
            {' — '}
            {STAGE_LABEL[task.stage]}
          </span>
          {!busy && (
            <button className="text-xs font-medium underline underline-offset-2" onClick={() => setTask(null)}>
              Dismiss
            </button>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!confirming}
        onClose={() => setConfirming(null)}
        onConfirm={() => send(confirming)}
        title={confirming ? CONFIRM[confirming].title : ''}
        body={confirming ? CONFIRM[confirming].body : ''}
        confirmLabel={confirming ? CONFIRM[confirming].label : ''}
        danger={confirming === 'close_valve'}
      />
    </section>
  )
}
