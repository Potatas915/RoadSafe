import { useEffect, useRef } from 'react'

export default function AccountDetails({ account, onClose, returnFocusRef }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = returnFocusRef?.current ?? document.activeElement
    dialog.current.showModal()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [returnFocusRef])
  const enforcer = account.role === 'Officer' || (account.role === 'Public' && account.requestedAccountType === 'Officer')
  const fields = [
    ['Full name', account.name],
    ['Username', account.username ?? 'Legacy account'],
    ['Account ID', account.id],
    ['Account type', account.role === 'Admin' ? 'Administrator' : enforcer ? 'Enforcer' : 'Public user'],
    ['Access', account.enabled ? 'Active' : 'Suspended'],
    ...(enforcer ? [
      ['Approval', account.role === 'Officer' ? 'Approved' : 'Awaiting verification'],
      ['Station', account.station?.name ?? 'No station selected'],
      ['Station address', account.station?.address || 'Not available'],
      ['Unit', account.unit && account.unit !== 'Unassigned' ? account.unit : 'Not specified'],
    ] : []),
  ]
  return <dialog ref={dialog} aria-labelledby="account-details-title" onCancel={event => { event.preventDefault(); onClose() }} className="m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl border border-darkBorder bg-darkCard p-0 text-slate-100 backdrop:bg-slate-950/80">
    <header className="flex items-center justify-between gap-4 border-b border-darkBorder p-5"><h2 id="account-details-title" className="font-semibold text-strong">Account details</h2><button type="button" onClick={onClose} className="dx-btn dx-btn-inline">Close</button></header>
    <dl className="space-y-4 p-5">{fields.map(([label, value]) => <div key={label}><dt className="text-xs text-slate-400">{label}</dt><dd className={`mt-1 break-words text-sm text-strong ${label === 'Account ID' ? 'font-mono select-text' : ''}`}>{value}</dd></div>)}</dl>
  </dialog>
}
