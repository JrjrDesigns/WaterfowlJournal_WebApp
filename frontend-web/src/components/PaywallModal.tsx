import React from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  onClose: () => void
  reason?: 'hunt_limit' | 'stats' | 'weather' | 'export'
}

const FEATURES = [
  'Unlimited hunt logs',
  'Flight forecasts & movement scores',
  'Advanced season analytics',
  'Automatic weather on all hunts',
  'CSV data export',
]

const titles: Record<string, string> = {
  hunt_limit: "You've hit the free limit",
  stats: 'Advanced Stats — Pro',
  weather: 'Weather Data — Pro',
  export: 'Data Export — Pro',
}

const descriptions: Record<string, string> = {
  hunt_limit: 'Free accounts log up to 10 hunts. Go Pro for unlimited hunts plus the forecast that reads them.',
  stats: 'Full analytics and charts are available on Pro.',
  weather: 'Automatic weather data on your hunts is a Pro feature.',
  export: 'Exporting your hunt history as CSV requires Pro.',
}

export default function PaywallModal({ onClose, reason = 'hunt_limit' }: Props) {
  const navigate = useNavigate()

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50 backdrop-blur-sm">
      <div className="bg-surface border border-hairline rounded-2xl w-full max-w-sm p-7 shadow-xl">
        <div className="mb-6">
          <h2 className="font-display text-3xl text-ink tracking-wider leading-none mb-2">{titles[reason]}</h2>
          <p className="text-muted text-sm leading-relaxed">{descriptions[reason]}</p>
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
          Go Pro — $4.99/month
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
