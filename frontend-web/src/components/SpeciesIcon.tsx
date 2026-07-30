import React, { useState, useEffect } from 'react'

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

export default function SpeciesIcon({ species, size = 40, className = '' }: { species: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => { setFailed(false) }, [species])

  if (!species || failed) {
    return (
      <div
        className={`flex items-center justify-center bg-bg border border-hairline rounded-full flex-shrink-0 ${className}`}
        style={{ width: size, height: size }}
      >
        <svg width={size * 0.55} height={size * 0.55} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="text-muted">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3c-3 0-5 2-5 5 0 4 3 7 5 9 2-2 5-5 5-9 0-3-2-5-5-5z" />
        </svg>
      </div>
    )
  }

  return (
    <img
      src={`/species-icons/${slugify(species)}.png`}
      alt={species}
      className={`rounded-full object-cover border border-hairline flex-shrink-0 ${className}`}
      style={{ width: size, height: size }}
      onError={() => setFailed(true)}
    />
  )
}
