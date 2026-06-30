import React, { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const tabs = [
  {
    to: '/hunts',
    label: 'Hunts',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    to: '/blinds',
    label: 'Blinds',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    to: '/stats',
    label: 'Stats',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
  {
    to: '/profile',
    label: 'Profile',
    icon: (active: boolean) => (
      <svg className={`w-6 h-6 ${active ? 'text-orange-500' : 'text-gray-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={active ? 2.5 : 2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
    ),
  },
]

export default function Layout() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen bg-navy-950 overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-navy-900 border-r border-gray-800 flex-shrink-0">
        {/* Logo */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-gray-800">
          <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
            </svg>
          </div>
          <div>
            <p className="font-bold text-white text-sm leading-tight">Waterfowl</p>
            <p className="text-orange-500 text-xs font-semibold tracking-widest uppercase">Journal</p>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {tabs.map(tab => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-semibold uppercase tracking-wider ${
                  isActive
                    ? 'bg-orange-500/15 text-orange-500 border border-orange-500/30'
                    : 'text-gray-400 hover:bg-navy-800 hover:text-white'
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
        <div className="px-4 py-4 border-t border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-navy-700 rounded-full flex items-center justify-center">
              <span className="text-sm font-bold text-gray-300">
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-white text-sm font-semibold truncate">{user?.name}</p>
              <p className="text-gray-500 text-xs truncate">{user?.email}</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60" onClick={() => setSidebarOpen(false)}>
          <aside className="w-64 h-full bg-navy-900 border-r border-gray-800 flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-5 border-b border-gray-800">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-orange-500 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z"/>
                  </svg>
                </div>
                <span className="font-bold text-white">Waterfowl Journal</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} className="text-gray-400">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1">
              {tabs.map(tab => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  onClick={() => setSidebarOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-sm font-semibold uppercase tracking-wider ${
                      isActive
                        ? 'bg-orange-500/15 text-orange-500 border border-orange-500/30'
                        : 'text-gray-400 hover:bg-navy-800 hover:text-white'
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
        <div className="md:hidden flex items-center justify-between px-4 py-3 bg-navy-900 border-b border-gray-800">
          <button onClick={() => setSidebarOpen(true)} className="text-gray-400">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="font-bold text-white text-sm uppercase tracking-widest">Waterfowl Journal</span>
          <div className="w-6" />
        </div>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* Mobile Bottom Tab Bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-navy-900 border-t border-gray-800 z-30">
          <div className="flex">
            {tabs.map(tab => (
              <NavLink
                key={tab.to}
                to={tab.to}
                className="flex-1 flex flex-col items-center py-2 gap-1"
              >
                {({ isActive }) => (
                  <>
                    {tab.icon(isActive)}
                    <span className={`text-xs font-semibold uppercase tracking-wider ${isActive ? 'text-orange-500' : 'text-gray-500'}`}>
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
