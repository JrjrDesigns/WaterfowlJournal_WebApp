import React, { useState, useEffect, useRef } from 'react'
import { fetchBlinds, createBlind, deleteBlind } from '../utils/api'
import { compressImage } from '../utils/compressImage'

interface Blind {
  id: string
  name: string
  description: string
  location: { lat: number; lng: number }
  blind_type?: string
  photo_base64?: string
}

const BLIND_TYPES = ['ground', 'pit', 'panel', 'a-frame', 'layout', 'boat']

export default function Blinds() {
  const [blinds, setBlinds] = useState<Blind[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [blindType, setBlindType] = useState('ground')
  const [lat, setLat] = useState('')
  const [lng, setLng] = useState('')
  const [photo, setPhoto] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleteTarget, setDeleteTarget] = useState<Blind | null>(null)

  useEffect(() => { loadBlinds() }, [])

  const loadBlinds = async () => {
    setLoading(true)
    try {
      const data = await fetchBlinds()
      setBlinds(data)
    } catch { /* ignore */ } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    setName(''); setDescription(''); setBlindType('ground')
    setLat(''); setLng(''); setPhoto(null)
  }

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPhoto(await compressImage(file))
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !description) { setError('Name and description are required'); return }

    let location = { lat: 0, lng: 0 }
    if (lat || lng) {
      const latNum = parseFloat(lat)
      const lngNum = parseFloat(lng)
      if (isNaN(latNum) || isNaN(lngNum)) { setError('Enter valid coordinates or leave both empty'); return }
      location = { lat: latNum, lng: lngNum }
    }

    setCreating(true)
    try {
      await createBlind({ name, description, blind_type: blindType, location, photo_base64: photo })
      setShowModal(false)
      resetForm()
      loadBlinds()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create blind')
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await deleteBlind(deleteTarget.id)
      setDeleteTarget(null)
      loadBlinds()
    } catch { /* ignore */ }
  }

  const typeLabel = (t: string | undefined) =>
    !t ? 'Ground' : t === 'a-frame' ? 'A-Frame' : t.charAt(0).toUpperCase() + t.slice(1)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/50">
          <div className="bg-surface border border-hairline rounded-2xl p-6 w-full max-w-sm shadow-lg">
            <h3 className="text-lg font-semibold text-ink mb-2">Delete "{deleteTarget.name}"?</h3>
            <p className="text-muted text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2.5 rounded-lg border border-hairline text-muted hover:text-ink text-sm font-semibold transition-colors">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Blind Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-ink/50 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-surface border border-hairline rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col shadow-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
              <h2 className="font-display text-2xl text-ink tracking-wider">NEW SPOT</h2>
              <button onClick={() => { setShowModal(false); resetForm(); setError('') }} className="text-muted hover:text-ink transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}

              {/* Photo */}
              <div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-36 border-2 border-dashed border-hairline hover:border-ink rounded-xl overflow-hidden transition-colors"
                >
                  {photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-muted hover:text-ink transition-colors">
                      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span className="text-sm font-semibold">Add Photo</span>
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Spot Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="North Point Blind" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the location and setup" rows={3} className="resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Blind Type</label>
                <div className="flex flex-wrap gap-2">
                  {BLIND_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBlindType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        blindType === type
                          ? 'bg-ink border-ink text-white'
                          : 'bg-surface border-hairline text-muted hover:border-ink hover:text-ink'
                      }`}
                    >
                      {typeLabel(type)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Coordinates (optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" />
                  <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" />
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {creating ? 'Creating…' : 'Save Spot'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Saved Spots
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">MY BLINDS</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-ink hover:bg-black text-white font-semibold px-4 py-2.5 rounded-lg transition-colors text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          New Spot
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
        </div>
      ) : blinds.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted font-semibold">No spots saved yet.</p>
          <p className="text-muted text-sm mt-1">Tap "New Spot" to add your first blind.</p>
        </div>
      ) : (
        <div className="bg-surface rounded-xl border border-hairline overflow-hidden">
          <div className="divide-y divide-hairline">
            {blinds.map(blind => (
              <div key={blind.id} className="flex items-stretch gap-0 overflow-hidden">
                {/* Thumbnail */}
                <div className="w-20 flex-shrink-0 bg-bg flex items-center justify-center border-r border-hairline">
                  {blind.photo_base64 ? (
                    <img src={blind.photo_base64} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-7 h-7 text-muted/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    </svg>
                  )}
                </div>

                <div className="flex-1 px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-ink text-sm truncate">{blind.name}</p>
                      <p className="text-xs text-muted uppercase tracking-wider mt-0.5 font-semibold">
                        {typeLabel(blind.blind_type)}
                      </p>
                    </div>
                    <button onClick={() => setDeleteTarget(blind)} className="text-muted hover:text-red-500 transition-colors flex-shrink-0 mt-0.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-xs text-muted mt-1 line-clamp-1">{blind.description}</p>
                  <p className="text-xs text-muted/60 mt-1 font-mono">
                    {blind.location.lat.toFixed(4)}, {blind.location.lng.toFixed(4)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
