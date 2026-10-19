import { createContext, useContext } from 'react'
import { ACCIDENT_CATEGORIES, categoryLabel } from '../models/report.js'

export const CategoryContext = createContext(ACCIDENT_CATEGORIES)
export const useCategories = () => useContext(CategoryContext)
export function useCategoryLabel() {
  const categories = useCategories()
  return id => categoryLabel(id, categories)
}
