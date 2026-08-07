import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { LogoStacked } from '../../components/Logo'
import { requestPasswordReset } from '../../utils/api'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email) {
      setError('Enter the email you signed up with')
      return
    }
    setLoading(true)
    try {
      await requestPasswordReset(email.trim().toLowerCase())
      setSent(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not send the reset link')
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
          <p className="text-muted text-sm mt-2">Reset your password</p>
        </div>

        <div className="bg-surface rounded-2xl border border-hairline p-7 shadow-sm">
          {sent ? (
            <>
              <p className="text-sm text-ink leading-relaxed">
                If that email has an account, a reset link is on its way. It's good for one hour.
              </p>
              <p className="text-xs text-muted leading-relaxed mt-3">
                Nothing arriving? Check your spam folder, and make sure you used the address
                you signed up with.
              </p>
              <Link
                to="/auth/login"
                className="block text-center w-full bg-ink hover:bg-black text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-6"
              >
                Back to Sign In
              </Link>
            </>
          ) : (
            <>
              <p className="text-sm text-muted leading-relaxed mb-5">
                Enter the email you signed up with and we'll send you a link to choose a new password.
              </p>

              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="hunter@example.com"
                    autoComplete="email"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
                >
                  {loading ? 'Sending…' : 'Send Reset Link'}
                </button>
              </form>

              <p className="text-center text-muted text-sm mt-5">
                Remembered it?{' '}
                <Link to="/auth/login" className="text-ink font-semibold underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
