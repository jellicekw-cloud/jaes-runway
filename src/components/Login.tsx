import { useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    setBusy(false)
    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'That email and password don\'t match. Check both and try again.'
        : error.message)
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-header text-white safe-x">
      <div className="flex-1 grid place-items-center py-10">
        <form onSubmit={onSubmit} className="w-full max-w-sm flex flex-col gap-5">
          <div className="flex flex-col items-center gap-3 text-center">
            <img src="/logo-emblem.png" alt="" width={240} height={240} className="w-60 max-w-[70vw] h-auto drop-shadow-[0_18px_30px_rgba(0,0,0,.5)]" />
            <h1 className="sr-only">Jae's Runway</h1>
          </div>

          <label className="flex flex-col gap-1.5" htmlFor="email">
            <span className="text-xs font-bold tracking-widest uppercase text-header-muted">Email</span>
            <input
              id="email" type="email" autoComplete="email" required value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-12 rounded-xl border border-header-2 bg-header-2 px-4 text-white placeholder:text-header-muted focus:outline-none focus:border-accent-hi"
            />
          </label>

          <label className="flex flex-col gap-1.5" htmlFor="password">
            <span className="text-xs font-bold tracking-widest uppercase text-header-muted">Password</span>
            <input
              id="password" type="password" autoComplete="current-password" required value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 rounded-xl border border-header-2 bg-header-2 px-4 text-white focus:outline-none focus:border-accent-hi"
            />
          </label>

          {error && <p role="alert" className="m-0 rounded-xl bg-bad/20 border border-bad px-4 py-3 text-sm">{error}</p>}

          <button
            type="submit" disabled={busy}
            className="h-12 rounded-xl border-0 bg-accent-hi text-white text-lg font-bold cursor-pointer disabled:opacity-60"
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
