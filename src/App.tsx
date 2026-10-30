import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, isConfigured } from './lib/supabase'
import Login, { SetNewPassword } from './components/Login'
import AppShell from './components/AppShell'

// A password reset link lands here with #...type=recovery (read before Supabase tidies the address bar)
const recoveryLink = typeof window !== 'undefined' && /type=recovery/.test(window.location.hash)

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [checking, setChecking] = useState(true)
  const [recovering, setRecovering] = useState(recoveryLink)

  useEffect(() => {
    if (!isConfigured) { setChecking(false); return }
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      setSession(s)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  if (!isConfigured) return <NotConfigured />
  if (checking) return <Splash />
  if (!session) return <Login />
  if (recovering) return <SetNewPassword onDone={() => setRecovering(false)} />
  return <AppShell email={session.user.email ?? ''} userId={session.user.id} />
}

function Splash() {
  return (
    <div className="min-h-screen grid place-items-center bg-header text-header-muted">
      <span className="text-sm font-bold tracking-[0.2em] uppercase">Jae's Runway</span>
    </div>
  )
}

function NotConfigured() {
  return (
    <div className="min-h-screen grid place-items-center bg-bg safe-x">
      <div className="max-w-md rounded-2xl border border-line bg-surface p-6 flex flex-col gap-3">
        <h1 className="m-0 text-2xl font-bold">Almost there</h1>
        <p className="m-0 text-muted">
          Runway can't find its Supabase keys. In Vercel, open this project's <b>Settings → Environment Variables</b> and add:
        </p>
        <ul className="m-0 pl-5 text-sm flex flex-col gap-1">
          <li><code>VITE_SUPABASE_URL</code></li>
          <li><code>VITE_SUPABASE_ANON_KEY</code></li>
        </ul>
        <p className="m-0 text-muted text-sm">Then redeploy (Deployments → ⋯ → Redeploy).</p>
      </div>
    </div>
  )
}
