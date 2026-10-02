// Sign-up abuse protection (migration 048): throwaway-email domains are
// refused by the database; this turns the outcomes into plain language.

export const THROWAWAY_EMAIL_MESSAGE =
  "That email provider isn't supported — it looks like a temporary address. Please sign up with your regular email."

// When the database trigger rejects a new account, Supabase Auth hides the
// reason behind this generic wording.
export function signupErrorMessage(error) {
  const message = error?.message ?? ''
  if (/database error saving new user/i.test(message)) return THROWAWAY_EMAIL_MESSAGE
  return message
}
