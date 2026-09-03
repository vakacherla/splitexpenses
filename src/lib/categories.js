// Mirrors the CHECK constraint on expenses.category in supabase/schema.sql —
// update both places together if you add or rename a category.
export const CATEGORIES = [
  'Food',
  'Lodging',
  'Flights',
  'Train',
  'Taxi/Cab',
  'Groceries',
  'Shopping',
  'Activities',
  'Utilities',
  'Misc',
]

// A muted, paper-palette color per category for chart legends — deliberately
// not the app's primary/accent colors, which are reserved for interactive UI.
export const CATEGORY_COLORS = {
  Food: '#b8901f',
  Lodging: '#6f7566',
  Flights: '#2f5233',
  Train: '#a04338',
  'Taxi/Cab': '#8a6a9e',
  Groceries: '#4a7c8c',
  Shopping: '#c17a4f',
  Activities: '#5c8a5c',
  Utilities: '#7a7a4a',
  Misc: '#9a958a',
}
