import { useEffect, useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import {
  LayoutDashboard, BellRing, BarChart3, ScrollText, Settings, Info,
  Droplets, LogOut, Contrast, MoreHorizontal, X, CloudOff,
  PanelLeftClose, PanelLeftOpen,
} from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import { useConnection } from '../hooks/useConnection'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/alerts', label: 'Alerts', icon: BellRing },
  { to: '/reports', label: 'Reports', icon: BarChart3 },
  { to: '/logs', label: 'Activity logs', icon: ScrollText },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/about', label: 'About', icon: Info },
]

// Bottom tab bar keeps to five destinations; the rest live under "More".
const MOBILE_MAIN = NAV.slice(0, 4)

function Logo({ collapsed }) {
  return (
    <div className="flex items-center gap-2.5 px-1">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-white">
        <Droplets size={19} strokeWidth={2.2} />
      </span>
      {!collapsed && (
        <div className="leading-tight">
          <p className="text-[15px] font-semibold">LeakGuard</p>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">Schola de San Jose</p>
        </div>
      )}
    </div>
  )
}

function NavItems({ collapsed, onNavigate }) {
  return (
    <nav className="mt-6 flex flex-col gap-1" aria-label="Main">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          onClick={onNavigate}
          title={collapsed ? item.label : undefined}
          className={({ isActive }) =>
            `flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors ${
              isActive
                ? 'bg-slate-200/70 font-medium text-navy dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 hover:bg-slate-100 hover:text-navy dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-white'
            } ${collapsed ? 'justify-center' : ''}`
          }
        >
          <item.icon size={17} strokeWidth={1.8} className="shrink-0" />
          {!collapsed && item.label}
        </NavLink>
      ))}
    </nav>
  )
}

export default function AppLayout() {
  const { user, logout } = useAuth()
  const { dark, toggle } = useTheme()
  const connLost = useConnection()
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem('lg-nav-collapsed') === '1'
    } catch {
      return false
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem('lg-nav-collapsed', collapsed ? '1' : '0')
    } catch {
      /* private mode — ignore */
    }
  }, [collapsed])
  const [moreOpen, setMoreOpen] = useState(false)

  const doLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="flex min-h-screen">
      {/* ── Desktop sidebar ── */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200 bg-white px-3 py-4 dark:border-slate-800 dark:bg-navy md:flex ${
          collapsed ? 'w-[68px]' : 'w-[230px]'
        } transition-[width]`}
      >
        <div className={`flex items-center gap-1 ${collapsed ? 'flex-col' : 'justify-between'}`}>
          <Logo collapsed={collapsed} />
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="btn-ghost !h-8 !w-8 !px-0"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? (
              <PanelLeftOpen size={17} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={17} strokeWidth={1.8} />
            )}
          </button>
        </div>
        <NavItems collapsed={collapsed} />
      </aside>

      {/* ── Main column ── */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* header on every screen */}
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur dark:border-slate-800 dark:bg-navy/95">
          <div className="md:hidden">
            <Logo />
          </div>
          <div className="hidden md:block" />
          <div className="ml-auto flex items-center gap-1.5 sm:gap-3">
            <button
              onClick={toggle}
              className="btn-ghost !h-9 !w-9 !px-0"
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              title={dark ? 'Light mode' : 'Dark mode'}
            >
              <Contrast size={17} strokeWidth={1.8} />
            </button>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700 dark:bg-sky-950 dark:text-sky-300">
                {user?.name?.[0]?.toUpperCase() ?? '?'}
              </span>
              <div className="hidden leading-tight sm:block">
                <p className="max-w-[140px] truncate text-sm font-medium">{user?.name}</p>
                <p className="text-[11px] capitalize text-slate-400 dark:text-slate-500">{user?.role}</p>
              </div>
            </div>
            <button
              onClick={doLogout}
              className="btn-ghost !h-9 !w-9 !px-0"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={17} strokeWidth={1.8} />
            </button>
          </div>
        </header>

        {connLost && (
          <div role="alert" className="flex items-center gap-2 bg-amber-100 px-4 py-2 text-sm font-medium text-amber-900 dark:bg-amber-950 dark:text-amber-200">
            <CloudOff size={15} />
            Connection to the server was lost — retrying automatically.
          </div>
        )}

        <main className="mx-auto w-full max-w-[1280px] flex-1 px-4 pb-24 pt-5 sm:px-6 md:pb-10">
          <Outlet />
        </main>
      </div>

      {/* ── Mobile bottom tab bar ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex h-16 items-stretch border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-navy md:hidden"
        aria-label="Mobile"
      >
        {MOBILE_MAIN.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] ${
                isActive ? 'font-medium text-primary' : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon size={20} strokeWidth={1.8} />
            {item.label === 'Activity logs' ? 'Logs' : item.label}
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] text-slate-500 dark:text-slate-400"
          aria-label="More options"
        >
          <MoreHorizontal size={20} strokeWidth={1.8} />
          More
        </button>
      </nav>

      {/* ── Mobile "More" sheet ── */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 bg-navy/40 md:hidden" role="dialog" aria-modal="true" aria-label="More options" onMouseDown={(e) => e.target === e.currentTarget && setMoreOpen(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-8 shadow-pop animate-fade-up dark:bg-navy">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold">More</p>
              <button onClick={() => setMoreOpen(false)} aria-label="Close" className="rounded-md p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X size={18} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {NAV.slice(4).map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setMoreOpen(false)} className="flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-3 text-sm dark:border-slate-700">
                  <item.icon size={17} strokeWidth={1.8} className="text-slate-400" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
