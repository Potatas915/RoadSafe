import { ACCIDENT_ICON_PATHS, accidentIconViewBox } from '../models/accidentIcons.js'

export default function AccidentCategoryIcon({ category, color = 'currentColor', className = '' }) {
  return <svg aria-hidden="true" viewBox={accidentIconViewBox(category).join(' ')} width="30" height="30" className={className} fill={color} fillRule="evenodd"><path d={ACCIDENT_ICON_PATHS[category] ?? ACCIDENT_ICON_PATHS.other} /></svg>
}
