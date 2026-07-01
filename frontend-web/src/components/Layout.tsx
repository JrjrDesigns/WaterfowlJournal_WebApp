import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const tabs = [
  {
    to: '/hunts',
    label: 'Hunts',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 ${active ? 'text-ink' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    to: '/locations',
    label: 'Locations',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 ${active ? 'text-ink' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 ${active ? 'text-ink' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg className={`w-5 h-5 ${active ? 'text-ink' : 'text-muted'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

function BrandMark({ className = 'w-7 h-7' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 110" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M50,104 C32,80 16,66 16,44 A34,34 0 1 1 84,44 C84,66 68,80 50,104 Z" fill="#1B5E45" />
      <ellipse cx="59" cy="43" rx="17" ry="16.5" fill="white" />
      <path d="M16,44 C12,45 12,53 16,54 L52,52 L52,38 Z" fill="white" />
      <circle cx="63" cy="40" r="2.4" fill="#1B5E45" />
    </svg>
  )
}

export default function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-bg overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-surface border-r border-hairline flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-hairline">
          <BrandMark />
          <span className="font-display text-2xl text-ink tracking-wider leading-none">BLIND GUIDE</span>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-5 space-y-0.5">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-xs font-semibold uppercase tracking-wider border-l-2 ${
                  isActive
                    ? 'bg-ink/[0.05] text-ink border-ink'
                    : 'text-muted hover:text-ink hover:bg-ink/[0.03] border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {tab.icon(isActive)}
                  {tab.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-hairline">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-ink rounded-full flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-bold text-white">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-ink text-xs font-semibold truncate">{user?.name}</p>
              <p className="text-muted text-xs truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-ink/40" onClick={() => setSidebarOpen(false)}>
          <aside className="w-56 h-full bg-surface border-r border-hairline flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-5 border-b border-hairline">
              <div className="flex items-center gap-3">
                <BrandMark />
                <span className="font-display text-2xl text-ink tracking-wider leading-none">BLIND GUIDE</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-muted hover:text-ink ml-2">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-5 space-y-0.5">
              {tabs.map(tab => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-xs font-semibold uppercase tracking-wider border-l-2 ${
                      isActive
                        ? 'bg-ink/[0.05] text-ink border-ink'
                        : 'text-muted hover:text-ink hover:bg-ink/[0.03] border-transparent'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {tab.icon(isActive)}
                      {tab.label}
                    </>
                  )}
                </NavLink>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-surface border-b border-hairline">
          <button onClick={() => setSidebarOpen(true)} className="text-muted hover:text-ink">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-display text-xl text-ink tracking-wider">BLIND GUIDE</span>
          <div className="w-6" />
        </div>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-hairline z-30">
          <div className="flex">
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="flex-1 flex flex-col items-center py-2.5 gap-1"
              >
                {({ isActive }) => (
                  <>
                    {tab.icon(isActive)}
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-ink' : 'text-muted'}`}>
                      {tab.label}
                    </span>
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
