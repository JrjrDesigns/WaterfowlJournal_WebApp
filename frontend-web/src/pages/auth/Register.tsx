import React, { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../contexts/AuthContext'
import { LogoStacked } from '../../components/Logo'

export default function Register() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { register } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!name || !email || !password) {
      setError('Please fill in all fields')
      return
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      await register(email.trim().toLowerCase(), password, name.trim())
      navigate('/hunts')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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
          <p className="text-muted text-sm mt-2">Start logging your hunts today</p>
        </div>

        <div className="bg-surface rounded-2xl border border-hairline p-7 shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
                {error}
                <Link to="/diagnostics" className="block underline underline-offset-2 mt-1.5 font-semibold">
                  Test my connection
                </Link>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-muted uppercase tracking-wider mb-2">Full Name</label>
              <input
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="John Hunter"
                autoComplete="name"
                required
              />
            </div>

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
                placeholder="Min 6 characters"
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-ink hover:bg-black disabled:opacity-50 text-white font-semibold py-3 rounded-lg transition-colors text-sm mt-2"
            >
              {loading ? 'Creating account…' : 'Create Account'}
            </button>

            <p className="text-center text-muted text-xs leading-relaxed">
              By creating an account you agree to our{' '}
              <a href="https://blindguideapp.com/terms" target="_blank" rel="noopener noreferrer"
                className="text-ink underline underline-offset-2">Terms of Service</a>
              {' '}and{' '}
              <a href="https://blindguideapp.com/privacy" target="_blank" rel="noopener noreferrer"
                className="text-ink underline underline-offset-2">Privacy Policy</a>.
            </p>
          </form>

          <p className="text-center text-muted text-sm mt-5">
            Already have an account?{' '}
            <Link to="/auth/login" className="text-ink font-semibold underline underline-offset-2">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
