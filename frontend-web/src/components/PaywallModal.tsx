import React from 'react'
import { useNavigate } from 'react-router-dom'

interface Props {
  onClose: () => void
  reason?: 'hunt_limit' | 'stats' | 'weather' | 'export'
}

const FEATURES = [
  'Unlimited hunt logs',
  'Advanced analytics & charts',
  'Weather data on all hunts',
  'CSV data export',
  'Priority support',
]

export default function PaywallModal({ onClose, reason = 'hunt_limit' }: Props) {
  const navigate = useNavigate()

  const titles: Record<string, string> = {
    hunt_limit: "You've reached the Free limit",
    stats: 'Advanced Stats — Pro Feature',
    weather: 'Weather Data — Pro Feature',
    export: 'Data Export — Pro Feature',
  }

  const descriptions: Record<string, string> = {
    hunt_limit: 'Free accounts can log up to 10 hunts. Upgrade to Pro for unlimited hunts and premium features.',
    stats: 'Full analytics and charts are available on the Pro plan.',
    weather: 'Weather data on your hunts is a Pro feature.',
    export: 'Exporting your hunt history as CSV requires a Pro plan.',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-navy-800 border border-gray-700 rounded-2xl w-full max-w-md p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-orange-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">{titles[reason]}</h2>
          <p className="text-gray-400 text-sm leading-relaxed">{descriptions[reason]}</p>
        </div>

        <div className="bg-navy-900 rounded-xl p-5 mb-6 border border-gray-700">
          <p className="text-xs font-semibold text-orange-500 uppercase tracking-widest mb-3">Pro includes</p>
          <ul className="space-y-2">
            {FEATURES.map(f => (
              <li key={f} className="flex items-center gap-3 text-sm text-gray-300">
                <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                {f}
              </li>
            ))}
          </ul>
        </div>

        <button
          onClick={() => { onClose(); navigate('/profile?upgrade=1') }}
          className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl transition-colors text-lg mb-3"
        >
          Upgrade to Pro
        </button>
        <button
          onClick={onClose}
          className="w-full text-gray-500 hover:text-gray-300 text-sm py-2 transition-colors"
        >
          Maybe later
        </button>
      </div>
    </div>
  )
}
