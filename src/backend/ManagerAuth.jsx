import { useEffect, useState } from 'react'
import { backend } from './client.js'
import { loginIdentity } from './username.js'
import { canUseManager } from '../models/staffAccess.js'
import AuthLanding, { Field, PanelNote, SubmitButton } from '../components/AuthLanding.jsx'

export default function ManagerAuth({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [role, setRole] = useState(null)
  const [enabled, setEnabled] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let generation = 0
    let appliedUserId = null
    async function apply(next) {
      const current = ++generation
      // Focus and token refresh can repeat sign-in for the same account.
      // Recheck access without unmounting its dashboard and map.
      if (next?.user.id !== appliedUserId) setLoading(true)
      if (next) {
        const result = await backend.from('user_roles').select('role,enabled,version').eq('user_id', next.user.id).single()
        if (!active || current !== generation) return
        setAllowed(!result.error && canUseManager(result.data))
        setRole(result.data?.role ?? null)
        setEnabled(result.data?.enabled !== false)
        setError(result.error ? 'Could not confirm current staff access. Retry sign-in or refresh.' : '')
      } else setAllowed(false)
      if (active && current === generation) { appliedUserId = next?.user.id ?? null; setSession(next); setLoading(false) }
    }
    backend.auth.getSession().then(({ data, error }) => {
      if (error && active) { setError(error.message); setLoading(false); return }
      if (active) void apply(data.session)
    })
    const { data } = backend.auth.onAuthStateChange((_event, next) => {
      // Keep database queries outside the auth callback's internal lock.
      setTimeout(() => { if (active) void apply(next) }, 0)
    })
    const timer = setInterval(() => {
      backend.auth.getSession().then(({ data, error }) => {
        if (!active) return
        if (error) { setAllowed(false); setError('Could not confirm the session. Sign in again.'); return }
        void apply(data.session)
      })
    }, 15000)
    return () => { active = false; clearInterval(timer); data.subscription.unsubscribe() }
  }, [])
  async function signIn(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      const { error } = await backend.auth.signInWithPassword({ email: loginIdentity(email), password })
      if (error) throw error
    } catch (failure) { setError(failure.message) }
    finally { setBusy(false) }
  }
  if (loading) return <main className="min-h-screen bg-darkBg text-slate-200 grid place-items-center">Loading your account…</main>
  if (session && allowed) return children({ ...session.user, appRole: role })
  return <AuthLanding status="Shared records">
    {session ? <>
      <p className="text-sm leading-relaxed text-slate-300">{!enabled ? 'This account is suspended. Contact an administrator.' : 'This account does not have active staff access. Public accounts can use the mobile app to report and track accidents. An Admin manages staff access.'}</p>
      <div className="mt-6 flex"><SubmitButton type="button" onClick={() => backend.auth.signOut()}>Sign out</SubmitButton></div>
    </> : <form onSubmit={signIn} className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-400">Sign in to review reports and coordinate response.</p>
      <Field label="Username" icon="fa-user" required autoComplete="username" type="text" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Your staff username" />
      <Field label="Password" icon="fa-lock" required type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
      <div className="pt-1"><SubmitButton busy={busy}>{busy ? 'Signing in…' : 'Sign in'}</SubmitButton></div>
      <PanelNote>Public accounts can use the mobile app to report and track accidents. An Admin manages staff access.</PanelNote>
    </form>}
    {error && <p role="alert" className="mt-4 rounded-xl border border-red-500/25 bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600 dark:text-red-300">{error}</p>}
  </AuthLanding>
}
