import { Droplets, Cpu, Radio, Bell, Gauge, ToggleLeft, MonitorSmartphone } from 'lucide-react'
import { PageHeader } from '../components/States'

const HARDWARE = [
  { icon: Cpu, text: 'ESP32-WROOM-32 microcontroller' },
  { icon: Gauge, text: '2× YF-S201 hall-effect flow sensors (Zone 1 & Zone 2)' },
  { icon: ToggleLeft, text: 'Relay-controlled solenoid water valve' },
  { icon: MonitorSmartphone, text: 'SSD1306 OLED display + DS1302 real-time clock' },
  { icon: Bell, text: 'Red LED strobe, buzzer and reset button' },
  { icon: Radio, text: 'SIM900A GSM module — proposed for SMS alerts' },
]

export default function About() {
  return (
    <>
      <PageHeader title="About" sub="The system and the people behind it" />
      <div className="grid max-w-none grid-cols-1 gap-4">
        <section className="card flex items-start gap-4 p-6">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-white">
            <Droplets size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h2 className="text-lg font-semibold">LeakGuard</h2>
            <p className="mt-1 text-sm leading-6 text-slate-600 dark:text-slate-300">
              An embedded IoT device for water leak detection and alert. Two flow sensors watch the
              supply lines; abnormal flow — at night, sustained too long, or above the burst rate —
              trips the affected zone, closes the main valve automatically, and reports the event
              here within seconds.
            </p>
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-semibold">Thesis project</h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Title</dt>
              <dd className="mt-0.5 font-medium leading-6">
                Embedded IoT Device for Water Leak Detection and Alert System for Schola de San Jose
                of Polomolok
              </dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Researchers</dt>
              <dd className="mt-0.5 font-medium">Louise Nathaniel V. Pajarillo · Valerie C. Rafales</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">Program</dt>
              <dd className="mt-0.5 font-medium">BS Information Technology</dd>
            </div>
            <div>
              <dt className="text-slate-500 dark:text-slate-400">School</dt>
              <dd className="mt-0.5 font-medium">Notre Dame-Siena College of Polomolok</dd>
            </div>
          </dl>
        </section>

        <section className="card p-6">
          <h2 className="text-sm font-semibold">Hardware</h2>
          <ul className="mt-3 space-y-3">
            {HARDWARE.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
                <Icon size={16} className="shrink-0 text-slate-400" />
                {text}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  )
}
