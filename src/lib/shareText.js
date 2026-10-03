// Shares a piece of text the way a phone expects: the native share sheet where
// there is one, otherwise the clipboard. Returns what happened so the screen can
// say "Copied" or stay quiet:
//   'shared'     the share sheet took it
//   'copied'     copied to the clipboard (no share sheet, or it failed)
//   'cancelled'  the person closed the share sheet: nothing was sent, not an error
//   'failed'     neither worked
// `nav` is injectable so this can be tested without a browser.
export async function shareOrCopy({ title, text }, nav = typeof navigator === 'undefined' ? undefined : navigator) {
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title, text })
      return 'shared'
    } catch (err) {
      if (err && err.name === 'AbortError') return 'cancelled'
      // any other share failure: fall through and try the clipboard instead
    }
  }
  try {
    await nav.clipboard.writeText(text)
    return 'copied'
  } catch {
    return 'failed'
  }
}
