// Read-only live connectivity check. Supply a password through the environment.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
const env = Object.fromEntries(readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/).filter((line) => /^VITE_SUPABASE_(URL|PUBLISHABLE_KEY)=/.test(line)).map((line) => { const i=line.indexOf('='); return [line.slice(0,i),line.slice(i+1).trim()] }))
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession:false,autoRefreshToken:false } })
const email = process.env.ROADSAFE_CHECK_EMAIL ?? 'admin@roadsafe.local'
const password = process.env.ROADSAFE_CHECK_PASSWORD
if (!password) throw new Error('Set ROADSAFE_CHECK_PASSWORD before running this check.')
const { data, error } = await client.auth.signInWithPassword({email,password})
if (error) throw error
try {
  const { data:role, error:roleError } = await client.from('user_roles').select('role').eq('user_id',data.user.id).single()
  if(roleError) throw roleError
  const feed = await client.rpc('get_report_feed')
  if(feed.error) throw feed.error
  console.log(`Live sign-in and report API passed. Role: ${role.role}; visible reports: ${feed.data.data.length}.`)
} finally { await client.auth.signOut({scope:'local'}) }
