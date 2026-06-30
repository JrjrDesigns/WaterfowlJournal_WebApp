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

const typeColors: Record<string, string> = {
  ground: 'text-amber-600',
  pit: 'text-yellow-700',
  panel: 'text-orange-600',
  'a-frame': 'text-red-600',
  layout: 'text-orange-500',
  boat: 'text-blue-500',
}

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

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Delete confirm */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70">
          <div className="bg-navy-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Delete "{deleteTarget.name}"?</h3>
            <p className="text-gray-400 text-sm mb-6">This cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)} className="flex-1 py-2 rounded-lg border border-gray-700 text-gray-400 hover:text-white text-sm font-semibold">Cancel</button>
              <button onClick={handleDelete} className="flex-1 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold">Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Blind Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4">
          <div className="w-full sm:max-w-lg bg-navy-900 border border-gray-700 rounded-t-2xl sm:rounded-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
              <h2 className="text-lg font-bold text-white">New Blind</h2>
              <button onClick={() => { setShowModal(false); resetForm(); setError('') }} className="text-gray-400 hover:text-white">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleCreate} className="overflow-y-auto flex-1 px-6 py-4 space-y-4">
              {error && (
                <div className="bg-red-500/15 border border-red-500/40 text-red-400 text-sm px-4 py-3 rounded-lg">{error}</div>
              )}

              {/* Photo */}
              <div>
                <input ref={fileRef} type="file" accept="image/*" onChange={handlePhotoUpload} className="hidden" />
                <button type="button" onClick={() => fileRef.current?.click()} className="w-full h-36 border-2 border-dashed border-gray-700 hover:border-orange-500/50 rounded-xl overflow-hidden transition-colors">
                  {photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 hover:text-orange-500 transition-colors">
                      <svg className="w-8 h-8 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      </svg>
                      <span className="text-sm font-semibold">Add Photo</span>
                    </div>
                  )}
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Blind Name</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g., North Point Blind" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Describe the blind location and setup" rows={3} className="resize-none" />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Blind Type</label>
                <div className="flex flex-wrap gap-2">
                  {BLIND_TYPES.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setBlindType(type)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                        blindType === type
                          ? 'bg-orange-500 border-orange-500 text-white'
                          : 'bg-navy-800 border-gray-700 text-gray-400 hover:border-gray-500'
                      }`}
                    >
                      {type === 'a-frame' ? 'A-Frame' : type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Location (Optional)</label>
                <div className="grid grid-cols-2 gap-2">
                  <input type="number" step="any" value={lat} onChange={e => setLat(e.target.value)} placeholder="Latitude" />
                  <input type="number" step="any" value={lng} onChange={e => setLng(e.target.value)} placeholder="Longitude" />
                </div>
              </div>

              <button
                type="submit"
                disabled={creating}
                className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors"
              >
                {creating ? 'Creating...' : 'Create Blind'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-white uppercase tracking-wider">My Blinds</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-4 py-2 rounded-xl transition-colors text-sm uppercase tracking-wider"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Add Blind
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-orange-500" />
        </div>
      ) : blinds.length === 0 ? (
        <div className="text-center py-20">
          <div className="w-20 h-20 bg-navy-800 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-10 h-10 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            </svg>
          </div>
          <p className="text-gray-400 font-semibold">No blinds added yet</p>
          <p className="text-gray-600 text-sm mt-1">Tap "Add Blind" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {blinds.map(blind => (
            <div key={blind.id} className="flex items-stretch gap-3 bg-navy-800 border border-gray-700 rounded-xl overflow-hidden">
              {/* Thumbnail */}
              <div className="w-20 flex-shrink-0 bg-navy-700 flex items-center justify-center">
                {blind.photo_base64 ? (
                  <img src={blind.photo_base64} alt="" className="w-full h-full object-cover" />
                ) : (
                  <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                  </svg>
                )}
              </div>

              <div className="flex-1 py-3 pr-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-white text-sm truncate">{blind.name}</p>
                    <p className={`text-xs font-semibold uppercase tracking-wider mt-0.5 ${typeColors[blind.blind_type || 'ground'] || 'text-orange-500'}`}>
                      {blind.blind_type === 'a-frame' ? 'A-Frame' : (blind.blind_type || 'Ground').charAt(0).toUpperCase() + (blind.blind_type || 'ground').slice(1)}
                    </p>
                  </div>
                  <button onClick={() => setDeleteTarget(blind)} className="text-gray-600 hover:text-red-400 transition-colors flex-shrink-0">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1 line-clamp-1">{blind.description}</p>
                <p className="text-xs text-gray-600 mt-1 font-mono">
                  {blind.location.lat.toFixed(4)}, {blind.location.lng.toFixed(4)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
