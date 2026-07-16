import type { MapMode } from '../utils/mapTiles'

interface Props {
  mode: MapMode
  onChange: (mode: MapMode) => void
}

const OPTIONS: { value: MapMode; label: string }[] = [
  { value: 'street', label: 'Street' },
  { value: 'satellite', label: 'Satellite' },
]

export default function MapModeToggle({ mode, onChange }: Props) {
  return (
    <div className="inline-flex bg-surface/95 border border-hairline rounded-full p-1 shadow-sm">
      {OPTIONS.map(opt => {
        const active = mode === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            aria-label={`${opt.label} map`}
            aria-pressed={active}
            onClick={() => onChange(opt.value)}
            className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors ${
              active ? 'bg-ink text-white' : 'text-muted'
            }`}
          >
            {opt.value === 'street' ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}
