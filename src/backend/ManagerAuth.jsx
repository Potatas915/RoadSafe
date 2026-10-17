import { useEffect, useState } from 'react'
import { backend } from './client.js'
import { loginIdentity } from './username.js'

export default function ManagerAuth({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [allowed, setAllowed] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    let generation = 0
    async function apply(next) {
      const current = ++generation
      setLoading(true)
      if (next) {
        const result = await backend.from('user_roles').select('role').eq('user_id', next.user.id).single()
        if (!active || current !== generation) return
        setAllowed(!result.error && result.data?.role === 'Admin')
      } else setAllowed(false)
      if (active && current === generation) { setSession(next); setLoading(false) }
    }
    backend.auth.getSession().then(({ data, error }) => {
      if (error && active) { setError(error.message); setLoading(false); return }
      if (active) void apply(data.session)
    })
    const { data } = backend.auth.onAuthStateChange((_event, next) => {
      // Keep database queries outside the auth callback's internal lock.
      setTimeout(() => { if (active) void apply(next) }, 0)
    })
    return () => { active = false; data.subscription.unsubscribe() }
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
  if (session && allowed) return children(session.user)
  return <main className="min-h-screen bg-darkBg text-slate-100 grid place-items-center p-6">
    <section className="w-full max-w-md bg-darkCard border border-darkBorder rounded-2xl p-8 space-y-5">
      <h1 className="text-2xl font-bold">RoadSafe Manager</h1>
      {session ? <>
        <p>This account is not an administrator. Use the mobile app to report and track accidents. Staff access must be granted by an authorized project administrator.</p>
        <button onClick={() => backend.auth.signOut()} className="bg-orange-600 rounded-xl px-4 py-3">Sign out</button>
      </> : <form onSubmit={signIn} className="space-y-4">
        <p className="text-slate-400 text-sm">Sign in to review reports and coordinate response.</p>
        <label className="block text-sm">Username<input autoComplete="username" type="text" required value={email} onChange={(e) => setEmail(e.target.value)} className="block w-full bg-darkBg border border-darkBorder rounded-xl p-3 mt-2" /></label>
        <label className="block text-sm">Password<input autoComplete="current-password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="block w-full bg-darkBg border border-darkBorder rounded-xl p-3 mt-2" /></label>
        <button disabled={busy} className="w-full bg-orange-600 rounded-xl p-3 disabled:opacity-50">{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>}
      {error && <p role="alert" className="text-red-300 text-sm">{error}</p>}
    </section>
  </main>
}


