import React, { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { LogoStacked } from '../../components/Logo'
import { resetPassword } from '../../utils/api'

export default function ResetPassword() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') || ''
  const navigate = useNavigate()

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError("Those passwords don't match")
      return
    }
    setLoading(true)
    try {
      await resetPassword(token, password)
      setDone(true)
      setTimeout(() => navigate('/auth/login'), 2500)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not reset your password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <LogoStacked className="h-[168px] w-auto" />
          </div>
          <p className="text-muted text-sm mt-2">Choose a new password</p>
        </div>

        <div className="bg-surface rounded-2xl border border-hairline p-7 shadow-sm">
          {!token ? (
            <>
              <p className="text-sm text-ink leading-relaxed">
                This reset link is missing its code. Request a new one and use the most
                recent email.
              </p>
              <Link
                to="/auth/forgot"
                className="block text-center w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-6"
              >
                Request a New Link
              </Link>
            </>
          ) : done ? (
            <>
              <p className="text-sm text-ink leading-relaxed">
                Your password has been reset. Taking you to sign in…
              </p>
              <Link
                to="/auth/login"
                className="block text-center w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-6"
              >
                Sign In
              </Link>
            </>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  autoComplete="new-password"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Confirm Password</label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  placeholder="Type it again"
                  autoComplete="new-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
              >
                {loading ? 'Saving…' : 'Set New Password'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
