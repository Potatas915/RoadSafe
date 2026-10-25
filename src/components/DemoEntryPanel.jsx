import { useState } from 'react'
import { Field, PanelNote, SubmitButton } from './AuthLanding.jsx'

// Shown after "Log out" in the web prototype, which has no real accounts to sign in with.
// The form looks and behaves like a normal sign-in, but any entry (or none) opens the demo workspace.
export default function DemoEntryPanel({ user, onEnter }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  return (
    <form onSubmit={(event) => { event.preventDefault(); onEnter() }} className="space-y-5">
      <p className="text-sm leading-relaxed text-slate-400">You have signed out of the demo workspace. Sign in again to review reports and coordinate response.</p>
      <Field label="Username" icon="fa-user" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} placeholder={user?.name ?? 'Your staff username'} autoFocus />
      <Field label="Password" icon="fa-lock" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Your password" />
      <div className="pt-1"><SubmitButton type="submit">Sign in</SubmitButton></div>
      <PanelNote title="Demo mode">This prototype runs on fictional data, so there are no real accounts yet. Any username and password, or none, opens the demo workspace. Staff will sign in with their own username and password once the app is connected to the shared records.</PanelNote>
    </form>
  )
}
