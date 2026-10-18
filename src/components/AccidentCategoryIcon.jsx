import { ACCIDENT_ICON_PATHS } from '../models/accidentIcons.js'

export default function AccidentCategoryIcon({ category, color = 'currentColor', className = '' }) {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" className={className} fill={color} fillRule="evenodd"><path d={ACCIDENT_ICON_PATHS[category] ?? ACCIDENT_ICON_PATHS.other} /></svg>
}
