import { useEffect, useRef } from 'react'

export default function AccountDetails({ account, onClose, returnFocusRef }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement
    dialog.current.showModal()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [returnFocusRef])
  const enforcer = account.role === 'Officer' || (account.role === 'Public' && account.requestedAccountType === 'Officer')
  const accountType = account.role === 'Admin' ? 'Administrator' : enforcer ? 'Enforcer' : 'Public user'
  const initials = account.name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase()
  const fields = [
    ['Username', account.username ?? 'Legacy account'],
    ['Account ID', account.id],
  ]
  const contact = [
    ['Email', account.email || 'Not provided'],
    ['Mobile number', account.mobileNumber || 'Not provided'],
  ]
  const affiliation = [
    ['Approval', account.role === 'Officer' ? 'Approved' : 'Awaiting verification'],
    ['Station', account.station?.name ?? 'No station selected'],
    ['Station address', account.station?.address || 'Not available'],
    ['Unit', account.unit && account.unit !== 'Unassigned' ? account.unit : 'Not specified'],
  ]
  const details = rows => <dl className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">{rows.map(([label, value]) => <div key={label} className={label === 'Account ID' || label === 'Station address' ? 'sm:col-span-2 min-w-0' : 'min-w-0'}><dt className="text-xs font-medium text-slate-400">{label}</dt><dd title={label === 'Account ID' ? account.id : undefined} className={`mt-1.5 text-sm leading-relaxed text-strong ${label === 'Account ID' ? 'font-mono whitespace-nowrap select-text' : 'break-words'}`}>{label === 'Account ID' ? '#' + (account.id.length > 16 ? account.id.slice(0, 8) : account.id) : value}</dd></div>)}</dl>
  return <dialog ref={dialog} aria-labelledby="account-details-title" aria-describedby="account-details-description" onCancel={event => { event.preventDefault(); onClose() }} className="account-editor m-auto w-[calc(100%_-_2rem)] max-w-2xl max-h-[90dvh] overflow-hidden rounded-xl border border-darkBorder bg-darkBg p-0 text-slate-100 shadow-xl backdrop:bg-black/70">
    <div className="flex max-h-[90dvh] flex-col">
      <header className="shrink-0 border-b border-darkBorder bg-darkBg p-5 sm:px-6">
        <p className="mb-2 text-xs font-medium text-slate-400">Account management</p>
        <h2 id="account-details-title" className="text-xl font-semibold text-strong">Account details</h2>
        <p id="account-details-description" className="mt-1 text-sm text-slate-400">Profile, access and affiliation for this registered account.</p>
      </header>
      <div className="overflow-y-auto p-5 space-y-5 sm:px-6">
        <section aria-label="Account summary" className="flex items-start gap-4 rounded-xl bg-white/[.04] p-4">
          <div aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-500/15 text-lg font-semibold text-slate-200">{initials || 'U'}</div>
          <div className="min-w-0"><h3 className="break-words text-lg font-semibold text-strong">{account.name}</h3>
            <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
              <span className="rounded-md bg-slate-500/15 px-2 py-1 text-slate-300">{accountType}</span>
              <span className={`rounded-md px-2 py-1 ${account.enabled ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'}`}>{account.enabled ? 'Active' : 'Suspended'}</span>
            </div>
          </div>
        </section>
        <section aria-label="Account identity" className="space-y-4 rounded-xl border border-darkBorder p-4"><h3 className="font-semibold text-strong">Account identity</h3>{details(fields)}</section>
        <section aria-label="Contact details" className="space-y-4 rounded-xl border border-darkBorder p-4"><h3 className="font-semibold text-strong">Contact details</h3>{details(contact)}</section>
        {enforcer && <section aria-label="Enforcer affiliation" className="space-y-4 rounded-xl border border-darkBorder p-4"><h3 className="font-semibold text-strong">Enforcer affiliation</h3>{details(affiliation)}</section>}
      </div>
      <footer className="flex shrink-0 justify-end border-t border-darkBorder bg-darkBg p-4 sm:px-6"><button type="button" onClick={onClose} className="dx-btn dx-btn-inline">Close</button></footer>
    </div>
  </dialog>
}
