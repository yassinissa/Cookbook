/**
 * Read an image file to a base64 data: URI, downscaling large photos first.
 *
 * Phone camera photos are routinely 3000-4000px and several MB — reading
 * several of those straight into memory as base64 (the Plating editor does
 * this for multiple photos at once) is enough to trigger iOS Safari's
 * memory-pressure page reload mid-upload, silently losing the edit. Capping
 * the longest edge before encoding keeps the in-memory + wire payload small
 * without a visible quality loss for a food photo.
 *
 * GIFs pass through untouched — a canvas round-trip would drop the
 * animation. PNGs stay PNG (they're usually photos with no transparency
 * need here, but re-encoding as JPEG would silently flatten any that do).
 */
const MAX_DIMENSION = 1600
const JPEG_QUALITY = 0.85

export function readImageFile(file: File): Promise<string> {
  if (file.type === 'image/gif') return readAsDataURL(file)

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height))
      if (scale === 1) {
        // already small enough — skip the canvas round-trip
        readAsDataURL(file).then(resolve, reject)
        return
      }
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        reject(new Error('canvas unavailable'))
        return
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      resolve(
        file.type === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', JPEG_QUALITY),
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('image load failed'))
    }
    img.src = objectUrl
  })
}

function readAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('read failed'))
    r.readAsDataURL(file)
  })
}
