// TRIP-19: banners and avatars were uploaded exactly as chosen, so a 14MB
// phone/desktop image was stored and then downloaded in full by everyone
// who views the trip card, banner, or avatar. This shrinks a raster image
// client-side before upload. It is deliberately conservative: anything it
// can't or needn't touch (SVG, GIF, small files, any decode/encode failure)
// is returned unchanged, so the worst case is the old behaviour, never a
// failed upload.

const PASSTHROUGH_TYPES = new Set(['image/svg+xml', 'image/gif'])

// Scale (width, height) down so the longer side is at most `max`,
// preserving aspect ratio. Never scales up.
export function fitWithin(width, height, max) {
  const longest = Math.max(width, height)
  if (!(longest > max)) return { width, height }
  const scale = max / longest
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) }
}

export async function downscaleImage(file, { maxDim = 1600, minBytes = 500 * 1024, quality = 0.85 } = {}) {
  if (!file?.type?.startsWith('image/') || PASSTHROUGH_TYPES.has(file.type)) return file
  try {
    // 'from-image' applies EXIF rotation, so phone photos aren't saved sideways.
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxDim)
    const alreadySmall = file.size <= minBytes && width === bitmap.width && height === bitmap.height
    if (alreadySmall) {
      bitmap.close?.()
      return file
    }
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    // JPEG has no alpha; paint white first so transparent PNGs don't go black.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close?.()
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
    if (!blob || blob.size >= file.size) return file
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}
