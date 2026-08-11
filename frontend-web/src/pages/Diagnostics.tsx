import React, { useEffect, useState } from 'react'

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8001'

type Status = 'running' | 'pass' | 'fail'

interface Result {
  key: string
  label: string
  meaning: string
  status: Status
  detail: string
  ms?: number
}

const withTimeout = async (fn: (signal: AbortSignal) => Promise<Response>, ms = 12000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  try {
    return await fn(controller.signal)
  } finally {
    clearTimeout(timer)
  }
}

const describe = (err: unknown): string => {
  if (err instanceof DOMException && err.name === 'AbortError') return 'timed out after 12s'
  if (err instanceof Error) return `${err.name}: ${err.message}`
  return String(err)
}

/**
 * A self-service network check, reachable without signing in.
 *
 * When a fetch fails there is no way to tell from the message whether the
 * request was blocked before it left the device, refused somewhere in between,
 * or rejected by the server — the browser reports all three as the same
 * TypeError. These checks separate those cases so a user can send back one
 * screenshot that actually says what's wrong.
 */
export default function Diagnostics() {
  const [results, setResults] = useState<Result[]>([])
  const [done, setDone] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { void run() }, [])

  const push = (r: Result) => setResults(prev => [...prev.filter(p => p.key !== r.key), r])

  const run = async () => {
    setDone(false)
    setResults([])
    const out: Result[] = []
    const record = (r: Result) => { out.push(r); push(r) }

    // 1 — what the device itself thinks
    record({
      key: 'online',
      label: 'Your device says it has internet',
      meaning: 'If this fails, the phone knows it is offline — turn Wi-Fi or data back on.',
      status: navigator.onLine ? 'pass' : 'fail',
      detail: `navigator.onLine = ${navigator.onLine}`,
    })

    // 2 — can we reach the site this page came from
    let t = performance.now()
    try {
      await withTimeout(signal => fetch(`/?probe=${Date.now()}`, { signal, cache: 'no-store' }))
      record({
        key: 'site', label: 'The Blind Guide website is reachable',
        meaning: 'Confirms the app itself loads. This page is proof, but it re-checks live.',
        status: 'pass', detail: 'app.blindguideapp.com responded', ms: Math.round(performance.now() - t),
      })
    } catch (err) {
      record({
        key: 'site', label: 'The Blind Guide website is reachable',
        meaning: 'The website itself is blocked or offline.',
        status: 'fail', detail: describe(err), ms: Math.round(performance.now() - t),
      })
    }

    // 3 — THE IMPORTANT ONE. `no-cors` skips all browser security checks, so it
    // fails only if the request genuinely could not reach the server: DNS,
    // firewall, content blocker, VPN, or a TLS rejection.
    let networkReached = false
    t = performance.now()
    try {
      await withTimeout(signal =>
        fetch(`${API_URL}/api/health?probe=${Date.now()}`, { mode: 'no-cors', signal, cache: 'no-store' }))
      networkReached = true
      record({
        key: 'reach', label: 'The Blind Guide server can be reached',
        meaning: 'Your network lets this device talk to our server.',
        status: 'pass', detail: 'connection succeeded', ms: Math.round(performance.now() - t),
      })
    } catch (err) {
      record({
        key: 'reach', label: 'The Blind Guide server can be reached',
        meaning: 'Something on this network or device is blocking our server outright — '
               + 'commonly a content blocker, VPN, DNS filter, or restricted Wi-Fi.',
        status: 'fail', detail: describe(err), ms: Math.round(performance.now() - t),
      })
    }

    // 4 — a normal, security-checked request
    t = performance.now()
    try {
      const res = await withTimeout(signal =>
        fetch(`${API_URL}/api/health?probe=${Date.now()}`, { signal, cache: 'no-store' }))
      const body = await res.text()
      record({
        key: 'api', label: 'The server answers normally',
        meaning: 'A regular request works end to end.',
        status: res.ok ? 'pass' : 'fail',
        detail: `HTTP ${res.status} — ${body.slice(0, 80)}`, ms: Math.round(performance.now() - t),
      })
    } catch (err) {
      record({
        key: 'api', label: 'The server answers normally',
        meaning: networkReached
          ? 'The server is reachable but the browser refused the reply — a security '
          + '(CORS) problem, or something rewriting traffic in between.'
          : 'Same block as above.',
        status: 'fail', detail: describe(err), ms: Math.round(performance.now() - t),
      })
    }

    // 5 — the exact shape of request that has been failing for the tester:
    // a POST with a JSON body, which needs a CORS preflight first.
    // example.com is reserved and can never have an account, so this looks up
    // nothing and emails nobody. (A `.invalid` address is rejected outright by
    // the server's email validation, which read as a failure of this check.)
    t = performance.now()
    try {
      const res = await withTimeout(signal =>
        fetch(`${API_URL}/api/auth/forgot-password`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'connection-test@example.com' }), signal,
        }))
      record({
        key: 'post', label: 'Sign-up and password-reset requests work',
        meaning: 'This is the exact request that has been failing.',
        status: res.ok ? 'pass' : 'fail',
        detail: `HTTP ${res.status}`, ms: Math.round(performance.now() - t),
      })
    } catch (err) {
      record({
        key: 'post', label: 'Sign-up and password-reset requests work',
        meaning: 'This is the exact request that has been failing.',
        status: 'fail', detail: describe(err), ms: Math.round(performance.now() - t),
      })
    }

    setDone(true)
    return out
  }

  const verdict = (): { title: string; body: string } => {
    const get = (k: string) => results.find(r => r.key === k)
    if (get('online')?.status === 'fail')
      return { title: 'This device is offline', body: 'Turn on Wi-Fi or mobile data and run this again.' }
    if (get('reach')?.status === 'fail')
      return {
        title: 'Something is blocking our server',
        body: 'The connection never got through. The usual causes are a content or ad blocker, '
            + 'a VPN or private-relay setting, a DNS filter on the router, or a guest/work Wi-Fi '
            + 'that restricts traffic. Try mobile data with Wi-Fi off — if it works there, the '
            + 'block is on that Wi-Fi network.',
      }
    if (get('api')?.status === 'fail' || get('post')?.status === 'fail')
      return {
        title: 'The server is reachable but the reply was refused',
        body: 'This one is on our side, or something is rewriting traffic in between. '
            + 'Send this screenshot over.',
      }
    if (done)
      return {
        title: 'Everything works from this device',
        body: 'All checks passed, so sign-up and password reset should work right now. '
            + 'If they still fail, screenshot this page along with the error you get.',
      }
    return { title: 'Checking…', body: 'Running a few tests against our server.' }
  }

  const copy = () => {
    const text = [
      `Blind Guide connection check — ${new Date().toISOString()}`,
      `Device: ${navigator.userAgent}`,
      `API: ${API_URL}`,
      '',
      ...results.map(r => `[${r.status.toUpperCase()}] ${r.label}${r.ms != null ? ` (${r.ms}ms)` : ''}\n    ${r.detail}`),
    ].join('\n')
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    })
  }

  const v = verdict()

  return (
    <div className="min-h-screen bg-bg p-5">
      <div className="w-full max-w-md mx-auto">
        <h1 className="font-display text-3xl text-ink tracking-wider leading-none mt-4">
          CONNECTION CHECK
        </h1>
        <p className="text-muted text-sm mt-2 leading-relaxed">
          This tests whether your device can reach Blind Guide, and where it stops if it can't.
          Nothing here changes your account.
        </p>

        <div className={`rounded-xl border p-5 mt-5 ${
          !done ? 'border-hairline bg-surface'
            : v.title.startsWith('Everything') ? 'border-green/30 bg-green/5'
            : 'border-red-200 bg-red-50'
        }`}>
          <p className="text-sm font-semibold text-ink">{v.title}</p>
          <p className="text-xs text-muted mt-1.5 leading-relaxed">{v.body}</p>
        </div>

        <div className="mt-4 space-y-2">
          {results.map(r => (
            <div key={r.key} className="bg-surface border border-hairline rounded-lg p-4">
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 text-sm font-bold ${
                  r.status === 'pass' ? 'text-green' : r.status === 'fail' ? 'text-red-600' : 'text-muted'
                }`}>
                  {r.status === 'pass' ? '✓' : r.status === 'fail' ? '✕' : '…'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{r.label}</p>
                  <p className="text-xs text-muted mt-0.5 leading-relaxed">{r.meaning}</p>
                  <p className="text-[11px] text-muted/70 mt-1.5 font-mono break-words">
                    {r.detail}{r.ms != null ? ` · ${r.ms}ms` : ''}
                  </p>
                </div>
              </div>
            </div>
          ))}
          {!done && <p className="text-xs text-muted text-center py-2">Running checks…</p>}
        </div>

        {done && (
          <>
            <button
              onClick={copy}
              className="w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-lg text-sm transition-colors mt-5"
            >
              {copied ? 'Copied — paste it in a message' : 'Copy these results'}
            </button>
            <button
              onClick={() => void run()}
              className="w-full border border-hairline text-ink font-semibold py-3 rounded-lg text-sm mt-2"
            >
              Run again
            </button>
          </>
        )}

        <p className="text-[11px] text-muted/60 mt-5 break-words leading-relaxed">
          {navigator.userAgent}
        </p>
      </div>
    </div>
  )
}
