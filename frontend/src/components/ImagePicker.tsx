import { useRef, useState } from 'react'

import { Button } from './Button'
import { DishImage } from './DishImage'
import { Icon } from './Icon'
import { useI18n } from '@/i18n'
import { readImageFile } from '@/lib/image'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// Raw phone-camera photos routinely exceed this before they're downscaled —
// this is a sanity cap on the *source* file, not the payload we actually
// send (that's checked below, after readImageFile has shrunk it).
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * Dish-photo picker. Reads the chosen file to a base64 data: URI and hands it
 * up via `onChange` — the recipe write API takes it as `image_data` ('' clears
 * the photo). `value` is whatever should preview right now: the existing photo
 * URL, a freshly-picked data URI, or '' for none.
 */
export function ImagePicker({
  value,
  name,
  error,
  onChange,
}: {
  value: string
  name: string
  error?: string
  onChange: (dataUriOrEmpty: string) => void
}) {
  const { t } = useI18n()
  const inputRef = useRef<HTMLInputElement>(null)
  const [localError, setLocalError] = useState('')
  const shown = error || localError

  async function pick(file: File | undefined) {
    if (!file) return
    setLocalError('')
    if (!ACCEPT.includes(file.type)) {
      setLocalError(t('image.badType'))
      return
    }
    if (file.size > MAX_SOURCE_BYTES) {
      setLocalError(t('image.tooBig'))
      return
    }
    try {
      const dataUri = await readImageFile(file)
      if (dataUri.length > MAX_UPLOAD_BYTES) {
        setLocalError(t('image.tooBig'))
        return
      }
      onChange(dataUri)
    } catch {
      setLocalError(t('image.readFailed'))
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-muted">{t('editor.field.image')}</span>

      <div className="flex items-start gap-4">
        <div className="aspect-[16/10] w-40 flex-none overflow-hidden rounded-lg border border-hairline bg-surface-sunken">
          <DishImage src={value || undefined} name={name} rounded="rounded-none" />
        </div>

        <div className="flex flex-col gap-2 pt-1">
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT.join(',')}
            className="hidden"
            onChange={(e) => {
              pick(e.target.files?.[0])
              e.target.value = '' // let the same file be re-picked
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            icon="plus"
            onClick={() => inputRef.current?.click()}
          >
            {value ? t('image.replace') : t('image.upload')}
          </Button>
          {value && (
            <button
              type="button"
              onClick={() => {
                setLocalError('')
                onChange('')
              }}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-danger-ink hover:underline"
            >
              <Icon name="trash" size={14} />
              {t('image.remove')}
            </button>
          )}
          <p className="text-xs text-ink-subtle">{t('image.hint')}</p>
        </div>
      </div>

      {shown && <p className="text-xs font-medium text-danger-ink">{shown}</p>}
    </div>
  )
}
