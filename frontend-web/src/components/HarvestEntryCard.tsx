import React from 'react'
import SpeciesIcon from './SpeciesIcon'

export interface Harvest {
  species: string
  harvested: number
  missed: number
  shot_not_recovered: number
  seen: number
  mine: number
  confirmed?: boolean
}

interface Props {
  harvest: Harvest
  index: number
  allSpecies: string[]
  hasParty: boolean
  onUpdate: (field: keyof Harvest, value: string | number | boolean) => void
  onRemove: () => void
}

function summarize(h: Harvest, hasParty: boolean): string {
  const parts: string[] = []
  if (h.seen > 0) parts.push(`${h.seen} seen`)
  if (h.harvested > 0) parts.push(`${h.harvested} ${hasParty ? 'party' : 'harvested'}`)
  if (hasParty && h.mine > 0) parts.push(`${h.mine} mine`)
  if (h.missed > 0) parts.push(`${h.missed} missed`)
  if (h.shot_not_recovered > 0) parts.push(`${h.shot_not_recovered} lost`)
  return parts.length > 0 ? parts.join(' · ') : 'No harvest recorded'
}

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
  </svg>
)

export default function HarvestEntryCard({ harvest, index, allSpecies, hasParty, onUpdate, onRemove }: Props) {
  if (harvest.confirmed) {
    return (
      <div className="bg-surface border border-hairline rounded-xl p-3 flex items-center gap-3">
        <SpeciesIcon species={harvest.species} size={40} />
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-ink text-sm truncate">{harvest.species}</p>
          <p className="text-xs text-muted mt-0.5">{summarize(harvest, hasParty)}</p>
        </div>
        <button type="button" onClick={() => onUpdate('confirmed', false)} className="text-muted hover:text-ink transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
          </svg>
        </button>
        <button type="button" onClick={onRemove} className="text-muted hover:text-red-500 transition-colors flex-shrink-0">
          <TrashIcon />
        </button>
      </div>
    )
  }

  return (
    <div className="bg-surface border border-hairline rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted font-semibold uppercase tracking-wider">Entry {index + 1}</span>
        <button type="button" onClick={onRemove} className="text-muted hover:text-red-500 transition-colors">
          <TrashIcon />
        </button>
      </div>
      <div className="flex items-center gap-2 mb-3">
        <SpeciesIcon species={harvest.species} size={36} />
        <select value={harvest.species} onChange={e => onUpdate('species', e.target.value)} className="flex-1">
          {allSpecies.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(['seen', 'harvested', 'missed', 'shot_not_recovered'] as const).map(field => (
          <div key={field}>
            <p className="text-xs text-muted mb-1 font-semibold capitalize">
              {field === 'shot_not_recovered' ? 'Lost' : field}
            </p>
            <input
              type="number" min="0"
              value={harvest[field]}
              onChange={e => onUpdate(field, parseInt(e.target.value) || 0)}
              className="text-center"
            />
          </div>
        ))}
      </div>
      {hasParty && (
        <div className="mt-2 pt-2 border-t border-hairline">
          <p className="text-xs text-muted mb-1 font-semibold">Mine (of the {harvest.harvested} harvested)</p>
          <input
            type="number" min="0" max={harvest.harvested}
            value={harvest.mine}
            onChange={e => onUpdate('mine', parseInt(e.target.value) || 0)}
            className="text-center w-24"
          />
        </div>
      )}
      <button
        type="button"
        onClick={() => onUpdate('confirmed', true)}
        className="mt-3 w-full flex items-center justify-center gap-2 bg-green text-white text-xs font-semibold py-2.5 rounded-lg hover:bg-green/90 transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
        Confirm
      </button>
    </div>
  )
}
