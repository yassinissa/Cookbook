import { useEffect, useMemo, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'

import { Button } from '@/components/Button'
import { Card, CardBody, CardHeader } from '@/components/Card'
import { DishImage } from '@/components/DishImage'
import { Field } from '@/components/Field'
import { Icon } from '@/components/Icon'
import { Input, Textarea } from '@/components/Input'
import { Page } from '@/components/Page'
import { ErrorState, Skeleton } from '@/components/States'
import { useToast } from '@/components/Toast'
import * as api from '@/lib/api'
import { qk } from '@/lib/queryClient'
import { usePlatingGuide } from '@/lib/queries'
import { parseApiError } from '@/lib/parseApiError'
import { cn } from '@/lib/cn'
import { readImageFile } from '@/lib/image'
import { localId } from '@/lib/id'
import { useI18n, type TFunc } from '@/i18n'
import type { PlatingGuideInput, PlatingImageInput, PlatingPin } from '@/types/api'

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
// Raw phone-camera photos routinely exceed this before they're downscaled —
// this is a sanity cap on the *source* file, not the payload we actually
// send (that's checked below, after readImageFile has shrunk it).
const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

const EMPTY: PlatingGuideInput = {
  plate_spec: '',
  garnish_spec_en: '',
  garnish_spec_ar: '',
  build_notes_en: '',
  build_notes_ar: '',
  common_errors_en: '',
  common_errors_ar: '',
  pickup_window_seconds: '',
  images: [],
}

/** local editing shape: an image entry plus a preview URL to render right now */
interface DraftImage extends PlatingImageInput {
  key: string
  preview: string
}

export function PlatingEditorPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const qc = useQueryClient()
  const { t } = useI18n()

  const { data, isLoading, isError, refetch } = usePlatingGuide(id)

  const [form, setForm] = useState<PlatingGuideInput>(EMPTY)
  const [images, setImages] = useState<DraftImage[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const hydrated = useRef(false)

  useEffect(() => {
    if (!data || hydrated.current) return
    hydrated.current = true
    const g = data.plating
    if (g) {
      setForm({
        plate_spec: g.plate_spec,
        garnish_spec_en: g.garnish_spec_en,
        garnish_spec_ar: g.garnish_spec_ar,
        build_notes_en: g.build_notes_en,
        build_notes_ar: g.build_notes_ar,
        common_errors_en: g.common_errors_en,
        common_errors_ar: g.common_errors_ar,
        pickup_window_seconds: g.pickup_window_seconds == null ? '' : String(g.pickup_window_seconds),
        images: [],
      })
      setImages(
        g.images.map((img, i) => ({
          key: img.id,
          id: img.id,
          preview: img.image_url,
          caption_en: img.caption_en,
          caption_ar: img.caption_ar,
          sort_order: i,
          pins: img.pins,
        })),
      )
    }
  }, [data])

  const set = (k: keyof PlatingGuideInput, v: string) => setForm((f) => ({ ...f, [k]: v }))

  const patchImage = (key: string, patch: Partial<DraftImage>) =>
    setImages((list) => list.map((im) => (im.key === key ? { ...im, ...patch } : im)))

  async function addImages(files: FileList | null) {
    if (!files?.length) return
    for (const file of Array.from(files)) {
      if (!ACCEPT.includes(file.type)) {
        toast.error(t('image.badType'))
        continue
      }
      if (file.size > MAX_SOURCE_BYTES) {
        toast.error(t('image.tooBig'))
        continue
      }
      try {
        const dataUri = await readImageFile(file)
        if (dataUri.length > MAX_UPLOAD_BYTES) {
          toast.error(t('image.tooBig'))
          continue
        }
        setImages((list) => [
          ...list,
          {
            key: `new-${localId()}`,
            image_data: dataUri,
            preview: dataUri,
            caption_en: '',
            caption_ar: '',
            sort_order: list.length,
            pins: [],
          },
        ])
      } catch {
        toast.error(t('image.readFailed'))
      }
    }
  }

  function move(key: string, dir: -1 | 1) {
    setImages((list) => {
      const i = list.findIndex((im) => im.key === key)
      const j = i + dir
      if (i < 0 || j < 0 || j >= list.length) return list
      const next = [...list]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!id) return
    setSaving(true)
    setFormError('')
    try {
      const payload: PlatingGuideInput = {
        ...form,
        images: images.map((im, i) => ({
          ...(im.id ? { id: im.id } : { image_data: im.image_data }),
          caption_en: im.caption_en,
          caption_ar: im.caption_ar,
          sort_order: i,
          pins: im.pins,
        })),
      }
      const saved = await api.updatePlatingGuide(id, payload)
      qc.setQueryData(qk.platingGuide(id), saved)
      qc.invalidateQueries({ queryKey: qk.plating })
      toast.success(t('plating.saved'))
      navigate(`/recipes/dishes/${id}`)
    } catch (err) {
      const { message } = parseApiError(err)
      setFormError(message)
      toast.error(t('toast.saveFailed', { detail: message }))
    } finally {
      setSaving(false)
    }
  }

  if (isError) {
    return (
      <Page>
        <ErrorState onRetry={() => refetch()} />
      </Page>
    )
  }
  if (isLoading || !data) return <EditorSkeleton />

  const hadGuide = !!data.plating

  return (
    <form onSubmit={onSubmit}>
      <Page stagger className="pb-28 lg:pb-6">
        <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon="arrowLeft"
              onClick={() => navigate(`/recipes/dishes/${id}`)}
            >
              {t('action.back')}
            </Button>
            <div>
              <h1 className="font-display text-[1.5rem] font-medium tracking-tight text-ink">
                {hadGuide ? t('plating.editor.editTitle') : t('plating.editor.newTitle')}
              </h1>
              <p className="text-xs text-ink-subtle">
                {t('plating.editor.for', { dish: data.name_en })}
              </p>
            </div>
          </div>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={saving}
            className="hidden sm:inline-flex"
          >
            {saving ? t('action.saving') : t('action.saveChanges')}
          </Button>
        </header>

        {formError && (
          <div className="mb-5">
            <ErrorState title={t('state.errorGeneric')} body={formError} />
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <Card elevated>
            <CardHeader title={t('plating.editor.photos')} subtitle={t('plating.editor.photosHint')} />
            <CardBody className="space-y-6">
              {images.length === 0 && (
                <p className="rounded-lg border border-dashed border-hairline-strong px-4 py-8 text-center text-sm text-ink-subtle">
                  {t('plating.editor.noPhotos')}
                </p>
              )}

              {images.map((img, i) => (
                <ImageField
                  key={img.key}
                  img={img}
                  index={i}
                  count={images.length}
                  dishName={data.name_en}
                  t={t}
                  onPatch={(p) => patchImage(img.key, p)}
                  onMove={(d) => move(img.key, d)}
                  onRemove={() => setImages((l) => l.filter((x) => x.key !== img.key))}
                />
              ))}

              <label className="inline-flex">
                <input
                  type="file"
                  accept={ACCEPT.join(',')}
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addImages(e.target.files)
                    e.target.value = ''
                  }}
                />
                <span className="inline-flex h-8 cursor-pointer items-center gap-2 rounded-lg border border-hairline-strong bg-surface px-3 text-[13px] font-medium text-ink hover:bg-surface-sunken">
                  <Icon name="plus" size={15} />
                  {t('plating.editor.addPhoto')}
                </span>
              </label>
            </CardBody>
          </Card>

          <Card elevated>
            <CardHeader title={t('plating.editor.spec')} />
            <CardBody className="space-y-4">
              <Field label={t('plating.field.plate')}>
                <Input
                  value={form.plate_spec}
                  onChange={(e) => set('plate_spec', e.target.value)}
                  placeholder={t('plating.field.platePlaceholder')}
                />
              </Field>
              <Field label={t('plating.field.window')} help={t('plating.field.windowHelp')}>
                <Input
                  type="number"
                  min={0}
                  value={form.pickup_window_seconds}
                  onChange={(e) => set('pickup_window_seconds', e.target.value)}
                />
              </Field>

              <BilingualField
                label={t('plating.field.garnish')}
                en={form.garnish_spec_en}
                ar={form.garnish_spec_ar}
                onEn={(v) => set('garnish_spec_en', v)}
                onAr={(v) => set('garnish_spec_ar', v)}
                t={t}
              />
              <BilingualField
                label={t('plating.field.build')}
                en={form.build_notes_en}
                ar={form.build_notes_ar}
                onEn={(v) => set('build_notes_en', v)}
                onAr={(v) => set('build_notes_ar', v)}
                t={t}
              />
              <BilingualField
                label={t('plating.field.errors')}
                en={form.common_errors_en}
                ar={form.common_errors_ar}
                onEn={(v) => set('common_errors_en', v)}
                onAr={(v) => set('common_errors_ar', v)}
                t={t}
              />
            </CardBody>
          </Card>
        </div>
      </Page>

      <div className="fixed inset-x-0 bottom-16 z-30 flex items-center gap-2 border-t border-hairline bg-surface/95 px-4 py-2.5 backdrop-blur sm:hidden">
        <Button type="submit" variant="primary" className="flex-1" loading={saving}>
          {saving ? t('action.saving') : t('action.saveChanges')}
        </Button>
      </div>
    </form>
  )
}

/* ── bilingual text block ──────────────────────────────────────────── */
function BilingualField({
  label,
  en,
  ar,
  onEn,
  onAr,
  t,
}: {
  label: string
  en: string
  ar: string
  onEn: (v: string) => void
  onAr: (v: string) => void
  t: TFunc
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-[13px] font-medium text-ink-muted">{label}</legend>
      <Textarea rows={2} value={en} onChange={(e) => onEn(e.target.value)} placeholder={t('lang.en')} />
      <Textarea
        rows={2}
        dir="rtl"
        value={ar}
        onChange={(e) => onAr(e.target.value)}
        placeholder={t('lang.ar')}
      />
    </fieldset>
  )
}

/* ── one image with click-to-place pins ────────────────────────────── */
function ImageField({
  img,
  index,
  count,
  dishName,
  t,
  onPatch,
  onMove,
  onRemove,
}: {
  img: DraftImage
  index: number
  count: number
  dishName: string
  t: TFunc
  onPatch: (p: Partial<DraftImage>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const dragging = useRef<number | null>(null)

  const nextN = useMemo(
    () => (img.pins.length ? Math.max(...img.pins.map((p) => p.n)) + 1 : 1),
    [img.pins],
  )

  function coordsFromEvent(e: { clientX: number; clientY: number }): [number, number] | null {
    const rect = boxRef.current?.getBoundingClientRect()
    if (!rect) return null
    return [
      Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width)),
      Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height)),
    ]
  }

  function addPin(e: React.MouseEvent) {
    const c = coordsFromEvent(e)
    if (!c) return
    const pin: PlatingPin = { n: nextN, x: c[0], y: c[1], label_en: '', label_ar: '' }
    onPatch({ pins: [...img.pins, pin] })
    setSelected(pin.n)
  }

  function updatePin(n: number, patch: Partial<PlatingPin>) {
    onPatch({ pins: img.pins.map((p) => (p.n === n ? { ...p, ...patch } : p)) })
  }

  function removePin(n: number) {
    onPatch({ pins: img.pins.filter((p) => p.n !== n) })
    setSelected(null)
  }

  function onPinPointerDown(e: PointerEvent, n: number) {
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragging.current = n
    setSelected(n)
  }
  function onPinPointerMove(e: PointerEvent) {
    if (dragging.current == null) return
    const c = coordsFromEvent(e)
    if (c) updatePin(dragging.current, { x: c[0], y: c[1] })
  }
  function onPinPointerUp(e: PointerEvent) {
    dragging.current = null
    ;(e.target as HTMLElement).releasePointerCapture?.(e.pointerId)
  }

  function nudge(e: React.KeyboardEvent, n: number) {
    const step = e.shiftKey ? 0.02 : 0.005
    const p = img.pins.find((x) => x.n === n)
    if (!p) return
    const map: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (map[e.key]) {
      e.preventDefault()
      updatePin(n, {
        x: Math.min(1, Math.max(0, p.x + map[e.key][0])),
        y: Math.min(1, Math.max(0, p.y + map[e.key][1])),
      })
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      removePin(n)
    }
  }

  const ordered = [...img.pins].sort((a, b) => a.n - b.n)

  return (
    <div className="rounded-lg border border-hairline bg-surface p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="font-mono text-xs text-ink-subtle">
          {t('plating.editor.photoN', { n: index + 1 })}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => onMove(-1)}
            aria-label={t('action.moveUp')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken disabled:opacity-30"
          >
            <Icon name="chevronLeft" size={15} className="rotate-90" />
          </button>
          <button
            type="button"
            disabled={index === count - 1}
            onClick={() => onMove(1)}
            aria-label={t('action.moveDown')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted hover:bg-surface-sunken disabled:opacity-30"
          >
            <Icon name="chevronRight" size={15} className="rotate-90" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('action.delete')}
            className="flex h-7 w-7 items-center justify-center rounded-md text-danger-ink hover:bg-danger-subtle"
          >
            <Icon name="trash" size={15} />
          </button>
        </div>
      </div>

      <div
        ref={boxRef}
        onClick={addPin}
        onPointerMove={onPinPointerMove}
        className="relative cursor-crosshair select-none overflow-hidden rounded-md border border-hairline bg-surface-sunken"
      >
        <div className="aspect-[16/10] w-full">
          <DishImage src={img.preview || undefined} name={dishName} rounded="rounded-none" />
        </div>
        {ordered.map((p) => (
          <button
            key={p.n}
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setSelected(p.n)
            }}
            onPointerDown={(e) => onPinPointerDown(e, p.n)}
            onPointerUp={onPinPointerUp}
            onKeyDown={(e) => nudge(e, p.n)}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
            className={cn(
              'absolute z-10 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 touch-none items-center justify-center rounded-full',
              'border-2 border-white bg-accent font-mono text-[11px] font-semibold text-accent-on shadow-[0_1px_6px_rgba(0,0,0,0.45)]',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]',
              selected === p.n && 'scale-125 ring-2 ring-white',
            )}
          >
            {p.n}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-ink-subtle">{t('plating.editor.pinHint')}</p>

      <div className="mt-3 space-y-2">
        {ordered.map((p) => (
          <div
            key={p.n}
            className={cn(
              'flex items-start gap-2 rounded-md border p-2',
              selected === p.n ? 'border-accent bg-accent-subtle' : 'border-hairline',
            )}
            onClick={() => setSelected(p.n)}
          >
            <span className="mt-1.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent font-mono text-[10px] font-semibold text-accent-on">
              {p.n}
            </span>
            <div className="grid flex-1 gap-1.5 sm:grid-cols-2">
              <Input
                value={p.label_en}
                onChange={(e) => updatePin(p.n, { label_en: e.target.value })}
                placeholder={t('plating.editor.pinLabelEn')}
                className="h-8 text-[13px]"
              />
              <Input
                value={p.label_ar}
                dir="rtl"
                onChange={(e) => updatePin(p.n, { label_ar: e.target.value })}
                placeholder={t('plating.editor.pinLabelAr')}
                className="h-8 text-[13px]"
              />
            </div>
            <button
              type="button"
              onClick={() => removePin(p.n)}
              aria-label={t('action.delete')}
              className="mt-1 flex h-7 w-7 flex-none items-center justify-center rounded-md text-danger-ink hover:bg-danger-subtle"
            >
              <Icon name="close" size={15} />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
        <Input
          value={img.caption_en}
          onChange={(e) => onPatch({ caption_en: e.target.value })}
          placeholder={t('plating.editor.captionEn')}
          className="h-8 text-[13px]"
        />
        <Input
          value={img.caption_ar}
          dir="rtl"
          onChange={(e) => onPatch({ caption_ar: e.target.value })}
          placeholder={t('plating.editor.captionAr')}
          className="h-8 text-[13px]"
        />
      </div>
    </div>
  )
}

function EditorSkeleton() {
  return (
    <Page>
      <Skeleton className="mb-6 h-8 w-56" />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <Skeleton className="h-[28rem]" />
        <Skeleton className="h-96" />
      </div>
    </Page>
  )
}
