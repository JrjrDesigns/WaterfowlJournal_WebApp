import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

interface Props {
  onClose: () => void
  reason?: 'stats' | 'weather' | 'export' | 'forecast'
}

// Logging is unlimited on free, so nothing here sells hunt capacity. What Pro
// sells is the reading of those hunts: the forecast ahead and the patterns
// behind.
const FEATURES = [
  'The whole week ranked, at every spot',
  'Which blind to sit, matched to the wind',
  'Scores tuned to what has produced for you',
  'Your season explained — species, spots, weather',
  'The full conditions on every hunt, plus CSV export',
]

const titles: Record<string, string> = {
  stats: 'The rest of your season — Pro',
  weather: 'Weather Data — Pro',
  export: 'Data Export — Pro',
  forecast: 'The rest of the week — Pro',
}

const descriptions: Record<string, string> = {
  stats: 'You keep your season totals for free. Pro shows what is behind them — every species, blind, and condition that shaped the year.',
  weather: 'Pro opens the full conditions on every hunt — sky, temperature, pressure, and the wind hour by hour through your sit.',
  export: 'Exporting your hunt history as CSV requires Pro.',
  forecast: 'Free covers today and tomorrow at one spot. Pro scores all seven days at every location you hunt.',
}

export default function PaywallModal({ onClose, reason = 'forecast' }: Props) {
  const navigate = useNavigate()
  const { isPaused } = useAuth()

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
      <div className="bg-surface border border-hairline rounded-2xl w-full max-w-sm p-7 shadow-xl">
        <div className="mb-6">
          <h2 className="font-display text-3xl text-ink tracking-wider leading-none mb-2">
            {isPaused ? 'Your Pro is paused' : titles[reason]}
          </h2>
          <p className="text-muted text-sm leading-relaxed">
            {isPaused
              ? 'Resume your subscription to get this back — your hunt history is untouched.'
              : descriptions[reason]}
          </p>
        </div>

        <div className="bg-bg rounded-xl p-4 mb-6 border border-hairline">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-3">Pro includes</p>
          <ul className="space-y-2">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-ink">
                <svg className="w-4 h-4 text-green flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => { onClose(); navigate('/profile?upgrade=1') }}
          className="w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-xl transition-colors text-sm mb-3"
        >
          {isPaused ? 'Resume Pro' : 'Go Pro — from $4.17/mo'}
        </button>
        <button
          onClick={onClose}
          className="w-full text-muted hover:text-ink text-sm py-2 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
