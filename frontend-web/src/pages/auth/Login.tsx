import React, { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LogoStacked } from '../../components/Logo'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    if (sessionStorage.getItem('sessionExpired')) {
      sessionStorage.removeItem('sessionExpired')
      setError('Your session expired. Please sign in again.')
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email || !password) {
      setError('Please fill in all fields')
      return
    }
    setLoading(true)
    try {
      await login(email.trim().toLowerCase(), password)
      navigate('/hunts')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-2">
            <LogoStacked className="h-28 w-auto" />
          </div>
          <p className="text-muted text-sm mt-2">A field journal for waterfowl hunters</p>
        </div>

        <div className="bg-surface rounded-2xl border border-hairline p-7 shadow-sm">
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

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Password</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-muted text-sm mt-5">
            No account?{' '}
            <Link to="/auth/register" className="text-ink font-semibold underline underline-offset-2">
              Create one
            </Link>
          </p>
        </div>

        {/* Test credentials — remove before production */}
        <div className="mt-5 p-4 bg-surface border border-hairline rounded-xl">
          <p className="text-xs font-semibold text-muted uppercase tracking-widest mb-2">Test Account</p>
          <p className="text-xs text-muted font-mono">hunter@test.com</p>
          <p className="text-xs text-muted font-mono">test123</p>
        </div>
      </div>
    </div>
  )
}
