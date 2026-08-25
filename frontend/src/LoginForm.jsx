import { useState } from 'react'
import { login } from './lib/auth'
import { inputClass, primaryButtonClass } from './RecipeFormFields'

export default function LoginForm({ onLoggedIn }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username, password)
      onLoggedIn()
    } catch {
      setError('Invalid username or password')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-stone-50">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-lg shadow-sm border border-stone-200">
        <h1 className="text-2xl font-semibold text-stone-900 tracking-tight">Cookbook</h1>
        <p className="text-sm text-stone-500 mb-6">Sign in to continue</p>

        <label htmlFor="username" className="block text-sm font-medium text-stone-700 mb-1">Username</label>
        <input
          id="username"
          className={`${inputClass} mb-4 py-2`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
          autoComplete="username"
        />

        <label htmlFor="password" className="block text-sm font-medium text-stone-700 mb-1">Password</label>
        <input
          id="password"
          type="password"
          className={`${inputClass} mb-4 py-2`}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />

        {error && (
          <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-md px-3 py-2 mb-4" role="alert">
            {error}
          </p>
        )}

        <button type="submit" disabled={loading} className={`${primaryButtonClass} w-full py-2`}>
          {loading ? 'Logging in…' : 'Log in'}
        </button>
      </form>
    </div>
  )
}
