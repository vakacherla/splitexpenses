// Loads the signed-in person's profile row.
//
// `share_usage` was added by migration 049. The app is deployed separately
// from the database, so for a window the new code can run before the column
// exists. Selecting a column that is missing makes the whole query fail, which
// would stop everyone loading their profile and sign-in would look broken. So
// ask for it first, and if the database says it does not exist, ask again
// without it and report the setting as unknown (undefined). Unknown means
// "tracking off": nothing is recorded until the column is there and says yes.
//
// Any other error (network, permissions) is still thrown, unchanged.

const BASE_COLUMNS = 'id, display_name, email, is_admin, is_super_admin, avatar_path'

export function isMissingColumnError(error) {
  if (!error) return false
  return error.code === '42703' || /share_usage/i.test(error.message ?? '')
}

export async function fetchProfileRow(client, userId) {
  const attempt = (columns) => client.from('profiles').select(columns).eq('id', userId).single()

  const first = await attempt(`${BASE_COLUMNS}, share_usage`)
  if (!first.error) return first.data

  if (!isMissingColumnError(first.error)) throw first.error

  const second = await attempt(BASE_COLUMNS)
  if (second.error) throw second.error
  return { ...second.data, share_usage: undefined }
}
