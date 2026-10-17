export function loginIdentity(value) {
  const username = value.trim().toLowerCase()
  // Preserve access for accounts created before username registration.
  if (username.includes('@')) return username
  if (!/^[a-z][a-z0-9_]{2,23}$/.test(username)) throw new Error('Enter a valid username.')
  return `${username}@roadsafe.local`
}
