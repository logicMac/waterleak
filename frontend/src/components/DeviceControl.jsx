import { useEffect, useRef, useState } from 'react'
import { RotateCcw, ShieldAlert, ShieldCheck, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import Badge from './Badge'
import { ConfirmModal } from './Modal'
import { api } from '../api/client'
import { useToast } from '../hooks/useToast'

const STAGE_LABEL = {
  sending: 'Sending…',
  waiting: 'Sent — waiting for device…',
  delivered: 'Delivered — running on device…',
  executed: 'Executed',
  expired: 'Expired — device never picked it up',
  failed: 'Failed',
}

/**
 * Remote device control with a real command lifecycle: the UI tracks the
 * queued command through pending → delivered → executed (confirmed by the
 * next status poll) or expired. The firmware only understands "reset" —
 * it clears the latched trips, same as holding the device button for 2 s.
 */
export default function DeviceControl({ status, isAdmin, onChanged }) {
  const toast = useToast()
  const [confirming, setConfirming] = useState(false)
  const [task, setTask] = useState(null) // {cmd, id, stage}
  const pollRef = useRef(null)

  const tripped = status?.zones?.some((z) => z.tripped)
  const online = !!status?.online
  const busy = !!task && !['executed', 'expired', 'failed'].includes(task.stage)

  const stopPolling = () => {
    clearInterval(pollRef.current)
    pollRef.current = null
  }
  useEffect(() => stopPolling, [])

  const send = async () => {
    setConfirming(false)
    setTask({ cmd: 'reset', stage: 'sending' })
    try {
      const d = await api.post('/admin/control', { command: 'reset' })
      const id = d.command_id
      setTask({ cmd: 'reset', id, stage: 'waiting' })
      const started = Date.now()
      pollRef.current = setInterval(async () => {
        try {
          const c = await api.get(`/admin/commands/${id}`)
          const s = c.command.status
          if (s === 'delivered') {
            setTask((t) => (t?.stage === 'delivered' || t?.stage === 'executed' ? t : { ...t, stage: 'delivered' }))
            const st = await api.get('/admin/status')
            onChanged?.(st)
            if (!st.zones?.some((z) => z.tripped)) {
              stopPolling()
              setTask({ cmd: 'reset', id, stage: 'executed' })
              toast.success('Reset confirmed on device')
            } else if (Date.now() - started > 15000) {
              stopPolling()
              setTask({ cmd: 'reset', id, stage: 'executed' })
              toast.info('Command delivered — awaiting state confirmation')
            }
          } else if (s === 'expired') {
            stopPolling()
            setTask({ cmd: 'reset', id, stage: 'expired' })
            toast.error('Command expired before the device picked it up')
          } else if (Date.now() - started > 40000) {
            stopPolling()
            setTask({ cmd: 'reset', id, stage: 'failed' })
            toast.error('Command stayed pending too long')
          }
        } catch {
          /* transient — keep polling */
        }
      }, 1000)
    } catch (e) {
      setTask({ cmd: 'reset', stage: 'failed' })
      toast.error(e.message)
    }
  }

  return (
    <section className="card p-5" aria-label="Device control">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Device control</h2>
        <Badge
          tone={status ? (tripped ? 'red' : 'green') : 'slate'}
          icon={tripped ? <ShieldAlert size={12} /> : <ShieldCheck size={12} />}
        >
          {status ? (tripped ? 'Alarm' : 'Armed') : '—'}
        </Badge>
      </div>

      {/* big state indicator */}
      <div className="mt-4 flex items-center gap-3">
        <span
          className={`relative flex h-12 w-12 items-center justify-center rounded-full ${
            tripped
              ? 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300'
              : 'bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300'
          }`}
        >
          {tripped ? <ShieldAlert size={22} /> : <ShieldCheck size={22} />}
        </span>
        <div>
          <p className="text-lg font-semibold leading-6">{tripped ? 'Alarm active' : 'Monitoring'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {online
              ? tripped
                ? 'Buzzer + LED active on device'
                : 'Both zones within limits'
              : 'Last known state — device offline'}
          </p>
        </div>
      </div>

      {!isAdmin && (
        <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
          Staff accounts can view and acknowledge alerts. Remote reset requires an admin.
        </p>
      )}

      <div className="mt-4">
        <button
          className="btn-primary w-full"
          disabled={busy || !isAdmin || !online}
          onClick={() => setConfirming(true)}
          aria-describedby="hint-reset"
        >
          <RotateCcw size={15} />
          Reset system
        </button>
        <p id="hint-reset" className="mt-1 min-h-[14px] text-center text-[11px] leading-4 text-slate-400 dark:text-slate-500">
          {!online ? 'Device is offline' : ''}
        </p>
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
            <span className="font-medium">Reset</span>
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
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={send}
        title="Reset the system?"
        body="Clears all tripped zones and resolves active alerts — same as holding the device button for 2 seconds."
        confirmLabel="Reset system"
      />
    </section>
  )
}
