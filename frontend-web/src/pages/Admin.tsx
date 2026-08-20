import React, { useState, useEffect, useCallback } from 'react'
import { fetchAdminOverview, fetchAdminUser, setAdminUserCategory } from '../utils/api'

type Category = 'user' | 'tester' | 'insider'

interface UserRow {
  id: string
  name: string
  email: string
  category: Category
  plan: string
  subscription_status: string
  ever_paid: boolean
  created_at: string | null
  days_since_signup: number | null
  last_active: string | null
  hunts: number
  locations: number
  blinds: number
  photos: number
  birds: number
  deletion_scheduled_for: string | null
}

interface Overview {
  generated_at: string
  totals: {
    new_users: number
    activated: number
    pro: number
    testers: number
    insiders: number
  }
  users: UserRow[]
}

interface Detail {
  user: UserRow
  locations: Array<{ id: string; name: string; location_type: string; blinds: number; created_at: string | null }>
  blinds: Array<{ id: string; name: string; blind_type: string; created_at: string | null }>
  hunts: Array<{
    id: string
    name: string
    date: string
    blind_name: string
    birds: number
    photos: number
    party: number
    has_notes: boolean
    time_of_day: string
    created_at: string | null
  }>
}

const CATEGORY_LABELS: Record<Category, string> = {
  user: 'New user',
  tester: 'Beta tester',
  insider: 'Friends & family',
}

/** Dates come back as UTC. Show them in whatever zone I'm reading this in. */
function parse(iso: string | null): Date | null {
  if (!iso) return null
  const d = new Date(iso)
  return isNaN(d.getTime()) ? null : d
}

/** Whole days between local midnights — so a signup at 11pm last night reads
 *  as yesterday rather than "20 hours", which is how I actually think about it. */
function daysAgo(iso: string | null): number | null {
  const d = parse(iso)
  if (!d) return null
  const then = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const today = new Date()
  const midnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  return Math.round((midnight.getTime() - then.getTime()) / 86400000)
}

function relative(iso: string | null): string {
  const days = daysAgo(iso)
  if (days === null) return '—'
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 60) return 'Last month'
  return `${Math.floor(days / 30)} months ago`
}

function fullDate(iso: string | null): string {
  const d = parse(iso)
  if (!d) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

function dateAndTime(iso: string | null): string {
  const d = parse(iso)
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  })
}

/** A hunt's own date field is a plain YYYY-MM-DD, not a timestamp. */
function huntDate(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return value || '—'
  const [y, m, d] = value.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric',
  })
}

function PlanBadge({ plan, everPaid }: { plan: string; everPaid: boolean }) {
  const isPro = plan === 'pro'
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap ${
      isPro
        ? 'text-green border-green/30 bg-green/5'
        : everPaid
          ? 'text-amber-600 border-amber-500/30 bg-amber-500/5'
          : 'text-muted border-hairline bg-bg'
    }`}>
      {isPro ? 'PRO' : everPaid ? 'LAPSED' : 'FREE'}
    </span>
  )
}

function StatTile({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="bg-surface border border-hairline rounded-xl p-4">
      <p className="font-display text-3xl text-ink leading-none tracking-wide">{value}</p>
      <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mt-1.5">{label}</p>
      {hint && <p className="text-[11px] text-muted mt-0.5">{hint}</p>}
    </div>
  )
}

/** "3 hunts · 1 location" — only the things they actually did. */
function activityLine(u: { hunts: number; locations: number; blinds: number }): string {
  const parts: string[] = []
  if (u.hunts) parts.push(`${u.hunts} hunt${u.hunts === 1 ? '' : 's'}`)
  if (u.locations) parts.push(`${u.locations} location${u.locations === 1 ? '' : 's'}`)
  if (u.blinds) parts.push(`${u.blinds} blind${u.blinds === 1 ? '' : 's'}`)
  return parts.length ? parts.join(' · ') : 'Nothing logged yet'
}

function UserDetail({ id, onBack, onCategoryChange }: {
  id: string
  onBack: () => void
  onCategoryChange: (id: string, category: Category) => void
}) {
  const [detail, setDetail] = useState<Detail | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    setError('')
    fetchAdminUser(id)
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(err => { if (!cancelled) setError(err.message || 'Could not load this account') })
    return () => { cancelled = true }
  }, [id])

  const changeCategory = async (category: Category) => {
    if (!detail) return
    setSaving(true)
    try {
      await setAdminUserCategory(id, category)
      setDetail({ ...detail, user: { ...detail.user, category } })
      onCategoryChange(id, category)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm font-semibold text-muted hover:text-ink mb-5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        All signups
      </button>

      {error && (
        <div className="bg-surface border border-hairline rounded-xl p-4 text-sm text-ink">{error}</div>
      )}

      {!detail && !error && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-ink" />
        </div>
      )}

      {detail && (
        <>
          <div className="bg-surface border border-hairline rounded-xl p-5 mb-4">
            <div className="flex items-start gap-4">
              <div className="w-11 h-11 bg-ink rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-base font-bold text-white">
                  {detail.user.name.charAt(0).toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-ink truncate">{detail.user.name}</p>
                <p className="text-muted text-sm truncate">{detail.user.email}</p>
                <p className="text-muted text-xs mt-1">
                  Joined {fullDate(detail.user.created_at)} · {relative(detail.user.created_at)}
                </p>
              </div>
              <PlanBadge plan={detail.user.plan} everPaid={detail.user.ever_paid} />
            </div>

            {detail.user.deletion_scheduled_for && (
              <p className="mt-3 text-xs font-semibold text-amber-600">
                Deletion scheduled for {fullDate(detail.user.deletion_scheduled_for)}
              </p>
            )}

            <div className="mt-4 pt-4 border-t border-hairline">
              <p className="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2">
                Counts as
              </p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(CATEGORY_LABELS) as Category[]).map(cat => (
                  <button
                    key={cat}
                    disabled={saving}
                    onClick={() => changeCategory(cat)}
                    className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${
                      detail.user.category === cat
                        ? 'bg-ink text-white border-ink'
                        : 'bg-bg text-muted border-hairline hover:text-ink'
                    }`}
                  >
                    {CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2">
                Only accounts marked “New user” count toward the signup number.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-4">
            <StatTile label="Hunts" value={detail.hunts.length} />
            <StatTile label="Locations" value={detail.locations.length} />
            <StatTile label="Blinds" value={detail.blinds.length} />
            <StatTile label="Birds" value={detail.hunts.reduce((sum, h) => sum + h.birds, 0)} />
          </div>

          <Section title="Hunts logged" empty="No hunts logged." count={detail.hunts.length}>
            {detail.hunts.map(h => (
              <div key={h.id} className="px-4 py-3 border-b border-hairline last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-ink text-sm truncate">{h.name}</p>
                  <p className="text-xs text-muted whitespace-nowrap">{huntDate(h.date)}</p>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {[
                    h.blind_name || 'No blind',
                    h.time_of_day,
                    `${h.birds} bird${h.birds === 1 ? '' : 's'}`,
                    h.photos ? `${h.photos} photo${h.photos === 1 ? '' : 's'}` : null,
                    h.party ? `+${h.party} in party` : null,
                    h.has_notes ? 'notes' : null,
                  ].filter(Boolean).join(' · ')}
                </p>
                <p className="text-[11px] text-muted/70 mt-0.5">Logged {dateAndTime(h.created_at)}</p>
              </div>
            ))}
          </Section>

          <Section title="Locations" empty="No locations saved." count={detail.locations.length}>
            {detail.locations.map(l => (
              <div key={l.id} className="px-4 py-3 border-b border-hairline last:border-0">
                <div className="flex items-baseline justify-between gap-3">
                  <p className="font-semibold text-ink text-sm truncate">{l.name}</p>
                  <p className="text-xs text-muted whitespace-nowrap">{fullDate(l.created_at)}</p>
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {[l.location_type.replace(/-/g, ' '), `${l.blinds} blind${l.blinds === 1 ? '' : 's'}`]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
            ))}
          </Section>

          <Section title="Blinds" empty="No blinds saved." count={detail.blinds.length}>
            {detail.blinds.map(b => (
              <div key={b.id} className="px-4 py-3 border-b border-hairline last:border-0 flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink text-sm truncate">{b.name}</p>
                  <p className="text-xs text-muted mt-0.5">{b.blind_type}</p>
                </div>
                <p className="text-xs text-muted whitespace-nowrap">{fullDate(b.created_at)}</p>
              </div>
            ))}
          </Section>
        </>
      )}
    </div>
  )
}

function Section({ title, count, empty, children }: {
  title: string
  count: number
  empty: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-surface border border-hairline rounded-xl mb-4 overflow-hidden">
      <div className="px-4 py-3 border-b border-hairline flex items-center justify-between">
        <p className="text-[11px] font-semibold text-muted uppercase tracking-wider">{title}</p>
        <p className="text-[11px] font-semibold text-muted">{count}</p>
      </div>
      {count === 0 ? <p className="px-4 py-5 text-sm text-muted">{empty}</p> : children}
    </div>
  )
}

export default function Admin() {
  const [overview, setOverview] = useState<Overview | null>(null)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<Category | 'all'>('user')
  const [selected, setSelected] = useState<string | null>(null)

  const load = useCallback(() => {
    setError('')
    fetchAdminOverview()
      .then(setOverview)
      .catch(err => setError(err.message || 'Could not load the dashboard'))
  }, [])

  useEffect(() => { load() }, [load])

  // Keep the list in step with a reclassification without another round trip.
  const applyCategory = (id: string, category: Category) => {
    setOverview(prev => {
      if (!prev) return prev
      const users = prev.users.map(u => (u.id === id ? { ...u, category } : u))
      const real = users.filter(u => u.category === 'user')
      return {
        ...prev,
        users,
        totals: {
          ...prev.totals,
          new_users: real.length,
          activated: real.filter(u => u.hunts || u.locations).length,
          pro: real.filter(u => u.plan === 'pro').length,
          testers: users.filter(u => u.category === 'tester').length,
          insiders: users.filter(u => u.category === 'insider').length,
        },
      }
    })
  }

  if (selected) {
    return (
      <UserDetail
        id={selected}
        onBack={() => setSelected(null)}
        onCategoryChange={applyCategory}
      />
    )
  }

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-10 text-center">
        <h1 className="font-display text-3xl text-ink tracking-wider mb-2">NOT AVAILABLE</h1>
        <p className="text-sm text-muted">{error}</p>
        <button
          onClick={load}
          className="mt-4 text-xs font-semibold uppercase tracking-wider text-ink border border-hairline rounded-lg px-4 py-2"
        >
          Try again
        </button>
      </div>
    )
  }

  if (!overview) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-ink" />
      </div>
    )
  }

  const { totals } = overview
  const realUsers = overview.users.filter(u => u.category === 'user')
  const signedUpWithin = (days: number) =>
    realUsers.filter(u => {
      const ago = daysAgo(u.created_at)
      return ago !== null && ago <= days
    }).length
  const newToday = signedUpWithin(0)
  const newYesterday = signedUpWithin(1) - newToday
  const newThisWeek = signedUpWithin(6)

  const tabs: Array<{ key: Category | 'all'; label: string; count: number }> = [
    { key: 'user', label: 'New users', count: totals.new_users },
    { key: 'tester', label: 'Testers', count: totals.testers },
    { key: 'insider', label: 'Friends', count: totals.insiders },
    { key: 'all', label: 'All', count: overview.users.length },
  ]
  const visible = tab === 'all' ? overview.users : overview.users.filter(u => u.category === tab)

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-0.5 flex items-center gap-2">
            <span className="inline-block w-5 h-px bg-muted/50" />
            Internal
          </p>
          <h1 className="font-display text-4xl text-ink tracking-wider leading-none">SIGNUPS</h1>
        </div>
        <button
          onClick={() => { setOverview(null); load() }}
          className="text-xs font-semibold uppercase tracking-wider text-muted hover:text-ink border border-hairline rounded-lg px-3 py-1.5"
        >
          Refresh
        </button>
      </div>

      {/* The headline number, with testers and my own circle already removed. */}
      <div className="bg-surface border border-hairline rounded-xl p-5 mb-3">
        <p className="font-display text-6xl text-ink leading-none tracking-wide">{totals.new_users}</p>
        <p className="text-xs font-semibold text-muted uppercase tracking-wider mt-2">
          Real new users
        </p>
        <p className="text-sm text-ink mt-2">
          {newToday} today · {newYesterday} yesterday
        </p>
        <p className="text-xs text-muted mt-1">
          Excludes {totals.testers} beta tester{totals.testers === 1 ? '' : 's'} and{' '}
          {totals.insiders} friends &amp; family account{totals.insiders === 1 ? '' : 's'}.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-6">
        <StatTile label="This week" value={newThisWeek} hint="last 7 days" />
        <StatTile label="Activated" value={totals.activated} hint="logged something" />
        <StatTile label="Paying" value={totals.pro} hint="on Pro" />
      </div>

      <div className="flex gap-1.5 mb-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg border whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-ink text-white border-ink'
                : 'bg-surface text-muted border-hairline hover:text-ink'
            }`}
          >
            {t.label} <span className="opacity-60">{t.count}</span>
          </button>
        ))}
      </div>

      <div className="bg-surface border border-hairline rounded-xl overflow-hidden">
        {visible.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted">Nobody in this group yet.</p>
        ) : visible.map(u => (
          <button
            key={u.id}
            onClick={() => setSelected(u.id)}
            className="w-full text-left px-4 py-3.5 border-b border-hairline last:border-0 hover:bg-ink/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-ink text-sm truncate">{u.name}</p>
                  <PlanBadge plan={u.plan} everPaid={u.ever_paid} />
                  {tab === 'all' && u.category !== 'user' && (
                    <span className="text-[10px] font-semibold text-muted border border-hairline rounded-full px-2 py-0.5 whitespace-nowrap">
                      {u.category === 'tester' ? 'TESTER' : 'FRIEND'}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted truncate">{u.email}</p>
                <p className={`text-xs mt-1 ${u.hunts || u.locations ? 'text-ink' : 'text-muted'}`}>
                  {activityLine(u)}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs font-semibold text-ink whitespace-nowrap">{relative(u.created_at)}</p>
                <p className="text-[11px] text-muted whitespace-nowrap">{fullDate(u.created_at)}</p>
              </div>
              <svg className="w-4 h-4 text-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-muted text-center mt-4">
        Updated {dateAndTime(overview.generated_at)}
      </p>
    </div>
  )
}
